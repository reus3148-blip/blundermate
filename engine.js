/**
 * Wrapper class for the Stockfish Web Worker.
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
            this.worker.postMessage('setoption name MultiPV value 3');
            this.worker.postMessage('isready');
        } else if (line === 'readyok') {
            if (this.callbacks.onReady) this.callbacks.onReady();
        } else if (line.startsWith('info depth')) {
            const evalData = this.parseEval(line);
            if (evalData && this.callbacks.onEval) {
                this.callbacks.onEval(evalData);
            }
        } else if (line.startsWith('bestmove')) {
            if (this.callbacks.onBestMove) this.callbacks.onBestMove();
        }
    }

    parseEval(line) {
        // 정규식(Regex) 대신 indexOf와 substring을 사용하여 엔진 파싱 속도를 극대화
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

    analyzeFen(fen, depth = 12) {
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
    }

    stop() {
        this.worker.postMessage('stop');
    }
}