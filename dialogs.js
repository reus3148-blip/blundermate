// 모바일 친화 다이얼로그 — 토스트(자동 사라짐) + 확인 모달(Promise<boolean>).
// OS의 alert()/confirm()은 톤이 다르고 모바일에서 깨지므로 도입.
//
// API:
//   showToast(message, durationMs?) — 하단 검정 pill, 자동 사라짐
//   showAlert(message)              — 토스트 1:1 매핑. 호출 의도 분리용 별칭
//   showConfirm(message, opts?)     — Promise<boolean>. opts: { okLabel, cancelLabel, destructive }
//   initDialogs()                   — main.js에서 한 번 호출. 모달 close 핸들러 + 키보드 와이어링.

import { t } from './strings.js';

const TOAST_DEFAULT_MS = 2600;

// 두 timer 모두 추적해 fade-out 중 새 호출이 와도 이전 'hidden' 추가가 새 토스트를 재숨김 처리하지 않게.
let _toastTimers = [];

export function showToast(message, durationMs = TOAST_DEFAULT_MS) {
    const el = document.getElementById('appToast');
    if (!el) return;
    _toastTimers.forEach(clearTimeout);
    _toastTimers = [];
    el.textContent = message;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('is-visible'));
    _toastTimers.push(setTimeout(() => {
        el.classList.remove('is-visible');
        // CSS opacity transition(0.2s) 끝난 뒤에 hidden 토글해야 페이드 잘림 방지.
        _toastTimers.push(setTimeout(() => el.classList.add('hidden'), 220));
    }, durationMs));
}

export function showAlert(message) {
    showToast(message);
}

let _confirmResolve = null;

export function showConfirm(message, opts = {}) {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
        return Promise.resolve(window.confirm(message));
    }

    // 직전 호출이 미해결이면 false로 마무리 — 상태 누수 방지.
    if (_confirmResolve) {
        const stale = _confirmResolve;
        _confirmResolve = null;
        stale(false);
    }

    msgEl.textContent = message;
    okBtn.textContent = opts.okLabel || t('ok');
    cancelBtn.textContent = opts.cancelLabel || t('cancel');
    // destructive 액션이면 OK 버튼을 위험 색으로 — 기존 .modal-destructive-btn 톤은 좌측 link라 안 어울림.
    okBtn.classList.toggle('confirm-ok-destructive', !!opts.destructive);
    modal.classList.remove('hidden');

    // Cancel에 포커스 — 사용자가 다른 입력에서 Enter 누르고 모달이 떠도 의도치 않은 OK 트리거 방지.
    // destructive일수록 "기본 = 취소"가 안전. native button activation으로 Space/Enter도 자연 처리됨.
    requestAnimationFrame(() => cancelBtn.focus());

    return new Promise(resolve => {
        _confirmResolve = resolve;
    });
}

let _dialogsInitialized = false;
export function initDialogs() {
    if (_dialogsInitialized) return;
    const modal = document.getElementById('confirmModal');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    if (!modal || !okBtn || !cancelBtn) return;
    _dialogsInitialized = true;
    const close = (result) => {
        modal.classList.add('hidden');
        const r = _confirmResolve;
        _confirmResolve = null;
        if (r) r(result);
    };
    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    // 오버레이(여백) 탭 = 취소. modal-content 내부 클릭은 무시.
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close(false);
    });
    // Escape만 글로벌. Enter는 cancelBtn focus + native activation으로 처리 — global Enter 핸들러는
    // 모달 밖 input에 focus가 남아있을 때 의도치 않은 OK를 유발할 수 있어 의도적으로 제거.
    document.addEventListener('keydown', (e) => {
        if (modal.classList.contains('hidden')) return;
        if (e.key === 'Escape') close(false);
    });
}
