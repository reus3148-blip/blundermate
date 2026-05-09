# Migration: chess.js 0.10.3 → 1.4.0 (latest, 2025-06-14)

> 다음 세션에서 진행할 chess.js 메이저 버전 마이그레이션 계획. 단독 phase로 충분히 큰 작업이라 별도 문서로 분리. 완료 후 본 문서는 WORKLOG의 해당 phase 본문에 합쳐지거나 archive 가능.

## Why

현재 사용 중인 `chess.js@0.10.3` (cdnjs 글로벌 `<script>`, 8년 이상 정체)의 한계로 우회 코드가 누적됨:

| 우회 위치 | 줄 수 | 우회 이유 |
|-----------|-------|----------|
| `analysis.js:parseNotesFromPgn` + `SAN_TOKEN_RE` | ~30 | PGN `{...}` 코멘트 API 부재. movetext 토큰 walk으로 직접 파싱 |
| `main.js:buildPgnWithNotes` + `SAN_TOKEN_RE` 중복 | ~25 | `set_comment` API 부재. `chess.pgn()` 결과 문자열에 `{note}` 직접 주입 |
| `analysis.js:buildQueueFromPgn` 두 번째 인자 + 호출 사이트의 원본 PGN 캡처 | ~5 | `load_pgn`이 코멘트를 strip해서 chess instance를 단일 진실 소스로 못 씀 — 그림자 상태 |
| `utils.js:parseAndLoadPgn` raw-token 폴백 | ~30 | 0.10 PGN 파서가 일부 chess.com PGN을 거부. 헤더 첫 토큰에서 break하는 미해결 갭 (CLAUDE.md "알려진 갭" 명시) |

**총 제거 가능: ~85-90줄 + duplication 0**

또한 v1만 가능한 새 인프라:
- **PGN 코멘트 표준 API** (`setComment`/`getComment`/`getComments`/`deleteComments`)
- **NAG 표준 지원** — `$1`/`$2`/`$4` (= `!`/`?`/`??`) 파싱·생성. classification chip을 PGN으로 영속해 chess.com·lichess와 round-trip
- **변형(variations) 트리** — `1. e4 (1. d4 d5) e5` 입출력. 시뮬레이션 / 분석 best line / vault 풀이 라인을 PGN에 영속 가능
- **TypeScript 타입 정의** + 활발한 유지보수
- **더 관대한 PGN 파서** — `parseAndLoadPgn` 폴백 제거 가능

ROI: 단독으로는 코드 단순화 + 그림자 상태 제거 정도이고 user-visible 효과는 0. 그러나 NAG export / 변형 트리 같은 후속 기능의 **불가결한 사전 작업**. 사용자 결정으로 진행.

---

## 핵심 결정

### CDN ESM URL

`<script>` 글로벌 → ES module import로 전환. `package.json` 도입은 CLAUDE.md "프론트엔드 npm 의존성 0" 위반이라 **금지**. CDN ESM 후보:

| URL | 비고 |
|-----|------|
| `https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm` | jsDelivr ESM, 지역 캐시 양호 |
| `https://esm.sh/chess.js@1.0.0-extended` | esm.sh, 빌드된 ESM |
| `https://cdn.skypack.dev/chess.js@1.0.0-extended` | skypack, 일부 deprecated 경고 |

**선택 권장**: jsDelivr `+esm`. chessground도 cdnjs 사용 중이지만 chess.js 1.x는 cdnjs에 없을 수 있어 jsDelivr fallback. **첫 phase 작업 시 실 fetch + 모듈 export 정상 검증** 필수 (한 import URL을 8 파일에서 공유).

### 버전 결정

- **chess.js 1.4.0** (2025-06-14 release, npm dist-tag `latest`) — 단일 패키지에 변형/NAG/코멘트 + TypeScript 타입 포함
- 1.x 시리즈 history: 1.0.0(2025-01-11) → 1.1.0 → 1.2.0 → 1.3.0/1.3.1 → 1.4.0
- jsDelivr ESM 빌드 검증 완료 (`+esm` URL이 `Chess` / `Move` / `validateFen` / piece 상수 + `DEFAULT_POSITION` export 정상)

**버전 핀**: URL에 `@1.4.0` 명시. `@latest` 미사용 — CDN 캐시 / 갑작스런 메이저 변경 회피. 후속 patch 출시 시점에 사용자가 명시적으로 결정.

