import { t } from './strings.js';
import { pickQuote, quotesReady } from './quotes.js';

const analysisView = document.getElementById('analysisView');
const analysisControlsBar = document.getElementById('analysisControlsBar');
const analysisMenuPopover = document.getElementById('liveMenuPopover');
const analysisMenuBtn = document.getElementById('liveMenuBtn');
const previewStartBtn = document.getElementById('previewStartBtn');
const loadingQuoteText = document.getElementById('loadingQuoteText');
const loadingQuoteAuthor = document.getElementById('loadingQuoteAuthor');
const loadingQuoteWrap = loadingQuoteText ? loadingQuoteText.parentElement : null;
const loadingProgressFill = document.getElementById('loadingProgressFill');
const loadingProgressText = document.getElementById('loadingProgressText');

const QUOTE_ROTATION_MS = 4500;

let isLoading = false;
let quoteRotationTimer = null;

export function isAnalysisLoadingActive() {
    return isLoading;
}

export function initPreviewStartButton(onClick) {
    previewStartBtn?.addEventListener('click', onClick);
}

export function setAnalysisChromeVisible(visible) {
    analysisControlsBar?.classList.toggle('chrome-hidden', !visible);
    if (!visible) {
        analysisMenuPopover?.classList.remove('is-open');
        if (analysisMenuPopover) analysisMenuPopover.hidden = true;
        analysisMenuBtn?.setAttribute('aria-expanded', 'false');
    }
}

export function applyPreviewControls() {
    setAnalysisChromeVisible(false);
    previewStartBtn?.classList.remove('hidden');
    if (previewStartBtn) previewStartBtn.textContent = t('analysis_start_btn');
}

export function removePreviewControls() {
    setAnalysisChromeVisible(true);
    previewStartBtn?.classList.add('hidden');
}

function showCurrentQuote() {
    const q = pickQuote();
    if (!q || !loadingQuoteText) return;
    loadingQuoteWrap?.classList.remove('fading');
    loadingQuoteText.textContent = q.quote;
    if (loadingQuoteAuthor) loadingQuoteAuthor.textContent = q.author;
}

function rotateQuoteWithFade() {
    if (!loadingQuoteWrap) return;
    loadingQuoteWrap.classList.add('fading');
    setTimeout(showCurrentQuote, 380);
}

export function setLoadingProgress(completed, total) {
    if (!loadingProgressFill || !loadingProgressText) return;
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    loadingProgressFill.style.width = pct + '%';
    loadingProgressText.textContent = `${pct}%`;
}

export function enterAnalysisLoading({ total, renderPreviewCard }) {
    isLoading = true;
    analysisView?.classList.remove('view-review');
    analysisView?.classList.add('analyzing-loading');
    setAnalysisChromeVisible(false);
    renderPreviewCard?.();
    setLoadingProgress(0, total);

    loadingQuoteWrap?.classList.remove('fading');
    quotesReady().then(() => {
        if (!isLoading) return;
        showCurrentQuote();
    });

    if (quoteRotationTimer) clearInterval(quoteRotationTimer);
    quoteRotationTimer = setInterval(rotateQuoteWithFade, QUOTE_ROTATION_MS);
}

export function exitAnalysisLoading() {
    if (!isLoading) return;
    isLoading = false;
    analysisView?.classList.remove('analyzing-loading');
    setAnalysisChromeVisible(true);

    if (quoteRotationTimer) {
        clearInterval(quoteRotationTimer);
        quoteRotationTimer = null;
    }
}
