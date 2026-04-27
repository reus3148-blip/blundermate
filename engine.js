/**
 * Stockfish UCI info 라인 파서. indexOf/substring 기반으로 정규식보다 빠르게 동작.
 * `{ type: 'cp'|'mate', value, multipv, pv }` 형태를 반환한다. score 라인이 아니면 null.
 */
function parseEvalLine(line) {
    if (!line.includes('score ')) return null;

    let type, value, multipv = 1, pv = '';

    const multipvIdx = line.indexOf('multipv ');
    if (multipvIdx !== -1) {
        multipv = parseInt(line.substring(multipvIdx + 8), 10);
    }

    const cpIdx = line.indexOf('score cp ');
    const mateIdx = line.indexOf('score mate ');

    if (cpIdx !== -1) {
        type = 'cp';
        value = parseInt(line.substring(cpIdx + 9), 10) / 100;
    } else if (mateIdx !== -1) {
        type = 'mate';
        value = parseInt(line.substring(mateIdx + 11), 10);
    } else {
        return null;
    }

    const pvIdx = line.indexOf(' pv ');
    if (pvIdx !== -1) pv = line.substring(pvIdx + 4);

    return { type, value, multipv, pv };
}

// Hash와 MultiPV 기본값 — 풀과 단일 엔진 모두에서 동일하게 적용.
// Hash 32MB: depth 14~16 배치 분석에 충분하고 모바일 RAM 부담 작음. MultiPV 3은 기존 값 유지.
const DEFAULT_HASH_MB = 32;
const DEFAULT_MULTIPV = 3;

/**
 * 단일 Stockfish Worker 래퍼 — 탐색 모드용 (콜백 기반, 점진적 eval 스트림 노출).
 */
export class StockfishEngine {
    constructor(workerPath, callbacks) {
        try {
            this.worker = new Worker(workerPath);
        } catch (e) {
            if (callbacks.onError) callbacks.onError(e);
            return;
        }

        this.isReady = false;
        this.callbacks = callbacks || {};

        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.postMessage('uci');
    }

    handleMessage(event) {
        const line = event.data;

        if (line === 'uciok') {
            this.isReady = true;
            if (this.callbacks.onUciOk) this.callbacks.onUciOk();
            this.worker.postMessage(`setoption name MultiPV value ${DEFAULT_MULTIPV}`);
            this.worker.postMessage(`setoption name Hash value ${DEFAULT_HASH_MB}`);
            this.worker.postMessage('isready');
        } else if (line === 'readyok') {
            if (this.callbacks.onReady) this.callbacks.onReady();
        } else if (line.startsWith('info depth')) {
            const evalData = parseEvalLine(line);
            if (evalData && this.callbacks.onEval) {
                this.callbacks.onEval(evalData);
            }
        } else if (line.startsWith('bestmove')) {
            if (this.callbacks.onBestMove) this.callbacks.onBestMove();
        }
    }

    analyzeFen(fen, depth = 14) {
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
    }

    stop() {
        this.worker.postMessage('stop');
    }
}

/**
 * 풀 한 멤버. 한 워커 = 한 Stockfish 인스턴스. promise 기반 1포지션 분석 API.
 * 분석 중 들어오는 info depth 라인은 라인별 최신값으로 누적해두고, bestmove 도착 시점에 한 번에 resolve.
 */
class PooledEngine {
    constructor(workerPath, { hash = DEFAULT_HASH_MB, multiPv = DEFAULT_MULTIPV } = {}) {
        this.hash = hash;
        this.multiPv = multiPv;
        this._lines = new Array(multiPv).fill(null);
        this._currentResolve = null;
        this._readyResolve = null;
        this._readyReject = null;
        this._failed = false;
        this._readyPromise = new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
        try {
            this.worker = new Worker(workerPath);
        } catch (e) {
            this._failed = true;
            if (this._readyReject) this._readyReject(e);
            return;
        }
        this.worker.onmessage = (e) => this._handleMessage(e.data);
        this.worker.onerror = (e) => {
            this._failed = true;
            if (this._readyReject) this._readyReject(e);
            // 진행 중 task가 있으면 에러로 종료시켜 호출자 promise가 hang되지 않게 함
            const resolve = this._currentResolve;
            this._currentResolve = null;
            if (resolve) resolve({ lines: this._lines.slice() });
        };
        this.worker.postMessage('uci');
    }

    ready() { return this._readyPromise; }

    /**
     * 한 포지션을 분석하고 끝날 때 { lines: [{type, value, multipv, pv}, ...] } 형태로 resolve.
     * 동시에 두 번 호출하면 안 된다 (풀이 idle 상태일 때만 dispatch).
     */
    run(fen, depth) {
        this._lines = new Array(this.multiPv).fill(null);
        return new Promise((resolve) => {
            this._currentResolve = resolve;
            if (this._failed || !this.worker) {
                this._currentResolve = null;
                resolve({ lines: this._lines.slice() });
                return;
            }
            this.worker.postMessage(`position fen ${fen}`);
            this.worker.postMessage(`go depth ${depth}`);
        });
    }

