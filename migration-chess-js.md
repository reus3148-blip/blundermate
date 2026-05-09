# Migration: chess.js 0.10.3 → 1.4.0 (latest, 2025-06-14)

> 다음 세션에서 진행할 chess.js 메이저 버전 마이그레이션 계획. 단독 phase로 충분히 큰 작업이라 별도 문서로 분리. 완료 후 본 문서는 WORKLOG의 해당 phase 본문에 합쳐지거나 archive 가능.

---

## 단계 0 사전 검증 결과 (2026-05-10)

5건 검증 완료. 결과 요약:

| # | 항목 | 결과 |
|---|------|------|
| 1 | jsDelivr `+esm` URL 살아있음 + export 정상 | ✅ `Chess`/`Move`/`validateFen`/`DEFAULT_POSITION` + 기물 상수 export 정상 |
| 2 | `history({verbose:true})` 반환 shape | ✅ 0.10 키(`color/from/to/piece/captured?/promotion?/flags/san`) 보존 + `before`/`after`(FEN)/`lan` 추가. **`comment` 필드 없음** |
| 3 | `setComment` / `getComments` 시그니처 | ⚠️ `setComment(comment: string): void` — **fen 인자 없음**, 현재 위치에만 설정. `getComments(): {fen, comment}[]` |
| 4 | NAG API (`setNag` 등) | ❌ **존재하지 않음** (소스 / README 0건) |
| 5 | 변형(variations) public API | ❌ **존재하지 않음** (`loadPgn` 내부에서 `node.variations[0]` 참조하지만 외부 노출 안 함) |

**plan 축소 결정 (2026-05-10)**:

- 구 단계 5 (NAG export 추가) **삭제** — v1에도 NAG API 없음. PGN 문자열 직접 주입 방식은 0.10 우회와 동일 수준이므로 마이그레이션의 후속 작업 명분 무효
- 구 단계 6 → 새 단계 5 (문서 갱신)으로 번호 재정렬
- 단계 3의 `buildPgnWithNotes` 의사코드 **재작성** — `setComment(text, fen)` 시그니처는 v1에 없음. 별도 chess 인스턴스에서 매수 replay하며 `setComment(text)` (현재 위치) 호출하는 방식
- "변형 트리 export" 후속 작업 명분 **무효** — v1에도 public 변형 API 없음. 본 마이그레이션 ROI는 NAG/변형 export 인프라가 아닌 **코드 단순화 ~60-65줄 + 그림자 상태 제거 + parseAndLoadPgn 폴백 제거**로 축소

검증 메서드: WebFetch로 jsDelivr `+esm` URL 본문 + GitHub `v1.4.0` 태그의 `src/chess.ts` + README 정적 분석. preview server 실 검증은 단계 1부터.

---

## Why (축소된 ROI)

현재 사용 중인 `chess.js@0.10.3` (cdnjs 글로벌 `<script>`, 8년 이상 정체)의 한계로 우회 코드가 누적됨:

| 우회 위치 | 줄 수 | 우회 이유 | v1 해결책 |
|-----------|-------|----------|----------|
| `analysis.js:parseNotesFromPgn` + `SAN_TOKEN_RE` | ~30 | PGN `{...}` 코멘트 API 부재 | `getComments()` |
| `main.js:buildPgnWithNotes` + `SAN_RE` | ~25 | `setComment` API 부재 | tempChess에서 매수 replay하며 `setComment` (단계 3 의사코드 참조) |
| `analysis.js:buildQueueFromPgn` 두 번째 인자 + 호출 사이트의 원본 PGN 캡처 | ~5 | `loadPgn`이 코멘트를 strip해서 chess instance를 단일 진실 소스로 못 씀 | `getComments()`로 직접 조회 |
| `utils.js:parseAndLoadPgn` raw-token 폴백 | ~30 | 0.10 PGN 파서가 일부 chess.com PGN을 거부 | v1 파서가 더 관대함 (단계 4에서 검증) |

**총 제거 가능: 최소 ~60줄 + parseAndLoadPgn 폴백 통과 시 추가 ~30줄 = 최대 ~90줄**

또한 v1 도입 효과:
- **PGN 코멘트 표준 API** (`setComment`/`getComment`/`getComments`/`deleteComments`) — 단, 현재 위치 한정
- **TypeScript 타입 정의** + 활발한 유지보수 (1.4.0 release: 2025-06-14)
- **더 관대한 PGN 파서**

**본 plan 범위 외** (v1.4.0 미지원, 별도 phase 또는 직접 PGN 문자열 조작 필요):
- NAG export — v1에 `setNag` 등 없음
- 변형(variations) export — v1에 public API 없음

