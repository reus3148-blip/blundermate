🤖 Project Workspace & AI Instructions

[AI 주의사항] AI(너)는 코드를 작성하거나 수정하기 전에 반드시 아래의 [핵심 개발 원칙]을 최우선으로 숙지하고, 모든 답변과 코드에 이를 반영해야 한다.

🚨 [필독] 핵심 개발 원칙 (Core Principles)

📱 모바일 퍼스트 (Mobile-First): 이 웹사이트는 100% 모바일 환경을 타겟으로 개발한다. 단, PC 브라우저에서 접속 시 모바일 화면 비율(예: 최대 너비 제한 등)을 흉내 내어 깨짐 없이 보여야 한다.

🌍 크로스 플랫폼 호환성: 모든 UI, 기능, 네트워크 통신, 애니메이션 등은 Android와 iOS(Safari) 양쪽 기기 모두에서 완벽하게 동일하게 작동해야 한다. 웹 표준을 엄격히 준수할 것.

🧩 모듈화 및 유지보수: 코드가 길어지는 것을 지양하고, 성격에 맞는 파일(예: ui.js, storage.js, utils.js 등)로 로직을 분리하여 유지보수성을 높인다.

사용자가 요구할 시 아래 사항들에 따라 코드를 점검합니다.
A. 잠재적 버그 및 예외 처리 (Edge Case) 찾기
가장 우선적으로 실행해야 할 점검입니다. 정상적인 작동 외에 오류가 날 수 있는 상황을 찾습니다.

"현재 열려있는 파일(또는 선택한 코드)에서 발생할 수 있는 잠재적인 버그나 메모리 누수 문제가 있는지 점검해 줘. 특히 사용자가 잘못된 값을 입력하거나 서버 응답이 지연될 때 등 예외 처리(Edge case)가 누락된 부분이 있다면 알려줘."

B. 코드 가독성 및 리팩토링 (유지보수 향상)
나중을 위해 코드를 깔끔하게 다듬는 과정입니다.

"이 코드의 유지보수성과 가독성을 높이기 위해 리팩토링할 방법을 제안해 줘. 불필요하게 중복된 코드가 있는지, 변수나 함수 이름이 직관적이지 않은지 확인하고 더 나은 구조로 다시 작성해 줄 수 있을까?"

C. 성능 최적화
웹사이트의 로딩 속도나 동작을 가볍게 만들기 위한 점검입니다.

"이 코드에서 성능을 최적화할 수 있는 부분을 찾아줘. 비효율적인 반복문, 불필요한 렌더링, 또는 API 호출 속도를 늦추는 병목 구간이 있는지 검토해 줘."

D. 보안 취약점 점검
사용자의 데이터나 서버를 보호하기 위한 필수 점검입니다.

"이 코드에 XSS, CSRF, 데이터 유출 등 프론트엔드/백엔드 보안 취약점이 없는지 확인해 줘. 만약 있다면 어떻게 방어 로직을 추가해야 하는지 코드 예시와 함께 설명해 줘."



✅ 완료된 작업 (Done History)
5번의 작업을 할 때 마다, 무엇을 했는지 요약해서 아래에 추가합니다.
AI가 이미 처리된 작업의 히스토리를 파악하여 중복 코드를 짜지 않도록 돕습니다.

[x] [Refactor] main.js 파일 비대화 해결: 핵심 로직을 utils.js로 분리 완료. (2026-04-09)

[x] [Refactor] 로컬 스토리지 관리 및 Vault 렌더링 로직을 storage.js와 ui.js로 분리 완료. (2026-04-09)

[x] [Feature] 모바일 최적화 플로팅 버튼(FAB)을 활용한 기보 전체화면(Full-screen) 토글 기능 추가.

[x] [Fix] 모바일 브라우저 호환성(100dvh, overscroll) 및 iOS Safari 입력창 강제 줌(Zoom), 포커스 버그 완벽 해결.

[x] [Fix] Chess.com API 호출 시 브라우저 보안 정책으로 인한 'Load failed' 오류 해결(User-Agent 제거 및 URL 인코딩 적용).

