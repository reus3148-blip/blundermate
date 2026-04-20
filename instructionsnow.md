모바일 뒤로가기 버튼이 앱을 종료시키는 Critical 버그 수정.

## 버그
- 유저가 게임 선택 → 분석 화면 진입
- 뒤로가기 → 홈으로 가지 않고 앱 자체가 꺼짐
- 이유: SPA라서 URL 변화 없음, 브라우저가 "이전 사이트"로 이동
- 결과: 모바일 유저 경험 치명적 손상

## 해결: History API + 화면 상태 관리

### 기본 원리
- 화면 전환 시 history.pushState()로 히스토리 스택에 추가
- popstate 이벤트 리스너로 뒤로가기 감지
- 감지 시 이전 화면으로 JS에서 복원

## 네 앱의 화면 전환 지점 (모두 처리 대상)

주요 네비게이션:
1. 홈 → 게임 미리보기
2. 게임 미리보기 → 분석 화면
3. 분석 화면 → 홈
4. 홈 → Vault
5. Vault 목록 → Vault 아이템 상세
6. Vault 상세 → 분석 화면 (해당 수)
7. 홈 → Saved Games
8. Saved Games → 분석 화면
9. 홈 → 포지션 입력 (PGN/FEN/직접 두기)
10. 포지션 입력 → 분석 화면

기타:
- 홈 → 다른 유저 검색 (모달 방식)
- 홈 → 피드백/설정 (모달 방식)

## 구현 방향

### 1. 화면 상태 관리 객체 설계
각 화면을 상태로 표현:
```js
const SCREEN_TYPES = {
  HOME: 'home',
  ANALYSIS: 'analysis',
  VAULT_LIST: 'vault_list',
  VAULT_DETAIL: 'vault_detail',
  SAVED_GAMES: 'saved_games',
  INPUT: 'input',  // PGN/FEN/직접 두기
  GAME_PREVIEW: 'game_preview',
};
```

상태에 필요한 부가 정보:
- 분석 화면: 어느 게임인지 (gameId 또는 pgn 참조)
- Vault 상세: vault_item id
- 게임 미리보기: 어느 게임 선택했는지
- 입력 화면: 어느 탭 활성화됐는지 (PGN/FEN/직접)

### 2. 화면 전환 함수 통합
화면 전환 시 공통 함수 사용:
```js
function navigateTo(screen, state = {}) {
  history.pushState({ screen, ...state }, '', `#${screen}`);
  renderScreen(screen, state);
}
```

기존에 직접 DOM 조작하는 화면 전환 코드들을 이 함수 호출로 리팩토링.

### 3. popstate 리스너
```js
window.addEventListener('popstate', (event) => {
  const state = event.state;
  if (state && state.screen) {
    renderScreen(state.screen, state);
  } else {
    // 히스토리 비어있거나 state 없으면 홈으로
    renderScreen(SCREEN_TYPES.HOME);
  }
});
```

### 4. 앱 초기 로드 시
최초 진입 시 홈 화면을 history에 명시적으로 push:
```js
history.replaceState({ screen: SCREEN_TYPES.HOME }, '', '#home');
```

### 5. 모달 처리 (선택)
모달(유저 검색, 피드백, 설정 등)도 뒤로가기로 닫히면 자연스러움:
- 모달 열 때 pushState
- popstate에서 모달 상태 감지 시 모달만 닫음

우선 핵심 화면 전환부터 처리, 모달은 선택사항.

## URL 해시 사용 이유
- #home, #analysis 같은 해시 URL 사용 (path 아님)
- 이유: 네 Vercel 라우팅이 path 기반으로 특정 라우팅 처리할 수 있음
- 해시는 서버로 전송 안 되므로 클라이언트에서만 사용
- 기존 배포 구조 안 건드림

## 작업 전 확인
1. main.js에서 화면 전환 관련 함수/로직 파악
   - 각 화면으로 이동하는 함수 이름들
   - DOM 교체 방식 (클래스 토글, innerHTML 교체 등)
2. 현재 상태 관리 변수 (currentScreen, currentGame 등)
3. 모달 열고 닫는 로직
4. 뒤로가기 버튼(‹ Back)의 기존 동작 - 이것도 같은 함수로 통합 가능

## 기존 뒤로가기 버튼 (‹ Back)과 통합
분석 화면 등에 있는 ‹ Back 버튼도 브라우저 뒤로가기와 동일하게 동작해야 함:
```js
function goBack() {
  history.back();
  // popstate 이벤트가 자동으로 발생, 처리됨
}
```
UI 뒤로가기와 하드웨어 뒤로가기가 같은 동작이 되면 일관성 완성.

## 엣지 케이스

### A. 앱 첫 진입에서 바로 뒤로가기
- 홈에서 뒤로가기 누르면 → 이전 사이트로 (정상 동작, 앱 종료)
- 이건 유지 (막으면 오히려 이상)

### B. 딥링크 (URL 직접 접속)
- blundermate.app#analysis 같은 URL로 직접 접속
- 현재는 항상 홈으로 가게 두고, Phase 2에서 딥링크 구현 (지금은 복잡)

### C. 뒤로가기 여러 번 연속
- 뒤로가기 연속 누르면 결국 앱 첫 진입 전으로 → 이전 사이트로
- 정상 동작

## 디버깅 로그
각 navigateTo 호출 시:
- console.log('[Nav] push:', screen, state)

popstate 이벤트 시:
- console.log('[Nav] pop:', event.state)

renderScreen 호출 시:
- console.log('[Nav] render:', screen, state)

이걸로 전환 흐름 추적 가능.

## 주의사항
- CLAUDE.md 디자인 시스템 무관 (로직)
- 기존 화면 전환 로직 유지, 단지 history 관리만 추가
- 기존 myUserId/viewingUserId 상태 분리 유지
- vaultSnapshot 패턴 유지 (모달 내 상태 고정 로직)
- 0수 자동 진입 로직 유지 (분석 완료 → 0수)

## 금지사항
- 새 라우팅 라이브러리 도입 금지 (Vanilla JS로)
- 화면 렌더링 로직 크게 리팩토링 금지 (history만 추가)
- URL path 변경 금지 (해시만 사용)

## 테스트 시나리오 (반드시)
- [ ] 홈 → 게임 미리보기 → 뒤로가기 → 홈으로 복귀 (앱 안 꺼짐)
- [ ] 홈 → 분석 → 뒤로가기 → 미리보기로 복귀 (전 단계로)
- [ ] 분석 중 0수(리포트) → 뒤로가기 → 미리보기로 (분석 화면 탈출)
- [ ] Vault → 상세 → 뒤로가기 → Vault 목록
- [ ] 홈 → Saved Games → 뒤로가기 → 홈
- [ ] 연속 뒤로가기: 분석 → 미리보기 → 홈 → (앱 종료 or 이전 사이트)
- [ ] UI ‹ Back 버튼과 하드웨어 뒤로가기가 동일 동작
- [ ] 다른 유저 검색 후 뒤로가기 (모달 처리 여부)
- [ ] 새로고침 후 상태 초기화 (홈으로)
- [ ] 데스크톱 브라우저 뒤로가기 버튼도 정상 작동
- [ ] 모바일 (iOS Safari / Chrome Android) 하드웨어/제스처 뒤로가기 정상

## 리포트
수정 전에 먼저 알려줘:
1. 현재 화면 전환이 어떤 함수/패턴으로 되어있는지
2. 어느 위치에 navigateTo를 넣을지 계획
3. 모달은 이번 작업에 포함할지 별도로 할지

확인 후 수정 진행.