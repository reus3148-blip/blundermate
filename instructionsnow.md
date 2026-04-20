styles.css에서 기타 고아 클래스들을 제거해줘. Pass 1c (마지막).

## 배경
- 이전 styles.css 분석 리포트에서 확인된 미사용 클래스들
- Pass 1a (State B), Pass 1b (Eval Bar) 완료됨
- 이번 Pass 1c는 나머지 흩어진 고아 클래스들 일괄 제거
- 예상 제거량 ~70줄

## 제거 대상
styles.css 내 다음 클래스 정의 모두 제거:

**홈 레이아웃 잔재**
- `.home-link-sep` (L318 근처)
- `.manual-input-wrapper` (L326 근처) — 주의: `#manualInputWrapper` ID 셀렉터는 다를 수 있음, 클래스 셀렉터만 제거
- `.home-divider` (L336 근처)
- `.home-spacer` (L343 근처)

**검색/입력 관련**
- `.username-input-row` (L212 근처)
- `.search-input-container` (L575 근처)
- `.search-submit-btn` (L612 근처)
- `.manual-input-toggle` (L682 근처)

**텍스트/유틸**
- `.text-divider` (L2196 근처)
- `.app-logo` (L161 근처) — 로고 이미지 미사용
- `.top-bar-spacer` (L803 근처)

**엔진 상태 (구버전)**
- `.engine-status` + 그 변형들 (L778, 787, 788, 2214 근처)
- `.top-bar-eval` (L807 근처)

**연습 피드백 (미구현)**
- `.practice-feedback` + 변형들 (L814-820 근처)

**AI 플레이스홀더**
- `.ai-panel-placeholder` (L1440 근처)
- `.ai-placeholder-icon` (L1451 근처)
- `.ai-placeholder-title` (L1459 근처)
- `.ai-placeholder-hint` (L1466 근처)
- `.ai-btn` (L1611 근처)

**컨트롤 탭 (구버전)**
- `.ctrl-tab` + `.active` 상태 (L1309-1332 근처)

**보드/모달 (미사용)**
- `.board-container--input` (L2225 근처)
- `.pgn-readonly` (L2231 근처) — !important 5개 포함
- `.btn-primary-outline` (L2173 근처)
- `.btn-undo` (L2249 근처)
- `.modal-actions-right` (L2244 근처)
- `.modal-content--wide` (L2220 근처)

**온보딩/컨테이너**
- `.onboarding-logo` (L2439 근처)
- `.container-message` + `.error` 변형 (L2203-2210 근처)

**섹션 주석도 같이 정리**
- 제거 후 빈 섹션이 되는 주석은 함께 제거
- 연속 빈 줄은 1줄로 압축

## 주의사항

### 1. 참조 재확인 필수
제거 전에 모든 대상 클래스에 대해 **0건 확인**:
- index.html
- main.js, ui.js, vault.js, savedGames.js, storage.js, utils.js, chessApi.js, gemini.js, engine.js, strings.js
- 동적 참조 (템플릿 리터럴 내 클래스명) 포함

**한 건이라도 나오면 해당 클래스는 제거하지 말고 목록에서 빼고 보고**. 이번 Pass는 목록이 길어서 하나라도 놓치면 위험.

### 2. 유사 이름 혼동 주의 — 건드리지 말 것
다음은 이름이 비슷하지만 **사용 중**이므로 건드리면 안 됨:

- `.home-hero`, `.home-recent-*`, `.home-*` 중 위 목록 외 (현재 사용 중)
- `.search-*` 중 위 목록 외 (검색 모달 등 사용 중일 수 있음)
- `.engine-*` 중 위 목록 외 (현재 엔진 토글 관련)
- `.ai-*` 중 위 목록 외 (AI 코치 UI 사용 중)
- `.ctrl-*` 중 위 목록 외 (현재 컨트롤 버튼)
- `.board-*` 중 `--input` 아닌 것 (보드 기본 스타일 사용 중)
- `.btn-*` 중 위 목록 외 (일반 버튼들 사용 중)
- `.modal-*` 중 위 목록 외 (모달 기본 사용 중)
- `.onboarding-*` 중 `-logo` 외 (온보딩 플로우 사용 중)

**대상 클래스 정확히 일치할 때만 제거**. 비슷한 이름은 사용 여부 재확인.

### 3. ID 셀렉터와 혼동 금지
`#manualInputWrapper` 같은 ID 셀렉터는 **이번 제거 대상 아님**. 오직 클래스 셀렉터(`.xxx`)만 제거.

### 4. CSS 변수 / !important 처리 미루기
- :root 변수 통합은 Pass 2
- `.pgn-readonly`의 !important 5개는 해당 클래스 제거와 함께 자동 제거됨

## 작업 순서
1. 제거 대상 클래스들 **각각** HTML/JS 전체에서 사용처 재검색 결과 공유
2. 0건 아닌 항목 있으면 목록에서 빼고 보고
3. 최종 제거 목록 승인 받은 뒤 제거 진행
4. 제거 후 총 제거 줄 수 + 파일 총 줄 수 보고
5. 파일 저장 후 승인 대기

## 제거 후 내가 확인할 것
- 홈 / 분석 / 복기 / 저장된 게임 / 설정 / 온보딩 / 수 입력 / 피드백 전 화면
- 모바일 / 데스크톱 양쪽
- 특히 모달 동작 (다른 유저 검색 모달, 기보 오버레이 등)