[x] [UX] 분석 창에서 분석 완료 및 엔진 준비 상태일 때 불필요한 상태 뱃지(Engine Ready, Analysis Complete)를 자동으로 숨김 처리하여 화면 공간 확보.

[x] [Security/Fix] 전체 코드 점검: XSS 취약점 방지를 위한 HTML Escape 로직 추가 및 시크릿 모드/용량 초과 대비 localStorage 예외 처리(try...catch) 적용.

[x] [Feature] Gemini API 프론트엔드 연동: '✨ Gemini' 버튼 클릭 시 Vercel 서버리스(/api/analyze)로 국면 데이터(FEN, SAN)를 전송하고 AI 해설을 안전하게 렌더링하는 로직 구현 완료.

[x] [Fix/Refactor] 엔진 초기화 전 분석 큐 시작 시 발생할 수 있는 교착 상태(Deadlock) 버그 해결 및 Gemini API 중복 호출(다중 클릭) 방지, UI 평가 뱃지 렌더링 예외(TypeError) 사전 차단 적용. (2026-04-09)

[x] [Refactor] main.js 가독성 향상: 비대해진 이벤트 리스너(Gemini AI 해설) 및 PGN 파싱 로직을 헬퍼 함수로 분리하고, 중복된 체스판 리렌더링(redrawAll) 코드를 `forceRedraw` 유틸리티로 통합.

[x] [Refactor] AI 해설 기능 토큰 제한(1024 -> 4096) 해제, 체스 특화 안전 필터(BLOCK_NONE) 적용, 및 Vercel Edge 환경 최적화 코드 클리닝 완료.

[x] [Feature/Fix] 메인 화면에 Settings 섹션 추가, Gemini AI 토글 스위치 상태에 따라 '실제 API 호출(ON)'과 '더미 데이터 출력(OFF)'으로 동작 분기 처리되도록 로직 수정.

[x] [Fix] PC 환경에서 Gemini AI 해설창 및 모달창(Overlay)이 앱 컨테이너를 벗어나 브라우저 전체 화면을 덮는 버그 해결 (position: fixed -> absolute 변경).

[x] [Feature/UX] 한 번 생성된 Gemini AI 해설(분석 결과)을 `analysisQueue`에 캐싱하여, 창을 닫았다가 다시 열어도 재요청 없이 즉시 렌더링되도록 개선 완료.

[x] [Refactor/UI] 홈 화면의 Settings 컨테이너를 우측 상단 톱니바퀴 아이콘 버튼 및 모달 팝업 구조로 변경하여 UI를 깔끔하게 다듬고 확장성 확보.

[x] [UI] Settings 버튼을 톱니바퀴 기호 대신 'Settings' 텍스트 기반의 알약(Pill) 형태로 변경하고, 텍스트에 맞는 호버(Hover) 애니메이션으로 개선.

[x] [Feature/Fix] Settings 메뉴에 '보드 좌표(Coordinates) 표시' 토글 추가 및 체스판 화면 비율 변경 시 좌표 텍스트(a~h, 1~8)가 보드와 어긋나는(깨지는) 현상 완벽 해결(CSS Flex 비율 강제 할당).

[x] [UI] 보드 좌표(Coordinates) 텍스트 굵기를 얇게 조절하고, 색상을 검은색으로 고정 및 다크 스퀘어 시인성 확보.

[x] [UI] 보드 좌표(Coordinates) 위치를 Chess.com 및 Lichess의 표준 UI와 동일하게 좌측 상단(숫자) 및 우측 하단(알파벳) 모서리로 일관성 있게 재배치 완료.

[x] [Feature] 흑(Black) 플레이 시 자동 보드 뒤집기(Orientation) 로직 검증 완료 및 언제든 시점을 변경할 수 있는 'F' 키(Flip) 단축키 기능 추가.

[x] [Feature/UX] Gemini AI 해설 호출 조건을 'Blunder', 'Mistake', 'Missed Win', 'Inaccuracy' 등 오답 상황으로만 제한하여 불필요한 API 비용을 절약하는 방어 로직 추가.

📝 메모 / 아이디어 창고 (Scratchpad)
