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
import { showConfirm, showToast } from './dialogs.js';
import { THEMES, setAndApplyTheme } from './theme.js';

const THEME_BTNS = [
    ['themeSystemBtn', THEMES.SYSTEM],
    ['themeLightBtn',  THEMES.LIGHT],
    ['themeDarkBtn',   THEMES.DARK],
];

function syncThemeButtons() {
    const cur = getTheme();
    for (const [id, t] of THEME_BTNS) {
        document.getElementById(id)?.classList.toggle('active', t === cur);
    }
}

let _navigateTo = null;
let _SCREENS = null;
let _applyLocale = null;
let _renderAiTabContentIfActive = null;
let _applyCoords = null;
let _showOnboarding = null;

let _initialized = false;

export function onSettingsViewEnter() {
    const depthSelect = document.getElementById('depthSelect');
    if (depthSelect) depthSelect.value = String(getDepth());
    const tcSelect = document.getElementById('defaultTcSelect');
    if (tcSelect) tcSelect.value = lsGet(DEFAULT_TC_KEY, 'rapid');
    const gemini = document.getElementById('geminiToggle');
    if (gemini) gemini.checked = getIsGeminiEnabled();
    const coords = document.getElementById('coordsToggle');
    if (coords) coords.checked = getIsCoordsEnabled();
    syncThemeButtons();
    const locale = getLocale();
    document.getElementById('langKoBtn')?.classList.toggle('active', locale === 'ko');
    document.getElementById('langEnBtn')?.classList.toggle('active', locale === 'en');
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

function wireSettingsPage() {
    wireBackBtn('settingsBackBtn');

    document.getElementById('langKoBtn')?.addEventListener('click', () => applyLocaleChange('ko'));
    document.getElementById('langEnBtn')?.addEventListener('click', () => applyLocaleChange('en'));

    document.getElementById('defaultTcSelect')?.addEventListener('change', (e) => {
        setDefaultTcFilter(e.target.value);
    });

    document.getElementById('depthSelect')?.addEventListener('change', (e) => {
        setDepth(e.target.value);
    });

    document.getElementById('geminiToggle')?.addEventListener('change', (e) => {
        setIsGeminiEnabled(e.target.checked);
    });

    document.getElementById('coordsToggle')?.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        setIsCoordsEnabled(enabled);
        _applyCoords?.(enabled);
    });

    for (const [id, theme] of THEME_BTNS) {
        document.getElementById(id)?.addEventListener('click', () => {
            setAndApplyTheme(theme);
            syncThemeButtons();
        });
    }

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
