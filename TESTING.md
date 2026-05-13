# 수동 회귀 체크리스트

코드베이스 테스트 0 (의도된 갭, [CLAUDE.md](CLAUDE.md) "알려진 갭" 참조). 대신 **큰 변경 후** 이 5-step을 모바일 시뮬레이터(또는 Chrome 모바일 뷰)에서 한 번 훑어 회귀 차단.

각 step의 "왜" 라인은 **과거 실제 회귀 사례** — 다음에 같은 함정 안 빠지게.

---

## 1. 라이브 분석 — 중간 바 3-등분 + 하단 인라인 액션

1. 하단 nav "분석" 탭 → 빈 보드 라이브 분석 진입
2. 중간 바: 3-등분 그리드 `[수 평가 | 평가치(%) | < >]` (각 칸 center 정렬)
3. 하단 바: `[저장] [AI] [실행취소] [회전] [처음부터]` (모드별 가시성), `[↩]` hidden
4. **회전** 탭 → 보드 흑 시점 (orientation-black)
5. **처음부터** 탭 → 시작 포지션 복귀 (32 pieces)
6. 보드 위 수 두기 → "분석 중..." placeholder + 잠시 후 엔진 라인 표시
7. **실행취소** 탭 → 마지막 수 제거 + 직전 위치로 복귀
8. 중간 바 `<` `>` 탭 → 큐 내 navigate

**왜:** Phase 61에서 중간 바를 3-등분(수평가/평가치/이전·다음)으로 재편, prev/next는 하단→중간 이동. 라이브 3-btn + 메인복귀 동시 visible될 invariant 위반 (`syncBottomBar()` 단일 진입점이 차단).

---

## 2. 리뷰 화면 변형 분석 (EXPLORE)

1. 홈 → chess.com/lichess 게임 카드 분석 진입 (또는 paste→PGN)
2. 분석 완료 후 리뷰 화면에서 임의 수 위치 navigate
3. **보드 위에서 메인라인 다른 수를 둠** (예: e4 게임에서 d4)
4. 변형 분석 진입: 하단 바 `[↩]` 노출 / `[AI]` hidden / `[⋯]` hidden
5. 엔진이 변형 위치 평가 시작 ("분석 중..." placeholder → 엔진 라인)
6. `<` (이전) 누르면 변형 한 수 undo (redo 스택에 보관) — `>` 로 redo 가능
7. `↩ 메인복귀` 탭 → 원래 main 라인 위치로 복귀, `[AI]` 다시 노출

**왜:** Phase 58 첫 시도에서 EXPLORE 모드를 통째 폐지해 이 흐름 전체가 깨졌음. 사용자 컴플레인으로 phase 1개 더 소비. 보드 드래그 → 변형 분석 진입이 핵심 기능 — 누락 시 즉시 회귀로 분류.

---

## 3. SIMULATE — 엔진 라인 따라가기

1. 리뷰 화면 임의 위치에서 엔진 라인(우측 패널) 항목 탭
2. SIMULATE 진입: 보드가 PV 첫 수로 이동, 하단 바 `[↩]` 노출 / `[AI]` hidden
3. `>` 다음 → PV 다음 수, `<` 이전 → 직전 수
4. PV 끝에서 `>` → 단일 엔진 라인 1개 확장 (sim extend)
5. `↩` 탭 → 원래 위치 복귀

**왜:** SIMULATE의 진입/탈출은 EXPLORE와 같은 `returnMainLineBtn`을 공유. Phase 58 중간에 EXPLORE 제거하면서 한 번 깨졌다가 복원.

---

## 4. paste→PGN 분석 진입 (cleanup gap)

1. 하단 nav "분석" → **라이브 분석 진입** + 수 몇 개 두기 (분석 큐 채움)
2. 분석 화면 상단의 게임 불러오기 → **paste PGN** 선택 → 임의 PGN 붙여넣고 분석 시작
3. **새 게임 리뷰 화면** 진입 시 다음 모두 확인:
   - `[⋯ 더보기]` hidden (LIVE_INPUT 잔재 아님)
   - `[↩]` hidden (EXPLORE/SIMULATE 잔재 아님)
   - `[AI]` 노출
4. 리뷰 → 다시 1번부터 반복하되 이번엔 (a) 보드 드래그로 EXPLORE 진입 / (b) 엔진 라인 클릭으로 SIMULATE 진입 한 뒤 paste→PGN
5. 모두 위 3번 invariant 충족

**왜:** Phase 58 /simplify 단계에서 `startNewAnalysis`가 `setAppMode(MAIN)` 직접 호출하면서 cleanup을 빼먹어 EXPLORE/SIMULATE 상태에서 paste→PGN 진입 시 `returnMainLineBtn` 잔류 가능성 발견. `exitBranchMode()`로 단일 cleanup 진입점화.

---

## 5. 콘솔 청결

위 1-4 흐름 전부 진행하는 동안 dev tools 콘솔 (mobile view에선 remote debug) 에서:
- `error` 0
- `warn` 0
- 의도된 silent fail은 network tab으로만 확인 (호출자 UI 처리 있음)

**왜:** [feedback_clean_console](https://github.com/.../memory) 사용자 명시 원칙. dev 콘솔 노이즈 = production 콘솔 노이즈 = 사용자 신뢰도 하락.

---

## 사용 가이드

- 큰 변경 후 (특히 `main.js` / `modes.js` / `board.js` / 분석 화면 관련) 5-step 모두 훑기
- 소소한 변경(스트링/스타일/홈 화면 등) 시엔 영향 가능성 있는 step만 선택
- 새 회귀 발견 시 이 문서에 사례 + "왜" 추가 — 다음에 같은 함정 차단
- 자동 테스트 인프라 도입 시점이 오면 이 체크리스트가 첫 e2e 시나리오의 사양으로 직접 변환됨
