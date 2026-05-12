// Platform router. 호출자는 이 파일을 import하고, 내부에서 getMyPlatform() 기준으로 chesscom/lichess 분배.
// 다른 사람 게임 검색은 본인 platform과 무관하게 임의 플랫폼 지정 가능 — *On 변형 사용.

import * as chesscom from './chesscom.js';
import * as lichess from './lichess.js';
import { getMyPlatform, PLATFORM_LICHESS } from './storage.js';

function adapterFor(platform) {
    return platform === PLATFORM_LICHESS ? lichess : chesscom;
}

function pickAdapter() {
    return adapterFor(getMyPlatform());
}

export function fetchPlayerProfile(username) {
    return pickAdapter().fetchPlayerProfile(username);
}

export function fetchPlayerProfileOn(platform, username) {
    return adapterFor(platform).fetchPlayerProfile(username);
}

export function fetchRecentGames(username, limit) {
    return pickAdapter().fetchRecentGames(username, limit);
}

export function fetchRecentGamesOn(platform, username, limit) {
    return adapterFor(platform).fetchRecentGames(username, limit);
}

// 온보딩에서 닉네임 존재 검증 — 현재 플랫폼 기준. 라우터는 onboardingPlatform을
// 호출 직전에 setMyPlatform으로 미리 적용해야 한다 (home.js submit handler 참고).
export function verifyUserExists(username) {
    return pickAdapter().verifyUserExists(username);
}

export function verifyUserExistsOn(platform, username) {
    return adapterFor(platform).verifyUserExists(username);
}
