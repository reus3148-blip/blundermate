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
        const matchCp = line.match(/score cp (-?\d+)/);
        const matchMate = line.match(/score mate (-?\d+)/);
        const matchMultiPv = line.match(/multipv (\d+)/);
        const matchPv = line.match(/ pv (.+)/);
        
        const multipv = matchMultiPv ? parseInt(matchMultiPv[1], 10) : 1;
        const pv = matchPv ? matchPv[1] : '';
        
        if (matchCp) {
            return { type: 'cp', value: parseInt(matchCp[1], 10) / 100, multipv, pv };
        } else if (matchMate) {
            return { type: 'mate', value: parseInt(matchMate[1], 10), multipv, pv };
        }
        return null;
    }

    analyzeFen(fen, depth = 12) {
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
    }

    stop() {
        this.worker.postMessage('stop');
    }
}