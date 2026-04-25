import { StockfishEngine } from './engine.js';

// ==========================================
// Module state
// ==========================================
// 분석 큐와 인덱스: live binding으로 main.js에서 직접 읽을 수 있게 export let.
// 변경은 반드시 setQueue/setCurrentIndex/advanceCurrentIndex로만 — 다른 모듈이 재할당 시도 시 ESM이 막아준다.
export let analysisQueue = [];
export let currentAnalysisIndex = 0;

// 엔진 상태 + 큐 재시작 상태 머신: 외부 노출은 함수만.
let _stockfish = null;
let _isEngineReady = false;
let _depth = parseInt(localStorage.getItem('blundermate_depth')) || 12;
let _isAnalyzing = false;
let _isWaitingForStop = false;
let _pendingQueue = null;
let _pendingTargetIndex = null;

// ==========================================
// Initialization
// ==========================================
// main.js가 엔진 콜백 전부를 정의하고 여기로 넘긴다 (UI/모드 분기는 main.js의 책임).
// initAnalysis는 StockfishEngine 인스턴스를 만들고 isEngineReady 추적만 가로챈다.
export function initAnalysis({ enginePath, callbacks }) {
    const wrappedCallbacks = {
        ...callbacks,
        onUciOk: () => {
            _isEngineReady = true;
            if (callbacks?.onUciOk) callbacks.onUciOk();
        },
    };
    _stockfish = new StockfishEngine(enginePath, wrappedCallbacks);
}

// ==========================================
// Engine accessors
// ==========================================
export function getEngine() { return _stockfish; }
export function isEngineReady() { return _isEngineReady; }

export function getDepth() { return _depth; }
export function setDepth(d) {
    _depth = parseInt(d) || 12;
    try { localStorage.setItem('blundermate_depth', _depth); } catch {}
}

// ==========================================
// Queue accessors
// ==========================================
export function setQueue(newQueue) { analysisQueue = newQueue; }
export function setCurrentIndex(i) { currentAnalysisIndex = i; }
export function advanceCurrentIndex() { currentAnalysisIndex++; }

export function isRunning() { return _isAnalyzing; }
export function isAwaitingRestart() { return _isWaitingForStop; }

// 분석 중에 사용자가 새 게임을 시작하면 즉시 stop 보내고 onBestMove 콜백에서 재시작.
// stop 응답은 비동기라 pendingQueue에 보류 후 isWaitingForStop 플래그를 set.
export function scheduleRestart(newQueue, targetIndex) {
    _pendingQueue = newQueue;
    _pendingTargetIndex = targetIndex;
    _isWaitingForStop = true;
    _isAnalyzing = false;
    _stockfish.stop();
}

// onBestMove 콜백이 stop 완료를 감지했을 때 호출. 보류된 큐를 반환하고 상태를 클리어.
// 반환값이 null이면 일반 완료(다음 수로 진행), 객체면 main.js가 startNewAnalysis를 다시 호출해야 함.
export function consumePendingRestart() {
    if (!_isWaitingForStop) return null;
    _isWaitingForStop = false;
    if (!_pendingQueue) return null;
    const result = { queue: _pendingQueue, targetIndex: _pendingTargetIndex };
    _pendingQueue = null;
    _pendingTargetIndex = null;
    return result;
}

// 큐의 다음 위치를 엔진에 보내거나, 큐가 끝났으면 콜백을 호출.
// onQueueDone: 큐 완료 (UI: 분석 상태 hide, 보드 시작 위치로 등)
// onPositionStart: 다음 분석 시작 (UI: 진행률 표시, 보드 업데이트)
// onWaitingEngine: 엔진이 아직 준비 안 됐을 때 — 보통 곧 onReady 콜백에서 자동 재개
export function processNext({ onQueueDone, onPositionStart, onWaitingEngine }) {
    if (currentAnalysisIndex >= analysisQueue.length) {
        if (onQueueDone) onQueueDone();
        return;
    }
    _isAnalyzing = true;
    const pos = analysisQueue[currentAnalysisIndex];
    if (onPositionStart) onPositionStart(currentAnalysisIndex, pos);
    if (!_isEngineReady) {
        _isAnalyzing = false;
        if (onWaitingEngine) onWaitingEngine();
        return;
    }
    _stockfish.analyzeFen(pos.fen, _depth);
}

// onBestMove 콜백 끝에서 호출 — 분석 완료된 수의 인덱스를 다음으로 옮기고 큐를 이어 돌린다.
export function markPositionDone(processNextOpts) {
    advanceCurrentIndex();
    _isAnalyzing = false;
    processNext(processNextOpts);
}

// 분석을 시작하지는 않고 상태만 idle로 — 큐 끝에서 onBestMove가 호출되었을 때 등.
export function markIdle() {
    _isAnalyzing = false;
}

// ==========================================
// Cleanup
// ==========================================
// 분석 화면을 떠날 때 (cleanupAnalysis) 호출. 엔진 멈추고 모든 상태 초기화.
export function stopAndClear() {
    if (_stockfish) _stockfish.stop();
    _isAnalyzing = false;
    _isWaitingForStop = false;
    _pendingQueue = null;
    _pendingTargetIndex = null;
    analysisQueue = [];
    currentAnalysisIndex = 0;
}

// 분석 화면을 막 떠난 직후, 외부에서 stop만 보낼 때 (탐색 모드 종료 등).
export function stopEngine() {
    if (_stockfish) _stockfish.stop();
}
