// 홈 화면 + 온보딩 모듈. main.js에서 약 500줄 추출.
//
// 책임:
//   - 홈 프로필 카드 (아바타/이름/레이팅/최근 전적)
//   - 최근 게임 카드 리스트 (무한 스크롤 + 비동기 분석 캐시 데코)
//   - 미니 보드 SVG 렌더 (84px 인라인 SVG, OS 폰트 의존 제거)
//   - 시간대 필터 드롭다운 (rapid/blitz/bullet/all)
//   - 온보딩 화면 (플랫폼 선택 + 닉네임 입력)
//   - 익명 사용자 닉네임 로그 fire-and-forget
//
// main.js와의 결합점: initHome({ pgnInput, homeView, bottomNav, appContainer,
//   syncBottomNav, SCREENS, handlePgnReviewStart })로 주입. refreshHomeCounts는
//   main.js의 renderScreen(HOME)에서 직접 호출.

import { fetchRecentGames, fetchPlayerProfile } from './chessApi.js';
import {
    getMyUserId, setMyUserId, getMyPlatform, setMyPlatform,
    PLATFORM_CHESSCOM, PLATFORM_LICHESS, ONBOARDING_KEY, DEFAULT_TC_KEY,
    computePgnHash, loadAnalysisCache,
} from './storage.js';
import {
    escapeHtml, parseOpeningFromPgn, rootOpeningName, formatRelativeDate,
    classifyGameResult, isWhitePlayer, cpToWhiteWinPct,
} from './utils.js';
import { t, getLocale } from './strings.js';

// ==========================================
// State
// ==========================================
// 헤더 드롭다운 / 설정 양쪽이 같은 키를 공유 — 마지막 선택이 다음 로드의 기본값.
const VALID_TC = ['rapid', 'blitz', 'bullet', 'all'];
let homeTimeClassFilter = (() => {
    try { const v = localStorage.getItem(DEFAULT_TC_KEY); return VALID_TC.includes(v) ? v : 'rapid'; }
    catch { return 'rapid'; }
})();
let homeProfileRatings = null;
let homeProfileAvatar = null;
let homeProfileDisplayName = null;
let cachedHomeGames = [];
// 홈 게임 카드 — 처음 10개 → 스크롤 하단 도달 시 10개씩 추가 (페치 한도 100).
const HOME_RECENT_PAGE = 10;
const HOME_RECENT_MAX = 100;
// 현재 렌더 컨텍스트(컨테이너 + filtered 게임 + 유저 + 날짜 문자열 + 현재 표시 개수).
// 카드 비동기 업그레이드(분석 캐시 lookup) + 무한 스크롤 양쪽에서 참조.
let homeRecentRenderState = null;

// 온보딩 화면 전용 — 사용자가 선택한 플랫폼. 제출할 때 setMyPlatform으로 영속화.
let onboardingPlatform = PLATFORM_CHESSCOM;

// 라벨은 플랫폼 브랜드명을 그대로 — 브랜드 표기 정확도가 i18n보다 중요.
const PLATFORM_LABELS = { [PLATFORM_CHESSCOM]: 'chess.com', [PLATFORM_LICHESS]: 'lichess' };

// main.js에서 주입받는 의존성. initHome에서 채워짐.
let _pgnInput = null;
let _homeView = null;
let _bottomNav = null;
let _appContainer = null;
let _syncBottomNav = null;
let _SCREENS = null;
let _handlePgnReviewStart = null;
// homeRecentLabel은 home 헤더의 플랫폼 라벨 (chess.com/lichess). DOM 캐시.
let _homeRecentLabel = null;
let _onboardingView = null;
let _onboardingUsernameInput = null;
let _onboardingSubmitBtn = null;
let _onboardingPlatformTabs = null;

// ==========================================
// Username log (익명 닉네임 fire-and-forget)
// ==========================================
const USERNAME_LOG_DEDUP_KEY = 'blundermate_username_log_last';
function logUsernameToServer(username, source) {
    try {
        const normalized = (username || '').trim().toLowerCase();
        if (!normalized) return;
        const platform = getMyPlatform();
        const dedupKey = `${source}:${platform}:${normalized}`;
        if (localStorage.getItem(USERNAME_LOG_DEDUP_KEY) === dedupKey) return;
        try { localStorage.setItem(USERNAME_LOG_DEDUP_KEY, dedupKey); } catch (_) {}
        fetch('/api/log-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: normalized, source, platform })
        }).catch(() => {});
    } catch (_) {}
}

