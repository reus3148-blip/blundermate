import { lsGet, lsSet } from './storage.js';
import { t } from './strings.js';
import { showConfirm } from './dialogs.js';

const OTB_SETTINGS_KEY = 'blundermate_otb_settings';
const PRESETS = [
    { id: '3+2', baseSeconds: 180, incrementSeconds: 2 },
    { id: '5+0', baseSeconds: 300, incrementSeconds: 0 },
    { id: '10+0', baseSeconds: 600, incrementSeconds: 0 },
    { id: '15+10', baseSeconds: 900, incrementSeconds: 10 },
];
const SIDES = ['white', 'black'];

let initialized = false;
let navigateHome = null;
let timerId = null;
let lastTs = 0;
let wakeLock = null;
let displayCache = { white: '', black: '', status: '' };

const state = {
    baseSeconds: 300,
    incrementSeconds: 0,
    remainingMs: { white: 300000, black: 300000 },
    activeSide: null,
    running: false,
    moves: { white: 0, black: 0 },
    flipped: false,
    wakeEnabled: false,
};

const els = {};

function loadSettings() {
    try {
        const parsed = JSON.parse(lsGet(OTB_SETTINGS_KEY, '{}') || '{}');
        const base = Number(parsed.baseSeconds);
        const inc = Number(parsed.incrementSeconds);
        state.baseSeconds = Number.isFinite(base) && base > 0 ? Math.min(base, 24 * 60 * 60) : 300;
        state.incrementSeconds = Number.isFinite(inc) && inc >= 0 ? Math.min(inc, 600) : 0;
        state.flipped = !!parsed.flipped;
        state.wakeEnabled = !!parsed.wakeEnabled;
    } catch (_) {}
    resetClock(false);
}

function saveSettings() {
    lsSet(OTB_SETTINGS_KEY, JSON.stringify({
        baseSeconds: state.baseSeconds,
        incrementSeconds: state.incrementSeconds,
        flipped: state.flipped,
        wakeEnabled: state.wakeEnabled,
    }));
}

function sideLabel(side) {
    return side === 'white' ? t('otb_white') : t('otb_black');
}

function otherSide(side) {
    return side === 'white' ? 'black' : 'white';
}

function canChangeTimeControls() {
    return !state.activeSide && state.moves.white === 0 && state.moves.black === 0;
}

function isClockMode() {
    return !!state.activeSide;
}

function getSideOrder() {
    return state.flipped ? ['white', 'black'] : ['black', 'white'];
}

