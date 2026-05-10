// 테마 정책 + DOM 적용. settings.js와 index.html FOUC inline 양쪽이 사용.
// 'system'이면 prefers-color-scheme 자동 따름; 사용자가 토글하면 'light'/'dark' 강제.

import { getTheme, setTheme } from './storage.js';

export const THEMES = Object.freeze({
    LIGHT:  'light',
    DARK:   'dark',
    SYSTEM: 'system',
});

function effectiveTheme() {
    const t = getTheme();
    if (t === THEMES.LIGHT || t === THEMES.DARK) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', effectiveTheme());
}

export function setAndApplyTheme(theme) {
    setTheme(theme);
    applyTheme();
}

if (typeof window !== 'undefined' && window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
        if (getTheme() === THEMES.SYSTEM) applyTheme();
    });
}
