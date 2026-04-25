import { formatMarkdownToHtml } from './utils.js';
import { t } from './strings.js';
import { GEMINI_KEY } from './storage.js';
import { appMode } from './modes.js';
import { currentlyViewedIndex } from './board.js';
import { analysisQueue } from './analysis.js';

// ==========================================
// Module state
// ==========================================
let _geminiEl = null;
let _onOpen = null; // 보통 main.js의 switchTab('ai')
let _isGeminiLoading = false;
let _geminiAbortController = null;
let _isGeminiEnabled = localStorage.getItem(GEMINI_KEY) !== 'false';

// ==========================================
// Initialization & accessors
// ==========================================
export function initGemini({ geminiEl, onOpen }) {
    _geminiEl = geminiEl;
    _onOpen = onOpen;
}

export function getIsGeminiEnabled() { return _isGeminiEnabled; }
export function setIsGeminiEnabled(v) {
    _isGeminiEnabled = !!v;
    try { localStorage.setItem(GEMINI_KEY, _isGeminiEnabled); } catch {}
}

// 진행 중인 요청을 즉시 취소. 보드 위치 변경 시 호출되어 불필요한 SSE 연결을 끊는다.
export function abortPendingGemini() {
    if (_geminiAbortController) {
        _geminiAbortController.abort();
        _geminiAbortController = null;
    }
}

// ==========================================
// AI 탭 콘텐츠 렌더링 (현재 보고 있는 수의 캐시된 설명 또는 분석 버튼)
// ==========================================
export function renderAiTabContent() {
    if (!_geminiEl) return;
    const move = analysisQueue[currentlyViewedIndex];
    if (move?.cachedExplanation) {
        _geminiEl.innerHTML = `<div id="geminiText" class="gemini-text-panel">${move.cachedExplanation}</div>`;
    } else {
        _geminiEl.innerHTML = `<button id="aiAnalyzeBtn" class="ai-analyze-btn">${t('analyzePosition')}</button>`;
    }
}

// ==========================================
// 메인 핸들러
// ==========================================
export async function handleGeminiExplanation() {
    if (_isGeminiLoading) return;

    // 스트리밍 중 재클릭 시 요청 취소
    abortPendingGemini();

    // 예외 1: 시작 위치
    if (currentlyViewedIndex < 0 || !analysisQueue[currentlyViewedIndex]) {
        _geminiEl.innerHTML = `<p class="ai-notice">${t('gemini_no_start')}</p>`;
        if (_onOpen) _onOpen();
        return;
    }

    // 예외 2: 탐색/시뮬레이션 모드
    if (appMode !== 'main') {
        _geminiEl.innerHTML = `<p class="ai-notice">${t('gemini_no_free')}</p>`;
        if (_onOpen) _onOpen();
        return;
    }

    const move = analysisQueue[currentlyViewedIndex];

    // 예외 3: 오답 상황이 아닌 경우 (API 비용 절약)
    const needsExplanation = ['Blunder', 'Mistake', 'Inaccuracy'].includes(move.classification);
    if (!needsExplanation) {
        _geminiEl.innerHTML = renderGoodMovePanel();
        if (_onOpen) _onOpen();
        return;
    }

    // 캐시 HIT: 재요청 없이 즉시 렌더링
    if (move.cachedExplanation) {
        _geminiEl.innerHTML = renderExplanationPanel(move.cachedExplanation);
        if (_onOpen) _onOpen();
        return;
    }

    // 로딩 UI 표시
    _isGeminiLoading = true;
    _geminiEl.innerHTML = renderExplanationPanel(`<p class="ai-loading">${t('gemini_analyzing')}<br><span class="ai-loading-sub">${t('gemini_analyzing_sub')}</span></p>`);
    if (_onOpen) _onOpen();

    _geminiAbortController = new AbortController();
    const abortController = _geminiAbortController;

    // 엔진 데이터 추출
    let ascii_board = '';
    let evalDrop = '0.0';
    let best_move = 'Unknown';
    let best_pv = '';
    let punishment_pv = '';

    try {
        ascii_board = new window.Chess(move.fen).ascii();
    } catch (e) {}

    if (currentlyViewedIndex > 0) {
        const prevMove = analysisQueue[currentlyViewedIndex - 1];
        if (prevMove?.engineLines?.[0]) {
            best_move = prevMove.engineLines[0].pv?.split(' ')[0] || 'Unknown';
            best_pv = prevMove.engineLines[0].pv || '';
            if (move.engineLines?.[0]) {
                const safeA = (typeof move.engineLines[0].scoreNum === 'number' && !isNaN(move.engineLines[0].scoreNum)) ? move.engineLines[0].scoreNum : 0;
                const safeB = (typeof prevMove.engineLines[0].scoreNum === 'number' && !isNaN(prevMove.engineLines[0].scoreNum)) ? prevMove.engineLines[0].scoreNum : 0;
                evalDrop = (safeA - safeB).toFixed(2);
            }
        }
    }
    if (move.engineLines?.[0]) {
        punishment_pv = move.engineLines[0].pv || '';
    }

    try {
        const geminiTextEl = document.getElementById('geminiText');
        geminiTextEl.innerHTML = '';

        if (_isGeminiEnabled) {
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
                try { const err = await response.json(); if (err.error) errorMsg = err.error; } catch (e) {}
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
        const errHtml = `<p class="ai-error">${t('gemini_error')}<br><span class="ai-error-detail">${error.message}</span></p>`;
        if (geminiTextEl) geminiTextEl.innerHTML = errHtml;
        else _geminiEl.innerHTML = errHtml;
    } finally {
        _isGeminiLoading = false;
        _geminiAbortController = null;
    }
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
            <strong class="ai-good-move-title">${t('gemini_already_best')}</strong>
            <p class="ai-good-move-desc">${t('gemini_best_only')}</p>
        </div>
    `;
}
