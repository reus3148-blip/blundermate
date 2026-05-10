// 설정 / 이 앱에 대해 / 피드백 페이지 모듈. main.js에서 약 170줄 추출.
//
// 주입 의존성: navigateTo + SCREENS는 main.js의 SPA 라우터, 나머지(applyLocale,
// renderAiTabContentIfActive, applyCoords, showOnboarding)는 main.js / home.js에
// 정의되어 있어 직접 import하면 순환 발생.

import { getDepth, setDepth } from './analysis.js';
import { getIsGeminiEnabled, setIsGeminiEnabled } from './gemini.js';
import { setDefaultTcFilter } from './home.js';
import { DEFAULT_TC_KEY, clearIdentity, lsGet, getIsCoordsEnabled, setIsCoordsEnabled, getTheme } from './storage.js';
import { setLocale, getLocale, t } from './strings.js';
import { showConfirm, showToast, showOptionSheet } from './dialogs.js';
import { THEMES, setAndApplyTheme } from './theme.js';

// 엔진 깊이 stepper 범위. analysis.js의 lsGet 기본값과 일치하는 14를 중앙에 두고 ±6, step 2.
const DEPTH_MIN = 8;
const DEPTH_MAX = 20;
const DEPTH_STEP = 2;

const LANG_OPTIONS = ['ko', 'en'];
const LANG_LABEL_KEY = { ko: 'settings_lang_ko', en: 'settings_lang_en' };

const TC_OPTIONS = ['rapid', 'blitz', 'bullet', 'all'];
const TC_LABEL_KEY = {
    rapid: 'home_filter_rapid',
    blitz: 'home_filter_blitz',
    bullet: 'home_filter_bullet',
    all:   'home_filter_all',
};

const THEME_OPTIONS = [THEMES.SYSTEM, THEMES.LIGHT, THEMES.DARK];
const THEME_LABEL_KEY = {
    [THEMES.SYSTEM]: 'theme_system',
    [THEMES.LIGHT]:  'theme_light',
    [THEMES.DARK]:   'theme_dark',
};

let _navigateTo = null;
let _SCREENS = null;
let _applyLocale = null;
let _renderAiTabContentIfActive = null;
let _applyCoords = null;
let _showOnboarding = null;

let _initialized = false;

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function syncDepthStepper(depth) {
    setText('depthVal', String(depth));
    const dec = document.getElementById('depthDecBtn');
    const inc = document.getElementById('depthIncBtn');
    if (dec) dec.disabled = depth <= DEPTH_MIN;
    if (inc) inc.disabled = depth >= DEPTH_MAX;
}

export function onSettingsViewEnter() {
    setText('settingsLangValue', t(LANG_LABEL_KEY[getLocale()]));
    setText('settingsTcValue', t(TC_LABEL_KEY[lsGet(DEFAULT_TC_KEY, 'rapid')]));
    setText('settingsThemeValue', t(THEME_LABEL_KEY[getTheme()]));
    syncDepthStepper(getDepth());

    const gemini = document.getElementById('geminiToggle');
    if (gemini) gemini.checked = getIsGeminiEnabled();
    const coords = document.getElementById('coordsToggle');
    if (coords) coords.checked = getIsCoordsEnabled();
}

export function onFeedbackViewEnter() {
    const input = document.getElementById('feedbackInput');
    const status = document.getElementById('feedbackStatusText');
    if (input) input.value = '';
    if (status) {
        status.textContent = '';
        status.style.color = '';
    }
}

export function initSettings({
    navigateTo, SCREENS, applyLocale, renderAiTabContentIfActive, applyCoords, showOnboarding,
}) {
    if (_initialized) return;
    _initialized = true;

    _navigateTo = navigateTo;
    _SCREENS = SCREENS;
    _applyLocale = applyLocale;
    _renderAiTabContentIfActive = renderAiTabContentIfActive;
    _applyCoords = applyCoords;
    _showOnboarding = showOnboarding;

    wireSettingsPage();
    wireBackBtn('aboutBackBtn');
    wireBackBtn('feedbackBackBtn');
    wireFeedbackSubmit();
}

function wireBackBtn(id) {
    document.getElementById(id)?.addEventListener('click', () => history.back());
}

function applyLocaleChange(locale) {
    setLocale(locale);
    _applyLocale?.();
    _renderAiTabContentIfActive?.();
}

