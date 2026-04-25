// 분석 화면의 동작 모드 상태.
// appMode: 'main' = 기보 분석 / 'explore' = 사용자가 보드에서 자유 변형 중 / 'simulate' = 엔진 추천 라인 따라가는 시뮬레이션
// isPreviewMode: 분석 시작 전 미리보기 카드 화면 (엔진 미작동, 보드 조작만 가능)
// isReviewMode: 분석 완료 후 전체화면 리뷰(승률 그래프 + 통계 표). 보드 자리와 패널 자리를 합쳐서 사용.
//   - 분석 직후 자동 ON, 보드 위치를 옮기면(updateBoardPosition) 자동 OFF.
//   - ☰ 오버레이의 "리뷰 보기" 버튼으로 다시 ON 가능.
//
// explorationChess: 'explore' 모드에서 사용자가 두는 변형 라인을 추적하는 별도 Chess 인스턴스 (메인 chess와 분리)
// explorationEngineLines: 'explore' 모드에서 엔진이 변형 위치에 대해 분석한 multi-PV 결과
// simulationQueue: 'simulate' 모드에서 엔진 추천 PV를 한 수씩 따라갈 수 있게 만든 FEN 리스트
// simulationIndex: simulationQueue에서 지금 보고 있는 인덱스
//
// 다른 모듈에서 read는 live binding으로 그대로 가능. 재할당은 setter로만.

export let appMode = 'main';
export const explorationChess = new Chess();
export let explorationEngineLines = [];
export let simulationQueue = [];
export let simulationIndex = -1;
export let isPreviewMode = false;
export let isReviewMode = false;

export function setAppMode(m) { appMode = m; }
export function setIsPreviewMode(b) { isPreviewMode = b; }
export function setIsReviewMode(b) { isReviewMode = b; }

export function clearExplorationEngineLines() { explorationEngineLines = []; }
export function setExplorationLineAt(i, line) { explorationEngineLines[i] = line; }

export function setSimulationQueue(arr) { simulationQueue = arr; }
export function pushSimulationQueueItem(item) { simulationQueue.push(item); }
export function setSimulationIndex(i) { simulationIndex = i; }