### 호환성 가드

- chess.js 0.10의 `move()`는 잘못된 수에 `null` 반환. v1도 동일 — OK
- v1 `move()`는 `{from, to, promotion}` 객체 또는 SAN 문자열 모두 받음 (0.10과 동일)
- `header()` getter/setter API 호환
- `fen()` / `turn()` / `board()` / `inCheck()` 류 메서드는 이름만 변경 (snake_case → camelCase)

---

## 메서드 매핑 표

검색·치환에 사용. 모두 8개 .js 파일에서 grep으로 위치 확인 후 일괄 변경.

| 0.10.3 (snake_case) | 1.x (camelCase) | 사용 사이트 (대략) |
|---------------------|------------------|------|
| `load_pgn(pgn)` | `loadPgn(pgn)` | utils.js, main.js, vault.js |
| `in_check()` | `isCheck()` | utils.js (classifyMove 등) |
| `in_checkmate()` | `isCheckmate()` | autoBlunders.js, vault.js |
| `in_stalemate()` | `isStalemate()` | (드물게 사용) |
| `in_draw()` | `isDraw()` | (드물게 사용) |
| `in_threefold_repetition()` | `isThreefoldRepetition()` | (있다면) |
| `insufficient_material()` | `isInsufficientMaterial()` | (있다면) |
| `game_over()` | `isGameOver()` | (있다면) |
| `validate_fen(fen)` | `validateFen(fen)` | utils.js (isValidFen 헬퍼) |
| `set_comment(c)` | `setComment(c, fen?)` | (현재 우회 — 신규 활용) |
| `get_comment()` | `getComment(fen?)` | (현재 우회 — 신규 활용) |
| `get_comments()` | `getComments()` | (현재 우회 — 신규 활용) |
| `delete_comment(fen?)` | `deleteComment(fen?)` | (필요 시 사용) |
| `delete_comments()` | `deleteComments()` | (필요 시 사용) |
| `header(...)` (getter/setter) | `header(...)` | 동일 |
| `pgn()` | `pgn()` | 동일 |
| `fen()` | `fen()` | 동일 |
| `turn()` | `turn()` | 동일 |
| `board()` | `board()` | 동일 |
| `move(spec)` | `move(spec)` | 동일 |
| `moves(opts)` | `moves(opts)` | 동일 (legal moves) |
| `history(opts)` | `history(opts)` | 동일 — `{verbose: true}` 결과 객체 형식 약간 다를 수 있음 (검증 필요) |
| `undo()` | `undo()` | 동일 |
| `reset()` | `reset()` | 동일 |
| `load(fen)` | `load(fen)` | 동일 |

**주의**: `history({verbose: true})`의 객체 키 변경 가능성. v1은 `from`/`to`/`san`/`piece`/`color`/`flags` 등이 0.10과 거의 같지만, `comment` 필드가 `Move.comment`로 노출될 수 있음 — 변경되면 `parseNotesFromPgn` 우회 자체가 불필요해짐.

---

## 변경 파일 인벤토리

`new Chess()` + snake_case 메서드 사용 사이트 (직전 grep 기준):

| 파일 | new Chess 호출 | 메서드 호출 | 비고 |
|------|----------------|-------------|------|
| [main.js](main.js) | 5건 | `load_pgn` 등 | SPA shell. import 추가 + 메서드 rename. `buildPgnWithNotes` 제거 후 `setComment` 활용으로 재작성 |
| [vault.js](vault.js) | 8건 | `load_pgn`, `in_checkmate` | 풀이 / 시뮬레이션 / 분석 라인 검증에 다수 사용 |
| [utils.js](utils.js) | 1건 | `load_pgn`, `validate_fen`, `in_check` 등 | classifyMove 등 분류 로직. 변경 영향 큼 — freechess 포팅 코드라 동작 보존 검증 |
| [analysis.js](analysis.js) | 1건 | `load_pgn` | `buildQueueFromPgn`. originalPgn 두 번째 인자 제거 후 `getComments`로 교체 |
| [autoBlunders.js](autoBlunders.js) | 2건 | `in_checkmate` | mate 검증 흐름 |
| [board.js](board.js) | 2건 | (생성/리셋만) | export `chess` 인스턴스 + `resetMainGame` |
| [modes.js](modes.js) | 1건 | (생성만) | `explorationChess` |
| [savedGames.js](savedGames.js) | 0건 | `_getChess().pgn()` 간접 사용 | import 추가만 (Chess 직접 안 씀) |

