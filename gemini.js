import { formatMarkdownToHtml } from './utils.js';

/**
 * Gemini AI 해설 핸들러를 생성합니다.
 * main.js의 상태에 대한 접근을 getState/setState 콜백으로 추상화하여 결합도를 낮춥니다.
 *
 * @param {object} ctx
 * @param {Function} ctx.getState  - 현재 앱 상태 스냅샷을 반환하는 함수
 * @param {Function} ctx.setState  - isGeminiLoading, geminiAbortController 를 업데이트하는 함수
 * @param {HTMLElement} ctx.geminiEl - Gemini 해설 패널 DOM 엘리먼트
 * @returns {Function} handleGeminiExplanation 핸들러
 */
export function createGeminiHandler({ getState, setState, geminiEl, onOpen }) {
    return async function handleGeminiExplanation() {
        const state = getState();

        if (state.isGeminiLoading) return;

        // 스트리밍 중 재클릭 시 요청 취소 (isGeminiLoading으로 이미 보호되지만 abort도 처리)
        if (state.geminiAbortController) {
            state.geminiAbortController.abort();
            setState({ geminiAbortController: null });
        }

        // 예외 1: 시작 위치
        if (state.currentlyViewedIndex < 0 || !state.analysisQueue[state.currentlyViewedIndex]) {
            geminiEl.innerHTML = '<p class="ai-notice">시작 위치에서는 AI 해설을 사용할 수 없습니다. 체스 수를 하나 선택해 주세요.</p>';
            onOpen();
            return;
        }

        // 예외 2: 탐색/시뮬레이션 모드
        if (state.isExplorationMode || state.isSimulationMode) {
            geminiEl.innerHTML = '<p class="ai-notice">자유 탐색 모드에서는 AI 해설을 지원하지 않습니다. 메인 기보로 돌아가 주세요.</p>';
            onOpen();
            return;
        }

        const move = state.analysisQueue[state.currentlyViewedIndex];

        // 예외 3: 오답 상황이 아닌 경우 (API 비용 절약)
        const needsExplanation = ['Blunder', 'Mistake', 'Missed Win', 'Inaccuracy'].includes(move.classification);
        if (!needsExplanation) {
            geminiEl.innerHTML = renderGoodMovePanel();
            onOpen();
            return;
        }

        // 캐시 HIT: 재요청 없이 즉시 렌더링
        if (move.cachedExplanation) {
            geminiEl.innerHTML = renderExplanationPanel(move.cachedExplanation);
            onOpen();
            return;
        }

        // 로딩 UI 표시
        setState({ isGeminiLoading: true });
        geminiEl.innerHTML = renderExplanationPanel('<p class="ai-loading">AI가 국면을 분석하고 있습니다...<br><span class="ai-loading-sub">(약 2~5초 소요)</span></p>');
        onOpen();

        const abortController = new AbortController();
        setState({ geminiAbortController: abortController });

        // 엔진 데이터 추출
        let ascii_board = '';
        let evalDrop = '0.0';
        let best_move = 'Unknown';
        let best_pv = '';
        let punishment_pv = '';

        try {
            ascii_board = new window.Chess(move.fen).ascii();
        } catch(e) {}

        const { analysisQueue, currentlyViewedIndex } = state;
        if (currentlyViewedIndex > 0) {
            const prevMove = analysisQueue[currentlyViewedIndex - 1];
            if (prevMove?.engineLines?.[0]) {
                best_move = prevMove.engineLines[0].pv?.split(' ')[0] || 'Unknown';
                best_pv = prevMove.engineLines[0].pv || '';
                if (move.engineLines?.[0]) {
                    evalDrop = (move.engineLines[0].scoreNum - prevMove.engineLines[0].scoreNum).toFixed(2);
                }
            }
        }
        if (move.engineLines?.[0]) {
            punishment_pv = move.engineLines[0].pv || '';
        }

        try {
            const geminiTextEl = document.getElementById('geminiText');
            geminiTextEl.innerHTML = '';

            if (state.isGeminiEnabled) {
                // 실제 Gemini API 호출 및 SSE 스트리밍
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: abortController.signal,
                    body: JSON.stringify({
                        fen: move.fen, ascii_board, playedMove: move.san,
                        classification: move.classification || 'Move',
                        evalDrop, best_move, punishment_pv, best_pv
                    })
                });

                if (!response.ok) {
                    let errorMsg = `Server error: ${response.status}`;
                    try { const err = await response.json(); if (err.error) errorMsg = err.error; } catch(e) {}
                    throw new Error(errorMsg);
                }
                if (!response.body) throw new Error('ReadableStream not supported');

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let fullText = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullText += decoder.decode(value, { stream: true });
                    geminiTextEl.innerHTML = formatMarkdownToHtml(fullText);
                    geminiTextEl.scrollTop = geminiTextEl.scrollHeight;
                }
            } else {
                // 더미 데이터 시뮬레이션 (Settings OFF 상태)
                const dummyData = `### 문제점\n${move.san}은 상대에게 ${punishment_pv || '결정적인 반격'}의 기회를 준다. 이 수순이 이어지면 포지션의 균형이 무너지고 수비가 어려워진다.\n\n### 개선안\n${best_move}를 뒀다면 ${best_pv ? '이어지는 전개에서' : '이후 수순에서'} 중앙 장악력을 유지하며 주도권을 가져올 수 있었다.`;

                let fullText = '';
                let chunkIndex = 0;
                await new Promise((resolve, reject) => {
                    const interval = setInterval(() => {
                        if (abortController.signal.aborted) {
                            clearInterval(interval);
                            reject(new DOMException('Aborted', 'AbortError'));
                            return;
                        }
                        if (chunkIndex < dummyData.length) {
                            fullText += dummyData.substring(chunkIndex, chunkIndex + 2);
                            chunkIndex += 2;
                            geminiTextEl.innerHTML = formatMarkdownToHtml(fullText);
                            geminiTextEl.scrollTop = geminiTextEl.scrollHeight;
                        } else {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 20);
                });
            }

            // 스트리밍 완료 후 결과 캐싱
            move.cachedExplanation = geminiTextEl.innerHTML;

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error("Gemini AI Error:", error);
            const geminiTextEl = document.getElementById('geminiText');
            const errHtml = `<p class="ai-error">AI 해설을 불러오는 데 실패했습니다.<br><span class="ai-error-detail">${error.message}</span></p>`;
            if (geminiTextEl) geminiTextEl.innerHTML = errHtml;
            else geminiEl.innerHTML = errHtml;
        } finally {
            setState({ isGeminiLoading: false, geminiAbortController: null });
        }
    };
}

// ==========================================
// 내부 UI 렌더링 헬퍼
// ==========================================
function renderExplanationPanel(content) {
    return `<div id="geminiText" class="gemini-text-panel">${content}</div>`;
}

function renderGoodMovePanel() {
    return `
        <div class="ai-good-move-panel">
            <svg class="ai-good-move-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <strong class="ai-good-move-title">이미 훌륭한 수입니다</strong>
            <p class="ai-good-move-desc">
                AI 코치는 <span class="text-danger">Blunder</span>·<span class="text-warning">Mistake</span> 등<br>
                설명이 꼭 필요한 상황에서만 분석합니다.
            </p>
        </div>
    `;
}
