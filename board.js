import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';

// 분석 화면의 "지금 보고 있는 위치" 상태를 보유한다.
// chess: Chess.js 인스턴스 (메인 게임의 PGN/현재 상태)
// cg: Chessground 보드 인스턴스
// currentlyViewedIndex: analysisQueue 안의 어느 수가 현재 보드에 표시되어 있는지 (-1 = 시작 위치)
// isUserWhite: 사용자가 백을 잡았는지 — 보드 방향, 평가치 부호, 정확도 그래프의 기준
// persistentShapes: 블런더/실수 시 엔진 추천 수를 가리키는 화살표 (보드에 고정 표시)
//
// import 측에서 read는 그대로 가능 (live binding). 재할당은 setter 함수만 사용.

export let chess = new Chess();
export let cg = null;
export let currentlyViewedIndex = -1;
export let isUserWhite = true;
export let persistentShapes = [];

// Chessground 인스턴스 생성 + 등록. main.js의 Initialization에서 한 번 호출.
export function initBoard(container, options) {
    cg = Chessground(container, options);
    return cg;
}

export function setMainGame(c) { chess = c; }
export function resetMainGame() { chess = new Chess(); return chess; }

export function setCurrentlyViewedIndex(i) { currentlyViewedIndex = i; }

export function setIsUserWhite(b) { isUserWhite = b; }

export function setPersistentShapes(arr) { persistentShapes = arr; }
export function pushPersistentShape(shape) { persistentShapes.push(shape); }
export function clearPersistentShapes() { persistentShapes = []; }