ROI: 코드 단순화 + 그림자 상태 제거. user-visible 효과는 0이지만 코드 명료성 + 향후 chess.js 활발한 유지보수 트랙으로 이동.

---

## 핵심 결정

### CDN ESM URL

`<script>` 글로벌 → ES module import로 전환. `package.json` 도입은 CLAUDE.md "프론트엔드 npm 의존성 0" 위반이라 **금지**.

**확정**: `https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm` (단계 0에서 실 fetch 검증 완료)

### 버전 결정

**chess.js 1.4.0** (2025-06-14 release, npm dist-tag `latest`).

**버전 핀**: URL에 `@1.4.0` 명시. `@latest` 미사용 — CDN 캐시 / 갑작스런 메이저 변경 회피.

### 호환성 가드

- `move()`는 잘못된 수에 `null` 반환 — 0.10/v1 동일
- `move()`는 `{from, to, promotion}` 객체 또는 SAN 문자열 모두 받음 — 0.10/v1 동일
- `header()` getter/setter — 동일
- `fen()` / `turn()` / `board()` — 이름 동일
- `history({verbose:true})` 객체에 `before`/`after`(FEN)/`lan` 필드 추가. 기존 키(`color/from/to/piece/captured?/promotion?/flags/san`) 모두 보존 — **분류 로직(`classifyMove`) 영향 없음 예상**, 단계 2에서 baseline 비교로 검증

---

## 메서드 매핑 표

| 0.10.3 (snake_case) | 1.4.0 (camelCase) | 비고 |
|---------------------|-------------------|------|
| `load_pgn(pgn)` | `loadPgn(pgn, opts?)` | opts: `{strict?, newlineChar?}` |
| `in_check()` | `isCheck()` | |
| `in_checkmate()` | `isCheckmate()` | |
| `in_stalemate()` | `isStalemate()` | |
| `in_draw()` | `isDraw()` | |
| `in_threefold_repetition()` | `isThreefoldRepetition()` | |
| `insufficient_material()` | `isInsufficientMaterial()` | |
| `game_over()` | `isGameOver()` | |
| `validate_fen(fen)` | `validateFen(fen)` | top-level export, Chess 메서드 아님 — `import { validateFen }` |
| `set_comment(c)` | `setComment(c)` | **fen 인자 없음**, 현재 위치만 |
| `get_comment()` | `getComment()` | |
| `get_comments()` | `getComments()` | 반환: `{fen, comment}[]` |
| `delete_comment()` | `deleteComment()` 또는 `removeComment()` | alias 양쪽 다 존재 |
| `delete_comments()` | `deleteComments()` 또는 `removeComments()` | alias 양쪽 다 존재 |
| `header(...)` | `header(...)` | 동일 |
| `pgn()` | `pgn()` | 동일 |
| `fen()` | `fen()` | 동일 |
| `turn()` | `turn()` | 동일 |
| `board()` | `board()` | 동일 |
| `move(spec)` | `move(spec, opts?)` | opts: `{strict?: boolean}` |
| `moves(opts)` | `moves(opts)` | 동일 |
| `history(opts)` | `history(opts)` | shape 변경: `{color, from, to, piece, captured?, promotion?, flags, san, lan, before, after}` |
| `undo()` | `undo()` | 동일 |
| `reset()` | `reset()` | 동일 |
| `load(fen)` | `load(fen, opts?)` | opts: `{skipValidation?, preserveHeaders?}` |

`validateFen`은 v1에서 **top-level export 함수** (Chess 인스턴스 메서드 아님). 호출 사이트에서 `chess.validate_fen(f)` → `validateFen(f)`로 변경 + named import 추가.

---

## 변경 파일 인벤토리

| 파일 | new Chess 호출 | 메서드 호출 | 비고 |
|------|----------------|-------------|------|
| [main.js](main.js) | 5건 | `load_pgn` 등 | SPA shell. import 추가 + 메서드 rename. `buildPgnWithNotes` 단계 3에서 재작성 |
| [vault.js](vault.js) | 8건 | `load_pgn`, `in_checkmate` | 풀이 / 시뮬레이션 / 분석 라인 검증 |
| [utils.js](utils.js) | 1건 | `load_pgn`, `validate_fen`, `in_check` 등 | classifyMove 등 분류 로직. **freechess 포팅 — 동작 보존 검증 필수** |
| [analysis.js](analysis.js) | 1건 | `load_pgn` | `buildQueueFromPgn`. originalPgn 두 번째 인자 제거 + `getComments()` |
| [autoBlunders.js](autoBlunders.js) | 2건 | `in_checkmate` | mate 검증 흐름 |
| [board.js](board.js) | 2건 | (생성/리셋만) | export `chess` 인스턴스 + `resetMainGame` |
| [modes.js](modes.js) | 1건 | (생성만) | `explorationChess` |
| [savedGames.js](savedGames.js) | 0건 | `_getChess().pgn()` 간접 | import 추가만 |