    stop() {
        if (this.worker) this.worker.postMessage('stop');
    }

    terminate() {
        try { this.worker && this.worker.terminate(); } catch (_) {}
    }

    _handleMessage(line) {
        if (line === 'uciok') {
            this.worker.postMessage(`setoption name MultiPV value ${this.multiPv}`);
            this.worker.postMessage(`setoption name Hash value ${this.hash}`);
            this.worker.postMessage('isready');
        } else if (line === 'readyok') {
            if (this._readyResolve) {
                this._readyResolve();
                this._readyResolve = null;
            }
        } else if (line.startsWith('info depth')) {
            const data = parseEvalLine(line);
            if (data) this._lines[data.multipv - 1] = data;
        } else if (line.startsWith('bestmove')) {
            const resolve = this._currentResolve;
            this._currentResolve = null;
            if (resolve) resolve({ lines: this._lines.slice() });
        }
    }
}

/**
 * 하드웨어 정보 기반 풀 크기 결정.
 * - 저사양(deviceMemory < 4) 또는 코어 부족 환경에선 2개로 캡 → OOM 방지
 * - 그 외엔 최대 3개 (분석 속도 vs 모바일 안정성 균형)
 */
export function getDefaultPoolSize() {
    const cores = navigator.hardwareConcurrency || 2;
    const memory = (typeof navigator !== 'undefined' && 'deviceMemory' in navigator)
        ? navigator.deviceMemory : 4;
    if (memory < 4) return Math.max(1, Math.min(cores, 2));
    return Math.max(1, Math.min(cores, 3));
}

/**
 * Stockfish 워커 풀. 각 워커는 독립 메모리/Hash 테이블을 가진다.
 * 게임 분석처럼 포지션마다 독립적인 워크로드용 — transposition 재활용은 거의 없음.
 *
 * 사용: `await pool.ready()` 후 `pool.analyze(fen, depth)` 여러 번 호출 → Promise.all로 모음.
 */
export class EnginePool {
    constructor(workerPath, size = getDefaultPoolSize(), options = {}) {
        this.size = size;
        this.engines = [];
        for (let i = 0; i < size; i++) {
            this.engines.push(new PooledEngine(workerPath, options));
        }
        this._idle = this.engines.slice();
        this._taskQueue = [];
        this._activeTasks = new Set();
        this._cancelled = false;
    }

    /** 풀 전체가 UCI 초기화 끝날 때까지 대기. */
    async ready() {
        await Promise.all(this.engines.map(e => e.ready()));
    }

    /**
     * 한 포지션 분석 요청. resolve 값은 `{ lines: [{type, value, multipv, pv}, ...] }`.
     * 풀에 idle 엔진이 있으면 즉시 시작, 없으면 대기열로.
     * cancelAll 후엔 reject('cancelled').
     */
    analyze(fen, depth) {
        return new Promise((resolve, reject) => {
            if (this._cancelled) {
                reject(new Error('cancelled'));
                return;
            }
            this._taskQueue.push({ fen, depth, resolve, reject });
            this._dispatch();
        });
    }

    /** 진행 중/대기 중 모든 task 취소. 활성 task는 stop 신호로 조기 종료시키고 Promise는 reject. */
    cancelAll() {
        this._cancelled = true;
        // 대기 task reject
        for (const task of this._taskQueue) {
            task.reject(new Error('cancelled'));
        }
        this._taskQueue.length = 0;
        // 활성 task의 워커에 stop 송신 — bestmove로 마무리되면 resolve되지만 호출자는 cancelled 상태이므로 무시
        for (const engine of this._activeTasks) {
            engine.stop();
        }
    }

    /** 이후 새 분석을 다시 받을 수 있도록 cancel 플래그 해제. 풀 자체는 살아있다. */
    reset() {
        this._cancelled = false;
    }

    /** 풀 종료 — 워커 전체 terminate. 페이지 언로드/정리 시 호출. */
    destroy() {
        this.cancelAll();
        for (const engine of this.engines) {
            engine.terminate();
        }
        this.engines = [];
        this._idle = [];
    }

    _dispatch() {
        while (this._idle.length > 0 && this._taskQueue.length > 0 && !this._cancelled) {
            const engine = this._idle.pop();
            const task = this._taskQueue.shift();
            this._activeTasks.add(engine);
            engine.run(task.fen, task.depth).then((result) => {
                this._activeTasks.delete(engine);
                this._idle.push(engine);
                if (this._cancelled) {
                    task.reject(new Error('cancelled'));
                } else {
                    task.resolve(result);
                }
                this._dispatch();
            }).catch((err) => {
                this._activeTasks.delete(engine);
                this._idle.push(engine);
                task.reject(err);
                this._dispatch();
            });
        }
    }
}
