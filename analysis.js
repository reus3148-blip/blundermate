import { StockfishEngine, EnginePool, getDefaultPoolSize } from './engine.js';
import { parseEvalData, convertPvToSan, classifyMove } from './utils.js';

// ==========================================
// Module state
// ==========================================
// 분석 큐: live binding으로 main.js에서 직접 읽을 수 있게 export let.
// 변경은 setQueue로만.
export let analysisQueue = [];

// 단일 엔진(_stockfish): 탐색(explore) 모드 전용 — 점진적 eval 스트림을 콜백으로 노출.
// 풀(_pool): 배치 게임 분석용 — 워커 N개에 포지션을 분산시켜 promise로 결과 수집.
// 두 경로는 서로 독립이며, 동일 wasm 워커 파일을 공유한다.
let _stockfish = null;
let _pool = null;
let _depth = parseInt(localStorage.getItem('blundermate_depth')) || 14;

// 배치 라이프사이클: 동시에 1개만 활성. 새 분석 요청 시 기존 배치를 abort하고 완료 대기.
// _activeBatch.completed가 settle되면 _activeBatch는 null이 되고, 보류된 restart runner가 호출된다.
let _activeBatch = null;       // { abort: () => void, completed: Promise<void> }
let _pendingRestart = null;    // { runner: () => void }

// ==========================================
// Initialization
// ==========================================
// main.js가 엔진 콜백 전부를 정의하고 여기로 넘긴다 (UI/모드 분기는 main.js의 책임).
// 단일 엔진은 콜백 기반(탐색 모드의 라이브 eval), 풀은 promise 기반(배치).
export function initAnalysis({ enginePath, callbacks }) {
    _stockfish = new StockfishEngine(enginePath, callbacks);
    _pool = new EnginePool(enginePath, getDefaultPoolSize());
}

// ==========================================
// Engine accessors
// ==========================================
export function getEngine() { return _stockfish; }

export function getDepth() { return _depth; }
export function setDepth(d) {
    _depth = parseInt(d) || 14;
    try { localStorage.setItem('blundermate_depth', _depth); } catch {}
}

// ==========================================
// Queue accessors
// ==========================================
export function setQueue(newQueue) { analysisQueue = newQueue; }

export function isRunning() { return !!_activeBatch; }
export function isAwaitingRestart() { return !!_pendingRestart; }

// ==========================================
// Batch analysis
// ==========================================
// 풀에 큐 전체를 병렬 dispatch. 각 포지션 완료 시 engineLines를 채우고 onProgress 호출.
// 모든 포지션 완료 시 인덱스 순서로 classifyMove 일괄 적용 후 onComplete 호출.
//
// 호출 전에 isRunning() === false 여야 한다 (배치 1개씩만 활성).
// 진행 중 abort되면 onComplete 호출되지 않는다 — restart 경로가 새 배치를 시작.
// 풀 초기화 실패 등 치명적 에러는 onError로 전달 (없으면 console.error로 기록).
export function runBatch({ onProgress, onComplete, onError }) {
    if (_activeBatch) return;

    _pool.reset();
    let aborted = false;

    const completed = (async () => {
        try {
            await _pool.ready();
        } catch (e) {
            if (onError) onError(e); else console.error('Engine pool failed to initialize:', e);
            return;
        }
        const tasks = analysisQueue.map((pos, idx) => {
            return _pool.analyze(pos.fen, _depth)
                .then((result) => {
                    if (aborted) return;
                    const isBlackToMove = pos.fen.includes(' b ');
                    pos.engineLines = result.lines.map((data) => {
                        if (!data) return null;
                        const { scoreStr, scoreNum } = parseEvalData(data, isBlackToMove);
                        const sanPv = convertPvToSan(data.pv, pos.fen);
                        const firstUci = data.pv ? data.pv.split(' ')[0] : '';
                        return { scoreStr, scoreNum, pv: sanPv, uci: firstUci };
                    });
                    if (onProgress) onProgress(idx);
                })
                .catch(() => { /* cancelled task — 정상 abort 경로 */ });
        });
        await Promise.all(tasks);

        if (aborted) return;
        // 분류는 모든 engineLines가 채워진 후 인덱스 순서대로. classifyMove(i)는 i-1의 engineLines가 필요.
        for (let i = 0; i < analysisQueue.length; i++) {
            analysisQueue[i].classification = classifyMove(i, analysisQueue);
        }
        if (onComplete) onComplete();
    })();

    _activeBatch = {
        abort: () => {
            if (aborted) return;
            aborted = true;
            _pool.cancelAll();
        },
        completed,
    };

    completed.finally(() => {
        _activeBatch = null;
        if (_pendingRestart) {
            const r = _pendingRestart;
            _pendingRestart = null;
            r.runner();
        }
    });
}

// 분석 중에 사용자가 새 게임을 시작하면 즉시 abort. 기존 배치가 정리되면 runner를 실행.
// runner는 보통 main.js의 startNewAnalysis(newQueue, targetIndex) 클로저.
export function scheduleRestart(runner) {
    _pendingRestart = { runner };
    if (_activeBatch) _activeBatch.abort();
}

// 분석 화면을 떠날 때 호출. 활성 배치 abort + 보류 상태 클리어 + 큐 비움.
export function stopAndClear() {
    if (_activeBatch) _activeBatch.abort();
    _pendingRestart = null;
    analysisQueue = [];
}

// ==========================================
// Queue builders (pure)
// ==========================================
// PGN이 이미 로드된 chess.js 인스턴스로부터 분석 큐를 만든다.
// 각 엔트리는 그 수가 둔 직후의 FEN과 메타데이터 (san, from, to, turn, moveNumber, isWhite)를 가진다.
// startFen 헤더가 있으면 그 위치부터 출발 (Chess960이나 중간 위치에서 시작한 게임).
export function buildQueueFromPgn(chessInstance) {
    const queue = [];
    const tempChess = new Chess();
    const startFen = chessInstance.header().FEN;
    if (startFen) tempChess.load(startFen);

    chessInstance.history({ verbose: true }).forEach((move, index) => {
        tempChess.move(move);
        queue.push({
            fen: tempChess.fen(),
            san: move.san,
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined, // 1순위 일치 검사 UCI 비교용
            turn: tempChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(index / 2) + 1,
            isWhite: index % 2 === 0,
            engineLines: [],
        });
    });
    return queue;
}

// FEN 1개짜리 단독 분석 큐 (기보 없이 한 포지션만 분석할 때).
// isFenOnly 플래그로 분석 완료 후 요약 화면을 띄우지 않게 처리됨.
export function buildSinglePositionQueue(fenText) {
    const parts = fenText.trim().split(/\s+/);
    const sideToMove = parts[1] || 'w';
    const fullMoveNumber = parseInt(parts[5]) || 1;
    return [{
        fen: fenText,
        san: '',
        from: null,
        to: null,
        turn: sideToMove === 'w' ? 'b' : 'w',
        moveNumber: fullMoveNumber,
        isWhite: sideToMove === 'w',
        engineLines: [],
        isFenOnly: true,
    }];
}