// ==========================================
// Profile card
// ==========================================
function updateHomeRecentHeader() {
    if (!_homeRecentLabel) return;
    _homeRecentLabel.textContent = PLATFORM_LABELS[getMyPlatform()];
}

function clearProfileCard() {
    const card = document.getElementById('homeProfileCard');
    if (card) card.classList.add('hidden');
}

function updateProfileCardIdentity(displayUser) {
    const nameEl = document.getElementById('homeProfileName');
    const avatarEl = document.getElementById('homeProfileAvatar');
    if (nameEl) nameEl.textContent = homeProfileDisplayName || displayUser || '—';
    if (avatarEl) {
        const isHeartUser = displayUser && displayUser.toLowerCase() === 'ss0bing' && getMyPlatform() === PLATFORM_LICHESS;
        if (homeProfileAvatar) {
            avatarEl.innerHTML = `<img src="${escapeHtml(homeProfileAvatar)}" alt="">`;
        } else {
            avatarEl.textContent = isHeartUser ? '💕' : '♜';
        }
    }
}

function updateProfileCardRating() {
    const el = document.getElementById('homeProfileRating');
    if (!el) return;
    const tc = homeTimeClassFilter === 'all' ? 'rapid' : homeTimeClassFilter;
    const rating = homeProfileRatings ? homeProfileRatings[tc] : null;
    el.textContent = rating || '—';
}

function updateProfileCardRecord(games, displayUser) {
    const labelEl = document.getElementById('homeProfileLabel');
    const wldEl = document.getElementById('homeProfileWld');
    if (!labelEl || !wldEl || !displayUser) return;
    const userLower = displayUser.toLowerCase();
    const filtered = homeTimeClassFilter === 'all'
        ? games
        : games.filter(g => (g.time_class || '') === homeTimeClassFilter);
    const recent = filtered.slice(0, 15).map(g => classifyGameResult(g, userLower));
    const w = recent.filter(r => r === 'win').length;
    const l = recent.filter(r => r === 'loss').length;
    const d = recent.filter(r => r === 'draw').length;
    labelEl.textContent = t('home_record_label').replace('{n}', recent.length);
    wldEl.textContent = t('home_record_wld').replace('{w}', w).replace('{l}', l).replace('{d}', d);
}

// ==========================================
// Mini board SVG (84px)
// ==========================================
// path는 viewBox 0 0 45 45 기준 단일-경로 실루엣. 유니코드 글리프(OS 폰트 의존, 비례 들쭉날쭉) 대체.
const _MINIBOARD_PIECE_PATHS = {
    P: 'M22.5 9a4.5 4.5 0 0 0-3.18 7.68A8.5 8.5 0 0 0 14 24.5c0 2.5 1.1 4.7 2.83 6.2L13 32v3h19v-3l-3.83-1.3A8.5 8.5 0 0 0 31 24.5a8.5 8.5 0 0 0-5.32-7.82A4.5 4.5 0 0 0 22.5 9z',
    N: 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21l-4 4-2-1-3 5-3-2-3 1.5L9 22l3-3 4-4 4-4 2-1z',
    B: 'M22.5 7l-2 4c-3 1-6 4-6 9 0 3.5 1 6 2.5 7l-3 1c-2 0-3 1-3 2v1h22v-1c0-1-1-2-3-2l-3-1c1.5-1 2.5-3.5 2.5-7 0-5-3-8-6-9l-2-4z',
    R: 'M9 11h27v6h-3v3h3v15H9V20h3v-3H9v-6zm3 3v3h3v-3h-3zm6 0v3h3v-3h-3zm6 0v3h3v-3h-3zm-13 6h17v15H11V20zm-2 17h27v3H9v-3z',
    Q: 'M9 14l4 11h19l4-11-5 7V11l-4 12-4-15-4 15-4-12v10l-5-7zm3 12c-1 1-1 2 0 3h21c1-1 1-2 0-3H12zm-1 4l4 8h17l4-8H11z',
    K: 'M22.5 5v3h-3v3h3v4l-2 1c-2 1-3 4-3 6 0 4 3 6 5 6s5-2 5-6c0-2-1-5-3-6l-2-1v-4h3V8h-3V5h-2zM11 28c-1 2-1 4 0 6h23c1-2 1-4 0-6H11zm0 8v3h23v-3H11z',
};

