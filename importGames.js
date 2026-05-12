// Import Games view — 우상단 + → "다른 사용자 게임 검색" 진입.
// 본인 user_id / platform은 절대 변경하지 않음 — *On 변형으로 임의 플랫폼 fetch.
// home.js의 게임 카드 컴포넌트는 내부 의존이 깊어 재사용하지 않고 단순 row 렌더 — 미니보드 미포함.

import { fetchRecentGamesOn, verifyUserExistsOn } from './chessApi.js';
import { PLATFORM_CHESSCOM, PLATFORM_LICHESS } from './storage.js';
import {
    escapeHtml, parseOpeningFromPgn, rootOpeningName, formatRelativeDate, getDateStrings,
    classifyGameResult, isWhitePlayer, resultLetter,
} from './utils.js';
import { t } from './strings.js';

const SEARCH_LIMIT = 20;

let _platform = PLATFORM_CHESSCOM;
let _pgnInput = null;
let _handlePgnReviewStart = null;
let _lastResults = [];
let _lastUser = '';

function setStatus(text) {
    const el = document.getElementById('importGamesStatus');
    if (!el) return;
    if (!text) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `<div class="container-message">${escapeHtml(text)}</div>`;
}

function setActivePlatform(platform) {
    if (platform !== PLATFORM_CHESSCOM && platform !== PLATFORM_LICHESS) return;
    _platform = platform;
    document.querySelectorAll('#importGamesView .platform-toggle-btn').forEach(btn => {
        const active = btn.dataset.platform === platform;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
}

async function runSearch() {
    const usernameInput = document.getElementById('importGamesUsername');
    const username = (usernameInput?.value || '').trim();
    const list = document.getElementById('importGamesList');

    if (!username) {
        setStatus(t('import_games_empty_query'));
        if (list) list.innerHTML = '';
        return;
    }

    setStatus(t('import_games_loading'));
    if (list) list.innerHTML = '';

    try {
        // verify는 "유저 존재하나 게임 0" 케이스 분기용. fetch와 병렬 — verify가 약 200ms 절약.
        const [exists, games] = await Promise.all([
            verifyUserExistsOn(_platform, username),
            fetchRecentGamesOn(_platform, username, SEARCH_LIMIT).catch(() => []),
        ]);
        if (!exists) {
            setStatus(t('import_games_not_found'));
            return;
        }
        if (!games || games.length === 0) {
            setStatus(t('games_empty'));
            return;
        }
        setStatus('');
        _lastResults = games;
        _lastUser = username;
        renderResults();
    } catch (err) {
        console.warn('[importGames] search failed:', err);
        setStatus(t('import_games_error'));
    }
}

function renderResults() {
    const list = document.getElementById('importGamesList');
    if (!list) return;
    const userLower = _lastUser.toLowerCase();
    const dateStrings = getDateStrings();

    list.innerHTML = _lastResults.map((game, idx) => {
        const isWhite = isWhitePlayer(game, userLower);
        const oppSide = isWhite ? game.black : game.white;
        const resultClass = classifyGameResult(game, userLower);
        const opening = rootOpeningName(parseOpeningFromPgn(game.pgn || '').name || '');
        const date = game.end_time ? formatRelativeDate(game.end_time, dateStrings) : '';
        const oppName = oppSide?.username || '';
        const oppRating = oppSide?.rating ? String(oppSide.rating) : '';
        const metaParts = [opening, date].filter(Boolean);
        const metaHtml = metaParts.map(p => `<span>${escapeHtml(p)}</span>`).join('');

        return `
            <button type="button" class="import-game-row" data-idx="${idx}">
                <span class="import-game-result import-game-result--${resultClass}">${escapeHtml(resultLetter(resultClass))}</span>
                <span class="import-game-info">
                    <span class="import-game-opp-row">
                        <span class="import-game-opp">${escapeHtml(oppName)}</span>
                        ${oppRating ? `<span class="import-game-opp-rating">${escapeHtml(oppRating)}</span>` : ''}
                    </span>
                    ${metaHtml ? `<span class="import-game-meta">${metaHtml}</span>` : ''}
                </span>
            </button>
        `;
    }).join('');

    list.querySelectorAll('.import-game-row').forEach(btn => {
        const idx = parseInt(btn.dataset.idx, 10);
        const game = _lastResults[idx];
        if (!game) return;
        btn.addEventListener('click', () => {
            if (!game.pgn) return;
            const isWhite = isWhitePlayer(game, _lastUser.toLowerCase());
            _pgnInput.value = game.pgn;
            _handlePgnReviewStart(null, isWhite, null, true);
        });
    });
}

export function initImportGames({ pgnInput, handlePgnReviewStart }) {
    _pgnInput = pgnInput;
    _handlePgnReviewStart = handlePgnReviewStart;

    document.getElementById('importGamesBackBtn')?.addEventListener('click', () => history.back());

    document.querySelectorAll('#importGamesView .platform-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => setActivePlatform(btn.dataset.platform));
    });

    const searchBtn = document.getElementById('importGamesSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', runSearch);

    const usernameInput = document.getElementById('importGamesUsername');
    if (usernameInput) {
        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
            }
        });
    }
}

// 페이지 진입 시 — 입력창 focus, 빈 상태 안내. 결과는 세션 보존.
export function onImportGamesViewEnter() {
    if (_lastResults.length === 0) {
        setStatus(t('import_games_empty_query'));
    }
    const usernameInput = document.getElementById('importGamesUsername');
    if (usernameInput) {
        setTimeout(() => usernameInput.focus(), 50);
    }
}