**총 ~20개 인스턴스화 + ~14건 메서드 호출** — 전체 ~35 사이트 수정.

---

## 단계별 작업 (순서)

각 단계는 **별도 commit**. 각 단계 끝에서 preview server에서 회귀 시나리오 검증 (아래 "검증" 섹션).

### 단계 0 — 사전 검증 (작업 전)

1. CDN ESM URL이 실제로 살아있는지 + 모듈 export 정상인지 확인:
   ```js
   import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
   const c = new Chess(); c.move('e4'); console.log(c.pgn());
   ```
2. v1의 `history({verbose: true})` 반환 객체 shape 확인 — 0.10과 키 다른지
3. `setComment` / `getComments` 시그니처 확인 — `chess.setComment(text)` (현 위치) vs `chess.setComment(text, fen)` (특정 위치)
4. NAG API 확인 — `move.nags` / `chess.setNag(num)` / 정확한 호출법
5. 변형 API 확인 — `chess.move(san, { variation: true })` 또는 별도 메서드?

위 5건을 `migration-chess-js.md`에 결과 기록 후 본 작업 진행 결정. **하나라도 미흡하면 마이그레이션 보류**.

### 단계 1 — `<script>` 제거 + ESM import 패치

1. `index.html` 의 `<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>` 제거 ([index.html:735](index.html))
2. 8 파일에 import 추가:
   ```js
   import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
   ```
3. preview server 부팅 — 콘솔 에러 0 확인
4. 첫 분석 흐름 시도 (saved game 클릭 → 분석 시작) — 메서드 이름 미스매치로 fail 예상. 로그 모음 후 다음 단계로

### 단계 2 — snake_case → camelCase 일괄 치환

1. 위 매핑 표 그대로 — `Edit` 도구의 `replace_all`로 각 메서드 일괄 변경
2. 각 파일에서 grep으로 잔여 snake_case 0 확인:
   ```bash
   grep -rn "load_pgn\|in_check\|in_checkmate\|in_stalemate\|in_draw\|game_over\|in_threefold\|insufficient_material\|validate_fen" *.js
   ```
3. preview server에서 분석 / vault 풀이 / 라이브 입력 / saved games 4개 메인 흐름 진입 — 콘솔 에러 0
4. **회귀 위험 큰 지점**: `utils.js:classifyMove` (freechess 포팅) — `inCheck()` 호출 결과로 분류가 좌우됨. 분석 결과 1게임을 마이그레이션 전후 비교

### 단계 3 — PGN 코멘트 우회 코드 제거 (NAG API로 교체)

1. [analysis.js](analysis.js) 의 `parseNotesFromPgn` + `SAN_TOKEN_RE` 삭제
2. `buildQueueFromPgn(chess, originalPgn)` → `buildQueueFromPgn(chess)` (두 번째 인자 제거). 본문에서 `chess.getComments()` 사용해 fen → comment 매핑 후 queue[i].note 채움
3. [main.js](main.js) 의 `buildPgnWithNotes` + `SAN_TOKEN_RE` 중복 삭제. 새 구현:
   ```js
   function buildPgnWithNotes() {
       analysisQueue.forEach((q, i) => {
           if (q.note) chess.setComment(q.note, q.fen);
       });
       return chess.pgn();
   }
   ```
   (실제 v1 API 시그니처에 맞춰 조정 — `setComment(text, fen)` 또는 chess instance를 fen 위치로 navigate 후 `setComment(text)`)
4. [main.js](main.js) `handlePgnReviewStart` 의 `buildQueueFromPgn(chess, pgnText)` → `buildQueueFromPgn(chess)` — 그림자 상태 제거
5. preview에서 PGN 메모 라운드트립 검증 (입력 → 저장 → 다시 열기 → 메모 노출)

### 단계 4 — `parseAndLoadPgn` 폴백 제거

1. v1 파서가 chess.com PGN을 잘 처리하는지 검증 — bywxx의 실제 게임 50건 샘플로 test
2. `utils.js parseAndLoadPgn` 의 raw-token 폴백 (~30줄) 제거. v1이 거부하면 그냥 `success: false` 반환
3. CLAUDE.md "알려진 갭"에서 해당 항목 제거

### 단계 5 — NAG export 추가 (선택, 동일 phase로 합쳐도 OK)