// chess.js board() 출력(8×8 {type, color, square} 배열)을 64-요소 cells로 정규화.
// "wK" / "bP" / null 형식 — _MINIBOARD_PIECE_PATHS 키와 piece-w/b 클래스 매핑에 직접 사용.
function _cellsFromBoard(board) {
    const out = [];
    for (const row of board) {
        for (const sq of row) {
            out.push(sq ? sq.color + sq.type.toUpperCase() : null);
        }
    }
    return out;
}

// 시작 포지션 — PGN 파싱 실패/빈 PGN 폴백용. 매번 chess.js 인스턴스 만들 필요 없도록 모듈 로드 시 1회 계산.
const _START_CELLS = _cellsFromBoard(new window.Chess().board());

function _squareToIdx(sq) {
    const f = 'abcdefgh'.indexOf(sq[0]);
    const r = 8 - parseInt(sq[1]);
    return r * 8 + f;
}
function renderMiniBoardSvgHtml(cells, size, lastMove, flipped) {
    const cellSize = size / 8;
    const lm = lastMove ? new Set(lastMove.map(_squareToIdx)) : new Set();
    const lightColor = '#E8DCBF';
    const darkColor = '#8C6840';
    const pieceScale = cellSize / 45;
    let body = '';
    for (let i = 0; i < 64; i++) {
        const rIdx = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
        const fIdx = flipped ? 7 - (i % 8) : (i % 8);
        const isLight = (rIdx + fIdx) % 2 === 0;
        const x = (i % 8) * cellSize;
        const y = Math.floor(i / 8) * cellSize;
        const realIdx = rIdx * 8 + fIdx;
        const piece = cells[realIdx];
        const isLm = lm.has(realIdx);
        body += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${isLight ? lightColor : darkColor}"/>`;
        if (isLm) body += `<rect class="last-move" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"/>`;
        if (piece) {
            const cls = piece[0] === 'w' ? 'piece-w' : 'piece-b';
            const d = _MINIBOARD_PIECE_PATHS[piece[1]];
            if (d) body += `<path class="${cls}" transform="translate(${x} ${y}) scale(${pieceScale})" d="${d}"/>`;
        }
    }
    return `<svg class="home-mini-board-svg home-game-board" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${body}</svg>`;
}

// ==========================================
// PGN summary + analysis cache decoration
// ==========================================
// PGN을 chess.js로 한 번 파싱해서 cells(미니보드용) + 마지막 수 + 수 카운트 추출.
// 이전엔 fen 문자열을 반환했는데 호출부에서 _miniBoardParseFen으로 다시 파싱 — 라운드트립 제거.
function parsePgnSummary(pgn) {
    if (!pgn) return { moves: 0, cells: null, lastMove: null };
    try {
        const c = new window.Chess();
        if (!c.load_pgn(pgn)) return { moves: 0, cells: null, lastMove: null };
        const verbose = c.history({ verbose: true });
        const last = verbose[verbose.length - 1];
        return {
            moves: Math.ceil(verbose.length / 2),
            cells: _cellsFromBoard(c.board()),
            lastMove: last ? [last.from, last.to] : null,
        };
    } catch {
        return { moves: 0, cells: null, lastMove: null };
    }
}

