// Opening forum — 오프닝별 한국어 커뮤니티 (Phase 57).
// 3-level drilldown: top(전체) → root(시실리안) → leaf(로솔리모/칸/나이도프).
// 레퍼런스 합성:
//   - Baymard 모바일 UX(깊이 3-tap 이하 + 위치 표시)
//   - Reddit multireddit(합집합 stream)
//   - 디시인사이드 갤러리 분류(메이저 → 마이너 3-tier)
//   - chess.com forum(카테고리 → topic → 댓글 drilldown, 단 뒤로가기 깨짐 갭은 history.back으로 회피)
//
// 사칭 OK 정책: 닉네임 = chess.com/lichess ID 그대로 (검증 없음). read는 공개, insert/delete는 user_id 매치.
// 진입은 /forum, /forum/<root>, /forum/<leaf> deep-link만. 앱 내 진입점은 추후 phase.

import { getMyUserId, getMyPlatform } from './storage.js';
import { escapeHtml, formatRelativeDate } from './utils.js';
import { showAlert, showConfirm } from './dialogs.js';
import { t } from './strings.js';

// 슬러그 상수 — magic string 박는 위치들 한 곳으로 모아 오타 차단.
// 새 오프닝 추가 시 OPENING_KEYS + OPENING_FORUM_LABELS + (root면) OPENING_GROUPS 세 곳 갱신.
const OPENING_KEYS = {
    SICILIAN: 'sicilian',
    SICILIAN_ROSSOLIMO: 'sicilian-rossolimo',
    SICILIAN_KAN: 'sicilian-kan',
    SICILIAN_NAJDORF: 'sicilian-najdorf',
};

const OPENING_FORUM_LABELS = {
    [OPENING_KEYS.SICILIAN]: '시실리안 디펜스',
    [OPENING_KEYS.SICILIAN_ROSSOLIMO]: '로솔리모',
    [OPENING_KEYS.SICILIAN_KAN]: '칸',
    [OPENING_KEYS.SICILIAN_NAJDORF]: '나이도프',
};

// Root → variants. root 키가 여기 있어야 drilldown(카테고리 list)이 변종 노출.
const OPENING_GROUPS = {
    [OPENING_KEYS.SICILIAN]: [
        OPENING_KEYS.SICILIAN_ROSSOLIMO,
        OPENING_KEYS.SICILIAN_KAN,
        OPENING_KEYS.SICILIAN_NAJDORF,
    ],
};

const ROOT_KEYS = Object.keys(OPENING_GROUPS);

// top level stream 합집합 — 모든 root + 모든 변종. 추후 root 수십 개 되면 server-side 'list-all' action 필요.
const ALL_KEYS = [...new Set([
    ...ROOT_KEYS,
    ...Object.values(OPENING_GROUPS).flat(),
])];

export function getForumLabel(slug) {
    return OPENING_FORUM_LABELS[slug] || slug;
}

// ── API ───────────────────────────────────────────────
async function callForum(action, params = {}) {
    const res = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
    });
    if (!res.ok) throw new Error(`forum ${action} failed: ${res.status}`);
    return res.json();
}

async function fetchComments(keys) {
    if (!keys || keys.length === 0) return [];
    if (keys.length === 1) return callForum('list', { opening_key: keys[0] });
    return callForum('list', { opening_keys: keys });
}

export async function postComment(openingKey, bodyText) {
    const userId = getMyUserId();
    if (!userId) throw new Error('no user_id');
    return callForum('post', {
        opening_key: openingKey,
        user_id: userId,
        platform: getMyPlatform(),
        body: bodyText,
    });
}

export async function deleteComment(id) {
    const userId = getMyUserId();
    if (!userId) throw new Error('no user_id');
    return callForum('delete', {
        id, user_id: userId, platform: getMyPlatform(),
    });
}

// ── view 상태 ─────────────────────────────────────────
let forumView, forumTitle, forumBackBtn, forumCategoryList,
    forumList, forumInputBar, forumInput, forumSubmitBtn, forumCharCount;
// null (top) | root slug | leaf slug. level은 이 키에서 derive — 별도 state 안 둠.
let currentKey = null;
let _initDone = false;