1. classification → NAG 매핑 헬퍼 (`utils.js`):
   ```js
   const NAG_BY_CLASS = {
       brilliant: 3, great: 1, best: 1, excellent: 146,
       good: null, inaccuracy: 6, mistake: 2, blunder: 4, missed_mate: 4,
   };
   export function nagForClassification(cls) {
       return NAG_BY_CLASS[(cls||'').toLowerCase()] ?? null;
   }
   ```
2. `buildPgnWithNotes` 옆에 `setNag` 호출 추가:
   ```js
   const nag = nagForClassification(q.classification);
   if (nag) chess.setNag(nag, q.fen);
   ```
3. PGN 복사 / saved_games 영속에 NAG 자동 동반 — chess.com·lichess import 시 우리 분류 그대로 마크
4. 검증: 우리 PGN 복사 → lichess analysis 화면에 import → `??` `?` 등이 표시되는지

### 단계 6 — 문서 갱신

1. [CLAUDE.md](CLAUDE.md) 의 "강제되는 invariants" 의 "Chessground/Chess.js는 CDN" 항목 — chess.js 버전 명시
2. [CLAUDE.md](CLAUDE.md) "알려진 갭" 에서 `parseAndLoadPgn 폴백` 제거
3. [NOTICE.md](NOTICE.md) 의 chess.js 버전 표기 갱신 (`0.10.3` → 신버전)
4. [WORKLOG.md](WORKLOG.md) 에 Phase 50 (또는 다음 번호) 본문 추가 — 본 마이그레이션 narrative
5. 본 `migration-chess-js.md` 파일은 archive 또는 삭제

---

## 검증 시나리오 (수동)

테스트 슈트 0이라 preview server에서 직접. 각 단계 후 모두 통과해야 다음 단계.

| # | 시나리오 | 통과 기준 |
|---|---------|----------|
| 1 | bywxx 로그인 후 home → 게임 카드 → 분석 시작 → 완료 | 분석 보고 화면 + 분류 통계 정상 |
| 2 | "첫 수부터 복기" → 좌우 화살표로 수 이동 | 보드 / engine lines / classification 정상 갱신 |
| 3 | 메모 입력 → 다른 수 → 돌아오기 | 메모 보존 |
| 4 | 책갈피 → 저장 → saved_games 다시 열기 → 분석 → 첫 수 | 메모 복원 |
| 5 | "기보" → "PGN 복사" | 클립보드에 `{...}` 코멘트 + (단계 5 후) `$N` NAG 동반 |
| 6 | 수 입력 모달에 PGN 붙여넣기 (코멘트 포함) | 분석 진입 후 메모 노출 |
| 7 | vault 풀이 (블런더 / 메이트 둘 다) | mate 검증 (`isCheckmate`) 정상 |
| 8 | autoBlunders — 분석 직후 자동 수집 | vault에 row 추가 |
| 9 | 라이브 입력 모드 — 보드에 수 입력 + 시뮬레이션 | undo / reset / paste 모두 동작 |
| 10 | 외부 PGN 50건 (실 chess.com 게임) parseAndLoadPgn 통과율 | v1 통과율이 0.10 이상이어야 함 (회귀 0) |
| 11 | classifyMove 결과 비교 (마이그레이션 전후 같은 게임) | classification 통계 동일 |

---

## 롤백 전략

각 단계가 별도 commit이라 git revert로 단계 단위 롤백 가능. 가장 위험한 단계는 **2 (snake_case 일괄 치환)** 와 **4 (parseAndLoadPgn 폴백 제거)**.

만약 단계 2 후 `classifyMove` 결과가 마이그레이션 전후 다르면 — **분류 알고리즘이 깨진 것이라 즉시 롤백 + 디버그**. freechess 포팅 코드라 외부 알고리즘 의존성이 있어 복구 어려움. 변경 전 상태에서 1게임 분류 결과 baseline을 미리 캡처해 두기.

---

## 참고

- chess.js v1 GitHub: <https://github.com/jhlywa/chess.js/tree/master>
- v0 → v1 변경 사항 changelog: 저장소 README의 "Migration" 섹션
- npm registry: <https://registry.npmjs.org/chess.js/latest>
- 본 plan 작성 시점 (2026-05-10) 기준 latest = **1.4.0** (2025-06-14 release). 본 작업은 1.4.0 핀 사용. 후속 patch 출시 시 사용자 결정으로 별도 bump phase.
