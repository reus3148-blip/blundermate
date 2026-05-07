// Platform router. 호출자는 이 파일을 import하고, 내부에서 getMyPlatform() 기준으로 chesscom/lichess 분배.
// 다른 유저 검색도 현재 플랫폼 안에서만 — 플랫폼별 검색은 Phase 3 후보.

import * as chesscom from './chesscom.js';
import * as lichess from './lichess.js';
import { getMyPlatform, PLATFORM_LICHESS } from './storage.js';

function pickAdapter() {
    return getMyPlatform() === PLATFORM_LICHESS ? lichess : chesscom;
}

export function fetchPlayerProfile(username) {
    return pickAdapter().fetchPlayerProfile(username);
}

export function fetchRecentGames(username, limit) {
    return pickAdapter().fetchRecentGames(username, limit);
}

// 온보딩에서 닉네임 존재 검증 — 현재 플랫폼 기준. 라우터는 onboardingPlatform을
// 호출 직전에 setMyPlatform으로 미리 적용해야 한다 (home.js submit handler 참고).
export function verifyUserExists(username) {
    return pickAdapter().verifyUserExists(username);
}
