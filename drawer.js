const drawerEl = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const homeMenuBtn = document.getElementById('homeMenuBtn');

const DRAWER_TRANSITION_MS = 240;

let drawerHideTimer = null;
let initialized = false;
let navigate = null;
let allowedTargets = new Set();

function openDrawer() {
    if (!drawerEl || !drawerOverlay || !homeMenuBtn) return;
    if (drawerHideTimer !== null) {
        clearTimeout(drawerHideTimer);
        drawerHideTimer = null;
    }
    drawerOverlay.hidden = false;
    drawerEl.hidden = false;
    void drawerEl.offsetWidth;
    drawerOverlay.classList.add('is-open');
    drawerEl.classList.add('is-open');
    drawerEl.setAttribute('aria-hidden', 'false');
    homeMenuBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onDrawerKeydown);
}

function closeDrawer() {
    if (!drawerEl || !drawerOverlay || !homeMenuBtn) return;
    drawerOverlay.classList.remove('is-open');
    drawerEl.classList.remove('is-open');
    drawerEl.setAttribute('aria-hidden', 'true');
    homeMenuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onDrawerKeydown);
    if (drawerHideTimer !== null) clearTimeout(drawerHideTimer);
    drawerHideTimer = setTimeout(() => {
        drawerHideTimer = null;
        if (!drawerEl.classList.contains('is-open')) {
            drawerEl.hidden = true;
            drawerOverlay.hidden = true;
        }
    }, DRAWER_TRANSITION_MS + 20);
}

function onDrawerKeydown(e) {
    if (e.key === 'Escape') closeDrawer();
}

function onDrawerItemClick(e) {
    const item = e.target.closest('[data-drawer-target]');
    if (!item) return;
    const target = item.dataset.drawerTarget;
    if (!allowedTargets.has(target)) return;
    closeDrawer();
    navigate?.(target);
}

export function initDrawer({ navigateTo, targets }) {
    navigate = navigateTo;
    allowedTargets = new Set(targets || []);
    if (initialized) return;
    initialized = true;

    homeMenuBtn?.addEventListener('click', openDrawer);
    drawerCloseBtn?.addEventListener('click', closeDrawer);
    drawerOverlay?.addEventListener('click', closeDrawer);
    drawerEl?.addEventListener('click', onDrawerItemClick);
}
