// 서버측 platform 정규화. Vercel은 _ 시작 파일을 endpoint로 라우팅하지 않음.
// storage.js의 같은 상수를 frontend가 가지지만 Edge runtime에서 import 불가(localStorage 부재)라 별도 정의.

export const PLATFORM_CHESSCOM = 'chesscom';
export const PLATFORM_LICHESS = 'lichess';

// 미전송/잘못된 값 = chesscom으로 폴백 — Phase 1 클라이언트 + 기존 row(DEFAULT 'chesscom')와 호환.
export function normalizePlatform(raw) {
    return raw === PLATFORM_LICHESS ? PLATFORM_LICHESS : PLATFORM_CHESSCOM;
}