**총 ~20개 인스턴스화 + ~14건 메서드 호출**

---

## 단계별 작업 (순서)

각 단계는 **별도 commit**. 단계 끝에서 preview server 회귀 시나리오 검증.

### 단계 1 — `<script>` 제거 + ESM import 패치

1. `index.html`의 `<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>` 제거
2. 8 파일에 import 추가:
   ```js
   import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
   ```
   `validateFen` 사용 사이트(`utils.js`)에는 함께:
   ```js
   import { Chess, validateFen } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
   ```
3. preview server 부팅 — 콘솔 에러 0 확인 (메서드 호출 전이니 `Chess is not defined` 류만 잡혀야 함)
4. 첫 분석 흐름 시도 — snake_case 메서드 부재로 fail 예상. 단계 2로

**baseline 캡처 (단계 1 시작 전)**: bywxx 실 게임 1건 분석 결과 (분류 통계, queue 객체 일부)를 텍스트로 저장. 단계 2/3 후 비교 기준.

### 단계 2 — snake_case → camelCase 일괄 치환

1. 매핑 표 그대로 — Edit 도구의 `replace_all`로 각 메서드 일괄 변경
2. 잔여 snake_case 0 확인 (Grep):
   ```
   load_pgn|in_check|in_checkmate|in_stalemate|in_draw|game_over|in_threefold|insufficient_material|validate_fen|set_comment|get_comment|delete_comment
   ```
3. `validateFen` 호출 사이트 전환: `tempChess.validate_fen(f)` → `validateFen(f)` (top-level 함수). 인스턴스 호출 형태 잔여 검색.
4. preview server에서 4개 메인 흐름 진입 (분석 / vault 풀이 / 라이브 입력 / saved games) — 콘솔 에러 0
5. **회귀 검증**: baseline과 분류 결과 비교. 동일 게임의 classification 통계가 단계 1 baseline과 일치해야 함. 어긋나면 즉시 롤백 + 디버그.

### 단계 3 — PGN 코멘트 우회 코드 제거

**핵심**: v1 `setComment`는 현재 위치에만 동작 → 별도 `tempChess` 인스턴스에서 매수 replay하며 호출.

1. [analysis.js:172-197](analysis.js) `buildQueueFromPgn`:
   - 두 번째 인자 `originalPgn` 제거
   - `parseNotesFromPgn` + `SAN_TOKEN_RE` 삭제 (~30줄)
   - 새 구현:
     ```js
     export function buildQueueFromPgn(chessInstance) {
         const queue = [];
         const tempChess = new Chess();
         const startFen = chessInstance.header().FEN;
         if (startFen) tempChess.load(startFen);

         // v1 코멘트 표준 API: fen → comment 맵
         const commentByFen = new Map();
         for (const { fen, comment } of chessInstance.getComments()) {
             commentByFen.set(fen, comment);
         }

         chessInstance.history({ verbose: true }).forEach((move, index) => {
             tempChess.move(move);
             const fen = tempChess.fen();
             queue.push({
                 fen,
                 san: move.san,
                 from: move.from,
                 to: move.to,
                 promotion: move.promotion || undefined,
                 turn: tempChess.turn() === 'w' ? 'b' : 'w',
                 moveNumber: Math.floor(index / 2) + 1,
                 isWhite: index % 2 === 0,
                 engineLines: [],
                 note: commentByFen.get(fen) || '',
             });
         });
         return queue;
     }
     ```

2. [main.js:847-867](main.js) `buildPgnWithNotes` 재작성:
   ```js
   function buildPgnWithNotes() {
       if (!chess || !analysisQueue || analysisQueue.length === 0) {
           return chess ? chess.pgn() : '';
       }
       // FEN-only 큐(분석 1포지션)는 코멘트 영속 대상 아님
       if (analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly) {
           return chess.pgn();
       }
       const tmp = new Chess();
       const startFen = chess.header().FEN;
       if (startFen) tmp.load(startFen);
       // 헤더 복사 (FEN 포함)
       const headers = chess.header();
       Object.entries(headers).forEach(([k, v]) => tmp.header(k, v));

       analysisQueue.forEach((q) => {
           tmp.move({ from: q.from, to: q.to, promotion: q.promotion });
           const note = (q.note || '').trim();
           if (note) tmp.setComment(note.replace(/[{}]/g, ''));
       });
       return tmp.pgn();
   }
   ```
   `SAN_RE` 토큰 walk + 정규식 (~25줄) 모두 제거. queue 자료구조의 `from/to/promotion`이 이미 v1과 호환되는 spec.