function formatClock(ms) {
    const safe = Math.max(0, Math.ceil(ms / 100) * 100);
    const totalSeconds = Math.floor(safe / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    if (safe <= 10000 && safe > 0) {
        return `${minutes}:${String(seconds).padStart(2, '0')}.${Math.floor((safe % 1000) / 100)}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function stopTick() {
    if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
    }
}

function syncActiveRemaining() {
    if (!state.running || !state.activeSide) return;
    const now = performance.now();
    const elapsed = now - lastTs;
    lastTs = now;
    state.remainingMs[state.activeSide] = Math.max(0, state.remainingMs[state.activeSide] - elapsed);
    if (state.remainingMs[state.activeSide] <= 0) {
        state.running = false;
        stopTick();
        releaseWakeLock();
    }
}

function scheduleTick() {
    stopTick();
    if (!state.running || !state.activeSide) return;
    const remaining = state.remainingMs[state.activeSide];
    const delay = remaining <= 10000 ? 120 : 500;
    timerId = setTimeout(() => {
        syncActiveRemaining();
        renderClock();
        scheduleTick();
    }, delay);
}

async function requestWakeLock() {
    if (!state.wakeEnabled || wakeLock || !('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
            renderWakeButton();
        });
    } catch (_) {
        wakeLock = null;
    }
    renderWakeButton();
}

function releaseWakeLock() {
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => {});
    renderWakeButton();
}

function startClock(startSide = 'white') {
    if (state.running) return;
    state.activeSide = state.activeSide || startSide;
    state.running = true;
    lastTs = performance.now();
    requestWakeLock();
    renderClock(true);
    scheduleTick();
}

function pauseClock() {
    if (!state.running) return;
    syncActiveRemaining();
    state.running = false;
    stopTick();
    releaseWakeLock();
    renderClock(true);
}

function resetClock(shouldRender = true) {
    stopTick();
    state.running = false;
    state.activeSide = null;
    state.remainingMs.white = state.baseSeconds * 1000;
    state.remainingMs.black = state.baseSeconds * 1000;
    state.moves.white = 0;
    state.moves.black = 0;
    releaseWakeLock();
    displayCache = { white: '', black: '', status: '' };
    if (shouldRender) renderClock(true);
}

function finishMove(side) {
    if (!state.running || state.activeSide !== side || state.remainingMs[side] <= 0) return;
    syncActiveRemaining();
    state.remainingMs[side] += state.incrementSeconds * 1000;
    state.moves[side] += 1;
    state.activeSide = otherSide(side);
    lastTs = performance.now();
    renderClock(true);
    scheduleTick();
}

function setPreset(preset) {
    if (!canChangeTimeControls()) return;
    pauseClock();
    state.baseSeconds = preset.baseSeconds;
    state.incrementSeconds = preset.incrementSeconds;
    saveSettings();
    resetClock();
    renderPresetControls();
}

function applyCustomSettings() {
    if (!canChangeTimeControls()) return;
    const minutes = Number(els.customMinutes?.value);
    const increment = Number(els.customIncrement?.value);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    pauseClock();
    state.baseSeconds = Math.min(Math.round(minutes * 60), 24 * 60 * 60);
    state.incrementSeconds = Number.isFinite(increment) && increment >= 0 ? Math.min(Math.round(increment), 600) : 0;
    saveSettings();
    resetClock();
    renderPresetControls();
}

function renderPresetControls() {
    if (!els.presetBar) return;
    const currentId = `${Math.round(state.baseSeconds / 60)}+${state.incrementSeconds}`;
    els.presetBar.innerHTML = PRESETS.map(preset => {
        const selected = preset.id === currentId;
        return `<button type="button" class="otb-preset${selected ? ' is-selected' : ''}" data-preset="${preset.id}" aria-pressed="${selected ? 'true' : 'false'}">${preset.id}</button>`;
    }).join('');
    if (els.customMinutes) els.customMinutes.value = String(Math.round(state.baseSeconds / 60));
    if (els.customIncrement) els.customIncrement.value = String(state.incrementSeconds);
    renderTimeControlLock();
}

function renderTimeControlLock() {
    const locked = !canChangeTimeControls();
    els.presetBar?.querySelectorAll('button').forEach(btn => { btn.disabled = locked; });
    if (els.customMinutes) els.customMinutes.disabled = locked;
    if (els.customIncrement) els.customIncrement.disabled = locked;
    if (els.customApply) els.customApply.disabled = locked;
    els.customMinutes?.closest('.otb-custom-row')?.classList.toggle('is-locked', locked);
}

function renderWakeButton() {
    if (!els.wakeBtn) return;
    const supported = 'wakeLock' in navigator;
    els.wakeBtn.hidden = !supported;
    els.wakeBtn.setAttribute('aria-pressed', state.wakeEnabled ? 'true' : 'false');
    els.wakeBtn.classList.toggle('is-on', !!wakeLock || state.wakeEnabled);
    els.wakeBtn.textContent = state.wakeEnabled ? t('otb_wake_on') : t('otb_wake_off');
}

function renderMode() {
    els.view?.classList.toggle('is-clock-mode', isClockMode());
}

function renderClock(force = false) {
    renderMode();
    for (const side of SIDES) {
        const time = formatClock(state.remainingMs[side]);
        const panel = els[`${side}Panel`];
        if (force || displayCache[side] !== time) {
            const timeEl = els[`${side}Time`];
            if (timeEl) timeEl.textContent = time;
            displayCache[side] = time;
        }
        panel?.classList.toggle('is-active', state.activeSide === side && state.running);
        panel?.classList.toggle('is-flagged', state.remainingMs[side] <= 0);
        const movesEl = els[`${side}Moves`];
        if (movesEl) movesEl.textContent = String(state.moves[side]);
    }
    const order = getSideOrder();
    if (els.clockStage) {
        els.clockStage.classList.toggle('is-flipped', state.flipped);
    }
    if (els[`${order[0]}Panel`]) els[`${order[0]}Panel`].style.order = '0';
    if (els[`${order[1]}Panel`]) els[`${order[1]}Panel`].style.order = '2';
    for (const side of SIDES) {
        els[`${side}Panel`]?.classList.toggle('is-top', side === order[0]);
        els[`${side}Panel`]?.classList.toggle('is-bottom', side === order[1]);
    }
    const status = state.remainingMs.white <= 0
        ? t('otb_flag_white')
        : state.remainingMs.black <= 0
            ? t('otb_flag_black')
            : state.activeSide
                ? t('otb_turn').replace('{side}', sideLabel(state.activeSide))
                : t('otb_ready');
    if (force || displayCache.status !== status) {
        if (els.status) els.status.textContent = status;
        displayCache.status = status;
    }
    if (els.startPauseBtn) {
        els.startPauseBtn.textContent = state.running ? t('otb_pause') : (state.activeSide ? t('otb_resume') : t('otb_start'));
    }
    renderTimeControlLock();
    renderWakeButton();
}

function cacheElements() {
    els.view = document.getElementById('otbView');
    els.backBtn = document.getElementById('otbBackBtn');
    els.setupPanel = document.getElementById('otbSetupPanel');
    els.clockStage = document.getElementById('otbClockStage');
    els.presetBar = document.getElementById('otbPresetBar');
    els.customMinutes = document.getElementById('otbCustomMinutes');
    els.customIncrement = document.getElementById('otbCustomIncrement');
    els.customApply = document.getElementById('otbCustomApply');
    els.startPauseBtn = document.getElementById('otbStartPauseBtn');
    els.resetBtn = document.getElementById('otbResetBtn');
    els.flipBtn = document.getElementById('otbFlipBtn');
    els.wakeBtn = document.getElementById('otbWakeBtn');
    els.status = document.getElementById('otbStatus');
    for (const side of SIDES) {
        els[`${side}Panel`] = document.getElementById(`otb${side === 'white' ? 'White' : 'Black'}Panel`);
        els[`${side}Time`] = document.getElementById(`otb${side === 'white' ? 'White' : 'Black'}Time`);
        els[`${side}Moves`] = document.getElementById(`otb${side === 'white' ? 'White' : 'Black'}Moves`);
    }
}

export function initOtb({ navigateToHome } = {}) {
    if (initialized) return;
    initialized = true;
    navigateHome = navigateToHome;
    cacheElements();
    loadSettings();
    renderPresetControls();

    els.backBtn?.addEventListener('click', () => navigateHome?.());
    els.presetBar?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-preset]');
        if (!btn) return;
        const preset = PRESETS.find(p => p.id === btn.dataset.preset);
        if (preset) setPreset(preset);
    });
    els.customApply?.addEventListener('click', applyCustomSettings);
    els.startPauseBtn?.addEventListener('click', () => {
        if (state.running) pauseClock();
        else startClock(state.activeSide || 'white');
    });
    els.resetBtn?.addEventListener('click', async () => {
        if (state.running || state.activeSide || state.moves.white > 0 || state.moves.black > 0) {
            const ok = await showConfirm(t('otb_reset_confirm'), {
                okLabel: t('otb_reset'),
                cancelLabel: t('cancel'),
                destructive: true,
            });
            if (!ok) return;
        }
        resetClock();
    });
    els.flipBtn?.addEventListener('click', () => {
        state.flipped = !state.flipped;
        saveSettings();
        renderClock(true);
    });
    els.wakeBtn?.addEventListener('click', () => {
        state.wakeEnabled = !state.wakeEnabled;
        saveSettings();
        if (state.running && state.wakeEnabled) requestWakeLock();
        if (!state.wakeEnabled) releaseWakeLock();
        renderWakeButton();
    });
    for (const side of SIDES) {
        els[`${side}Panel`]?.addEventListener('click', () => finishMove(side));
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (state.running) syncActiveRemaining();
            stopTick();
            releaseWakeLock();
            return;
        }
        if (document.visibilityState === 'visible' && state.running) {
            syncActiveRemaining();
            renderClock(true);
            if (state.running) {
                if (state.wakeEnabled) requestWakeLock();
                scheduleTick();
            }
        }
    });
}

export function onOtbViewEnter() {
    renderPresetControls();
    renderClock(true);
}

export function onOtbViewExit() {
    pauseClock();
}