// 캐시된 moves[] (각 { engineLines, classification })에서 사용자(나)의 정확도 + 분류 카운트 계산.
function computeMyStatsFromCache(moves, isUserWhite) {
    const counts = { brilliant: 0, great: 0, mistake: 0, blunder: 0 };
    const accs = [];
    let prevWhitePct = 50;

    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const isWhiteMove = (i % 2) === 0;
        const isMyMove = isWhiteMove === isUserWhite;

        const top = m.engineLines && m.engineLines[0];
        let currWhitePct = null;
        if (top && typeof top.scoreNum === 'number') {
            currWhitePct = cpToWhiteWinPct(top.scoreNum);
        }

        if (isMyMove && currWhitePct !== null) {
            const prevOwnPct = isUserWhite ? prevWhitePct : 100 - prevWhitePct;
            const currOwnPct = isUserWhite ? currWhitePct : 100 - currWhitePct;
            const loss = Math.max(0, prevOwnPct - currOwnPct);
            const a = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
            accs.push(Math.max(0, Math.min(100, a)));

            const cls = m.classification;
            if (cls === 'Brilliant') counts.brilliant++;
            else if (cls === 'Great') counts.great++;
            else if (cls === 'Mistake') counts.mistake++;
            else if (cls === 'Blunder') counts.blunder++;
        }

        if (currWhitePct !== null) prevWhitePct = currWhitePct;
    }

    if (accs.length === 0) return null;
    const avg = accs.reduce((s, v) => s + v, 0) / accs.length;
    return { accuracy: Math.round(avg), classification: counts };
}

async function decorateCardWithAnalysisAsync(card, game, isUserWhiteForGame) {
    if (!game.pgn) return;
    let hash;
    try { hash = await computePgnHash(game.pgn); } catch { return; }
    let cache;
    try { cache = await loadAnalysisCache(hash); } catch { return; }
    if (!cache || !Array.isArray(cache.moves) || cache.moves.length === 0) return;

    const stats = computeMyStatsFromCache(cache.moves, isUserWhiteForGame);
    if (!stats) return;

    const metaBottom = card.querySelector('[data-slot="meta-bottom"]');
    if (metaBottom) {
        metaBottom.innerHTML = `<span class="home-game-accuracy">${stats.accuracy}%</span>`;
    }

    const classRow = card.querySelector('[data-slot="class-row"]');
    if (classRow) {
        const items = [];
        const c = stats.classification;
        if (c.brilliant > 0) items.push({ k: 'brilliant', n: c.brilliant });
        if (c.great > 0)     items.push({ k: 'great',     n: c.great });
        if (c.mistake > 0)   items.push({ k: 'mistake',   n: c.mistake });
        if (c.blunder > 0)   items.push({ k: 'blunder',   n: c.blunder });
        if (items.length > 0) {
            classRow.innerHTML = items.map(it =>
                `<span class="home-game-class-chip"><span class="home-game-class-dot home-game-class-dot--${it.k}"></span>${it.n}</span>`
            ).join('');
            classRow.hidden = false;
        }
    }
}

// ==========================================
// Game cards rendering
// ==========================================
function renderHomeGamesList(games, displayUser) {
    const list = document.getElementById('homeRecentList');
    if (!list) return;

    const filtered = homeTimeClassFilter === 'all'
        ? games
        : games.filter(g => (g.time_class || '') === homeTimeClassFilter);

    list.innerHTML = '';
    homeRecentRenderState = null;

    if (filtered.length === 0) {
        list.innerHTML = `<div class="container-message">${t('filter_no_games')}</div>`;
        return;
    }

    const dateStrings = { dateToday: t('dateToday'), dateYesterday: t('dateYesterday'), dateDaysAgo: t('dateDaysAgo') };
    homeRecentRenderState = { container: list, filtered, displayUser, dateStrings, visible: 0 };
    appendHomeRecentBatch(0, Math.min(HOME_RECENT_PAGE, filtered.length, HOME_RECENT_MAX));
}

// 무한 스크롤 — 홈 스크롤 컨테이너 하단 근처 도달 시 10개씩 추가. 페치 한도(100)까지.
function onHomeScroll(e) {
    if (!homeRecentRenderState) return;
    const { filtered, visible } = homeRecentRenderState;
    const cap = Math.min(filtered.length, HOME_RECENT_MAX);
    if (visible >= cap) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 240) return;
    appendHomeRecentBatch(visible, Math.min(visible + HOME_RECENT_PAGE, cap));
}

