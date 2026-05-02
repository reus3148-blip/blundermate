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