// 'top' | 'root' | 'leaf' — 알 수 없는 slug는 top으로 폴백(URL 오염 방지).
function getLevel() {
    if (!currentKey) return 'top';
    if (OPENING_GROUPS[currentKey]) return 'root';
    if (OPENING_FORUM_LABELS[currentKey]) return 'leaf';
    return 'top';
}

function setStateFromKey(key) {
    currentKey = (!key || OPENING_GROUPS[key] || OPENING_FORUM_LABELS[key]) ? (key || null) : null;
}

function getStreamKeys() {
    const level = getLevel();
    if (level === 'top') return ALL_KEYS;
    if (level === 'root') return [currentKey, ...OPENING_GROUPS[currentKey]];
    return [currentKey];
}

// ── rendering ─────────────────────────────────────────
function renderCommentRow(c) {
    const myUser = getMyUserId();
    const canDelete = !!myUser && c.user_id === myUser;
    const platBadge = c.platform === 'lichess' ? 'Lichess' : 'Chess.com';
    const when = c.created_at ? formatRelativeDate(c.created_at) : '';
    const delBtn = canDelete
        ? `<button type="button" class="forum-comment-del" data-id="${escapeHtml(c.id)}" aria-label="${t('forum_delete')}">×</button>`
        : '';
    // leaf에선 모든 댓글이 같은 키라 chip 동어반복 — 생략. top/root에선 어느 변종인지 표시.
    const showChip = getLevel() !== 'leaf' && c.opening_key !== currentKey;
    const chip = showChip
        ? `<span class="forum-variant-chip">${escapeHtml(getForumLabel(c.opening_key))}</span>`
        : '';
    return `
        <div class="forum-comment">
            <div class="forum-comment-head">
                <span class="forum-comment-user">${escapeHtml(c.user_id)}</span>
                ${chip}
                <span class="forum-comment-meta">${escapeHtml(platBadge)}${when ? ` · ${escapeHtml(when)}` : ''}</span>
                ${delBtn}
            </div>
            <div class="forum-comment-body">${escapeHtml(c.body)}</div>
        </div>`;
}

function renderCategoryList() {
    if (!forumCategoryList) return;
    let items = [];
    const level = getLevel();
    if (level === 'top') {
        items = ROOT_KEYS.map(k => ({
            key: k,
            label: getForumLabel(k),
            meta: t('forum_variants_count').replace('{n}', String(OPENING_GROUPS[k]?.length || 0)),
        }));
    } else if (level === 'root') {
        items = (OPENING_GROUPS[currentKey] || []).map(v => ({
            key: v,
            label: getForumLabel(v),
            meta: '',
        }));
    }
    if (items.length === 0) {
        forumCategoryList.innerHTML = '';
        forumCategoryList.classList.add('hidden');
        return;
    }
    forumCategoryList.classList.remove('hidden');
    forumCategoryList.innerHTML = items.map(item => `
        <button type="button" class="forum-category-row" data-key="${escapeHtml(item.key)}">
            <span class="forum-category-label">${escapeHtml(item.label)}</span>
            ${item.meta ? `<span class="forum-category-meta">${escapeHtml(item.meta)}</span>` : ''}
            <svg class="forum-category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
    `).join('');
}

async function refreshComments() {
    if (!forumList) return;
    forumList.innerHTML = `<div class="forum-status">${t('forum_loading')}</div>`;
    try {
        const data = await fetchComments(getStreamKeys());
        if (!Array.isArray(data) || data.length === 0) {
            forumList.innerHTML = `<div class="forum-status forum-status--empty">${t('forum_empty')}</div>`;
            return;
        }
        forumList.innerHTML = data.map(renderCommentRow).join('');
    } catch (_e) {
        forumList.innerHTML = `<div class="forum-status forum-status--err">${t('forum_load_error')}</div>`;
    }
}

function renderHeader() {
    if (forumTitle) {
        forumTitle.textContent = getLevel() === 'top'
            ? t('forum_root_title')
            : getForumLabel(currentKey);
    }
    // top level은 site home으로 빠지는 back이라 forum back 화살표 가림 (visibility hidden으로 layout 유지).
    if (forumBackBtn) forumBackBtn.style.visibility = getLevel() === 'top' ? 'hidden' : '';
}