// 홈 게임 카드 batch append. 초기 렌더 + 무한 스크롤 양쪽에서 호출.
function appendHomeRecentBatch(from, to) {
    if (!homeRecentRenderState) return;
    const { container, filtered, displayUser, dateStrings } = homeRecentRenderState;
    const slice = filtered.slice(from, to);
    if (slice.length === 0) return;
    homeRecentRenderState.visible = to;

    const userLower = displayUser.toLowerCase();

    slice.forEach(game => {
        const isWhite = isWhitePlayer(game, userLower);
        const oppSide = isWhite ? game.black : game.white;
        const resultClass = classifyGameResult(game, userLower);

        const summary = parsePgnSummary(game.pgn);
        const opening = rootOpeningName(parseOpeningFromPgn(game.pgn || '').name || '');
        const date = game.end_time ? formatRelativeDate(game.end_time, dateStrings) : '';
        const oppRating = oppSide.rating ? String(oppSide.rating) : '';

        const isKo = getLocale() === 'ko';
        const resultLetter = resultClass === 'win' ? (isKo ? '승' : 'W')
                          : resultClass === 'loss' ? (isKo ? '패' : 'L')
                          : (isKo ? '무' : 'D');

        const movesLabel = summary.moves ? `${summary.moves}${t('moves_suffix')}` : '';
        const metaParts = [opening, movesLabel].filter(Boolean);
        const metaInner = metaParts.map((p, i) => {
            const sep = i === 0 ? '' : '<span class="home-game-meta-sep" aria-hidden="true">·</span>';
            return `${sep}<span>${escapeHtml(p)}</span>`;
        }).join('');

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'home-game-card';
        card.innerHTML = `
            ${renderMiniBoardSvgHtml(summary.cells || _START_CELLS, 84, summary.lastMove, !isWhite)}
            <div class="home-game-body">
                <div>
                    <div class="home-game-header">
                        <span class="home-result-chip home-result-chip--${resultClass}">${resultLetter}</span>
                        <span class="home-game-opp">${escapeHtml(oppSide.username || '')}</span>
                        ${oppRating ? `<span class="home-game-opp-rating">${escapeHtml(oppRating)}</span>` : ''}
                    </div>
                    <div class="home-game-meta-row">${metaInner}</div>
                </div>
                <div class="home-game-class-row" data-slot="class-row" hidden></div>
            </div>
            <div class="home-game-meta">
                <span class="home-game-when">${escapeHtml(date)}</span>
                <span data-slot="meta-bottom">
                    <button type="button" class="home-analyze-btn" data-action="analyze">${escapeHtml(t('home_analyze_btn'))}</button>
                </span>
            </div>
        `;

        // 카드 본체 → 분석 화면(미분석이면 새 분석, 캐시 hit이면 즉시 리뷰).
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="analyze"]')) return;
            if (!game.pgn) return;
            _pgnInput.value = game.pgn;
            _handlePgnReviewStart(null, isWhite, null, true);
        });

        const analyzeBtn = card.querySelector('[data-action="analyze"]');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!game.pgn) return;
                _pgnInput.value = game.pgn;
                _handlePgnReviewStart(null, isWhite, null, true);
            });
        }

        container.appendChild(card);

        // 분석 캐시가 있으면 카드 비동기 업그레이드 — "분석" 버튼 → 정확도%, chips 노출.
        decorateCardWithAnalysisAsync(card, game, isWhite);
    });
}

// ==========================================
// Time class filter dropdown (rapid/blitz/bullet/all)
// ==========================================
function syncTcFilterUI() {
    const labelEl = document.getElementById('homeTcFilterLabel');
    if (labelEl) {
        labelEl.setAttribute('data-i18n', `home_filter_${homeTimeClassFilter}`);
        labelEl.textContent = t(`home_filter_${homeTimeClassFilter}`);
    }
    document.querySelectorAll('.home-tc-filter-option').forEach(opt => {
        opt.setAttribute('aria-checked', opt.dataset.tc === homeTimeClassFilter ? 'true' : 'false');
    });
}