3. [main.js:1174](main.js) `handlePgnReviewStart`의 `buildQueueFromPgn(chess, pgnText)` → `buildQueueFromPgn(chess)`. 호출 사이트의 `pgnText` 캡처 변수도 미사용이면 제거.

4. preview에서 PGN 메모 라운드트립 검증:
   - 메모 입력 → "PGN 복사" 클립보드 → 새 게임 PGN 붙여넣기 → 분석 진입 → 메모 노출
   - saved_games에 메모 포함 게임 저장 → 다시 열기 → 메모 복원

5. 전후 baseline 비교 (queue의 note 필드, 동일 메모 유지 확인)

### 단계 4 — `parseAndLoadPgn` 폴백 제거

1. v1 파서가 chess.com PGN을 잘 처리하는지 검증 — bywxx 실 게임 50건 샘플로 통과율 측정 (preview console에서 batch 호출)
2. v1 통과율 ≥ 0.10 통과율이면: [utils.js](utils.js) `parseAndLoadPgn`의 raw-token 폴백 (~30줄) 제거. v1이 거부하면 `success: false` 반환
3. 통과율이 낮으면 단계 4 보류 — 폴백 유지하고 단계 5로
4. CLAUDE.md "알려진 갭"에서 해당 항목 제거 (단계 4 통과 시)

### 단계 5 — 문서 갱신

1. [CLAUDE.md](CLAUDE.md) "강제되는 invariants"의 "Chessground/Chess.js는 CDN" 항목 — chess.js 1.4.0 (jsDelivr `+esm`) 명시
2. [CLAUDE.md](CLAUDE.md) "알려진 갭"에서 `parseAndLoadPgn 폴백` 항목 제거 (단계 4 통과 시)
3. [NOTICE.md](NOTICE.md) 의 chess.js 버전 표기 갱신 (`0.10.3` → `1.4.0`)
4. [WORKLOG.md](WORKLOG.md) 에 새 phase 본문 추가 — 본 마이그레이션 narrative + 단계 0 결과 + 축소된 ROI
5. 본 `migration-chess-js.md` 파일 archive 또는 삭제

---

## 검증 시나리오 (수동)

테스트 슈트 0이라 preview server에서 직접. 각 단계 후 모두 통과해야 다음 단계.

| # | 시나리오 | 통과 기준 |
|---|---------|----------|
| 1 | bywxx 로그인 후 home → 게임 카드 → 분석 시작 → 완료 | 분석 보고 + 분류 통계 정상 |
| 2 | "첫 수부터 복기" → 좌우 화살표 | 보드 / engine lines / classification 정상 갱신 |
| 3 | 메모 입력 → 다른 수 → 돌아오기 | 메모 보존 |
| 4 | 책갈피 → 저장 → saved_games 다시 열기 → 분석 → 첫 수 | 메모 복원 |
| 5 | "기보" → "PGN 복사" | 클립보드에 `{...}` 코멘트 동반 |
| 6 | 수 입력 모달에 PGN 붙여넣기 (코멘트 포함) | 분석 진입 후 메모 노출 |
| 7 | vault 풀이 (블런더 / 메이트 둘 다) | mate 검증 (`isCheckmate`) 정상 |
| 8 | autoBlunders — 분석 직후 자동 수집 | vault에 row 추가 |
| 9 | 라이브 입력 모드 — 보드에 수 입력 + 시뮬레이션 | undo / reset / paste 모두 동작 |
| 10 | 외부 PGN 50건 (실 chess.com 게임) parseAndLoadPgn 통과율 | v1 통과율이 0.10 이상이어야 함 (회귀 0) |
| 11 | classifyMove 결과 비교 (마이그레이션 전후 같은 게임) | classification 통계 동일 |

---

## 롤백 전략

각 단계가 별도 commit이라 git revert로 단계 단위 롤백 가능. 가장 위험한 단계는 **2 (snake_case 일괄 치환)** 와 **4 (parseAndLoadPgn 폴백 제거)**.

단계 2 후 `classifyMove` 결과가 마이그레이션 전후 다르면 — **분류 알고리즘이 깨진 것이라 즉시 롤백 + 디버그**. freechess 포팅 코드라 외부 알고리즘 의존성이 있어 복구 어려움. **변경 전 상태에서 1게임 분류 결과 baseline 미리 캡처 필수** (단계 1 시작 전).

---

## 참고

- chess.js v1 GitHub: <https://github.com/jhlywa/chess.js>
- v1.4.0 release: 2025-06-14
- 단계 0 검증 일자: 2026-05-10 (본 plan 재작성과 동시)
- 검증 메서드: WebFetch (정적) — jsDelivr `+esm` URL 본문 + GitHub `v1.4.0` 태그 `src/chess.ts` + README
