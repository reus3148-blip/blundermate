import { getLocale } from './strings.js';

// quote.json은 처음 사용 시 한 번만 fetch. 실패해도 앱은 계속 동작 — 로딩 카드는 quote 없이 진행바만 표시.
let _quotes = null;
let _loadingPromise = null;
let _lastIndex = -1;

function loadQuotes() {
    if (_quotes) return Promise.resolve(_quotes);
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = fetch('./quote.json')
        .then(r => r.ok ? r.json() : [])
        .then(data => {
            _quotes = Array.isArray(data) ? data : [];
            return _quotes;
        })
        .catch(() => {
            _quotes = [];
            return _quotes;
        });
    return _loadingPromise;
}

// 모듈 import 시점부터 백그라운드로 미리 로드 — 분석 시작 시 첫 명언이 곧바로 뜨도록.
loadQuotes();

/**
 * 직전에 쓴 명언과 다른 임의의 명언을 반환. 로케일에 맞춰 ko/en 텍스트만 추출.
 * 아직 로드 전이거나 빈 배열이면 null.
 */
export function pickQuote() {
    if (!_quotes || _quotes.length === 0) return null;
    let idx;
    if (_quotes.length === 1) {
        idx = 0;
    } else {
        do {
            idx = Math.floor(Math.random() * _quotes.length);
        } while (idx === _lastIndex);
    }
    _lastIndex = idx;
    const entry = _quotes[idx];
    const locale = getLocale();
    const lang = (locale === 'en') ? 'en' : 'ko';
    return {
        quote: entry.quote?.[lang] || entry.quote?.ko || '',
        author: entry.author?.[lang] || entry.author?.ko || '',
    };
}

// 명언 데이터가 아직 로드 전이라면 첫 분석 시점에 await 가능하도록 노출.
export function quotesReady() {
    return loadQuotes();
}