function renderInputBar() {
    if (!forumInputBar) return;
    // top은 어디 저장할지 모호 → read-only. root/leaf에서만 입력.
    forumInputBar.classList.toggle('hidden', getLevel() === 'top');
}

function renderAll() {
    renderHeader();
    renderCategoryList();
    renderInputBar();
    refreshComments();
}

function updateCharCount() {
    if (!forumInput || !forumCharCount) return;
    const len = (forumInput.value || '').length;
    forumCharCount.textContent = `${len}/500`;
    forumCharCount.classList.toggle('is-over', len > 500);
}

async function handleSubmit() {
    if (!currentKey || !forumInput || !forumSubmitBtn) return;
    const text = (forumInput.value || '').trim();
    if (!text) return;
    if (text.length > 500) {
        showAlert(t('forum_too_long'));
        return;
    }
    if (!getMyUserId()) {
        showAlert(t('forum_need_username'));
        return;
    }
    forumSubmitBtn.disabled = true;
    try {
        await postComment(currentKey, text);
        forumInput.value = '';
        updateCharCount();
        await refreshComments();
    } catch (_e) {
        showAlert(t('forum_post_error'));
    } finally {
        forumSubmitBtn.disabled = false;
    }
}

async function handleDelete(id) {
    const ok = await showConfirm(t('forum_delete_confirm'));
    if (!ok) return;
    try {
        await deleteComment(id);
        await refreshComments();
    } catch (_e) {
        showAlert(t('forum_delete_error'));
    }
}

// Drilldown — 카테고리 row click 시 그 키로 push. browser back은 history.back으로 main.js popstate 거쳐 복귀.
function handleCategoryClick(e) {
    const row = e.target.closest('.forum-category-row');
    if (!row) return;
    const key = row.dataset.key;
    if (!key) return;
    history.pushState({ screen: 'forum', openingKey: key }, '', `/forum/${key}`);
    setStateFromKey(key);
    if (forumInput) forumInput.value = '';
    updateCharCount();
    renderAll();
}

// ── exports ────────────────────────────────────────────
export function openForumView({ openingKey } = {}) {
    initForum();
    if (!forumView) return;
    forumView.classList.remove('hidden');
    setStateFromKey(openingKey);
    if (forumInput) forumInput.value = '';
    updateCharCount();
    renderAll();
}

export function hideForumView() {
    forumView?.classList.add('hidden');
    forumCategoryList?.classList.add('hidden');
}

// /forum, /forum/<slug>(/) 매칭. slug 미지정 = top. 매칭하면 history state 박고 renderScreen 호출.
export function tryActivateFromLocation(renderScreen) {
    const m = location.pathname.match(/^\/forum(?:\/([\w-]+))?\/?$/);
    if (!m) return false;
    const slug = m[1] || null;
    history.replaceState({ screen: 'forum', openingKey: slug }, '', location.pathname);
    renderScreen('forum');
    return true;
}

export function initForum() {
    if (_initDone) return;
    forumView = document.getElementById('forumView');
    if (!forumView) return;
    _initDone = true;
    forumTitle = document.getElementById('forumTitle');
    forumBackBtn = document.getElementById('forumBackBtn');
    forumCategoryList = document.getElementById('forumCategoryList');
    forumList = document.getElementById('forumList');
    forumInputBar = document.getElementById('forumInputBar');
    forumInput = document.getElementById('forumCommentInput');
    forumSubmitBtn = document.getElementById('forumSubmitBtn');
    forumCharCount = document.getElementById('forumCharCount');

    if (forumSubmitBtn) forumSubmitBtn.addEventListener('click', handleSubmit);
    if (forumInput) {
        forumInput.addEventListener('input', updateCharCount);
        forumInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit();
            }
        });
    }
    if (forumList) {
        forumList.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.forum-comment-del');
            if (delBtn) handleDelete(delBtn.dataset.id);
        });
    }
    if (forumCategoryList) forumCategoryList.addEventListener('click', handleCategoryClick);
    if (forumBackBtn) forumBackBtn.addEventListener('click', () => history.back());
}