function wireDisclosure({ rowId, valueId, titleKey, options, labelKey, get, set }) {
    document.getElementById(rowId)?.addEventListener('click', async () => {
        const cur = get();
        const picked = await showOptionSheet({
            title: t(titleKey),
            options: options.map(v => ({ value: v, label: t(labelKey[v]) })),
            current: cur,
        });
        if (!picked || picked === cur) return;
        set(picked);
        setText(valueId, t(labelKey[picked]));
    });
}

function wireSettingsPage() {
    wireBackBtn('settingsBackBtn');

    wireDisclosure({
        rowId: 'settingsLangRow',
        valueId: 'settingsLangValue',
        titleKey: 'settings_sheet_lang_title',
        options: LANG_OPTIONS,
        labelKey: LANG_LABEL_KEY,
        get: getLocale,
        // disclosure 값 텍스트는 data-i18n 바인딩이 아니라 imperative 렌더 — applyLocale이 못 잡으니 직접 갱신.
        set: (locale) => { applyLocaleChange(locale); onSettingsViewEnter(); },
    });

    wireDisclosure({
        rowId: 'settingsTcRow',
        valueId: 'settingsTcValue',
        titleKey: 'settings_sheet_tc_title',
        options: TC_OPTIONS,
        labelKey: TC_LABEL_KEY,
        get: () => lsGet(DEFAULT_TC_KEY, 'rapid'),
        set: setDefaultTcFilter,
    });

    wireDisclosure({
        rowId: 'settingsThemeRow',
        valueId: 'settingsThemeValue',
        titleKey: 'settings_sheet_theme_title',
        options: THEME_OPTIONS,
        labelKey: THEME_LABEL_KEY,
        get: getTheme,
        set: setAndApplyTheme,
    });

    document.getElementById('depthDecBtn')?.addEventListener('click', () => {
        const next = Math.max(DEPTH_MIN, getDepth() - DEPTH_STEP);
        if (next === getDepth()) return;
        setDepth(next);
        syncDepthStepper(next);
    });
    document.getElementById('depthIncBtn')?.addEventListener('click', () => {
        const next = Math.min(DEPTH_MAX, getDepth() + DEPTH_STEP);
        if (next === getDepth()) return;
        setDepth(next);
        syncDepthStepper(next);
    });

    document.getElementById('geminiToggle')?.addEventListener('change', (e) => {
        setIsGeminiEnabled(e.target.checked);
    });

    document.getElementById('coordsToggle')?.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        setIsCoordsEnabled(enabled);
        _applyCoords?.(enabled);
    });

    document.getElementById('settingsFeedbackBtn')?.addEventListener('click', () => {
        _navigateTo(_SCREENS.FEEDBACK);
    });
    document.getElementById('settingsAboutBtn')?.addEventListener('click', () => {
        _navigateTo(_SCREENS.ABOUT);
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const ok = await showConfirm(t('settings_logout_confirm'), {
            okLabel: t('settings_logout'),
            destructive: true,
        });
        if (!ok) return;
        clearIdentity();
        // 온보딩으로 — history는 home으로 일단 돌려놓고 home.js가 onboardingView로 덮어씀.
        _navigateTo(_SCREENS.HOME);
        _showOnboarding?.();
    });
}

function wireFeedbackSubmit() {
    const submitBtn = document.getElementById('submitFeedbackBtn');
    if (!submitBtn) return;
    submitBtn.addEventListener('click', async () => {
        const input = document.getElementById('feedbackInput');
        const status = document.getElementById('feedbackStatusText');
        const content = (input?.value || '').trim();
        if (!content) {
            if (status) {
                status.textContent = t('feedback_validation');
                status.style.color = 'var(--blunder)';
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = t('feedback_sending');
        if (status) status.textContent = '';

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                showToast(t('feedback_success'));
                if (input) input.value = '';
                // 성공 후 직전 페이지(보통 settings)로 자동 복귀.
                setTimeout(() => { history.back(); }, 600);
            } else {
                let errText = t('feedback_error_label');
                try {
                    const errJson = await res.json();
                    if (errJson.error) errText = errJson.error;
                } catch (_) {}
                if (status) {
                    status.textContent = errText;
                    status.style.color = 'var(--blunder)';
                }
            }
        } catch (error) {
            if (status) {
                status.textContent = t('feedback_error_network');
                status.style.color = 'var(--blunder)';
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = t('feedback_send');
        }
    });
}