// 홈 드롭다운에서 호출 — 세션 한정 변경. localStorage 영속화 안 함 (앱 재시작 시 default로 복귀).
// 설정에서 default를 바꾸려면 setDefaultTcFilter 사용.
export function setHomeTcFilter(tc) {
    if (!VALID_TC.includes(tc)) return;
    if (tc === homeTimeClassFilter) return;
    homeTimeClassFilter = tc;
    syncTcFilterUI();
    const displayUser = getMyUserId();
    if (cachedHomeGames.length > 0 && displayUser) {
        renderHomeGamesList(cachedHomeGames, displayUser);
        updateProfileCardRecord(cachedHomeGames, displayUser);
    }
    updateProfileCardRating();
}

// 설정에서 호출 — localStorage 영속 + 현재 홈 필터에도 즉시 반영.
export function setDefaultTcFilter(tc) {
    if (!VALID_TC.includes(tc)) return;
    try { localStorage.setItem(DEFAULT_TC_KEY, tc); } catch {}
    setHomeTcFilter(tc);
}

function toggleHomeTcMenu(forceState) {
    const trigger = document.getElementById('homeTcFilterBtn');
    const menu = document.getElementById('homeTcFilterMenu');
    if (!trigger || !menu) return;
    const open = forceState !== undefined ? forceState : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ==========================================
// Loaders
// ==========================================
function loadHomeRecentGames() {
    const displayUser = getMyUserId();
    const section = document.getElementById('homeRecentSection');
    const list = document.getElementById('homeRecentList');
    if (!displayUser || !section || !list) return;

    updateHomeRecentHeader();
    section.classList.remove('hidden');

    list.innerHTML = `<div class="home-recent-skeleton">${'<div class="home-recent-skeleton-card"></div>'.repeat(3)}</div>`;

    fetchRecentGames(displayUser).then(games => {
        if (!games || games.length === 0) {
            // 0게임 = 정상 응답이지만 비어있음. 프로필 카드는 그대로 유지 —
            // fetchPlayerProfile은 0게임이어도 성공하므로 식별/레이팅 표시 가능.
            list.innerHTML = `<div class="container-message">${t('games_empty')}</div>`;
            cachedHomeGames = [];
            updateProfileCardIdentity(displayUser);
            updateProfileCardRecord([], displayUser);
            const card = document.getElementById('homeProfileCard');
            if (card) card.classList.remove('hidden');
            return;
        }
        cachedHomeGames = games;
        renderHomeGamesList(games, displayUser);
        updateProfileCardIdentity(displayUser);
        updateProfileCardRecord(games, displayUser);
        const card = document.getElementById('homeProfileCard');
        if (card) card.classList.remove('hidden');
    }).catch(() => {
        cachedHomeGames = [];
        clearProfileCard();
        section.classList.add('hidden');
    });
}

function updateHomeHeader() {
    homeProfileRatings = null;
    homeProfileAvatar = null;
    homeProfileDisplayName = null;
    updateProfileCardRating();
    const userId = getMyUserId();
    if (!userId) {
        clearProfileCard();
        return;
    }
    updateProfileCardIdentity(userId);
    fetchPlayerProfile(userId).then(profile => {
        if (!profile) return;
        homeProfileRatings = profile.ratings || null;
        homeProfileAvatar = profile.avatar || null;
        homeProfileDisplayName = profile.displayName || null;
        updateProfileCardRating();
        updateProfileCardIdentity(userId);
    });
}

// renderScreen(HOME) 진입 시 main.js가 호출 — 식별/게임 새로 fetch.
export function refreshHomeCounts() {
    updateHomeHeader();
    loadHomeRecentGames();
}

// ==========================================
// Onboarding
// ==========================================
function applyOnboardingPlatformUI(platform) {
    onboardingPlatform = platform;
    if (_onboardingPlatformTabs) {
        _onboardingPlatformTabs.querySelectorAll('.onboarding-platform-tab').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.platform === platform);
        });
    }
    const isLichess = platform === PLATFORM_LICHESS;
    if (_onboardingUsernameInput) _onboardingUsernameInput.placeholder = t(isLichess ? 'usernamePlaceholder_lichess' : 'usernamePlaceholder');
}

function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    _onboardingView.classList.add('hidden');
    _homeView.classList.remove('hidden');
    _syncBottomNav(_SCREENS.HOME);
    refreshHomeCounts();
}

// ==========================================
// Public API
// ==========================================
// main.js가 호출. 콜백 주입 + 모든 이벤트 와이어링 + 온보딩 부트스트랩까지 처리.
// DOM ref는 ID로 직접 lookup — 외부에서 주입할 이유 없음.
let _initialized = false;

export function initHome({ syncBottomNav, SCREENS, handlePgnReviewStart }) {
    if (_initialized) return;
    _initialized = true;

    _pgnInput = document.getElementById('pgnInput');
    _homeView = document.getElementById('homeView');
    _bottomNav = document.getElementById('bottomNav');
    _appContainer = document.querySelector('.app-container');
    _syncBottomNav = syncBottomNav;
    _SCREENS = SCREENS;
    _handlePgnReviewStart = handlePgnReviewStart;
    _homeRecentLabel = document.getElementById('homeRecentLabel');
    _onboardingView = document.getElementById('onboardingView');
    _onboardingUsernameInput = document.getElementById('onboardingUsernameInput');
    _onboardingSubmitBtn = document.getElementById('onboardingSubmitBtn');
    _onboardingPlatformTabs = document.getElementById('onboardingPlatformTabs');

    // 무한 스크롤 — 게임 리스트 자체에서 스크롤 (프로필/헤더는 위에 고정).
    document.getElementById('homeRecentList')?.addEventListener('scroll', onHomeScroll, { passive: true });

    syncTcFilterUI();

    // 시간대 필터 드롭다운
    document.getElementById('homeTcFilterBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHomeTcMenu();
    });
    document.getElementById('homeTcFilterMenu')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.home-tc-filter-option');
        if (!opt) return;
        e.stopPropagation();
        setHomeTcFilter(opt.dataset.tc);
        toggleHomeTcMenu(false);
    });
    // 메뉴 외부 클릭 / ESC 시 닫기
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('homeTcFilterMenu');
        if (!menu || menu.classList.contains('hidden')) return;
        if (!e.target.closest('.home-tc-filter')) toggleHomeTcMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const menu = document.getElementById('homeTcFilterMenu');
        if (menu && !menu.classList.contains('hidden')) toggleHomeTcMenu(false);
    });

    // 온보딩 — 플랫폼 탭
    _onboardingPlatformTabs?.addEventListener('click', (e) => {
        const btn = e.target.closest('.onboarding-platform-tab');
        if (!btn) return;
        const platform = btn.dataset.platform;
        if (platform !== PLATFORM_CHESSCOM && platform !== PLATFORM_LICHESS) return;
        if (platform === onboardingPlatform) return;
        applyOnboardingPlatformUI(platform);
    });

    // 온보딩 — 제출
    _onboardingSubmitBtn?.addEventListener('click', () => {
        if (!_onboardingUsernameInput) return;
        const username = _onboardingUsernameInput.value.trim();
        if (!username) {
            _onboardingUsernameInput.focus();
            return;
        }
        setMyPlatform(onboardingPlatform);
        setMyUserId(username);
        logUsernameToServer(username, 'onboarding');
        finishOnboarding();
    });
    _onboardingUsernameInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') _onboardingSubmitBtn?.click();
    });

    // 온보딩 부트스트랩 — 첫 진입이면 온보딩 화면 노출, 아니면 홈 데이터 로드 + 캐시 사용자 로그.
    if (!localStorage.getItem(ONBOARDING_KEY)) {
        _homeView.classList.add('hidden');
        _onboardingView.classList.remove('hidden');
        _bottomNav.classList.add('hidden');
        _appContainer.classList.add('bottom-nav-hidden');
        applyOnboardingPlatformUI(PLATFORM_CHESSCOM);
    } else {
        refreshHomeCounts();
        const cachedUser = getMyUserId();
        if (cachedUser) logUsernameToServer(cachedUser, 'cached');
    }
}

// 로그아웃 시 main.js가 호출 — 온보딩 화면 복귀.
export function showOnboarding() {
    if (_onboardingUsernameInput) _onboardingUsernameInput.value = '';
    _homeView.classList.add('hidden');
    _onboardingView.classList.remove('hidden');
    _bottomNav.classList.add('hidden');
    _appContainer.classList.add('bottom-nav-hidden');
}
