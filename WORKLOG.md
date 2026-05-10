# Blundermate 작업 내역

모바일 우선 체스 게임 리뷰 웹앱. Chess.com / PGN으로 게임을 불러와 Stockfish 분석 + Gemini 한국어 해설을 제공.

스택: Pure ES6 modules (빌드 없음) · Vercel Edge Functions · Supabase · Stockfish WASM · Chessground · Chess.js

---

## Phase 51 — NAG export (2026-05-10)

분류 결과를 PGN 표준 NAG(`$N` 글리프)로 export. chess.com / lichess analysis에 import 시 `??`/`?`/`!!` 자동 표시 → 외부 도구와 round-trip 호환.

### 매핑 (utils.js NAG_BY_CLASS)

| 분류 | NAG | 글리프 |
|------|-----|--------|
| Brilliant | `$3` | `!!` |
| Great | `$1` | `!` |
| Inaccuracy | `$6` | `?!` |
| Mistake | `$2` | `?` |
| Blunder / missed_mate | `$4` | `??` |
| Best / Excellent / Good / Forced | (null) | (마크 안 함) |

표준 1~6만 사용 — chess.com / lichess / ChessBase 등 모든 주요 도구가 인식.

### 우회 구현

chess.js v1.4.0에 `setNag` API 부재 (Phase 50 단계 0 검증). `tmp.pgn()` 출력 후 SAN 토큰 walk + `$N` 직접 주입:

```js
// utils.js
export function injectNags(pgn, queue) {
    // SAN 직후 위치에 nagForClassification(queue[i].classification) 주입
}
```

[main.js](main.js) `buildPgnWithNotes` 끝에서 `return injectNags(tmp.pgn(), analysisQueue)`.

### 한계

- chess.js v1의 `loadPgn`이 NAG silently strip — 본 프로젝트 안 round-trip 안 됨 (사용자가 우리 PGN을 다시 우리 도구에 붙여넣으면 분류 사라짐). 단 분석 캐시가 별도라 큰 문제 아님
- chess.com / lichess는 표준 NAG 인식 → 외부 round-trip OK

### 검증

5수 mock queue + 코멘트 동거: PGN 출력에 `$3`/`$2`/`$4` 정확 위치 + 코멘트 보존 확인. Best/Excellent/Forced는 null 반환으로 SAN만 출력.

### 향후

chess.js 1.5+에서 `setNag` 도입 시 우회 제거 가능. 현재 `injectNags`는 `buildPgnWithNotes` 끝의 단일 호출이라 교체 비용 작음.

---

## Phase 50 — chess.js 0.10.3 → 1.4.0 ESM 마이그레이션 (2026-05-10)

8년 정체된 chess.js 0.10.3 글로벌 `<script>`를 1.4.0 ES module로 교체. 누적 ~43줄 net 감소 + PGN 코멘트 우회 / 그림자 상태 / parseAndLoadPgn 폴백 제거. user-visible 효과 0, 코드 명료성 + 향후 chess.js 활발한 유지보수 트랙 합류가 ROI.

### 단계 0 사전 검증으로 plan 축소

원 plan은 NAG export + 변형(variations) export 후속 작업의 사전 단계로 마이그레이션을 정당화했으나, 1.4.0 소스 정적 검증 결과:

- ❌ NAG API 부재 (`setNag` 등 없음, README 0건)
- ❌ public 변형 API 부재 (`loadPgn` 내부에서만 `node.variations[0]` 참조)
- ⚠️ `setComment(text, fen)` 시그니처 가정도 틀림 — v1은 `setComment(text)` (현재 위치 한정)

→ NAG / 변형 export 명분 무효, plan 축소 후 진행. 잔여 ROI: 코드 단순화 + 그림자 상태 + parseAndLoadPgn 폴백 제거.

검증 메서드: WebFetch (정적) — jsDelivr `+esm` URL 본문 + GitHub `v1.4.0` 태그 `src/chess.ts` + README. preview server 실 검증은 단계 1부터.

### 단계별 narrative

| 단계 | commit | net 변화 | 핵심 |
|------|--------|----------|------|
| 1 | `3475b33` | +22 / -14 | `<script>` 제거 + 9 파일에 ESM import + window.Chess→Chess 교체 |
| 2 | `93db22f` | +28 / -23 | snake_case→camelCase + safeLoad helper(13 사이트 try/catch wrap) + validateFen top-level |
| 3 | `e67ec93` | +31 / -62 | parseNotesFromPgn/SAN_TOKEN_RE 삭제, buildQueueFromPgn 단일 인자, getComments fen맵 사용 |
| 4 | `fd0c414` | +1 / -26 | parseAndLoadPgn raw-token 폴백 삭제 (50건 chess.com PGN 100% 통과 확인 후) |
| 5 | (이 commit) | docs only | CLAUDE.md / NOTICE.md / WORKLOG / migration-chess-js.md 정리 |

**누적**: ~43줄 net 감소.

### 핵심 호환성 처리

**v1 의미론 변화 (0.10 → 1.4.0)**:
- `loadPgn` / `load`: boolean 반환 → void + invalid input 시 throw
- `validateFen`: Chess 인스턴스 메서드 → top-level export 함수
- `validateFen` 반환: `{ valid }` → `{ ok }`
- `setComment`: 0.10/v1 모두 현재 위치 한정 — 매수 navigate 후 호출 패턴. 0.10에선 우회로 PGN 문자열 직접 조작하던 코드를 v1에선 표준 API로 교체
- `history({verbose:true})`: 기존 키(`color/from/to/piece/captured?/promotion?/flags/san`) 보존 + `before`/`after`(FEN) / `lan` 추가

**`safeLoad` helper ([utils.js](utils.js))** — v1의 throw 패턴을 0.10의 boolean 반환 의미로 wrap:

```js
function safeLoad(c, fen) {
    try { c.load(fen); return true; } catch { return false; }
}
```

13 사이트(getAttackers/getDefenders/isPieceHanging/classifyMove/convertPvToSan)에서 사용. `if (!c.load(fen)) return ...` 패턴 → `if (!safeLoad(c, fen)) return ...`.

**`buildQueueFromPgn` 그림자 상태 제거 ([analysis.js](analysis.js))** — chess instance가 단일 진실 소스. `originalPgn` 두 번째 인자 제거 + `getComments()` → `Map<fen, comment>` 변환 후 queue.fen 매칭으로 note 채움.

**`buildPgnWithNotes` 표준 API 전환 ([main.js](main.js))** — `SAN_RE` 토큰 walk(~25줄) 제거. tempChess에서 매수 replay하며 `setComment(note)` 호출. 헤더는 명시적 복사.

### 검증

- **단계 0**: jsDelivr `+esm` URL fetch + GitHub `v1.4.0` 태그 정적 분석
- **단계 1-4 spot-check**: preview eval로 핵심 함수 호출 — parseAndLoadPgn / buildQueueFromPgn / isValidFen / countMovesFromPgn / getAttackers / getDefenders / classifyMove 의존 헬퍼 모두 정상
- **단계 3 round-trip**: 메모 입력 → setComment → pgn() → loadPgn → getComments — 코멘트 보존 + 수정한 메모 round-trip 동작
- **단계 4 통과율**: bywxx의 chess.com 최근 50건 PGN으로 v1 직접 호출 통과율 — **50/50 (100%)**, garbage 입력은 `success:false`로 정상 거부

### baseline 비교 결정

원 plan은 단계 1 시작 전 분석 1게임 baseline 캡처 + 단계 2 후 비교를 명시. 그러나 사용자와의 논의로 baseline 검증을 light 수준으로 축소:

> classifyMove는 Stockfish 평가(chess.js 무관)와 chess.js 보드 헬퍼(`get`/`board`/`turn`/`isCheck`/`isCheckmate`)에 의존. 보드 헬퍼는 체스 규칙 표준이라 0.10/v1 의미 변화 없음. 따라서 회귀 가능성 거의 0.

→ strict baseline 캡처 스킵. spot-check + round-trip + chess.com PGN 통과율 100%로 충분히 검증.

### 본 phase에서 보류한 트랙

- **NAG / 변형 export** — v1 1.4.0에 미지원. PGN 문자열 직접 조작이 필요. 별 phase 또는 후속 chess.js 버전(1.5+)에서 검토
- **parseAndLoadPgn 폴백 제거의 lichess 검증** — bywxx는 chess.com 단독 사용자라 lichess PGN 통과율은 미검증. lichess 사용자가 추가되면 재평가

### 문서 정리

- [CLAUDE.md](CLAUDE.md) "강제되는 invariants" — chess.js는 jsDelivr ESM 1.4.0 명시
- [CLAUDE.md](CLAUDE.md) "알려진 갭" — `parseAndLoadPgn 폴백` 항목 제거
- [NOTICE.md](NOTICE.md) — chess.js 사용 위치를 cdnjs 0.10.3 → jsDelivr 1.4.0 ESM로 갱신
- `migration-chess-js.md` 삭제 — narrative는 본 phase로 흡수

---

## Phase 49 — Vault + Saved Games 디자인 시스템 정렬 (2026-05-09)

Apple HIG / Notion / Lichess / chess.com 4개 시스템을 병렬 리서치 → 합성 → vault + saved-games 화면을 "premium calm" 톤으로 정렬. 카드 패턴, empty state, 분류 chip, 필터 탭, 터치 타겟을 통합. 기능 신규 0, 시각·UX 개선만. 8 파일 변경.

### 톱-레벨 합성 결정

| 결정 | 채택 출처 | 거부 출처 |
|------|----------|----------|
| 3-tier 타이포 (15/14/12) | Notion 3-weight + Apple iOS 17/15/13 (모바일 9:16에 맞춰 한 단계 축소) | chess.com 1.6× 숫자 hero |
| Inset grouped 리스트 (단일 컨테이너 + hairline 디바이더) | Apple HIG (Mail/Notes 표준) | 카드별 shadow + accent strip (chess.com 결) |
| Press = invisible row + gray fill, no scale | Notion + Apple | chess.com scale 0.97 |
| 필터 = text+underline 단일 패턴 | Notion + Lichess single-axis | chess.com pill 가득 |
| Move classification glyph chip (??/?/?!/M3) | chess.com + lichess 공통 표준 | 신규 글리프 발명 |
| Empty state = icon 80px + 헤드라인 + body + CTA | Apple HIG + chess.com | Notion 평문 / Lichess 1-line |
| 터치 타겟 ≥ 44px | Apple HIG 강제 | — |

### 1) 디자인 토큰 ([styles/tokens.css](styles/tokens.css))

새 토큰 8개 추가 — typography scale + press affordance + inset grouped 치수.

```css
--fs-title:15px --fs-body:14px --fs-meta:12px --fw-title:600 --fw-body:400
--press-fill:rgba(28,29,31,0.05) --press-fill-active:rgba(28,29,31,0.08)
--list-container-radius:14px --list-divider:rgba(28,29,31,0.06)
--list-row-pad-x:16px --list-row-pad-y:12px
--list-row-min-h:60px (standard) / 76px (spacious) / 44px (compact)
```

### 2) Empty state 통합 helper ([ui.js](ui.js))

`renderEmptyState(container, { icon, title, desc, ctaLabel?, onCta? })` 신규. SVG icon dictionary (`bookmark` / `puzzle` / `inbox`) 내장.

이전: 3종 분산 — `.empty-state` (italic 1-line) / `.vault-puzzle-empty` (평문) / `.saved-games-empty` (icon+title+desc 풀스택).
이후: 모두 `.empty-state-v2` 마크업으로 통합 — 80px outline icon + 헤드라인(15px/600) + body(13px/tx2) + 선택적 CTA (44px / `var(--ac)` / 잉크블루).

### 3) Move classification chip ([ui.js](ui.js))

`classificationChipHtml(rawCategory, { mateIn })` — chess.com·lichess 표준 글리프(??/?/?!/!/!!/✓/M{n})를 인라인 chip으로. tokens.css의 분류 색을 12% alpha 배경 + 풀 채도 텍스트로 매핑.

`vault-cat-chip`(2개 modifier)을 `.cls-chip`(4 modifier: blunder/mistake/inaccuracy/best)로 통합. `vault.js`의 `renderSolvableItem` header도 같은 helper 사용 — vault 카드와 puzzle header가 동일한 chip 시각.

### 4) Inset grouped list ([styles.css](styles.css) 끝부분 신규 + 1493+/2641+/3042+ 정리)

신규 클래스: `.list-group` / `.list-row` / `.list-row-body` / `.list-row-title` / `.list-row-notes` / `.list-row-meta` / `.list-row-action` / `.list-row-chevron`.

`.list-group` 단일 컨테이너에 `.list-row` 들이 hairline divider(rgba(28,29,31,0.06))로 분리. per-card shadow + 좌측 4색 accent strip 패턴 제거. `.list-row:hover`는 `--press-fill` (rgba 5%), `:active`는 `--press-fill-active` (rgba 8%) — Notion gray-fill 패턴. transform: scale 사용 안 함.

대체된 legacy:
- `.vault-card` + `.vault-card-info/top/moves/arrow/cat/meta/notes` (3042-3110) → `.list-row.vault-row`
- `.saved-game-card` + `::before` accent strip + `.saved-game-card-title/notes/actions` + `.edit-btn` (1493-1558) → `.list-row.saved-game-row`
- `.saved-games-empty*` (1574-1608) → `.empty-state-v2`
- `.vault-puzzle-empty-text` → `.empty-state-v2` (HTML 정적 마크업도 [index.html:300-303](index.html) 정리)
- `.vault-card--legacy` → `.list-row--legacy`

### 5) Saved Games 카드 마크업 변경 ([savedGames.js](savedGames.js))

`buildCard`:
- 외곽: `<div class="saved-game-card">` → `<div class="list-row saved-game-row" role="button" tabindex="0">` (nested button 위반 회피 — 내부에 `<button class="list-row-action">` 가 있으므로 outer는 div + ARIA)
- 본문: 제목(15/600) + notes(14/regular tx2 — italic 제거) + meta line ("내 실전 게임 · 어제" 식 middot — Lichess 패턴)
- 항상 보이던 edit pencil → trailing **⋯ ellipsis** (HIG 결, edit modal 진입은 동일)
- trailing **›** chevron (Apple push-to-detail 시그널)

`renderSavedGamesList`:
- 컨테이너 wrapping: rows를 `<div class="list-group">`에 한 번 감싸 inset grouped 시각 부여
- empty state: 정적 HTML → `renderEmptyState` helper 호출 (icon: bookmark + CTA: "게임 분석하기" → `onEmptyCta` 콜백)
- 날짜는 `formatRelativeDate` (utils.js, 이미 home.js에서 사용중) 재사용

`initSavedGames`에 `onEmptyCta` 옵션 추가 — main.js가 `() => navigateTo('home')` 주입.

### 6) Vault 카드 + puzzle header ([vault.js](vault.js))

`renderVaultList`:
- 좌측 색 accent strip(`--vault-card-accent`) 제거
- 메인 라인: SAN + classification chip + → bestMove (chess.com 결: 잘못 둔 수 vs 정답수)
- meta: `gameTitle · 23수` (Lichess middot)
- empty state: helper 호출 (icon: puzzle + emptyDesc + CTA)
- legacy 카드 (`source !== 'auto' && !pgn`) → `list-row--legacy` opacity 0.55 보존
- `categoryVisual` (label + color 객체 반환) → `categoryColor` + `categoryLabel` 두 함수로 분리. detail view의 `vaultInfoCategory` 색 라벨 보존을 위해 유지.

`renderSolvableItem`:
- `<span class="vault-cat-chip ${chipCls}">` 마크업 → `classificationChipHtml(chipCategory, { mateIn })` — vault 카드와 동일한 chip 컴포넌트.

`initVault`에 `onEmptyCta` 옵션 추가.

### 7) 필터 탭 44px 보강 ([styles.css](styles.css))

3개 분산 패턴 중 list-view 1차 필터를 44px로 통일:
- `.vault-filter-tab` (28px → 44px min-height) — vault list 보조 뷰
- `.pill-filter-bar--scope .pill-btn` (auto / line-height 20px → 44px min-height + line-height 22) — saved games 5탭
- 본문 폰트 13px → `var(--fs-body)` (14px)
- 새 통합 클래스 `.text-tab-row` / `.text-tab` (신규 컴포넌트로 정의 — 추후 컴포넌트 마이그레이션 시 사용)

iOS segmented pill (`.vault-filter-tabs--inline` 32px, `.pill-filter-bar--insights .pill-btn` 26px)은 다른 컨트롤 type이라 그대로 유지 — Apple 자체가 segmented control은 ~32pt 허용.

### 8) i18n 키 ([strings.js](strings.js))

신규 KO+EN 7쌍:
- `vault_blunder_list_empty_desc`, `vault_puzzle_empty_desc`, `vault_empty_cta` (vault empty 구조화)
- `saved_games_empty_cta` (saved empty CTA)
- `cls_chip_blunder/mistake/inaccuracy/missed_mate/best` (chip aria-label용)

기존 `vault_puzzle_empty` 카피는 "분석을 돌리면 자동으로 모여요" → "아직 풀어볼 퍼즐이 없어요" (헤드라인 → 별도 desc로 분리).

### 비-목표 (의도적 보류)

- 다크 모드 — 토큰 체계는 사용하지만 dark 팔레트 미정.
- Insights / Home / 분석 화면 시각 — 본 phase 범위 외 (별 phase).
- 빈 상태 SVG 일러스트 외주 — 본 phase는 80px outline icon으로 마무리. 디자이너 시안 들어오면 교체.
- Vault detail view의 색 라벨 (`vaultInfoCategory`) — chess 도메인 의미 유지.

### 검증

수동 — preview server (vercel dev :3000) 4개 화면 직접 확인:

| 화면 | 결과 |
|------|------|
| 홈 | 변경 없음 (회귀 0) |
| Vault 빈 상태 | 80px puzzle icon + 헤드라인 + desc + 잉크블루 CTA — Apple HIG 패턴 정확 |
| Vault 리스트 보조 뷰 | 4개 글리프 chip(??/?/?!/M3) + inset grouped + middot meta — 4개 시스템 합성 확인 |
| Saved 빈 상태 | 80px bookmark icon + 헤드라인 + desc + CTA — vault과 동일 톤 |
| Saved 데이터 상태 | inset grouped + 좌측 strip 제거 + ⋯ + › 트레일링 — Apple Mail 결 |
| 필터 탭 터치 | preview_inspect 결과 — pill-filter-bar--scope: min-height 44px ✓ / vault-filter-tab: 44px ✓ |
| chip 색 | rgba(208,56,50,0.12) bg + var(--blunder) color — IBM Plex Mono 11px ✓ |
| 콘솔 | 에러 0 |

테스트 슈트 부재(CLAUDE.md "알려진 갭")로 자동 검증 없음 — preview server 시각 확인 + DOM inspect로 토큰 적용 검증.

### 영향받은 파일 (8 files)

| 파일 | 변경 |
|------|------|
| [styles/tokens.css](styles/tokens.css) | +20 (Phase 49 토큰 8개) |
| [ui.js](ui.js) | +60 (renderEmptyState + classificationChipHtml + 3 SVG icon) |
| [styles.css](styles.css) | +200 신규 / -180 legacy 정리 (.list-* / .cls-chip / .text-tab / .empty-state-v2 추가, .vault-card / .saved-game-card / .saved-games-empty / .vault-cat-chip 등 제거) |
| [strings.js](strings.js) | +14 (KO+EN 7쌍) |
| [savedGames.js](savedGames.js) | buildCard 마크업 + renderSavedGamesList 컨테이너 + renderEmptyState 호출 + initSavedGames signature |
| [vault.js](vault.js) | renderVaultList 마크업 + classificationChipHtml 통합 + categoryVisual 분리 + showPuzzleEmpty + initVault signature |
| [main.js](main.js) | initVault / initSavedGames에 `onEmptyCta: () => navigateTo('home')` 주입 |
| [index.html](index.html) | `#vaultPuzzleEmpty` 정적 마크업 정리 (renderEmptyState가 동적 렌더) |

---

## Phase 48 — 코드 건강 점검: 버그/보안 sweep + simplify (2026-05-09)

27개 .js 파일 / ~13k 라인 전수 점검(6 병렬 에이전트 → 약 100건 발견). 우선순위 critical/security만 픽스 후 simplify 패스(3 병렬 에이전트)로 헬퍼 추출 + 데드 코드 정리. 16 파일 / +220 -123. 기능 신규 0, 신뢰성 개선만.

### 1) Engine pool 워커 수명주기 ([engine.js](engine.js))

이전: `worker.onerror` 후 `_idle.push(engine)`이 죽은 워커를 풀에 다시 넣음 → 그 워커가 다시 dispatch되면 `if (this._failed) resolve({ lines: nulls })`로 즉시 null 반환 → 분석 결과 silently 깨짐. 사용자는 "빈 라인" 이상 진단 불가.

이후:
- `_dispatch()` 진입 시 `_idle = _idle.filter(e => !e._failed)`로 영구 제외
- 모든 워커 실패 시 task queue를 즉시 reject (이전엔 hang)
- 실패 워커는 `_retireFailed()` 헬퍼로 `engine.terminate()` + `this.engines.splice()` 같이 정리 (Web Worker 스레드 leak 방지)
- `EnginePool.ready()`는 `Promise.all` → `Promise.allSettled` — 일부 워커 실패해도 살아남은 워커가 있으면 진행. 전부 실패 시에만 reject
- 부산물: `_pool.ready()`가 한 번 reject되면 캐시된 rejected promise가 재사용돼 모든 후속 `runBatch`가 즉시 실패하던 경로도 부분 실패 시점부터 막힘

### 2) Storage 격리 / race 4건 ([storage.js](storage.js))

- **Platform snapshot at callDB entry**: `_doCallDB` 내부에서 `getMyPlatform()`을 read하던 걸 `callDB` 진입 시점 스냅샷으로 이동. fetch 도중 `setMyPlatform`이 호출돼도 in-flight 호출의 platform 태깅이 바뀌지 않음.
- **Breaker reset race**: 성공 응답이 동시 5xx의 trip을 무력화하던 race. `startedAt = Date.now()`를 캡처하고 `if (_dbBreakerUntil <= startedAt)`일 때만 reset → "내 호출이 시작되기 전에 trip된 cooldown만 reset, 내 호출 진행 중 다른 호출이 trip시킨 건 보존".
- **Cross-platform leak in `getAnalyzedGameById`**: 로컬 캐시 lookup이 platform 필터 없이 `id`만으로 검색 → chesscom row가 lichess 게임으로 반환 가능. `(id, platform)` 쌍으로 매칭.
- **`updateSavedGame` Supabase sync 누락**: 노트/타이틀 편집이 로컬에만 남고 Supabase 동기화 안 됨 (다른 디바이스 보존 안 됨). callDB('update', 'saved_games', ...) 추가 + 로컬 update에도 platform 격리 가드.

CLAUDE.md "(user_id, platform) 페어 격리"가 4 경로에서 모두 어긋나 있던 거 일괄 픽스.

### 3) Gemini 모듈 안정성 ([gemini.js](gemini.js))

- **모듈 로드 시 throw**: 최상단의 `let _isGeminiEnabled = localStorage.getItem(GEMINI_KEY) !== 'false'`가 Safari private mode에서 throw → 전체 모듈 import 실패 → 분석 화면 백지. `lsGet` 헬퍼로 교체.
- **Reflected XSS**: `error.message`를 `escapeHtml` 없이 `innerHTML`로 박던 거 → escape 추가. proxy가 헤더 echo하거나 fetch URL을 에러 메시지에 넣으면 트리거 가능.
- **Reader leak**: SSE 스트리밍 루프가 throw할 때 `reader.releaseLock()` 호출 안 됨 → ReadableStream 핸들 leak. `try/finally`로 감쌈.

### 4) Vault 풀이 race + stuck ([vault.js](vault.js))

- **`handleMateMove` _replayGen 가드 누락**: `await analyzeForMate()` 도중 사용자가 "다음 퍼즐"로 넘어가면 stale 응수가 새 보드에 박힘. 엔진 호출 전 `const gen = _replayGen` 캡처 → 복귀 시 `if (gen !== _replayGen) return`으로 차단. 블런더 path에는 이미 가드 있었음.
- **null-cat 카드 자동 skip**: `categorize(item) === null` (legacy 'positional' 등)일 때 `showPuzzleEmpty(true)`만 하고 멈춤 → 사용자 stuck. `removeItemEverywhere(item.id) + loadNextPuzzle()`로 자동 진행.
- **COORDS_KEY 누락 픽스**: vault.js의 두 사이트(`openVaultItem`, `renderSolvableItem`)가 직접 `localStorage.getItem(COORDS_KEY)`로 읽고 있어 try/catch 부재. `getIsCoordsEnabled()` accessor로 통합.

### 5) localStorage 헬퍼 추출 ([storage.js](storage.js))

13곳 inline `try { localStorage... } catch (_) {}` 보일러플레이트 → `lsGet/lsSet` 두 함수로 통합:

```js
export function lsGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (_) { return fallback; }
}
export function lsSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { return false; }
}
```

부수 효과:
- `getMyUserId/setMyUserId/getMyPlatform/setMyPlatform`이 4 one-liner로 압축
- `getIsCoordsEnabled/setIsCoordsEnabled` accessor 추가 (gemini의 getIsGeminiEnabled 패턴과 대칭) — main.js + settings.js + vault.js 4 사이트 통합
- analysis.js / gemini.js / home.js / ui.js / settings.js / strings.js / main.js 전부 `lsGet/lsSet` import

### 6) 기타 픽스 / 정리

- **`homeProfileRatings` ReferenceError** ([main.js:427](main.js:427)): main.js가 home.js의 module-level `let`을 직접 참조 → 클릭 시 `ReferenceError`. `export let`으로 변환 (board.js / modes.js 패턴 일관) → main.js는 live binding으로 import.
- **escapeHtml(0) 버그** ([utils.js:541](utils.js:541)): `if (!unsafe) return ''`가 0/false/empty도 빈 문자열 반환. `null/undefined` 명시 체크로 수정 → 64개 호출 사이트에 자동 propagate.
- **formatRelativeDate locale** ([utils.js:783](utils.js:783)): `'ko-KR'` 하드코드 → `getLocale()` 기반 `en-US`/`ko-KR` 분기.
- **Insights i18n 우회 3건** ([insights.js](insights.js)): `renderTimeOfDayCard/DayOfWeekCard/OpponentDiffCard`의 한국어 하드코드 labelMap → 신규 short i18n 키 16개 (KO+EN). EN UI에서 한국어 노출되던 거 차단.
- **`api/db.js` update saved_games 화이트리스트**: 기존 analyzed_games 전용 → 테이블별 schema(`UPDATE_SCHEMA`) 분기로 saved_games(title/notes/category) 추가. 임의 컬럼 변경 차단 유지.
- **OS prompt 제거** ([main.js:899](main.js:899)): `navigator.clipboard.writeText.catch(() => prompt('PGN', pgn))` → `showToast(t('feedback_error_network'))`. CLAUDE.md "OS alert/confirm 대체" 위반 정리.
- **XSS escape 4곳 추가** ([ui.js](ui.js)): `move.san`, `line.uci`, `line.scoreStr`, `line.pv` 모두 escapeHtml 적용. 현재는 chess.js/Stockfish 출력이라 안전 범위지만 defense-in-depth.
- **Dead code**: `_hasUsableEngine()` (호출 0), `currentEval` 변수, `analysisLoadingText/Card` ref, `getMyUserId` import, `// parseAndLoadPgn moved to utils.js` 코멘트.
- **Dead i18n 키 7개** ([strings.js](strings.js)): `vault_count`, `vault_delete_title`, `saved_games_count`, `saved_games_empty`, `home_settings`, `aria_search`, `savedGames` (KO+EN 양쪽). grep으로 사용처 0건 검증.
- **Phase 46 narrative 코멘트**: vault.js 2곳, savedGames.js 3곳, main.js 4곳 정리. CLAUDE.md "Phase narrative 강제 제거" 적용.
- **init guard 비대칭**: `dialogs.js`, `savedGames.js`에 `_initialized` 가드 추가 (settings.js와 일치).
- **'chesscom' 리터럴 8곳 → `PLATFORM_CHESSCOM`** ([storage.js](storage.js)).
- **`platform` typo** → `platform` ([home.js](home.js)).

### 7) Simplify 패스 (3-agent 리뷰 → 핵심만 적용)

- **`lsGet/lsSet` 추출** (위 5번)
- **`getIsCoordsEnabled` accessor** (4 사이트 통합)
- **`homeProfileRatings` getter 제거** → `export let` (codebase 컨벤션)
- **dead `_hasUsableEngine`** 메서드 삭제
- **gemini reader.releaseLock 중복 try/catch** 제거 (외부 try/finally가 이미 감쌈)
- **insights.js shortLabelMap pattern**은 유지 — 3 사이트 추출 시 헬퍼 비용이 더 큼 (마이크로 최적화 스킵)

### 의도적 스킵 (인프라/의존성 결정 필요)

- **API rate limiting** — 4 엔드포인트(analyze/db/feedback/log-username)가 rate limit 0. Vercel KV 또는 외부 서비스 필요 → 인프라 결정.
- **CORS Origin allowlist** — dev 환경 깨질 위험. 운영 도메인 결정 필요.
- **Gemini 본문 sanitization** — `marked`가 raw HTML escape 안 함. DOMPurify 의존성 필요한데 "no npm" 제약과 충돌 → 별도 결정 필요.
- **`EnginePool.destroy()` 와이어링** — `initAnalysis`는 한 번만 호출되는 사이트 → 회귀 가능성 vs 변경 비용 trade-off로 보류.
- **utils.js `parseAndLoadPgn` 폴백 헤더 처리** — chess.js가 거부한 PGN을 raw token으로 재시도하는데 헤더 첫 토큰에서 break. 정상 PGN은 chess.js가 전부 처리하니 실 영향 미미 → 기능 추가 형태로 별도 phase.

### 검증

| 항목 | 결과 |
|---|---|
| 모듈 로드 에러 (전체 화면 진입) | 0 |
| 콘솔 에러 (홈/복기/저장/통계/설정/About) | 0 |
| 분석 파이프라인 (5수 PGN) | 분류 + eval + 정확도 정상 |
| Settings 페이지 진입 | tc=rapid, coords/gemini=on 정상 표시 |
| EnginePool ready/dispatch | 실패 워커 격리 + retire 정상 |

### 라인 변화 (Phase 48만)

| 파일 | 변경 |
|---|---|
| [storage.js](storage.js) | +73 −19 (lsGet/lsSet/getIsCoordsEnabled + platform race 3 + updateSavedGame sync) |
| [strings.js](strings.js) | +35 −17 (insights short i18n 16개 + dead 키 7개 제거 + lsGet 사용) |
| [engine.js](engine.js) | +27 −4 (worker retire + ready allSettled + dispatch 격리) |
| [main.js](main.js) | +14 −31 (dead refs/imports/var 정리 + lsGet 통합 + OS prompt 제거) |
| [api/db.js](api/db.js) | +20 −11 (UPDATE_SCHEMA 추가) |
| [vault.js](vault.js) | +12 −7 (mate replay 가드 + null-cat skip + COORDS 헬퍼) |
| [home.js](home.js) | +10 −5 (export let homeProfileRatings + lsGet/lsSet + platform 롤백) |
| [gemini.js](gemini.js) | +14 −10 (lsGet/escapeHtml/reader try-finally) |
| [ui.js](ui.js) | +7 −7 (escapeHtml 4곳 + lsGet) |
| [settings.js](settings.js) | +4 −4 (lsGet + accessor) |
| [insights.js](insights.js) | +3 −9 (i18n short 키 변환) |
| [savedGames.js](savedGames.js) | +3 −4 (init guard + dead 코멘트) |
| [utils.js](utils.js) | +5 −4 (escapeHtml falsy + locale) |
| [analysis.js](analysis.js) | +3 −2 (lsGet/lsSet) |
| [autoBlunders.js](autoBlunders.js) | +4 −1 (dedup error 로그) |
| [dialogs.js](dialogs.js) | +3 (init guard) |

순 효과: +220 −123 = +97 라인. 보일러플레이트 제거(−)보다 race/leak 가드 추가(+)가 약간 더 큼. 신규 기능 0, 신뢰성 5건(워커 leak / breaker race / cross-platform leak / mate replay race / module load throw) + XSS 차단 1 + 보안 hardening 다수.

### 남은 갭 (계속 미해결 — 별 트랙)

- **테스트 슈트 부재** — 동시성/오류 경로 검증은 여전히 수동 + preview server. callDB pilot/breaker race, mate replay race 같은 건 production 모니터링으로만 잡힘.
- **DOMPurify** — Gemini 본문 sanitization. prompt injection으로 `<script>` 흘릴 위험 이론적 잔존.
- **Rate limiting** — 인프라 결정.
- **다크 모드** — 0 진행.
- **빈 상태 일러스트** — 디자이너 외주 영역.

---

## Phase 47 — PC 비율 / vault 화면 전반 재디자인 / 분석 결 eval 표시 / 한 수 풀이 (2026-05-09)

vault 화면 전반을 한 세션에 재구성. PC 모드 비율 보정 → top bar segmented pill → 화면 4요소 위계 재정비(progress bar / category chip / board flash / action bar) → 분석 화면 결의 단일 eval display → 한 수 풀이로 정답 판정 단순화. 동시에 vault/saved 진입 시 supabase fetch 동안 빈 화면(naked) 가림용 로딩 오버레이 추가.

### 1) PC 모니터 비율 9:16 (tokens.css)

이전 `.app-container { max-width: 420px }` 고정으로 세로 긴 PC 모니터(1080+)에서 컨테이너가 홀쭉. height-driven 폭 계산으로 변경:
```css
.app-container { width: min(100vw, calc(100dvh * 9 / 16)); }
```
- 1080p → 컨테이너 폭 ~607px (vs 420)
- 1440p → ~810px
- aspect-ratio 대신 calc 명시 — 자식 min-content 가 폭을 밀어내던 케이스 회피
- 모바일(<480px) breakpoint는 그대로 100% 폭

### 2) vault top bar — segmented pill + 우측 ☰ ([styles.css](styles.css))

3탭(블런더/메이트/기타) 좌측 정렬 underline 탭 + 정중앙 어정쩡한 ☰ → **iOS HIG segmented control pill** + 정중앙 정렬 + ☰ 우측 끝.

- `.vault-filter-tabs--inline`을 둥근 컨테이너 (radius 9px, --bg-elevated 배경)로 재정의
- 선택된 segment: 흰 배경 + subtle shadow + font 600
- `1fr auto 1fr` 그리드에서 segmented는 `grid-column: 2 / justify-self: center`, ☰는 `grid-column: 3 / justify-self: end`
- 보조 list 뷰의 `.vault-filter-tabs`(--inline 미적용)는 underline 스타일 보존

레퍼런스: [Apple HIG Segmented Controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls), [iOS 26 tab bar accessory](https://designfornative.com/ui-changes-in-ios-26-thats-not-about-liquid-glass/) (search 액세서리 우측 분리 트렌드).

### 3) vault 화면 전체 재구성 ([vault.js](vault.js), [styles.css](styles.css))

- **Progress bar (Duolingo 결)**: indicator 12 segment dots → 단일 fill bar + `1/12` 카운트. `.puzzle-progress` + `.puzzle-progress-fill` (--ac 잉크블루 채움). 풀이 진행 시 width transition 0.3s
- **Category chip**: prompt header 앞에 `[블런더]`(red 톤) / `[메이트]`(green 톤) chip을 inline. 카드 정체성 한눈에. CSS `.vault-cat-chip--blunder/mate` modifier
- **Board flash**: 정답/오답 시 `.vault-puzzle-board-wrap`에 `.vault-flash-correct/wrong` 클래스 → 0.55s ring 애니메이션 (haptic 대안 시각 피드백). `flashBoard(correct)` 헬퍼가 `void offsetWidth` reflow로 동일 클래스 재트리거 처리
- **Bottom action bar 위계**: 균등 회색 3개 → `다음`(primary 액션)을 잉크블루(`var(--ac)`) + 600 weight, 이전/다시는 `--tx3` 그대로. 사용 빈도 높은 액션 시각 강조

레퍼런스: [Duolingo 진행률 바 + 마일스톤](https://userguiding.com/blog/duolingo-onboarding-ux), [Anki rating 위계](https://forums.ankiweb.net/t/material-based-anki-flashcard/29493), [모바일 게임 success/fail 피드백 best practice](https://medium.com/nerd-for-tech/haptics-for-mobile-the-best-practices-for-android-and-ios-d2aa72409bdd) (retention +30%).

### 4) Eval transition display — 분석 화면 결의 단일 win-chance-display

이전: unified-controls 중앙에 `vaultPlyIndicator`로 "실수 직전" / "+1수" 텍스트만. "왜 블런더인지" 임팩트 무.

이후: 분석 화면의 `.win-chance-display`와 동일 element 재사용. **커서 위치에 따라 값 자체가 바뀜**:
- ply scrub backward (cursor < blunderIdx): 직전 best 라인 winChance — 예) `66%` (회색 `--tx2`)
- ply scrub forward (cursor ≥ blunderIdx): 드롭된 winChance — 예) `46%` (`--blunder` 빨강)
- 메이트 카드: `M3` 표시 (변화 없음)
- 옛 row(no winChance): `cpLoss` 폴백
- gameContext 없는 옛 row도 가상 [-1: before / 0: after] cursor toggle로 작동 — < > 가 의미 있게

데이터 우선순위: `solution.acceptable[0].winChance + winChanceDrop` → `mateIn` → `cpLoss` 폴백 → 빈 표시.

`.vault-eval-dropped` 클래스 한 줄로 색만 빨강 토글. 분석 화면과 100% 동일한 위치/스타일 유지.

### 5) Screen loading overlay (`withScreenLoading`)

vault/saved 진입 시 supabase fetch (~3s 가능)동안 빈 home/카드 영역(naked)이 노출되던 이슈.

- [ui.js](ui.js): `withScreenLoading(overlayEl, asyncFn, { minDuration = 200 })` export — 진입 시 overlay 노출, async 완료 시 (또는 캐시 hit 시 minDuration 만족 후) 자동 숨김
- index.html: 각 `view-container` 첫 자식으로 `.screen-loading` 마크업 (워드마크 + bg-base 배경)
- vault.js `loadVaultData` / `loadBlunderListData`, savedGames.js `loadSavedGamesData` 모두 wrapper로 변경

minDuration 200ms로 캐시 hit(<50ms) 시 깜빡임 방지.

### 6) 블런더 한 수 풀이 + feedback 슬림화

이전: `handleSequenceMove`가 `puzzleLockedLine` + `puzzleLineIndex`로 시퀀스 끝까지 매칭 강제. canonical 라인의 4-5수를 정확히 둬야 정답 → 너무 어려움.

이후 ([vault.js](vault.js)):
- 첫 수가 `acceptable` 라인 중 어느 것이든 매칭 → 즉시 `puzzleSolved = true` + correct
- 매칭 실패 → 즉시 fail
- 시퀀스 lock 로직 50줄 + 상태 변수(`puzzleLockedLine`, `puzzleLineIndex`) 통째 삭제
- `renderPuzzleFeedback`: head + (오답 시 "둔 수")만. 풀 시퀀스 + meta 라인 제거 — engine-line panel이 다중 라인을 더 잘 보여줌
- `.vault-panel-content { overflow-y: auto }` 안전망 — 좁은 viewport에서 잘림 방지

메이트 카드는 그대로 (`handleMateMove` 엔진 검증 path 유지) — 메이트 시퀀스는 학습 가치 있음.

### 7) Simplify 패스 (3-agent 리뷰 → 5건 픽스)

- **`withScreenLoading` 추출** (위 5번) — vault.js + savedGames.js 중복 제거 + minDuration 200ms 깜빡임 방지 한 번에
- **Progress bar diff-update**: `renderIndicator`가 매번 innerHTML 재생성 → fill 노드 새로 생기면서 `transition: width 0.3s`가 매번 처음부터 시작 → 애니메이션 안 보이던 버그. fill/count 노드 재사용으로 width style만 업데이트
- **`updatePlyIndicator`의 raw `'missed_mate'` 비교** → `categorize(item) === 'mate'`로 single source of truth
- **`renderPuzzle` null-cat 분기에 stale state 누수**: puzzleSolved/Processing 상태가 다음 카드로 새는 가능성 → 진입 시 reset
- **narrative 주석 정리** (3곳: index.html "Phase 42 채택", storage.js "수동 저장 폐지됨", savedGames.js 변경 narrative)

### 검증

| 항목 | 결과 |
|---|---|
| PC 1280×900: container 506×900, 비율 0.5625 | ✓ |
| vault top bar: segmented pill 중앙 + ☰ 우측 끝 | ✓ |
| 메이트 탭 전환: white pill bg 토글, font 600 | ✓ |
| Progress bar fill 노드 persist + width 변경 (8.33% → 16.67%) | ✓ — transition 정상 |
| eval display: 66% → 46% (cursor scrub forward) + 색 회색→빨강 | ✓ |
| Loading overlay min-duration 200ms 보장 | show t=3ms, hide t=2590ms ✓ |
| viewport 분포: top(46) + ind(26) + prompt(50) + board(488) + ctrls(52) + panel(116) + action(57) + nav(57) = 892/900 | ✓ 잘림 없음 |
| 콘솔 에러 | 0건 |

### 라인 변화 (Phase 47만)

| 파일 | 변경 |
|---|---|
| [index.html](index.html) | −10 (split eval markup → 단일, narrative 주석 정리) + 6 (loading overlay 마크업 2개) |
| [styles/tokens.css](styles/tokens.css) | +24 (PC 9:16 비율 + screen-loading 스타일) |
| [styles.css](styles.css) | +90 (segmented pill / progress bar / chip / flash / eval / vault-panel-content scroll) |
| [vault.js](vault.js) | −80 (시퀀스 lock 50줄 + 상태 + feedback 슬림 + dead 'other' deck 잔재) +60 (eval display + flash + chip + progress diff-update + virtual cursor + screen-loading 래퍼) |
| [ui.js](ui.js) | +20 (`withScreenLoading` export) |
| [savedGames.js](savedGames.js) | −10 (loading 인라인 → withScreenLoading 위임) |

순 효과: ~80줄 감소(코드) + viewport 안 4-요소 위계 정돈 + "왜 블런더인지" 숫자로 시각화 + 풀이 진입 마찰 낮춤 + supabase 렉 로딩 오버레이 + 1 실 버그 픽스(progress 애니메이션).

---

## Phase 46 — vault 자동 전용 전환 + saved_games로 단일 저장 흐름 통합 (2026-05-08)

vault에서 수동 저장 흐름을 통째 들어내고 자동 수집(블런더/메이트)만 남김. 분석/라이브 화면의 💾 저장 버튼은 더 이상 "vault vs game" 갈래 없이 곧바로 saved_games 모달로. vault top-bar는 3탭(블런더/메이트/기타) → 2탭으로.

**왜:**
- 사용자 명시: "복기 화면의 상단바는 블런더/메이트 둘만 남기고, 자동 저장만. 실수 저장은 saved_games로 통합"
- '기타' deck은 Phase 27에서 수동 저장(positional 등) 흡수용으로 만든 자리였는데 실사용 빈도가 낮고 "정답 없는 감상" UX가 vault의 풀이 정체성과 어긋났음
- 저장 흐름 갈래(수동 vault vs saved_games)도 사용자 입장에선 "한 수만 vs 게임 전체"가 멘탈 모델로 분리돼 있지 않았음 — saveChoiceModal에서 매번 한 번 더 결정해야 했던 마찰 제거

**제거 ([index.html](index.html), [main.js](main.js), [savedGames.js](savedGames.js), [vault.js](vault.js)):**
- `saveChoiceModal` (저장 갈래 picker) + `saveModal` (vault 카테고리 picker) HTML/CSS 잔재 + 핸들러 통째
- main.js: `vaultSnapshot`, `currentBestMoveForVault` 상태 + `choiceSaveMoveBtn`/`confirmSaveBtn` 핸들러 + `addVaultItem`/`buildAcceptableLines`/`buildGameContext` import
- vault.js: `deckState.other`, `categorize`의 `'other'` 분기 (→ null 반환 → deck/list에서 자연 제외), `renderOtherItem` 함수 통째, `puzzleIsOther` 상태 + 키보드 분기 (`puzzleSolved` 단일 가드로 단순화)
- savedGames.js: `choiceSaveGameBtn` ref + 핸들러 (openSaveGameModal export로 흡수)
- storage.js: `addVaultItem` (호출자 0). `_vaultRowFromItem`은 batch 전용으로 남김, source 디폴트 `'manual'` → `'auto'`
- index.html template '기타' 버튼 1줄 + 두 모달 블록(saveChoiceModal/saveModal)
- strings.js dead key 13개: `vault_filter_other`, `vault_puzzle_other_header/subhead`, `vault_engine_suggested`, `whatToSave`, `saveThisMove`, `saveToVault`, `category`, `notes_move_placeholder`, `saveMove` (KO+EN 양쪽)

**재배선:**
- saveMoveBtn 클릭 → `openSaveGameModal()` 직접 호출 (savedGames.js에서 신규 export). 라이브/분석 모드 분기는 그대로 — 빈 상태 가드만 main.js에서 처리하고 모달 본체는 savedGames 책임
- modal close registry에서 saveChoiceModal/saveModal 항목 정리

**옛 데이터 처리:**
- 기존 vault에 `category: 'positional'` 등 수동 저장 row가 있으면 `categorize()`가 null을 반환 → deck 필터(`_itemsCache.filter(...)`)에서 자연 제외
- localStorage/Supabase 행 자체는 보존 — 데이터 손실 없음. 사용자가 SQL로 정리하고 싶으면 `delete from vault_items where source='manual';`
- 자동 수집 row(missed_mate/blunder/mistake classification)는 영향 0

**검증 (preview):**
- 모듈 로드 에러 0, 콘솔 에러 0
- vault 진입 → 필터 탭 2개(블런더/메이트), 두 탭 전환 정상
- 홈/저장/통계 탭 진입 정상

**라인 변화:**
| 파일 | 변경 |
|---|---|
| [index.html](index.html) | −44 (saveChoiceModal + saveModal 블록 + '기타' 버튼) |
| [main.js](main.js) | −188 (DOM ref + 상태 + 두 핸들러 + import) |
| [vault.js](vault.js) | −68 (renderOtherItem 53줄 + deck 분기 + puzzleIsOther) |
| [savedGames.js](savedGames.js) | −2 (choiceSaveGameBtn → openSaveGameModal export로 이전) |
| [storage.js](storage.js) | −15 (addVaultItem) |
| [strings.js](strings.js) | −26 (KO+EN dead key 13개) |
| [CLAUDE.md](CLAUDE.md) | +1 (vault = 자동 수집 전용 명시) |

순 효과: ~340줄 감소 + 저장 흐름 갈래 1단 단순화 + vault 카드 분류 일관성 (자동 수집의 missed_mate/blunder/mistake만).

**남은 갭 (계속 미해결):**
- **블런더 후속 수 동급 인정** — Phase 44에서 이어진 항목. 무관

---

## Phase 45 — Phase 40~44 simplify 패스 (2026-05-08)

오늘 작업한 vault 코드(Phase 40~44)에 대한 3-agent /simplify 리뷰 → 6건 픽스. 분석 화면은 이번 세션 동안 한 줄도 안 건드린다는 제약 유지.

**적용:**
- **`placePieceBadge` 공유 헬퍼 추출 ([ui.js](ui.js)):** main.js의 `BADGE_MAP` + `showPieceBadge`(~53줄)와 vault.js `renderBlunderVisualization`의 거의 동일한 logic 통합. 둘 다 같은 helper 호출. 분석 화면 동작 변경 없음 (호출 사이트만 wrapper로). vault.js 60줄 → 10줄
- **`_replayGen` cancellation token ([vault.js](vault.js)):** `onLineClick`의 350ms × N replay loop과 `handleSequenceMove`의 250ms 응수 자동재생 — 사용자가 await 중 "다음 퍼즐"로 이동하면 stale loop이 새 puzzleChess를 오염시키던 실 버그. `renderSolvableItem` 진입 시 `_replayGen++`, async 가드로 stale 검출
- **Phase 번호 narrative 주석 14곳 제거:** CLAUDE.md "WHAT 주석 금지" + 변경 narrative는 WORKLOG에 속함 원칙. WHY는 유지 (예: Chessground init/redraw가 board children을 wipe하므로 80ms 후 attach)
- **`setTapZonesActive` no-op + 호출 4곳 제거:** Phase 42에서 좌/우 탭존 제거 후 호출 호환용으로 남겨뒀던 zombie 함수. 함수 통째 삭제
- **`onLineClick` 변수 섀도잉(`r`):** for-loop 내부 `const r = tmp.move()`가 outer Promise param `r`과 충돌. `result` / `resolve`로 분리
- **`showPlyOnBoard` 클린업 중복 → `clearBlunderVisualization()` 재사용:** 5줄 인라인 cleanup이 이미 존재하는 함수와 동일 → 호출로 대체

**의도적 스킵:**
- **`PUZZLE_CATEGORY` 상수 추출** — 'mistake'/'blunder'/'missed_mate'는 Supabase classification 컬럼 wire 값이라 상수화해도 wire 안 바뀜. 다파일 mass-replace 위험 vs 임팩트 작음
- **`buildSequenceFromPv` + `trimTrailingForced` 중복 `new Chess(prevFen)`** — cold path (분석 onComplete 후 게임당 ~6회), sub-ms
- **`setTimeout(80ms)` Chessground race hack** — 기능적으로 안정, 주석에 WHY 명시되어 있음
- **`scoreNum: (winChance-0.5)*2` leaky encoding** — `renderEngineLines` API 변경하면 분석 화면도 영향. 가독성만 살짝 떨어지고 기능 정상

**검증:**
- 모듈 로드 에러 0
- vault 진입 + 보드 / 화살표 / 배지 / unified-controls / 하단 액션바 / 필터 탭 모두 정상 렌더
- placePieceBadge 공유 헬퍼 → vault 카드의 빨간 ?? 배지 정상 표시

**파일별 라인 변화 (Phase 45만):**
| 파일 | 변경 |
|---|---|
| [ui.js](ui.js) | +52 (BADGE_MAP + placePieceBadge export) |
| [main.js](main.js) | −56 (BADGE_MAP/showPieceBadge body → 공유 호출) |
| [vault.js](vault.js) | −80 (renderBlunderVisualization slim, setTapZonesActive 제거, narrative 주석 정리) |
| [autoBlunders.js](autoBlunders.js) | −5 (narrative 주석 정리) |
| [storage.js](storage.js) | −3 (narrative 주석 정리) |

순 효과: ~92줄 감소 + 실 버그(replay cancellation) 1건 픽스 + 코드 중복 ~50줄 통합.

---

## Phase 44 — vault 풀이 후 "내가 둔 수" replay 엔트리 (2026-05-08)

풀이 종료 후 정답 라인 패널에 한 줄 추가 — 사용자가 실제 게임에서 둔 수의 흐름을 step-by-step 재생. Phase 41에서 캐포처해둔 `gameContext.plies` 데이터를 처음 활용. UI 변경 한 곳, 클릭 핸들러 분기 한 곳.

**왜:**
- Phase 42에서 정답 라인은 engine-line UI로 풍부하게 표시했지만, "그래서 내가 어떻게 망쳤는지"는 텍스트로만 ("둔 수: Kb8") 보여줌
- gameContext.plies는 실수 ±3수 윈도우를 갖고 있어서 실수 + 후속 흐름 재생 데이터가 이미 준비돼 있었음
- 학습 가치: 정답 라인과 자기 라인을 나란히 비교해서 "왜 이 길이 더 좋은가" 직관 형성

**변경 ([vault.js](vault.js)):**

`renderAcceptableLines(item)`가 acceptable 라인 N개를 lines 배열로 변환한 뒤, `gameContext`가 있으면 ◾ 엔트리 추가:
```js
const gc = item?.solution?.gameContext;
if (gc && gc.plies?.length > 0 && gc.blunderIndex < gc.plies.length) {
    const userMoves = gc.plies.slice(gc.blunderIndex);
    lines.push({
        scoreNum: 0,
        scoreStr: '◾',          // 사용자 마커 (★ 베스트, = 동급, ◾ 내 수)
        pv: userMoves.map(m => m.san).join(' '),
        uci: userMoves[0]?.uci || '',
    });
}
```

`onLineClick(index)`에 분기 추가 — index가 acceptable 범위 밖이면 gameContext에서 moves 빌드:
```js
let moves;
if (index < acceptable.length) {
    moves = acceptable[index].moves || [];
} else {
    moves = gc.plies.slice(gc.blunderIndex);
}
```

이후 step-by-step replay 로직(`prevFen` 리셋 → 350ms 간격 chess.js move → chessground.set)은 정답 라인 클릭과 100% 동일.

**시각:**
```
1.  ★    Kc8  Nf3  Bg7  Nxg5  Nf6      ← canonical 베스트
2.  =    Kc6  Nf3  Bg7  Nxg5  Nf6      ← 동급 정답 (acceptable)
3.  ◾    Kb8  Nf3  Bg7  ...             ← 내가 실제로 둔 수 (게임 흐름)
```

호버 시 첫 수만 paleGreen 화살표 미리보기 (정답 라인과 동일). 클릭 시 prevFen 리셋 후 350ms 간격 자동 재생.

**옛 row 호환:**
- Phase 40 이전 row: `solution` 없음 → acceptable 패널 자체 숨김 → ◾ 엔트리도 없음
- Phase 40~41 row: `solution.acceptable`만 있음 (gameContext 부재) → acceptable 라인만 보이고 ◾ 미추가
- Phase 41 이후 row: gameContext 있음 → ◾ 엔트리 자동 추가

기존 vault에 쌓여 있는 옛 row들은 ◾ 표시 안 됨. 사용자가 새로 분석 한 판 돌리면 자연스럽게 ◾ 줄 등장. 옛 row를 다시 만들고 싶으면 [supabase-schema.md](supabase-schema.md)의 vault 비우기 SQL + 재분석.

**검증:**
- 옛 row(bywxx Memofhjk 카드) → ◾ 엔트리 미추가, 회귀 없음 ✓
- 신 row 동작은 합성 데이터 주입이 Supabase 우선 정책으로 무력화돼 라이브 검증 미실시. 코드 추가는 if-guard로 격리돼 있어 옛 데이터엔 영향 0

**남은 갭 (계속 미해결):**
- **블런더 후속 수 동급 인정** — 첫 수 lock 후 user의 두 번째 수가 다른 동급 라인이면 오답. 엔진 매 수마다 호출이 필요한 무거운 작업이라 별도 phase

---

## Phase 43 — 메이트 퍼즐 엔진 검증 (시퀀스 lock 해제) (2026-05-08)

메이트 카드의 풀이 검증을 시퀀스 매치에서 **엔진 기반**으로 전환. 사용자가 엔진 추천 1수와 다른 길로 같은 N수 메이트를 찾으면 정답 인정, 느려진 메이트(N+1, N+2)는 자동 거부. 변경은 [vault.js](vault.js)의 `onPuzzleUserMove` 분기 순서 한 줄.

**왜:**
- Phase 40에서 모든 카드(블런더/메이트)를 `handleSequenceMove`로 통일 → 메이트도 lock된 시퀀스만 정답 처리. 사용자가 합법적 대체 mate-in-N 길을 찾아도 시퀀스 미스매치로 오답
- 사용자 명시 요구: "컴퓨터 추천 1수랑 조금 달라도 4수 메이트하면 성공", "4수 메이트를 5수 6수 메이트로 돌아가는 경우는 실패"
- 인프라 이미 있음 — `handleMateMove` + `analyzeForMate` + `_puzzleEngine`은 Phase ?? (이전)에 비-solution 메이트 카드용으로 구현돼 있었음. solution 있는 메이트 카드만 시퀀스 path로 빠지던 게 문제

**변경 ([vault.js:993](vault.js:993)):**

이전:
```js
if (puzzleItem?.solution?.acceptable?.length > 0) {
    await handleSequenceMove(played);     // 메이트도 시퀀스 lock 매치
} else if (puzzleIsMate) {
    await handleMateMove(played);          // 비-solution 메이트만 엔진
} else { ... single-move legacy ... }
```

이후:
```js
// Phase 43: 메이트는 항상 엔진 검증 — solution 시퀀스에 lock되지 않음
if (puzzleIsMate) {
    await handleMateMove(played);
} else if (puzzleItem?.solution?.acceptable?.length > 0) {
    await handleSequenceMove(played);
} else { ... single-move legacy ... }
```

**`handleMateMove`의 검증 로직 (변경 없음, 흐름 정리만):**
1. 사용자 수 적용 → `puzzleUserMoves++`
2. `puzzleChess.in_checkmate()` → 즉시 성공 (`mateDelivered: true`)
3. `puzzleUserMoves >= puzzleMateBudget` → 예산 초과 실패. **이게 "느려진 메이트" 거부 메커니즘.** mate-in-2인데 user_moves가 2개 됐는데도 mate 안 떨어졌으면 fail
4. `analyzeForMate(post-user fen, depth 14)` → 사용자 관점 mate가 여전히 보이는지 확인. 보이지 않으면 fail
5. 보이면 엔진의 best 응수를 자동 재생 후 다음 user 수 대기

**대체 라인 인정 시나리오 (예: mate-in-2에서):**
- canonical: `Qh8+ Kf7 Qe8#`
- 사용자: `Qa8+ Kf7 Qf8#` (a-h대각선으로 같은 위치 도달, 2수 메이트 유지)
- Phase 42까지: U1 = `Qa8+`이 acceptable에 없으면 첫 수에서 오답
- Phase 43: U1 후 엔진 분석 → mate-in-1 여전히 mover 측. continue. U2 후 in_checkmate → 성공

**느려진 메이트 거부 시나리오:**
- canonical mate-in-2
- 사용자 U1 후 엔진 분석 → mate-in-? 길어짐 (예: mate-in-3로 늘어남)
- engine still says mover mates → continue. 그러나 U2까지 둬도 in_checkmate 안 되면 `puzzleUserMoves(2) >= puzzleMateBudget(2)` 체크에서 fail

**옛 row 호환:**
- prevFen 없는 옛 mate row → `renderSolvableItem`의 PGN replay 폴백 경로로 puzzleChess 셋업
- solution 없어도 `handleMateMove`는 `puzzleMateBudget`(item.mateIn)만 있으면 동작. Phase 40 이전 row는 `mate_in` 컬럼이 이미 있었음

**검증:**
- vault 진입 + 회귀 없음 (board 정상 렌더, header/subhead 정상) ✓
- 라이브 메이트 케이스 검증은 Phase 41 이전 row엔 missed_mate 카드가 적어 합성 데이터 주입 시도했으나 Supabase 우선 정책 때문에 localStorage 인젝션 무력. 코드 변경은 단순 분기 재배치이고 `handleMateMove` 자체는 이전부터 비-solution 메이트 카드용으로 검증된 흐름이라 회귀 위험 낮음. 실제 메이트 퍼즐 풀이 시 자연스럽게 엔진 검증 경로 진입

**남은 갭 (미해결):**
- **블런더 후속 수 동급 인정** — 첫 수 lock 후 user의 두 번째 수가 다른 동급 라인이면 오답 처리. 엔진 매 수마다 분석으로 해결 가능하지만 부담 ↑
- **"내가 둔 수" 자동 replay 버튼** — gameContext.plies 데이터는 있는데 자동 재생 UI 없음

이 두 항목은 후속 phase에서 처리. 메이트 검증이 가장 큰 정답률 갭이었어서 그것만 우선 해결.

---

## Phase 42 — vault 시각 통일 (분석 chrome 채택) + 정답 라인 engine-line UI + 하단 액션바 (2026-05-08)

vault 화면 chrome을 분석 화면과 같은 골격으로 통일. 분석 화면 자체는 한 줄도 안 건드림 — vault HTML이 같은 CSS 클래스(`analysis-top-bar` / `unified-controls` / `panel-content` / `live-action-bar`)를 차용하기만 함. 풀이 후 정답 라인은 분석 화면의 [`renderEngineLines`](ui.js:119)를 그대로 import해 시각 일관.

**왜:**
- vault가 자체 chrome(`vault-filter-row` / `vault-puzzle-prompt` / `vault-puzzle-actions`)을 갖고 있어서 분석 화면과 결이 달랐음
- 사용자 피드백: 두 화면 사이에 "어디서 어떤 일이 가능한지"가 시각적으로 구분 안 돼 멘탈 모델 부하
- 정답 시퀀스를 텍스트로만 보여주던 게(Phase 40) 분석 화면의 engine-line UI에 비해 풍부함이 떨어졌음

**핵심 결정:**
- **분석 화면 비건드림.** 같은 CSS 클래스를 vault HTML이 차용하는 일방향 의존만. CSS 셀렉터 점검 결과 `unified-controls` / `panel-content` / `live-action-bar` / `analysis-top-bar` 모두 generic이라 그대로 재사용 가능
- **버튼은 < > 둘만.** 분석의 save / AI / 분류 라벨 / 평가 / 메인복귀 등은 vault에서 의미 없거나 다른 자리로 이동 (필터는 top-bar, 정답은 panel-content에 자동 표시). `vaultPrevPlyBtn` / `vaultNextPlyBtn` 새 ID로 분석의 prev/next 영향 없게
- **이전/다음/다시 퍼즐은 별도 하단 액션바.** Phase 36 라이브 모드의 `live-action-bar` 스타일 재사용 — 이미 검증된 56px + safe-area 패턴

### HTML 재구조 ([index.html](index.html))

이전: `vault-filter-row` + `vault-puzzle-prompt` + `vault-puzzle-board-wrap`(탭존 포함) + `vault-puzzle-feedback` + `vault-puzzle-actions`
이후:
```
#vaultPuzzlePane.vault-pane (flex column, padding-bottom로 bottom-nav 56px clearance)
├─ .analysis-top-bar.vault-top-bar — 필터 탭 + ☰ 목록
├─ #vaultPuzzleEmpty
├─ #vaultPuzzleStage (flex column, scrollable)
│  ├─ #vaultPuzzleIndicator
│  ├─ .vault-puzzle-prompt (header + subhead)
│  ├─ .board-wrapper > #vaultPuzzleBoard
│  ├─ .unified-controls (vault: < >만, ctrl-center에 ply indicator)
│  └─ .panel-content > [#vaultPuzzleFeedback, #vaultEngineLinesContainer]
└─ .live-action-bar.vault-action-bar — 이전 / 다시 / 다음 퍼즐 (vault-pane 마지막 자식이라 자동 하단)
```

좌/우 탭존(`vaultPuzzleTapZones`) 제거 — 하단 명시 버튼이 같은 일을 더 명확히. `setTapZonesActive` 함수는 호출 호환을 위해 no-op로 유지.

### vault.js 신규 핸들러 ([vault.js](vault.js))

- `navigatePly(delta)` — `solution.gameContext.plies` 안에서 cursor 이동, `showPlyOnBoard`로 시각만 바꿈 (puzzleChess 미변경). cursor가 `puzzleStartPlyIdx`이면 드래그 활성, 아니면 비활성 — scrubbing 모드에서 실수 방지
- `showPlyOnBoard(idx)` — idx<0이면 prevFen, 아니면 `plies[idx].fen` + `lastMove` 하이라이트. start로 돌아오면 블런더 시각화 자동 재표시
- `updatePlyIndicator()` — 분석 화면의 `win-chance-display` 자리에 "실수 직전" / "+1수" / "-2수" 같은 상대 위치 표시
- `renderAcceptableLines(item)` — 풀이 종료 시 `renderEngineLines(vaultEngineLinesContainer, lines, hover, leave, click)` 호출. lines는 `solution.acceptable`을 분석 화면 포맷(`{scoreNum, scoreStr, pv, uci}`)으로 변환. 베스트엔 `★`, 나머지 정답 라인엔 `=` 표시
- `onLineHover(uci)` — 첫 수를 paleGreen 화살표로 미리보기
- `onLineLeave()` — 화살표 해제
- `onLineClick(index)` — 그 라인을 prevFen에서 시작해 350ms 간격으로 step-by-step replay (chess.js + chessground.set 조합)

### `renderEngineLines` 그대로 재사용

ui.js의 `renderEngineLines`는 처음부터 `(container, lines, onHover, onLeave, onClick)` 시그니처라 분석/vault 양쪽에서 차이 없이 호출 가능. setupEngineLinesDelegation의 mouseover/mouseout/click 위임 + `_onHover`/`_onLeave`/`_onClick` 컨테이너 프로퍼티 패턴이 격리돼 있어 모듈간 충돌 없음. 함수 자체엔 한 줄도 안 더 손댐.

핸들러 시그니처 미스매치 디버깅: 처음 `onLineClick(uci, index)`로 작성했는데 실제 위임은 `_onClick(idx)` 단일 인자만 전달 → `index` undefined로 클릭 무반응. `onLineClick(index)`로 정정.

### CSS 보정 ([styles.css](styles.css))

- `.vault-pane`을 flex column + flex:1 + min-height:0 + padding-bottom으로 — 자식 [top-bar/empty/stage/action-bar] 수직 배치, 마지막 action-bar가 자동으로 하단. bottom-nav 56px + safe-area 가림 방지
- `#vaultPuzzlePane .board-container` max-width 300px → 360px 빼는 걸로 — 추가된 unified-controls + panel + action-bar 공간 만큼

다른 분석 한정 셀렉터 풀거나 alias 추가는 불필요 — generic 그대로 작동.

### Chessground init 충돌 (Phase 41과 동일 회피)

블런더 시각화 시점은 그대로 setTimeout 80ms — Chessground가 init/redraw 중 board children을 wipe하는 사이클 후에 안전하게 attach. Phase 41 디버깅 메모 그대로 적용.

### 검증

| 항목 | 결과 |
|---|---|
| top-bar 필터 + ☰ + 보드 + < > + 패널 + 이전/다시/다음 | ✓ 시각 |
| 잘못된 첫 수 → 피드백 + engine-line 패널에 정답 라인 2개(`★ Kc8 Nf3 ...` / `= Kc6 Nf3 ...`) + 분석 hint 텍스트 | ✓ |
| 라인 호버 → 첫 수 paleGreen 화살표 | ✓ (분석과 동일 동작) |
| 라인 클릭 → 보드에 350ms 간격 replay | ✓ (시그니처 픽스 후) |
| 하단 액션바 visible (bottom-nav 위) | ✓ (vault-pane padding-bottom 적용 후) |
| < > scrub gameContext (Phase 41 row) | ✓ 데이터 있으면 동작. 옛 row는 자동 no-op |

### 옛 row 호환

vault에 이미 쌓여있는 Phase 39 이전 row는 `solution`/`gameContext` 없음 → `<>`는 no-op, engine-line 패널은 `vaultEngineLinesContainer.classList.contains('hidden')`로 숨김 유지. 시퀀스 풀이 안 되는 단일 수 카드만 fallback으로 동작 (Phase 40에서 이미 폴백 경로 보장).

### 스코프 컷

- 분석 화면 자체 변경 금지 (사용자 명시 요청)
- `<` `>` 가 정답 시퀀스 navigate (option β)는 안 함 — 모드 충돌 회피, gameContext 한 가지 의미로 고정 (option α)
- 미래 puzzle UX 폴리시 (success 애니메이션, length 힌트 헤더, 정답률 통계) 별도 phase

---

## Phase 41 — vault 카드 시각: 블런더 화살표 + 분류 배지 + 수동 저장 통합 + ±3수 게임 컨텍스트 (2026-05-08)

Phase 40으로 풀이 알고리즘은 완성됐고, 41은 **vault 카드의 학습 컨텍스트** 보강. 카드 열면 사용자가 둔 실수 수가 빨간 화살표 + 분류 배지로 한눈에 보이고, 자동/수동 저장 모두 같은 시퀀스 풀이 + ±3수 게임 컨텍스트 데이터를 갖게 됨. 자동 카드 vs 수동 카드의 데이터 비대칭이 사라지면서 vault가 한 가지 카드 타입으로 통일.

**왜 필요했나:**
- Phase 40 직후 사용자 피드백: 카드 열어도 "여기서 뭐가 잘못된 거지?"가 즉시 안 보임 — 단순히 포지션만 떴음
- 자동 수집은 시퀀스 풀이가 되는데 "Save This Move"로 수동 저장한 카드는 단일 best_move 옛 포맷이라 vault에 두 종류 카드가 섞임
- 학습 가치: 실수가 어떤 흐름에서 일어났는지(±3수 컨텍스트) 보여주면 패턴 인식 ↑

### ① 블런더 시각화 ([vault.js:680](vault.js:680))

`renderSolvableItem` 끝에서 `renderBlunderVisualization(item)` 호출:
- `item.san`을 `puzzlePrevFen` 위에서 chess.js로 replay → from/to 추출
- Chessground `drawable.autoShapes`에 빨간 화살표 (`{ orig: from, dest: to, brush: 'red' }`)
- `vaultPuzzleBoard` 위에 `.piece-badge-square` div 절대 위치 + `?` (Mistake) / `??` (Blunder) 배지 — 분석 화면 [main.js:1773](main.js:1773)의 `BADGE_MAP` 색/심볼 그대로 재사용 (결정: 미관 개선은 추후, 일관성 우선)
- `missed_mate`는 배지 제외 — "실수했다"기보단 "메이트 못 봄"이라 같은 마크가 의미적으로 안 맞음 (화살표는 띄움)

**setTimeout 80ms hack:** Chessground init/redraw가 board children을 일시적으로 wipe해서 sync 추가하면 사라짐. mutation observer로 추적해서 잡음 — `Chessground(...)` 호출 후 30ms 시점 `redrawAll()`이 cg-container를 제거+재추가하면서 형제 노드도 같이 사라짐. 80ms로 미루면 그 사이클 후라 안전하게 살아남.

**자동 클리어:** 사용자가 첫 수 두는 순간(`onPuzzleUserMove` 진입 시) `clearBlunderVisualization()` — 보드 상태가 prevFen을 떠나면 화살표·배지가 떠 있을 square가 의미 잃기 때문.

### ② 게임 컨텍스트 ±3수 캡처 (`buildGameContext` in [autoBlunders.js](autoBlunders.js))

```js
gameContext: {
  plies: [{ san, uci, fen, side: 'user'|'opponent', classification }, ...],  // 최대 7개 (3+1+3)
  blunderIndex: 3,  // 배열 내 실수 ply의 위치. 게임 시작/끝 부근이면 3 미만
}
```

queue 인덱스 i 주변 윈도우 `queue.slice(max(0, i-3), min(len-1, i+3)+1)` — 게임 시작/끝 가까우면 자동으로 잘림. 각 ply는 post-move fen을 직접 저장(replay 비용 ↓, 7×80byte ≈ 560byte 추가).

자동 수집(`extractAutoCandidates`): missed_mate / blunder 두 path 모두 `solution.gameContext`에 첨부.

UI scrubbing(±3 navigate)은 Phase 41 스코프 밖 — 데이터만 캡처해두고 후속 phase에서 prev/next 버튼으로 윈도우 탐색.

### ③ 수동 저장 통합 ([main.js:1053](main.js:1053) confirmSaveBtn)

`buildAcceptableLines` + `buildGameContext`를 [autoBlunders.js](autoBlunders.js)에서 `export` → main.js의 confirmSaveBtn 핸들러에서 자동 수집과 같은 로직 호출:

```js
const acceptable = buildAcceptableLines(snap.prevFen, snap.engineLines, isUserWhite, ...);
solution = { acceptable };
if (appMode !== APP_MODES.LIVE_INPUT) {
    solution.gameContext = buildGameContext(analysisQueue, snap.moveIndex, isUserWhite);
}
```

vaultSnapshot이 이미 `prevFen` + `engineLines`를 갖고 있어서(Phase 36 라이브 모드 수정 시 추가됨) 추가 데이터 채집 불필요. **자동/수동 카드가 같은 데이터 모델로 vault에 들어옴.**

라이브 입력 모드는 `analysisQueue`가 비어있어 gameContext 안 만듦 — solution.acceptable만 채움. 라이브엔 게임 컨텍스트 자체가 없으므로 자연스러움.

### ④ Storage round-trip — 변경 없음

`gameContext`가 `solution` 객체 안에 nested되어 있어서 Phase 40의 `solution_json` jsonb 컬럼 round-trip이 그대로 적용. `_vaultRowFromItem` / `normalizeVaultItem` 셋 다 추가 변경 없이 동작. Supabase 마이그레이션 SQL 추가 ALTER 불필요.

### 데이터 흐름

```
분석 onComplete                      |  분석 화면 "Save This Move"
  → extractAutoCandidates           |    → confirmSaveBtn handler
       ├─ buildAcceptableLines      |         ├─ buildAcceptableLines
       └─ buildGameContext          |         └─ buildGameContext (LIVE 모드 제외)
  → vault row {                     |    → vault row { (동일 형태)
       solution: { acceptable, gameContext },
       prevFen, ...
  → addVaultItem(s)Batch → Supabase + localStorage

vault 카드 open
  → renderSolvableItem
       ├─ Chessground 보드 fen=prevFen 셋업
       └─ setTimeout(80ms) → renderBlunderVisualization
            ├─ chess.js replay item.san → from/to
            ├─ autoShapes red arrow
            └─ piece-badge-square div with category symbol
  → 사용자 첫 수 → clearBlunderVisualization → handleSequenceMove (Phase 40 그대로)
```

### 검증

| 항목 | 결과 |
|---|---|
| 카드 open: c7→b8 빨간 화살표 + ?? 빨간 배지 (Blunder) | ✓ 시각 확인 |
| 사용자 첫 수 → 화살표/배지 자동 제거 | ✓ |
| 자동 수집 row → solution.gameContext 정상 채움 (7 plies, blunderIndex=3) | ✓ extractAutoCandidates |
| 수동 저장 → 자동과 동일 solution 구조 | ✓ confirmSaveBtn 통합 후 |
| storage round-trip — gameContext 보존 | ✓ (nested in solution_json) |

### 디버깅 메모 — Chessground init과 sync 충돌

처음 sync로 `vaultPuzzleBoard.appendChild(badge)` 했더니 100ms 안에 사라짐. mutation observer로 추적: `[+badge, -CG-CONTAINER -badge, +CG-CONTAINER]` 순. Chessground 9.x가 `redrawAll()` 호출 시 cg-container를 단순 갱신이 아니라 remove+recreate하는데 sibling으로 attach된 우리 badge도 휩쓸려 나감.

해결: 80ms 후 setTimeout. Chessground 자체 init이 sync 끝나는 30ms 후 redrawAll 한 번 fire한 다음 안정 상태가 되면 그때 attach. 깔끔하진 않지만 chessground 내부 동작에 의존하므로 어쩔 수 없음.

옛 분석 화면 `showPieceBadge`는 같은 문제가 없는 이유: 분석 보드는 init 후 한참 뒤(분석 진행 중 classification 갱신 시점)에 배지를 추가하므로 Chessground 사이클이 이미 안정. vault는 init 직후 추가라 시점이 충돌.

---

## Phase 40 — vault 알고리즘 v2: 승률 기반 트리거 + 시퀀스 풀이 + 정답 라인 다중 인정 (2026-05-08)

vault 자동 수집을 [Lichess 퍼즐 생성기](https://github.com/ornicar/lichess-puzzler) 방식으로 재설계. 그동안 vault는 "한 위치 + 한 정답 수"를 정적으로 보여주는 구조였는데, 풀이 시퀀스(여러 수 콤비네이션)와 다중 정답 라인까지 저장·재생하도록 확장.

**왜 바뀌나:**
- 기존 단일 수 비교는 "사용자가 둔 best PV 첫 수만" 정답으로 판정 → 거의 동급의 2등 후보를 골라도 오답 처리. "내 실수 vault" 컨셉엔 너무 엄격
- 단일 수만 풀고 끝나는 UX는 메이트 콤비네이션(M2~M4)의 학습 가치를 살리지 못함
- 정렬·필터에 raw cp 손실(cpLoss)을 쓰면 포지션 품질 무시: +500 → +400(-100cp 손실)이 0 → -100과 동일 가중

**핵심 결정:**
- **공개 퍼즐 DB의 "유일해" 게이트는 도입 안 함.** Lichess는 `winChance(best) - winChance(2nd) ≥ 0.5`가 기준이지만, 우리는 *내 학습용*이라 더 관대해도 됨 → "엔진 라인 안에 있으면 정답"
- **명백히 떨어지는 라인은 제외.** 베스트 대비 사용자 관점 승률이 **−10%p 초과** 떨어지면 정답 후보에서 빠짐. multiPV=3 중 2~3개가 보통 통과
- **메이트 / 우위 두 카테고리 분리.** 메이트 퍼즐은 끝까지(M2=3플라이, M3=5, M4=7) 전체 시퀀스 저장 + mate를 주는 라인만 정답. 우위 퍼즐은 5플라이 cap + 끝쪽 강제수 trim

### ① 승률 변환 ([utils.js:50](utils.js:50))

`winChance(score, isWhiteMover)` / `winChanceDelta(a, b, isWhiteMover)` 신규. Lichess Lila #11148 보정 시그모이드: `1 / (1 + exp(-0.00368208 · cp))`. mover 관점 0~1 반환, mate는 1/0으로 단순화.

검증값: 0cp=0.5, +100cp=0.591, +400cp=0.813, +800cp=0.95 — Lichess 공식과 일치.

기존 `cpToWhiteWinPct`(50~100, 백 관점)는 그대로 유지 — analysis 화면 윈%바가 이미 의존 중. 새 헬퍼는 mover 관점 + mate 처리가 추가된 vault 알고리즘 전용.

### ② autoBlunders.js 재작성

상수:
- `MAX_BLUNDER_PLIES = 5` (우위 퍼즐 시퀀스 길이 cap)
- `ACCEPT_GAP = 0.10` (베스트 대비 정답 후보 인정 갭)
- `ALREADY_DECIDED_HI/LO = 0.9 / 0.1` (cp 600 ≈ win% 90/10 컷의 승률 버전)

흐름:
- **missed_mate (≤M4)**: prev top eval이 mover-favorable mate인데 사용자가 그 수를 안 뒀을 때 트리거. `buildAcceptableLines(prev.fen, prev.engineLines, isUserWhite, { requireMate: true })` — multiPV 중 mate 주는 라인만 채택. 시퀀스는 PV 전체, 체크메이트 도달 시 stop. trim 없음
- **blunder/mistake**: classifyMove의 분류를 게이트로 유지(freechess 휴리스틱 보존). 추가 필터: 양쪽 승률 모두 ≥0.9 또는 ≤0.1 이면 skip(이미 결판). 정렬키는 `winChanceDrop = prevWc - postWc` (cpLoss 자리)
- **시퀀스 빌드**: `buildSequenceFromPv(fen, pvSan, opts)` chess.js로 SAN 검증해 verbose move 추출, side='user'/'opponent' 교차 태그
- **끝쪽 trim** (`trimTrailingForced`): 우위 퍼즐만 — 마지막 수가 `legal moves === 1` 위치에서 둔 강제수면 iterative pop. "정답이 한 수밖에 없는" 끝부분은 학습 가치 없음

각 후보 형태:
```js
{
  moveIndex, classification, winChanceDrop, prevFen,
  bestSan, bestUci,                       // 첫 정답 수 (legacy best_move 칼럼용)
  solution: { acceptable: [
    { san, uci, winChance, moves: [{san, uci, side}, ...] },
    ...
  ] },
  cpLoss, mateIn,                         // 표시 보조용 보존
}
```

### ③ storage.js — Supabase 3개 신 컬럼 + 옛 row 폴백

`vault_items`에 `prev_fen text` / `solution_json jsonb` / `win_chance_drop numeric` 추가. 마이그레이션 SQL은 [supabase-schema.md](supabase-schema.md). `_vaultRowFromItem` / `normalizeVaultItem` / `normalizeLocalVaultItem` 셋 다 신 필드 round-trip:
- 신 row: 3개 필드 정상 직렬화/역직렬화
- 옛 row: 필드 부재 → null로 정규화 → vault.js가 자동 폴백 (PGN 로드 + replay 경로)

검증: 로컬 신/옛 row 둘 다 `getVaultItems()` round-trip 성공.

### ④ vault.js — 시퀀스 플레이백 + 피드백 풀 시퀀스 표시

`renderSolvableItem` 분기 추가:
- **신 path**: `item.prevFen` 직접 사용 — `puzzleChess = new Chess(item.prevFen)` 으로 시작. PGN 로드 불필요
- **옛 path**: `analyzedGameId`로 PGN 가져와 `moveIndex`까지 replay (변경 없음, 옛 row 호환)

`onPuzzleUserMove` 분기:
- **신 path** (`item.solution?.acceptable?.length > 0`): `handleSequenceMove(played)` → 첫 user 수가 acceptable 라인 첫 수와 매칭되면 그 라인 lock → `puzzleLineIndex`로 ply 진행. 다음이 opponent 수면 250ms 딜레이 후 자동 재생, user 수면 보드 재활성. 라인 끝 도달 시 solved
- **옛 path**: 기존 `handleMateMove`(메이트는 엔진으로 검증) / 단일 best_move SAN 비교

상태 변수 신규:
- `puzzleLockedLine` — 사용자가 첫 수로 잠근 라인 (acceptable 중 하나)
- `puzzleLineIndex` — lock된 라인 안의 다음 처리 ply 인덱스

**피드백 카드 — 시퀀스 친화 표시:** `renderPuzzleFeedback`이 옛 단일 best_move만 보여주던 걸 풀 시퀀스로 교체. `item.solution?.acceptable?.[0]?.moves` 가 있으면 user/opponent 교차로 렌더 — 사용자 수는 굵게, 응수는 `puzzle-fb-opp` 클래스로 톤 다운(회색·얇음). 옛 row(solution 없음)는 single SAN 그대로 폴백.

> 처음 출시 직후 사용자 피드백: "수순을 맞게 둬도 오답이라고 뜬다." 진단 결과 알고리즘은 정상(시퀀스 핸들러 검증 통과)이고, **피드백이 옛 포맷대로 첫 수만 표시**돼서 사용자가 "이게 한 수 퍼즐인데 왜 두 번 둬야 하지?"로 혼동한 게 원인. 풀 시퀀스 표시로 즉시 해소.

### 데이터 흐름

```
분석 onComplete
  → extractAutoCandidates(queue, isUserWhite)         // autoBlunders.js
       ├─ missed_mate 체크 (mate-only filter)
       └─ classifyMove 게이트 + 승률 필터 + winChanceDrop 정렬
  → 각 후보에 buildAcceptableLines + buildSequenceFromPv → solution
  → buildVaultRow → addVaultItemsBatch
       ├─ localStorage: solution 객체 그대로 직렬화
       └─ Supabase: solution_json jsonb 컬럼

vault 진입
  → getVaultItems → normalizeVaultItem (snake → camel, solution_json → solution)
  → renderSolvableItem
       ├─ prevFen 직접 사용 (신) or PGN replay (옛)
       └─ Chessground init
  → 사용자 첫 수 → handleSequenceMove
       ├─ acceptable 매칭 → 라인 lock → opponent 응수 자동
       └─ 라인 끝까지 진행 → solved
```

### 검증 (preview eval)

| 케이스 | 기대 | 실측 |
|---|---|---|
| `winChance({type:'cp', value:100}, true)` | ≈ 0.59 (Lichess 공식) | **0.591** ✓ |
| Missed M1: top=`+M1`, 2등=`+25cp` | mate-only 필터 → 1개만 인정 | **acceptable_count=1** ✓ |
| Blunder: top `+30`(Nf3) / 2등 `+25`(e4) / 3등 `-100`(a3) | 1·2등 인정, 3등(13%p 갭) 거부 | **acceptable=[Nf3, e4]** ✓ |
| 시퀀스 side 교차 | user/opponent/user/... | **`Nf3/user d5/opponent d4/user`** ✓ |
| 신 row round-trip(localStorage) | prevFen·solution·winChanceDrop 보존 | ✓ |
| 옛 row round-trip | 신 필드 = null, legacy 필드 그대로 | ✓ |
| vercel dev e2e — Supabase round-trip | 신 컬럼 INSERT/SELECT | ✓ (vercel dev + 컬럼 마이그레이션 후) |
| vault 진입 → 보드 렌더 | Chessground 정상 | ✓ |
| **잘못된 첫 수 → 풀 시퀀스 피드백** | "정답수: Bxb5 *Bxe5* Bd7 *Bc7+* Ke8" | ✓ |
| **올바른 시퀀스 끝까지 풀이** | "정답" verdict | ✓ (Kc8 → Bg7 → Nf6 user 차례 통과) |

### 스코프 컷

- master DB 교차 확인(Lichess가 2M 토너먼트 게임으로 SF 검증) — 우리 도메인 overkill
- 게임 단위 dedup 1000 버퍼 — 분석당 ~30~80수 보면 됨
- "tier" 시스템 — 단순 reject/accept만
- 다중 user 수 사이의 fork (acceptable 첫 수 후 두 번째 user 수에서 또 다른 정답) — 첫 수에서만 라인 분기, 이후는 lock된 라인 따라가는 것으로 단순화. 추후 필요 시 확장

### 마이그레이션 메모

기존 운영 환경에 적용 시 [supabase-schema.md](supabase-schema.md) 하단의 ALTER TABLE 3개 컬럼 추가 SQL을 Supabase SQL Editor에서 실행. 이전에 수집된 vault row는 `prev_fen` / `solution_json` 둘 다 NULL → 자동으로 옛 path(단일 수 비교)로 동작 — 데이터 손실/표시 깨짐 없음.

---

## Phase 39 — 픽셀 로고 + SEO/보안 메타 + PWA 브랜딩 + 분석/설정 UX 정리 (2026-05-07)

10개 커밋. 두 큰 줄기 — (1) 시각 정체성·SEO·보안·프라이버시 기초, (2) 분석 화면 네비/SIMULATE 확장 + 설정 모달→페이지 분리 + UX 픽스.

**픽셀 룩 로고 + 브랜딩 통일 (`dbae851`, `82609c1`):**
- favicon-32 / apple-touch-icon-180 / icon-192 / icon-512 픽셀 룩 (잉크 블루 #2B5BD7). `logo.png` → `logo-old.png` 백업
- manifest `name` / `short_name` / `apple-mobile-web-app-title`을 영문 워드마크 'blundermate'로 통일 — 워드마크 자체는 lowercase 영문인데 PWA 설치 시만 한글 음차('블런더메이트')로 떠서 정체성이 어긋나 있던 상태
- JSON-LD `alternateName: '블런더메이트'`는 한국어 검색 발견용으로 유지 — search visibility는 한글, install label은 영문으로 분리
- 온보딩 정리: tagline 교체, 중복 라벨 제거, 입력창 가운데로, @bywxx 크레딧

**SEO / 보안 헤더 / 프라이버시 (`ba23dd5`, `ece14e8`, `d98dafe`):**
- [`vercel.json`](vercel.json): `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` 헤더 추가
- [`index.html`](index.html): preconnect(fonts.googleapis/gstatic) + dns-prefetch(cdn.jsdelivr/unpkg/cdnjs) + JSON-LD WebApplication + canonical + `lang="ko"` + multi-size favicon 분리
- [`robots.txt`](robots.txt) 신규: `Allow: /` + `Disallow: /api/`
- `marked.min.js`: head sync → defer (초기 파싱 차단 제거)
- `mask-icon.svg`: 296 단일 픽셀 rect (13.3KB) → 가로 run 병합 28 rect (1.38KB, **-90%**) — Safari 핀 탭용
- OG/Twitter 메타 카피를 description meta와 통일 (Lichess 언급 추가, 'Stockfish + Gemini' 명시) — Phase 34 Lichess 지원 후 drift 상태였음. og:image / twitter:image PNG 갱신은 별도 phase
- [`privacy.html`](privacy.html) 신규(7섹션 한국어 처리방침) + 연락처 이메일 평문 → `[at]` / `[dot]` 마스킹 (스팸봇 스크래핑 차단)

**Maskable 아이콘 시도 → 제거 결정 (`73eee94`):**
- 처음엔 `icon-maskable-512.png`(112px ~22% padding)을 manifest에 넣었으나 Android 설치 시 룩이 너무 작아 보여 제거. `icon-512.png`(any 단일)로 통일 — 룩이 캔버스의 ~66%를 차지해 대부분 어댑티브 마스크(원/스큐어클) 안에 자연 fit
- 트레이드오프: 일부 공격적 원형 마스크 launcher에서 외곽 차콜 일부 잘림 가능 — 시각 크기 > 마스킹 안전 마진

**분석 화면 — EXPLORE 네비 + SIMULATE 라인 무한 확장 (`733c558`):**
- EXPLORE의 `<`: 이전엔 `returnMainLineBtn`과 기능 중복(메인라인까지 점프)이었음 → 변형 한 수씩 undo로 변경. 변형 소진 시에만 메인라인으로 빠져 한 칸 더 뒤로
- EXPLORE의 `>`: 변형 redo 스택 — 따라가본 수 재생. 새 변형 수 두면 fork → 스택 클리어
- SIMULATE→EXPLORE 전환 시 `simulationQueue`의 PV 수를 `explorationChess.history`에 replay — 변형 수 1번 undo 후 메인라인까지 튀던 버그 픽스
- SIMULATE 큐 끝에서 `>` → 단일 엔진(depth 12, MultiPV=1) 즉석 분석으로 best move 한 수 추가. 클릭마다 라인 무한 확장. 분석 중 `<` / sim-move 클릭 / 변형 수 / 메인 복귀 모두 abort
- 리팩토링: `syncExploreBoard` 통합(LIVE/EXPLORE 중복 제거), `showEngineLoading` / `hideEngineStatus` 헬퍼로 분산된 className/textContent 조작 7곳 통합, `exploreRedoStack` / `simExtendState`를 [modes.js](modes.js)로 이전
- 설정 General에 "기본 시간대" select 추가(rapid/blitz/bullet/all). 홈 드롭다운과 같은 localStorage 키 공유로 출발했으나 이후 `bc6d156`에서 의미 분리

**설정/About/피드백 모달 → 페이지 (`2dc7d8b`):**
- 한 모달 안에 컨트롤 5 + 네비 3 + 로그아웃 + 푸터까지 빽빽해서 분리. [settings.js](settings.js) 신설(199줄), main.js −175줄
- `SCREENS.SETTINGS/ABOUT/FEEDBACK` 추가, drilldown 패턴(back btn) 채용
- `.app-container { overflow: clip }` — `moves-overlay-sheet`의 transform이 scrollHeight를 늘려 focus 자동 `scrollIntoView`가 컨테이너를 스크롤시키던 부작용 차단
- `storage.clearIdentity()` 캡슐화 — settings에서 raw localStorage 키 접근 제거
- 카피: "기본 시간대" → "기본 시간 컨트롤" (timezone 오해 방지)
- **dead 제거:** Phase 38에서 추가했던 last push UI + `api/version.js`(삭제) + [_http.js](api/_http.js)의 GET 일반화를 원복. last push 표시 자체가 페이지 전환 후 무가치해져서 표면적 정보 줄임 — 38이 막 들어간 코드를 39에서 되돌리는 자연스러운 회귀 케이스

**홈 TC 드롭다운 vs 설정 기본값 의미 분리 (`bc6d156`):**
- 이전엔 둘이 같은 localStorage 키를 공유 — 홈에서 한 번 바꾸면 영구 default가 됐음. 사용자 멘탈 모델대로: **설정의 "기본" = 영속**(앱 재시작 시 초기값), **홈 드롭다운 = 메모리 한정**
- `setHomeTcFilter`: localStorage 쓰기 제거, 메모리만 변경
- `setDefaultTcFilter` 신설: localStorage 영속 + `setHomeTcFilter` 위임으로 즉시 sync

**온보딩 ID 검증 + 통계 재배치 + 시계 카드 픽스 (`3892c9b`):**
- `chessApi.verifyUserExists` 라우터 + chesscom/lichess 어댑터별 구현. 온보딩 submit 시 검증 → 404면 "존재하지 않는 ID 입니다" 빨간 인라인 에러. `_onboardingPending` 가드로 더블 submit 방지. 입력 변경 / 플랫폼 탭 전환 시 에러 자동 클리어
- 통계: "상대 레이팅별 성적" 카드 openings → patterns 이동. 오프닝과 무관 — patterns 탭의 "자주 만난 상대" 바로 위에 배치해 "vs 상대" 묶음 자연 군집화
- 시계 카드 sub 깨짐: 3분할 좁은 카드(~110px)에서 한글 sub가 단어 단위로 4~5줄 잘리던 문제 → column 레이아웃 + 텍스트 압축 ("잔여 ≤10초로 둔 수" → "≤10초 잔여:", "3초 안에 둔 수" → "<3초:")

---

## Phase 38 — P0/P1 코드 위생 통합 + 2회 simplify 패스 (2026-05-05 ~ 06)

코드 리뷰 도출 P0/P1 항목 한 번에 + 두 차례 `/simplify` 패스로 발견 14건 사전 해결. 기능 추가 없음 — 표면 정리만.

**P0 (안전성):**
- **`callDB` 서킷 브레이커 + pilot coalescing ([storage.js:50-118](storage.js:50)):** /api/db가 죽은 환경(static dev server, Vercel Functions 미배포 등)에서 콜드 로드 시 ~10개 카드 + vault + saved가 거의 동시에 callDB를 부르는데 첫 응답 전 in-flight 200+가 모두 5xx를 받음. pilot 패턴: 첫 호출은 fetch 시작, 같은 시점 다른 호출들은 pilot 결과 await. pilot 5xx → `_dbBreakerUntil` 60s setting → waiter들은 깨어나서 entry check로 silent throw. 검증: `performance.getEntriesByType('resource')` = **1건** (이전 200+). `_dbBreakerLogged` 별도 상태 없이 `_dbBreakerUntil > Date.now()`로 derive — race condition 없는 단일 진실 원천. `err.silent` 플래그 + `_warnDb` 헬퍼로 콘솔 경고도 1건만.
- **`alert`/`confirm` → 모달/토스트 ([dialogs.js](dialogs.js) 신규, 9곳):** logout/삭제 confirm 3곳 + alert 6곳 교체. `showToast`/`showAlert`/`showConfirm`/`initDialogs` ES module export. `showConfirm`은 `Promise<boolean>`, `destructive: true` 옵션 시 빨간 OK 버튼 자동. **cancelBtn 자동 focus + 글로벌 Enter 핸들러 제거** — 모달 밖 input에 focus 남아있을 때 의도치 않은 OK 트리거 위험 차단. ESC만 글로벌, Enter는 native button activation으로.
- **`showButtonSuccess` → toast 통합:** 헬퍼 9줄 제거 + saveMoveBtn 아이콘이 텍스트로 깜빡이던 awkward 동작 사라짐. `_toastTimers[]` 배열로 outer/inner setTimeout 둘 다 추적 — 빠른 연속 호출 시 이전 호출의 inner setTimeout(220ms 후 'hidden' 추가)이 새 토스트에 다시 hidden 씌우던 race condition 픽스.

**P1 (구조):**
- **A. console.* 게이트 ([index.html](index.html)):** module import 전 inline `<script>`로 비-localhost 환경에서 `console.log`/`warn`/`debug`/`info`를 noop. `console.error` 보존 — 사용자 버그 리포트 진단성. 47개 console 호출이 한 줄로 정리.
- **B. last push time → /api/version ([api/version.js](api/version.js) 신규):** GitHub API(rate limit 60/h, 외부 의존, "Failed to fetch" 메시지 노출) 제거. Vercel `VERCEL_GIT_COMMIT_AUTHOR_DATE` env를 Edge Function으로 노출. `_http.js` `methodGuard`에 `allowed` 인자 추가(디폴트 `['POST']`로 4개 기존 호출자 호환) + `Access-Control-Allow-Methods`에 GET 추가 (cross-origin GET preflight 버그 사전 차단).
- **C. `home.js` 추출 (-455줄):** 홈 프로필 카드, 게임 카드 무한 스크롤, 미니보드 SVG, 시간대 필터, 온보딩 전체 이전. main.js 2,531 → 2,072줄. `initHome({syncBottomNav, SCREENS, handlePgnReviewStart})` — DOM ref는 내부 `getElementById` lookup (DI 백 7→3). `_initialized` 플래그 멱등성 가드. 미니보드 더블 FEN 파싱 제거 — `parsePgnSummary`가 chess.js `c.board()` → cells 직접 반환, `_miniBoardParseFen` 함수 자체 삭제. 미사용 import 13개 main.js에서 제거.
- **D. `styles/tokens.css` 분리 (-118줄):** :root 변수 + 베이스 리셋. cascade 위험 0. **styles.css 본체 분할은 별도 phase로 보류** — 시간순 성장으로 selector가 흩어져 있어(`pill-buttons` 1402, `saved-game-card` 1599 등) 분할이 아니라 selector 의존 추적 + cascade 재배치(=리팩토링) 동반. 그때는 "관련 selector 묶기 + 죽은 코드 제거"가 본질.

**Simplify 패스에서 잡힌 것:**
- 1차: dialogs.js 추출(`window.*` 전역 누설 + 5곳 dead polyfill 제거), Enter 키 안전성, callDB pilot coalescing, `_dbBreakerLogged` derive, WHAT 주석 정리.
- 2차: `_http.js methodGuard` allowlist + GET CORS preflight, `api/version.js` 단일 호출로 단순화, `home.js` `initHome` 멱등성 + DI 백 3개로 축소, 미니보드 더블 FEN 파싱 제거.

**검증 (모두 미리보기 measure + 시각 캡처):**
| 지표 | 이전 | 이후 |
|---|---|---|
| 콜드 로드 `/api/db` fetch | 200+ | **1건** |
| 콘솔 에러/경고 (silent gate) | 카드당 2~3개 | **0건** |
| 미니보드 카드당 FEN 파싱 | 2회 | **0회** (chess.js board() 직접) |
| main.js 줄 수 | 2,531 | **2,072** (-459) |
| 다이얼로그 destructive 자동 cancel focus | — | ✓ |

---

## Phase 37 — sw.js 영구 삭제 (2026-05-05)

**결정: Service Worker는 다시 켜지 않는다.** sw.js 117줄 + vercel.json의 SW 헤더 룰 제거.

**왜:**
- 현재 상태(SW 없음 + manifest.webmanifest만 존재)가 사실상 PWA의 "최선의 변종"으로 동작 중. iOS/Android 둘 다 "홈 화면에 추가" 메뉴 노출 + standalone 풀스크린 + theme-color 통일까지 다 됨. SW가 빠진 대신 **매번 fresh fetch → 자동 업데이트가 깨끗히 동작**. cache-first/network-first 전략을 잘못 짜서 사용자가 며칠씩 stale 버전을 보는 PWA의 가장 흔한 함정에 빠지지 않음.
- 오프라인 동작은 사용자가 "필요 없음"으로 명시. SW의 주된 가치 중 하나가 빠지면 도입 비용(전략 설계 + skipWaiting/claim 타이밍 + API 라우트 우회 + 캐시 버전 무효화 + WORKLOG 새 phase + 검증) 대비 리턴이 음수.
- sw.js 본문 자체에 "재활성화 시 network-first/cache-first 전략 분리 구현 필요" 주석이 박혀 있던 상태 — 의도적으로 쓰던 코드가 아니라 결정 보류 중인 죽은 코드. 미래에 누군가 헷갈릴 여지를 없앰.

**삭제:**
- `sw.js` (117줄)
- `vercel.json`의 `/sw.js` 헤더 룰 (Service-Worker-Allowed + Cache-Control)

**남김:** manifest.webmanifest, apple-touch-icon, theme-color, apple-mobile-web-app-* meta — 이걸로 PWA 설치 경험은 충분.

**main.js의 옛 SW unregister 블록은 영구 보존** ([main.js:2076](main.js:2076)) — Phase 8 PWA 시기에 sw.js를 등록한 적이 있는 사용자 브라우저에 옛 SW가 cache-first로 살아있을 수 있다. 매 로드 시점에 unregister + 캐시 삭제로 그런 사용자도 깨끗한 fresh fetch 경로로 자동 마이그레이션. 죽은 코드가 아니라 자동 업데이트가 매끄럽게 동작하는 핵심 메커니즘.

---

## Phase 36 — 수 입력 → 라이브 분석 모드 (2026-05-04)

기존 별도 `inputView`(보드 입력 전용 화면)을 통째로 들어내고, 분석 화면 UI를 그대로 재사용해 **사용자가 보드에 수를 둘 때마다 단일 엔진이 실시간 분석**하는 모드로 전환. chess.com / lichess의 분석 보드와 동일한 UX.

**왜:** inputView는 수 입력만 받고 PGN을 토출해 따로 분석을 돌리는 구조라 "지금 둔 수가 좋은지" 즉시 알 수 없었음. 같은 분석 패널 자산을 두 벌(메인 분석 view + inputView 보드/textarea/네비) 유지하던 점도 부담.

**진입 + 흐름:**
- 홈 우상단 `+` → `openLiveInput()` — 분석 화면을 빈 큐 + `appMode=LIVE_INPUT`으로 띄움
- `explorationChess.load(START_FEN)` + 시작 포지션 즉시 depth 12로 라이브 분석
- 보드에 수 두면 → `handleExplorationMove`가 explorationChess 갱신 → `kickExploreEngine(fen)` 으로 새 포지션 재분석
- `prevMoveBtn` = `liveInputUndo()` (`explorationChess.undo()` + 재분석). `nextMoveBtn`은 noop — 항상 끝에 있음
- `☰` 오버레이는 explorationChess.history()에서 수 목록 추출

**`APP_MODES.LIVE_INPUT` 도입 ([modes.js](modes.js)):**
- 이전에 `isLiveInputMode` 별도 boolean 플래그로 시작했다가 dispatch 분기가 4곳(prev/next/handleExplorationMove/movesOverlay)에 흩어지면서 mode enum으로 흡수
- `handleExplorationMove`의 "MAIN→EXPLORE 전환" 블록 조건에 `&& appMode !== LIVE_INPUT` 추가해서 라이브 모드 진입 후 첫 수 둘 때 EXPLORE로 강제 전환되지 않게 가드

**`kickExploreEngine(fen)` 헬퍼:**
- `openLiveInput` / `liveInputUndo` / `handleExplorationMove` 세 군데에 흩어져 있던 "stop + clear engine lines + reset top eval + container message + status tag + analyzeFen" 시퀀스를 단일 헬퍼로 통합
- depth 결정도 헬퍼 안: `appMode === LIVE_INPUT ? LIVE_INPUT_DEPTH(12) : getDepth()` — 라이브 모드는 매 수 즉응성 우선, explore 모드는 사용자 설정 depth 따름
- 매 호출마다 `getEngine().stop()` 먼저 — Stockfish 중간에 새 `position`/`go` 들어와도 안전하게 시작

**Depth 12 락 (렉 방지):**
- 기본 분석은 depth 14 ([Phase 24](#phase-24)) — 매 수마다 1~2초 걸려서 라이브 모드엔 부적합
- 12로 내리면 한 수당 200~500ms — 실시간 사용 무리 없음

**PGN/FEN 붙여넣기 분리 ([index.html](index.html)):**
- 우상단에 `📋` paste 버튼 추가 (라이브 모드에서만 노출), 누르면 `livePasteModal`
- 모달 내 textarea 입력 → PGN/FEN 자동 분기
  - `isValidFen(text)` → `handleFenReviewStart` (단일 포지션)
  - 그 외 → `handlePgnReviewStart` (풀 배치)
- 라이브 입력 상태 cleanup은 `startNewAnalysis`로 흡수 — paste 핸들러는 라우팅만

**분석 화면 UI 그대로 유지:**
- `setLiveInputControls(active)`는 라이브 전용 paste 버튼만 토글 — Save / AI 토글 / 분류 라벨 / 구분선 / 평가는 분석 화면과 동일하게 노출
- Save: `choiceSaveMoveBtn`에 라이브 분기 추가 — `explorationChess.history()` 마지막 수 + 현재 top engine PV를 vaultSnapshot으로 캡처. `confirmSaveBtn`은 `appMode===LIVE_INPUT`일 때 PGN을 `explorationChess.pgn()`에서 추출
- AI: 호환 단계 미개통. 클릭 시 기존 `gemini_no_start` 안내(빈 큐 가드 그대로). 후속 phase에서 explorationChess + explorationEngineLines 기반으로 라이브 분석 가능하게 확장 가능

**라이브 수 분류 (Best/Mistake/Blunder/...):**
- `handleExplorationMove`가 라이브 모드에서 `analysisQueue.push({ fen, san, from, to, promotion, isWhite, moveNumber, engineLines: [] })` — classifyMove가 직전 포지션의 engineLines를 참조하도록 인덱스 일관성 유지
- `engineCallbacks.onBestMove`가 라이브 모드에서 새 분석 완료 시: `analysisQueue[idx].engineLines = explorationEngineLines.slice()` → `classifyMove(idx, analysisQueue)` → 라벨 + 보드 위 배지(`showPieceBadge`) 갱신
- `liveInputUndo`가 `analysisQueue.pop()`도 같이 — 한 수 빼면 큐도 동기 축소. 배지는 직전 분류로 자동 redraw
- **Stale info 필터** (`engineCallbacks.onEval`): `getEngine().stop()` 직후 워커가 OLD 포지션의 잔여 info를 emit하는 경우가 있음. PV 첫 수의 from-square에 현재 차례 기물이 없으면 그 라인 버림 — 가벼운 검증으로 stale onBestMove까지 빈 lines로 막아서 분류는 새 분석 결과로만 산출됨
- 첫 수는 `prevTopMoveUci=''` + `previousEvaluation={cp:20}` 베이스라인으로 분류 — Brilliant/Great 검출은 안 되지만 Best/Excellent/Good/Inaccuracy/Mistake/Blunder는 정상 동작. 두 번째 수부터 직전 포지션의 engineLines를 참조해 정밀 분류

**검증 (preview):**
- e2-e4 → BEST (52%) ✓
- g7-g5 (의도적 약수) → MISTAKE/INACCURACY (63%) ✓ — 보드 g5 위에 분류 배지 표시
- prev 1회 → 직전 분류(BEST)로 라벨 복귀 ✓

**Save 라우팅 — 라이브 모드도 saved_games / vault 둘 다 정상:**
- `saveChoiceModal`은 원래부터 "Save This Move(Vault)" / "Save Entire Game(saved_games)" 두 갈래
- 이전엔 Vault(`choiceSaveMoveBtn`) 분기만 라이브 모드 처리했음 → "Save Entire Game"(`choiceSaveGameBtn`)이 `_getChess().pgn()`을 호출하는데 라이브 모드에선 메인 chess가 비어 있어 빈 PGN 저장됨
- 픽스: `initSavedGames`에 전달하는 `getChess` 콜백을 `() => appMode === LIVE_INPUT ? explorationChess : chess`로 — 모드에 따라 적절한 인스턴스 반환
- 검증: 라이브로 `1. e4 e5 2. Nf3 Nc6` 두고 "전체 게임 저장" → `localStorage.blundermate_saved_games`에 `pgn: "1. e4 e5 2. Nf3 Nc6"` 정상 보존

**라이브 액션바 (Undo / Reset / PGN) — 분석 화면 하단 전용:**
- 홈 bottomNav 시각 결을 그대로 차용 — `position: relative + flex-shrink: 0`로 분석 view의 마지막 자식. 56px + safe-area, 3등분 flex
- Undo (실행취소): `analysisQueue.pop()` + 새 tail로 nav. 캐시된 engineLines 있으면 즉시 표시, 없으면(첫 수 후 undo로 시작 포지션 도달 등) 엔진 재시작
- Reset (처음부터): `setQueue([]) + clearPersistentShapes()`로 모든 수 제거. `syncLiveStateToIndex(-1)`로 시작 포지션 진입 + 엔진 재시작
- PGN: 기존 paste 모달 그대로 — 우상단 📋 → 하단 액션바로 이동. top bar는 이제 분석 화면과 100% 동일 (back / 워드마크 / ☰)

**prev/next는 navigation 본연 역할로 복원:**
- 이전 단계에선 라이브 모드의 prev = `liveInputUndo`로 매핑했었음. 사용자 피드백 후 분리: prev = "직전 위치로 navigate" (history 보존), Undo는 액션바의 별도 버튼
- `liveInputNavigate(delta)`: `currentlyViewedIndex ± 1`, queue 보존. 캐시된 engineLines 있으면 엔진 재시작 없이 즉시 렌더 (분석 화면 navigation과 동일 결)
- `syncLiveStateToIndex(idx)` 헬퍼: navigate / undo / reset 모두 공통. explorationChess를 idx 위치로 replay → 보드 동기 → 캐시 cache hit이면 렌더, miss면 `kickExploreEngine`

**Fork 처리 (중간에서 새 수 두면 분기):**
- `handleExplorationMove`이 라이브 모드에서 `currentlyViewedIndex < analysisQueue.length - 1`이면 `analysisQueue.length = currentlyViewedIndex + 1`로 truncate 후 새 수 push
- 사용자가 e4/e5/Nf3 두고 prev 2번으로 e4 직후로 가서 c5(시실리안) 두면 e5/Nf3 라인은 사라지고 e4/c5 라인이 됨

**검증 추가:**
- prev 1번 → EXCELLENT(e5의 캐시 분류) ✓
- prev 1번 더 → BEST(e4의 캐시 분류) ✓
- next 1번 → EXCELLENT(다시 e5) ✓
- Undo → 마지막 수 pop, 새 tail 분류 표시 ✓
- Reset → 시작 포지션 + 엔진 재시작 ✓
- Fork: prev 2번 후 c5 → e5/Nf3 라인 truncate, c5가 EXCELLENT로 분류 ✓

**삭제 (총 −137줄):**
- `inputView` HTML 블록 / `.input-pgn-area` · `.input-pgn-textarea` · `.input-secondary-btn` · `.input-analyze-btn` CSS
- `inputChess` · `inputCg` · `inputViewIndex` · `inputStartFen` 상태 / `openInputView` · `getInputViewChess` · `handleInputBoardMove` · `updateInputBoard` · `buildInputMovesQueue` 등 8개 함수
- 5개 입력 뷰 버튼 핸들러
- `SCREENS.INPUT` 라우트
- `input_*` i18n 키 5종

**검증 (preview):**
- 시작 포지션 즉시 53% / depth 12 라인 3개
- e2-e4 두면 흑 응수 라인(`d5/e5/e6`)으로 갱신
- prev로 undo → 다시 백 후보(`e4/d4/Nf3`)
- 📋 → 모달 → PGN 입력 → 색 선택 → 배치 분석 → 리뷰 화면 (정확도 99.2%/99.7%) e2e 통과

**의사결정 메모 — 라이브 모드에 분류/그래프/AI/Save를 어디까지 채울까:**
- 첫 시도는 4개 다 살리려 했음 (chess.com/lichess가 그렇게 해서). 하지만 라이브 분류 = 직전 eval 캐시 + classifyMove를 explore 콜백에 push하는 새 흐름이고, 그래프 = `analysisQueue` 기반 재구조화 필요. 한 번에 다 넣으면 phase 길이 폭증
- 일단 라이브 = "엔진 평가 + PV 패널만" 좁은 v1. 그 외(AI/Save/분류/그래프)는 발견점 자체를 숨김. 후속 phase에서 라이브 분류부터 (직전 eval만 캐시하면 즉시 라벨 가능 — 비용 작음)
- `appMode` 4값(MAIN/EXPLORE/LIVE_INPUT/SIMULATE) + isPreview/isReview 플래그 2개로 모드 공간 정리 — 5번째 라이브 모드 분기가 추가될 때 충돌 신호로 봐야 함

---

## Phase 1 — 초기 프로토타입 (~0407)

- 모바일 우선 PGN 리뷰 앱 골격 (`Initial commit`, `3233062`)
- 체스 보드 크기 최적화, 모바일 UI 적용
- 수 평가 알고리즘 도입 (`378afcf`)
- 게임 저장 기능 (`e66f040`)

## Phase 2 — Gemini AI 연동 (~0409)

- Gemini 2.5 Flash 연동, SSE 스트리밍 (`cb3dfe1`, `36c23a3`)
- iOS Safari 호환성 해결 (`af91925`)
- `api/analyze.js` Vercel Edge Function — API 키 서버사이드 격리

## Phase 3 — 분석 화면 UI 재설계 (Claude Code 도입 후)

- Chess.com/Lichess 스타일 분석 뷰 (`0629a52`)
- eval 바 대칭, 상단 바 중앙정렬, 평가치 그래프
- 컨트롤 바 + 탭 바 통합 (‹ Engine · Save · AI ›)
- 기보 오버레이(☰ 슬라이드업) 추가 (`0b0e940`)
- 시뮬레이션 패널, 엔진 라인 UI 개선
- AI 해설 어조 개선, maxOutputTokens 2048, 마크다운 렌더링

## Phase 4 — 홈 화면 재설계

- 카드 제거, 플랫 레이아웃, 버튼 개편 (`2cee942`)
- State A/B 두 상태 레이아웃 (`8d1971b`)
- 하단바 분류 라벨, 구분선
- 승률 표시, 진영 선택 모달

## Phase 5 — i18n & 데스크탑 대응

- 한국어/영어 언어 전환 (`1932dd5`)
- 데스크탑 와이드 레이아웃 중앙 정렬, 최대 너비 제한
- 브라우저 언어 자동 감지 (`e4d810b`)

## Phase 6 — Supabase 연동

- 초기 Supabase UI (`09d4f2a`)
- 피드백 저장: `api/feedback.js`에서 PostgREST 직접 호출 (SDK 미사용)
- Vault/Saved Games는 localStorage 유지 — 추후 Supabase 전환 예정 (`storage.js`가 추상화 계층)
- `api/db.js`에 `user_id` 검증 추가 (DELETE/INSERT spoofing 차단, `f1f6658`)

## Phase 7 — 복기(Vault) 기능

- Vault 모듈 분리 (`vault.js`, `6c12ee4`)
- 분석 화면에서 Vault 항목을 전체 게임으로 열기 (`5f80a0d`)
- PGN 다운로드, 수 두기(탐색 모드)

## Phase 8 — 시작화면 / PWA / 정리

- 시작화면 개선 (`f91bbd6`)
- PWA 도입 후 제거 (`49c5dc4` → `1e75ddd`)
- 0수 리포트 통합 (`649660b`)

## Phase 9 — Vault 버그 수정 (2026-04-19)

- **저장 버그** (`4561386`): 모달 열림 시점에 `vaultSnapshot`으로 즉시 캡처 — 모달 후 인덱스 변경에 영향 안 받게
- **조회 버그** (`c1664a9`): `findMoveIndexByFen()` 추가, Supabase에 `move_index` 등 누락 필드 저장. 3단계 인덱스 결정(직접 → FEN 매칭 → 폴백)

## Phase 10 — 홈 화면 최근 게임 카드

- 진영 아이콘(♙/♟) → 세로바 인디케이터로 전환
- 상대 닉네임/레이팅, 레이팅 변화 diff
- 타임컨트롤 변환("600" → "10분"), 상대 날짜
- Chess.com stats API로 Rapid/Blitz/Bullet 레이팅 헤더 표시
- 인사말 1줄로 통합 (`bywxx · Rapid 1120 · Blitz 694 · Bullet 364`)

## Phase 11 — OG / SEO / FEN 입력

- OG / Twitter Card 메타 + `og-image.png` (`80d0d79`)
- FEN 입력 단일 포지션 분석 (`423d5a6`)
- Vercel Analytics 연결

## Phase 12 — SPA & eval 관례 변경

- History API 기반 SPA 네비게이션 — 모바일 뒤로가기 버그 수정 (`dc98a26`)
- eval 표시를 엔진 관례(+ = 백 유리)로 통일, 승률 %는 유저 관점 유지 (`e0e37b9`)
- 체크메이트 수가 Blunder로 분류되는 버그 수정 (`af56099`)

## Phase 13 — 코드 정리 & 홈 개선

- `styles.css` 죽은 코드 434줄 제거 (`53707be`)
- 홈 프로필 카드, 페어 버튼, 레이아웃 재정렬 (`63ebfcd`)
- i18n 하드코딩 문자열 일괄 전환
- 게임 스크롤 박스 6.5 → 4.5개, 모달 오버플로 방지
- 닉네임 길이별 폰트 축소
- 탐색 모드 평가치 표시, 엔진 depth 설정 추가
- 오프닝 한국어 표시 (ECO 30개 하드코딩 + 범위 fallback, `6f4e29c`)

## Phase 15 — 홈 프로필 카드 + 티어 + 바텀 네비 (`525bace`)

- 홈 프로필 카드, 티어 시스템, 바텀 네비게이션

## Phase 16 — 분석 컨트롤러 모듈 분리 (`05a1daa`)

`main.js`의 23개 전역 상태 → 4개 모듈로 캡슐화:

- **`analysis.js`** — 엔진 + 큐 라이프사이클 (stockfish, ANALYSIS_DEPTH, analysisQueue, currentAnalysisIndex, isAnalyzing, isWaitingForStop, pendingQueue, pendingTargetIndex). `scheduleRestart`/`consumePendingRestart`로 비동기 stop+재시작 패턴 일원화
- **`board.js`** — 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes)
- **`modes.js`** — 동작 모드 (appMode, explorationChess, explorationEngineLines, simulationQueue, simulationIndex, isPreviewMode)
- **`gemini.js`** — 자체 상태 내장 (isGeminiLoading, geminiAbortController, isGeminiEnabled). `getState/setState` 콜백 제거하고 직접 import

**뷰 가시성 단일화:** `main.js`의 `renderScreen`이 모든 view 표시/숨김을 단독 관리. vault/savedGames/insights 모듈은 데이터 로드(`loadXxxData`)만 담당 — 새 화면 추가 시 형제 모듈 수정 불필요.

## Phase 17 — 0수 화면 통일 + 리포트 5단계 카드 (`4323763`, `af86bf8`)

- **0수 화면** 미리보기 화면 양식으로 통일, dead code 제거
- **`isReviewMode` 도입** — `-1` 인덱스 = 전체화면 리뷰. ☰ 오버레이 "리뷰 보기" 진입점, 0수에서 prev로도 진입
- **리포트 5단계 카드:**
  1. 게임 헤더 (오프닝/타이틀/결과)
  2. Hero 정확도 (56px + 상대 비교)
  3. 수별 평가 차트 (16:4)
  4. 수 분류 표
  5. "첫 수부터 복기" CTA
- 홈 시간대 필터(전체/래피드/블리츠/불렛, 기본 래피드) — 선택 시 게임 목록 + 프로필 레이팅·티어·W/L/D 동기 갱신
- 게임 fetch 30 → 100개 + 홈↔통계 캐시 공유
- `countMovesFromPgn`을 chess.js 기반으로 정확화 (PGN 헤더 날짜 점 매치 버그). insights는 정규식 fast path로 100배 단축
- 통계 진입 잔렉: rAF + setTimeout으로 무거운 계산 deferred
- 설정 모달: 피드백 버튼 홈 → 설정 이동

## Phase 18 — 통계(insights) 화면 + 오프닝 그룹화 (`e96dc0b`, `81a3d17`)

- **`insights.js`** — 통계 화면. 진영/시간제어별 승률, Top5 오프닝, 게임 길이/종료 사유/시간대별 분포. 바텀 네비 4번째 탭
- 상단 두 필터 바 (전체/래피드/블리츠/불렛, 전체/백/흑). 캐시된 100게임에서 클라이언트 사이드 필터 — 재 fetch 없음
- subtitle 동적 결합: "최근 100게임 중 래피드 · 백 N개"
- 필터 활성 시 byColor/byTimeClass 카드 자동 숨김 (redundant 제거)
- **`utils.rootOpeningName`** — chess.com ECOUrl 슬러그가 변종까지 포함해 같은 루트가 분산되는 문제 해결. 첫 root 키워드(Gambit/Defense/Game/Opening/System/Attack)까지 자름. 통계 화면만 적용
  - "Scotch Gambit Haxo Gambit Sicilian" → "Scotch Gambit"
  - "King's Indian Defense Advance" → "King's Indian Defense"
- `styles.css` 빈 룰셋 제거 + 섹션 헤더 정돈

## Phase 19 — 닉네임 로깅 & lowercase 정규화 (`0e7c464`, `5918500`)

- **`api/log-username.js`** — 새 Edge Function. `username_logs` 테이블로 fire-and-forget INSERT (source: onboarding/search/cached, 64자 cap)
- `main.js`에 `logUsernameToServer` 헬퍼 — localStorage 기반 source+username dedup, 실패 무시. 온보딩 제출 / 유저 검색 / 캐시된 기존 사용자(첫 방문 1회) 3개 지점에서 호출
- `supabase-username-logs.md`: 테이블 생성 SQL + RLS(anon INSERT only) + 조회 쿼리
- 기존 `CLAUDE.md`/`README.md`/`CHANGELOG-2026-04-19.md`/`supabase schema reference.md`/`instructionsnow.md` 5개 문서 → `worklog.md` 단일 파일로 통합
- **잠수함 패치 — 닉네임 lowercase 정규화:** Chess.com이 대소문자 구분하지 않으므로 클라이언트/서버 양쪽 경계에서 lowercase 통일. 같은 유저가 케이스 바꿔 입력해도 vault/saved_games/username_logs가 분산되지 않음
  - `storage.js` setMyUserId/getMyUserId 양쪽 lowercase, read 시점 자동 정규화 (마이그레이션 불필요)
  - `api/db.js` select/insert/delete 진입 시점에서 user_id 정규화 (구버전 클라이언트 호환)
  - `chessApi.js`가 chess.com의 캐노니컬 케이스(`player.username`)를 displayName으로 반환 — 홈 프로필은 lowercase로 잠시 보였다가 displayName으로 갱신
  - `supabase-username-logs.md`에 일회성 lowercase 마이그레이션 SQL 추가

## Phase 20 — 통계 시간 카드 + 리포트 4단계 + 티어 모달 (`0dbf2fe`)

- **`utils.js` 클럭 파싱 헬퍼** — `extractClocks` / `parseInitialTime` / `parseIncrement` / `extractMoveTimesForUser`. chess.com PGN의 `{[%clk]}` 주석 기반. correspondence/clock 없는 게임은 자동 스킵
- **통계 시간 카드 4종** (insights.js): 평균 사고 시간 / 단계별(오프닝·미들·엔드) / 시간 압박(잔여 ≤10초 비율) / 즉답 비율(<3초 비율). 분석 화면은 정보 밀도 부담으로 통계에서만 노출
- **분석 리포트 5 → 4단계 축소:** Hero 정확도 카드 제거 (표에 정확도 행이 이미 있어 중복). 헤더/차트/통계표/CTA만 남김. 관련 i18n 키(`review_accuracy_yours/opponent`), CSS(`.review-hero-*`) 모두 정리
- 홈 `home-ad-space` placeholder(60px) 제거 → 게임 카드 1개 더 노출
- **티어 라벨 → 버튼 + 랭크 모달:** 탭 시 TIERS 데이터로 동적 생성, 현재 티어 행 강조

## Phase 21 — Stockfish 워커 풀 병렬화 + 로딩 명언 + 피드백 FAB (`1cea959`)

- **`engine.js`에 `EnginePool` 추가** — N개 독립 워커 인스턴스, Hash 32MB 옵션, `parseEvalLine` 공유. 배치 분석을 진짜 병렬로 처리
- **`analysis.js` 배치 경로 재작성** — 풀 promise 기반으로 전환. `currentAnalysisIndex`/`processNext` 제거, scheduleRestart는 explore 전용으로 축소
- `main.js`: `engineCallbacks`를 explore 전용으로 축소, 배치 dead writes 청소, `cleanupAnalysis`에 analyzeBtn 활성화 보강
- **로딩 카드** — 명언 100선(`quotes.js` + `quote.json`) + 진행률 % 바. 0수/preview 골격 유지하며 보드만 카드로 교체
- **피드백 FAB** — 홈 우측 하단, 기존 피드백 모달 재사용

## Phase 23 — cp ↔ win% 단일 소스 (freechess 본가 방식 회귀)

Phase 22에서 도입한 SF18 WDL 기반 win%가 표시 cp(정규화)와 모순되는 문제 해결.

**문제:** SF18은 NNUE의 WDL을 직접 출력하면서, cp 출력은 정규화된 값(100cp ≈ 50% 승률)으로 압축. WDL은 NN 분포 직접 / cp는 압축된 다른 모델이라 같은 포지션이 두 모델로 평가되어 "+1.5인데 99%?" 같은 모순 발생.

**중간 시도 폐기:** WDL을 살리고 표시 cp를 역시그모이드로 파생하는 방식도 시도했지만, 그 경우 표시 cp가 SF의 실제 평가가 아닌 Lichess 곡선 위의 가짜값이 되고 분류용 cp(raw)와도 달라져서 폐기.

**최종 해결:** **freechess 본가와 동일하게 raw cp + Lichess 시그모이드 단일 소스**. SF NN의 WDL은 사용하지 않음.

- 표시 cp = SF raw cp ("+1.5") — 엔진 그대로 정직한 값
- 표시 win% = `cpToWhiteWinPct(scoreNum)` ("63%") — 같은 cp의 시그모이드 변환
- 정확도 / 그래프 / 분류 모두 동일한 raw cp 기반 → 완전 일관

**트레이드오프:** SF NN의 진짜 확신도(결정적 엔드게임에서 99%)는 잃음. 정직성과 일관성을 우선시한 결정.

- `utils.js` — `cpToWhiteWinPct` 단일 헬퍼. `wdlToWhiteWinPct`/`getDisplayScore`/`whiteWinPctToDisplayPawns` 모두 제거
- `analysis.js` / `main.js` — engineLine에서 `whiteWinPct` 필드 제거. WDL 분기 삭제
- `ui.js` — `updateTopEvalDisplay(scoreStr, ...)` scoreStr만 받음. `evalToWinChance`는 `cpToWhiteWinPct`에 위임
- `engine.js` — `setoption UCI_ShowWDL value true` 송신 제거 + `parseEvalLine`의 wdl 토큰 파싱 제거

## Phase 24 — 엔진 평가 코드 정리 + depth 14 기본 (`64a8976`, `a6eccc6`)

WDL 도입/회귀 와리가리하면서 남은 잔재 정리, 그리고 Phase 21 워커 풀 이후 체감 속도 여유로 기본 depth 상향.

- `classifyMove`/`runBatch`의 `isUserWhite` 파라미터 제거 — 받기만 하고 안 씀
- `cpToWhiteWinPct` / `computePlayerAccuracy` / `updateTopEvalDisplay` 주석에서 WDL 결정 히스토리 제거
- `ui.js` `'evalDisplayMode'` 하드코딩 → `EVAL_MODE_KEY` 상수
- **기본 depth 12 → 14** — quiet move의 Best/Excellent 구분 등 분류 정확도 향상. 설정 모달에서 명시 저장한 사용자는 자기 값 유지(localStorage 우선), 그 외는 자동 14 적용

## Phase 26 — Vault 자동 블런더 수집 + 퍼즐 보기 모드 (`6d64477`)

수동 저장에 의존하던 vault에 자동 수집 + 출제 모드 추가. 분석 끝나면 손 안 대도 풀이 채워지고, 별도 탭에서 무작위 출제됨.

**자동 수집 (`autoBlunders.js` — 신규):**
- 분석 `onComplete` 직후 호출. 사용자 수만 대상으로 두 종류 후보 추출:
  1. **워스트 2** — `classification ∈ {Mistake, Blunder}` 중 CPL 내림차순 상위 2
  2. **missed_mate** — 직전 top eval이 mover에게 mate-in-1~4였는데 그 수를 안 둔 케이스
- 한 인덱스가 두 분류 모두 걸리면 **missed_mate 우선**
- `cp→mate`로 끌려간 케이스는 cpLoss 계산 불가 → 큰 가상값(9999)으로 정렬 보장
- **dedup은 `position_fen` 기준** — 같은 포지션이 다른 게임에서 재발해도 한 번만 저장
- 에러는 토스트 없이 `console.warn`만 — 백그라운드 fire-and-forget

**`analyzed_games` 테이블 분리:**
- vault_item마다 PGN을 들고 다니면 한 게임당 N행 중복 → 한 게임당 1행으로 분리
- `vault_items.analyzed_game_id`로 참조, `source='auto'` row는 `pgn` 컬럼이 NULL
- `pgn_hash` (SHA-256) upsert 키 — 같은 PGN이면 재삽입 안 함
- legacy `manual` row는 그대로 PGN 직접 보관 (호환)

**Vault UI — 텍스트 탭 (목록/보기):**
- **목록** = 기존 수동 저장 vault_items
- **블런더 목록** 서브뷰 — 자동 풀 전용 리스트
- **보기** = 자동 풀에서 무작위 출제 → 직전 포지션 보드 표시 → 한 수 입력 → `bestUci` 비교 → 다음 문제
- 모드 진입 시 항상 `list` 리셋 (퍼즐 후 재진입 자연스러움)

**기타:**
- `api/db.js` 화이트리스트에 `analyzed_games` 추가 — 허용 컬럼은 `pgn_hash` / `id`만 (SQL 분리 차단)
- `storage.js`에 `computePgnHash` / `upsertAnalyzedGame` / `addVaultItemsBatch` / `getAnalyzedGameById` 추가, `ANALYZED_GAMES_KEY` localStorage 폴백

## Phase 27 — Vault 재구조화: 분류축 전환 + 자동 다음 제거 (`d311f81`)

직접/자동(source)을 1차로 두던 분류를 실수/메이트/기타(category)로 갈아끼우고, 풀이 진행을 사용자가 직접 넘기도록 한 단계 큰 정리.

**왜 바꿨나:** vault 진입 시 사용자 머릿속 첫 질문은 "어떻게 들어왔는지"가 아니라 "뭘 풀까". 풀이 UX도 cp 실수(한 수 비교)와 메이트(엔진 응수까지 따라감)가 갈라지는 게 본질이라 그쪽이 1차 분류로 자연스러움. 직접 저장은 사용량이 적어 보조로 내려도 손실 작음.

**분류축 전환:**
- `categorize(item)` — `mistake`/`blunder` → 실수, `missed_mate` → 메이트, 그 외(`positional` 등) → 기타. source 무관.
- `_autoItemsCache` → `_itemsCache`로 이름 변경, manual+auto 통합. `getVaultItems({source})` 필터 호출 제거.
- `deckState` 3개(mistake/mate/other), 각자 stories history 위치 독립 유지.
- '**기타**' deck — 정답 없는 감상용. 보드 인터랙션 잠금, 노트+수 표시, 진입 즉시 좌/우 탭존 활성. positional 직접 저장이 들어갈 자리.

**자동 다음 제거:**
- `_autoNextTimer` / `AUTO_NEXT_DELAY` / `scheduleAutoNext` / `cancelAutoNext` 전부 삭제. 풀이 deck도 정답/오답 후 사용자가 직접 좌/우/화살표/다음 버튼으로 넘김.
- 풀이 deck은 풀이 완료 후, 'other' deck은 진입 즉시 탭존/화살표 활성.

**진입 즉시 stories:**
- 옛 `vaultModeTabs`(목록/보기) 제거 — 진입하면 바로 stories pane.
- 보조 리스트는 우상단 ☰(`vaultListLink`)로 진입. 게임 날짜(`played_date`) desc, NULL이면 `created_at` 폴백 정렬.

**`played_date` 컬럼 추가:**
- 자동/수동 두 출처가 같은 정렬 키를 공유하도록 `vault_items.played_date` 신설. autoBlunders는 PGN `UTCDate||Date`에서, 수동 저장은 `chess.header()`에서 추출. `storage.js`의 normalize 2곳(Supabase row / localStorage) + insert 매핑 일관 처리.
- 옛 자동 항목은 `analyzed_games.played_date`로 1회 백필 SQL 제공. 옛 수동 항목은 PGN을 SQL로 못 파싱하니 NULL 유지(폴백으로 자연 처리).

**`navigateTo` 일원화 (부수 수정):**
- `vault.js`가 `_navigateTo('vault_blunder_list')`만 호출하던 ☰/detail 진입로가 `history.pushState`만 되고 `renderScreen`이 안 돌아 화면이 안 바뀌어 사용자 시각엔 무반응. main.js `navigateTo`가 `pushState + renderScreen`을 한 호출에 처리하도록 일원화.
- bottom nav 4곳의 `navigateTo + renderScreen` 중복 호출도 정리 — 옛날엔 `loadVaultData` 등 데이터 로드가 nav 한 번에 두 번 돌던 부작용도 사라짐.

**UI 안전망:**
- vault stories 세로 부족 시 다음 버튼이 viewport 밖으로 밀리던 이슈: `vault-puzzle-stage`에 `overflow-y: auto`, 분석 화면 기준이던 board `max-width`를 vault 전용으로 빡빡하게(`calc(100dvh - 340px)`).

## Phase 28 — 분석 화면 컨트롤바 재배치 + 엔진라인 상단 이동 시도 폐기 (`18023a6`, `f400daa`)

분석 화면 정보 계층을 정리해보려 한 일련의 실험. 아이디어로 시작해 일부는 본선 진입, 일부는 폐기.

**시도(폐기됨) — 엔진라인을 보드 위로:**
- vault stories의 prompt 영역과 같은 리듬으로 PV 2줄 + 평가 row를 보드 위에 상시 노출, 보드 아래는 [AI 물어보기/저장/<>] 단순화. 위(엔진의 시선) ↔ 아래(내 시선) 이분 구조 의도.
- 두 커밋(`06070db` engineLines 위로 이동, `14742df` PV 2줄 + info row + 컨트롤바 재구성)으로 진행했으나 **분석화면이 vault stories와 너무 닮아 정체성이 흐려짐** — 사용자 피드백으로 두 커밋 모두 force-reset(`741e606`로). 빈 커밋(`d025723`)으로 재배포 트리거.
- 폐기 이유 기록: 시각언어 일관성 ↑은 매력적이었지만, 분석화면이 "vault 형제"가 되면 화면 자체의 무게감이 떨어짐. 보드 위는 비워두고 정보는 컨트롤바·패널에 모으는 기존 구조가 더 분석적이라는 판단.

**적용된 것 — 컨트롤바 재배치(`18023a6`):**
- 좌(prev/AI) → (AI/저장), 우(저장/next) → (prev/next). 평가(분류·승률)는 중앙 유지.
- 바 높이 44 → 52px, 보드 `max-width` 259 → 267px로 보정 (vault detail 포함 글로벌 .board-container 영향).

**버튼 크기·간격 정리(`f400daa`):**
- AI(텍스트, ~24px) vs 저장(아이콘, 36px)의 폭 불균형 + AI에 min-height 없어 터치 타겟 작던 문제. 모든 버튼 44×44로 통일, ctrl-group 내 4px gap, AI에 active 스케일 피드백 추가. 좌·우 그룹 폭 92px로 대칭.

## Phase 29 — vault 표기/레이아웃 일관화 + 통계 8 카드 추가 + 시각 재편

vault 표기·레이아웃 안정화부터 통계 화면 대규모 확장·시각 재편까지 한 세션에 묶음. **모든 통계는 stockfish 없이** chess.com PGN/헤더 + vault 자동 수집 데이터로 도출 (사이트 정체성: 체스닷컴 리뷰 못 돌리는 사람 대상).

**vault 표기 일관 (사이트 정체성 = blunder + mate):**
- `vault_puzzle_find_mate` "외통" → "메이트"
- 풀이 모드 카테고리 라벨 "실수" → "블런더" (mistake+blunder cp 손실 통합 카테고리)
- onboarding tagline "체스 실수" → "블런더와 놓친 메이트"
- `vaultDetail`의 raw `item.category` 노출 버그 수정 — `categoryVisual()` 의 한국어 라벨 사용

**vault 보드 y좌표 픽셀 락:**
- filter-tabs(30px), indicator(26px), prompt(50px) 모두 `height` 명시 + `box-sizing: border-box`. min-height 사용 금지.
- prompt 안 헤더(20px line-height/height) + subhead(16px) 픽셀 박스로 — 한/영/숫자 mix와 폰트 weight 변동에도 동일.
- 카테고리(블런더/메이트/기타) 전환 시 보드 윗변 1픽셀 흔들림 없음.
- indicator `MAX_INDICATOR_SEGS=12` cap, 초과 시 우측 카운터(`5/30`)로 보강.
- 빈 `.vault-info-row` 자동 숨김 (`:has(:empty)`), "다음" 버튼 풀 상태별 라벨 (`다시 풀기` / `처음부터` / `다음`).

**root 탭 back 버튼 제거 (iOS 패턴):**
- vaultView, savedGamesView, insightsView 의 top-bar 에서 back 버튼 제거 — bottom-nav 가 root 진입점이라 중복.
- drilldown(vaultDetail, vaultBlunderList) 은 back 유지.
- top-bar grid `1fr auto 1fr` 슬롯 균형 위해 `<div class="top-bar-spacer">` 보강 (title 중앙 정렬 보존).

**CSS 청소:**
- 데드 셀렉터 제거 — `.input-controls`, `.vault-mode-tabs`, `.vault-sub-row`, `.vault-sub-link` (Phase 27 에서 구조 제거됐는데 CSS만 남아있던 것)
- `!important` 1건 (`.empty-state padding`) 제거 — 오버라이드 없는데 박혀있던 잔재
- 데드 i18n 키 제거 — `vault_unknown`, `insights_filter_tc`, `insights_filter_color`

**통계 신규 8 카드:**
- 상대 레이팅별 성적 (5단 버킷: ≤−200 / −100 / 비슷 / +100 / ≥+200)
- 첫 수 (백 게임만, e4/d4/c4/Nf3/기타) — 표본 ≥5 일 때만 노출
- 캐슬링 패턴 (kingside/queenside/none)
- 거래 활동 (캡쳐 비율 → 소극/균형/활발/공격 라벨, 임계 12/20/28%)
- 요일별 성적 (월~일)
- 자주 만난 상대 Top 5 (≥2판)
- 레이팅 변화 (시작→끝 델타, 최고/최저) — 단일 시간제어 필터에서만
- 블런더 핫스팟 (vault auto items moveNumber 5수 단위 히스토그램)

**통계 시각 재편:**
- **컬럼 차트** (`renderColumnChartCard`) — 분포 카드는 7-row WDL 대신 vertical bar chart. 막대 높이 = 표본. 적용: 요일/시간대/상대레이팅/첫수/핫스팟.
- **2/3-up 페어링** (`.insight-pair`, `pairCards()`) — 작은 metric 카드(평균/압박/즉답/거래) 사이드바이사이드. 360px 미만 1열 fallback.
- **6 카테고리 탭** (요약/오프닝/시계/시간/사람/약점) — `insightsCategoryFilter` state, 본문 분할로 스압 감소. 가로 스크롤 폴백.
- **iOS 세그먼트 컨트롤** 필터 (`.pill-filter-bar--insights` modifier) — 둥근 컨테이너, 선택 셀 강조.
- **좌우 정렬** — 시간제어 left, 진영 right (`justify-content: space-between`). 카테고리 탭도 동일 패턴 (6 탭 균등 분포).
- **WDL row 헤더 분리** (`.insight-row-header`) — label-left / %-right column 정렬. row 간 % 비교 시각 쉬움.

**오프닝 root + variant 합성 (`utils.subVariantName` / `compactOpeningLabel`):**
- `Sicilian Defense Najdorf Variation` / `Sicilian Defense Dragon Variation` 등 같은 root 의 다른 variant 가 별도 버킷으로 분리. root 의 trailing `Defense/Game/Opening` 스트립해 `Sicilian Najdorf` / `Sicilian Dragon` 라벨로 컴팩트.
- 변종 없을 땐 root 그대로 유지.

**기타:**
- `getMyUserId()` 미설정 시 vault 핫스팟 `getVaultItems({source:'auto'})` 가 localStorage 폴백으로 동작
- chess.com 게임 + vault 핫스팟 병렬 `Promise.all` 로 동시 fetch (insights 진입 시간 단축)

## Phase 30 — Saved Games 화면 리팩터 (`2afc008`)

저장 게임 카드를 home/vault 카드 결과 통합하고, 카드 외부 휴지통을 편집 모달 안 destructive 버튼으로 옮긴 정리 작업.

**카드 단순화:**
- 휴지통 아이콘 / 카테고리 pill / 날짜 제거 → 제목 + 노트(있을 때만) + 편집 아이콘만
- 카테고리는 좌측 인디케이터(`::before` data-category 기반)로 일임
- `.saved-game-card` base 스타일을 `.home-recent-card` / `.vault-card`와 합쳐 한 셀렉터 그룹
- card-save-btn(다시 저장) 제거 — 기능 중복

**빈 상태 (Notion/Linear 결):**
- "저장된 게임이 없습니다" 단줄 → 큰 북마크 아이콘(56px) + 타이틀 + 설명문
- `.saved-games-list--empty` modifier로 컨테이너 flex 중앙 정렬
- i18n 키 `saved_games_empty_title` / `saved_games_empty_desc` 추가

**삭제 위치 이동 (management context):**
- 카드 외부 휴지통 → 편집 모달 안 `modal-destructive-btn` (좌측 정착, `margin-right: auto`)
- 편집 진입 시에만 노출, save flow에선 hidden
- 편집 모달 타이틀 동적 전환 — `setSaveGameModalTitle(isEdit)` → "Save Game" ↔ "Edit Game" (i18n 키 `editGame` 추가)

**죽은 코드 정리:**
- `openSaveGameModalForPgn` / `_pendingSavePgn` / `BOOKMARK_SVG` / `CATEGORY_I18N` 제거 — 카드 save 버튼 사라지면서 같이 청소
- `main.js` import에서도 `openSaveGameModalForPgn` 제거
- `_getChess().pgn()` 직접 호출로 단순화

**기타:**
- "Cancel" 한국어 번역 보강 ("Cancel" → "취소")
- "Save Entire Game" → "Save Game" (간결)
- saveGameModal 폼 스타일 정비 — settings 모달 결로 통일 (h2 17px/700, label uppercase mini, 38px peer 버튼)

## Phase 35 — 홈 프로필 카드 + 무한 스크롤 재도입 + 오프닝 root 그룹화 + 분석 캐시 hash fix (`0160f12`, `343f220`, `3308054`)

Phase 32에서 정리했던 정보 위계 일부가 실사용에서 부족하다고 판단되어 부분 회귀 + 오프닝 표기 통합 + 분석 캐시 silent miss fix를 한 묶음으로 진행. 즉 Phase 32의 "단일 질문 중심" 디렉션은 유지하되, 식별 정보(누구의 어떤 레이팅 풀인지)와 탐색 비용(15→100 게임 접근)을 다시 보강하는 방향.

**Phase 32 회귀 — 프로필 카드 + 무한 스크롤 (`343f220`):**
- 38px 히어로 카피 → 프로필 카드(아바타 / 이름 / 레이팅 / 최근 15전적). hero가 "누구 풀인지"를 명시 안 해서 다중 사용자 환경에서 자기 데이터 보고 있는지 확인이 어려웠음
- 4 + "모두 보기" → 10개씩 무한 스크롤 (`appendHomeRecentBatch` 부활, 페치 한도 100). "모두 보기" 누르고 다시 화면 진입할 때 컨텍스트 손실되는 문제 + 100판 풀 안에서 자유 탐색하고 싶은 사용성 우선
- 프로필/헤더는 sticky 고정, 게임 리스트만 내부 스크롤 — 헤더 위치 안정성 유지
- `home_see_all` / `homeRecentExpanded` 패턴 폐기. Phase 32에서 제거한 `loadMoreHomeRecent` 계열은 Phase 21 워커 풀의 `appendHomeRecentBatch`로 재구현 (이름만 보존, 구현은 새로 작성)

**오프닝 root 그룹화 + 변종 인라인 확장 (`343f220`):**
- 홈 카드: 오프닝 root family만 표시 ("Sicilian Defense"). 변종("Najdorf" 등)은 게임 진입 시점에 노출 — 카드 메타 행 압축
- 통계: 오프닝을 root로 합산하고 행 클릭 시 변종을 인라인 확장 (Phase 29의 `compactOpeningLabel` 한 줄 표기 폐기)
- `subVariantName` 수정 — stop word를 포함하도록 변경해 "Scotch Gambit" 같은 root+suffix 형태 보존
- "Variation" 접미사는 라벨에서 일괄 제거 ("Najdorf Variation" → "Najdorf")
- 슬러그 파서 보강: chess.com URL 슬러그에 `'...3.E3-D5'` 형태 수순 표기까지 포함된 케이스도 잘라내도록 수정

**분석 캐시 silent miss fix (`0160f12`):**
- 증상: 분석 후 홈 카드에 정확도% / move-class 칩이 안 뜸. localStorage 행은 있는데 `hasAnalysisJson:false`거나 hash 자체 미스매치
- **원인 1 — 행 누락:** `collectAutoBlunders`가 블런더/놓친메이트 candidate 0이면 early return → `upsertAnalyzedGame` 스킵 → `analyzed_games` 행 없는 상태에서 `saveAnalysisCache`가 `idx<0`으로 silent skip → 캐시 영구 손실
  - 픽스: `_persistAnalysisCache`가 `upsertAnalyzedGame`을 직접 호출해 행을 보장. autoBlunders 흐름과 캐시 저장 흐름의 의존 분리
- **원인 2 — hash 미스매치:** chess.com API 원본 PGN은 black move 앞에 ellipsis 붙음(`"1. d4 1... d5"`)인데 chess.js round-trip 후엔 사라짐(`"1. d4 d5"`). `computePgnHash`가 ellipsis 정규화 안 해서 저장 시점(round-trip된 PGN)과 조회 시점(API 원본)의 hash가 달라 `decorateCardWithAnalysisAsync` 매칭 실패
  - 픽스: `computePgnHash`에 black ellipsis / 변형 `(...)` / NAG / SAN annotation / 결과 토큰 제거를 추가. 두 입력이 동일 hash 산출
- 부수: `saveAnalysisCache`의 silent skip에 `console.warn` 추가 — 향후 같은 종류의 silent miss 진단 가능
- 옛 캐시 행은 새 정규화로 hash가 바뀌어 자연 무효화됨 (한 번 더 분석하면 새 hash로 새 행이 만들어지고 정상 동작)

**Dead code 정리 (`3308054`):**
- `compactOpeningLabel` 제거 — root 그룹화로 호출자 0
- `homeRecentLoadingMore` 제거 — sync 핸들러라 가드 무의미
- `variants` Map 키 `'__base__'` → `''` (실 판별자는 `isBase: !v.label`)
- `appendHomeRecentBatch` 내부에서 `state.visible` 갱신 → 호출부 단순화
- variant sort 3줄 → 1줄 + stale 코멘트 갱신/제거

**의사결정 메모:** Phase 32는 "정보 빼는 방향"의 극단을 시도한 점에서 가치 있는 실험. 이번에 일부 되돌린 건 "Phase 32가 틀렸음"이 아니라 "그 디렉션의 한계점을 실사용으로 확인 → 균형점 조정". hero 카피의 시정성·드롭다운 필터 등 Phase 32의 다른 결정은 유지.

## Phase 32 — 홈 화면 hi-fi 리디자인 (디자인 핸드오프 기반)

> **Phase 35 회귀 메모:** 본 phase에서 제거한 프로필 카드 / 무한 스크롤은 Phase 35에서 재도입됨 (각각 다중 사용자 식별 / 100판 자유 탐색 사유). 본 문서는 의사결정 시점 기록으로 유지.

`design_handoff_home_redesign/` 폴더의 hi-fi 핸드오프(픽셀 단위 명세 + JSX 프로토타입)를 vanilla JS 코드베이스로 1:1 재현. 분석 결과(정확도/move-class)를 supabase 캐시에서 끌어와 카드에 직접 노출하는 게 핵심 변화.

**왜:** 기존 홈은 한 화면에 너무 많은 컨트롤(설정·검색·FAB·프로필 카드·시간대 필터·최근 게임·피드백·4탭 nav)을 요구했음. "어떤 게임을 다시 들여다볼까요?"라는 단일 질문 중심으로 정보 위계를 정리.

**스코프:** 홈 화면 한 개 모바일 (390×844 기준). 라이브러리/통계/분석/PGN 모달은 다음 PR. 3탭 nav 전환도 다음 PR (현재 4탭 유지).

**상단 바 (52px 그리드):**
- 좌: 설정 / 중앙: blundermate 워드마크 / 우: + (PGN 입력)
- 검색 버튼 제거 — 라이브러리 화면에서 흡수 예정
- `.analysis-top-bar.home-top-bar` 합성 셀렉터로 specificity 끌어올려 base 46px 덮음

**히어로 (38px 디스플레이):**
- 2줄 카피 "어떤 게임을 / 다시 들여다볼까요?" — 38px / 600 / -0.035em / 1.05 (Inter)
- 메타 행: 레이팅 pill (` ● 1812 래피드 `, 6×6 dot + 숫자 + tc) · 점 구분자 · "최근 15" · 4×12 form strip 막대 (시간순 그라데이션)
- 프로필 카드 제거 — 정체성/티어/W/L/D 카운트가 모두 빠지지만 레이팅 pill로 흡수
- 피드백 FAB 제거 — 설정 모달 안 `#settingsFeedbackBtn`으로 통일

**최근 게임 카드 (미니보드 + 분석 메트릭):**
- 84×84 SVG 미니보드 (좌측, `_miniBoardParseFen` + `renderMiniBoardSvgHtml`) — 8×8 그리드, 마지막 수 하이라이트, 유니코드 기물 글리프(`♔♕♖♗♘♙` 등). 흰 기물은 `paint-order: stroke fill`로 윤곽선 보존
- 본문: 결과 칩(승/패/무) + 상대 닉네임(13px/600) + 상대 레이팅(11px) + 메타 행(오프닝 · 수 카운트)
- 우측 메타 컬럼: 상단 시간(오늘/어제/N일 전) + 하단 정확도% 또는 "분석" 버튼 — `flex-shrink: 0; min-width: 52px;` + 모든 텍스트 `white-space: nowrap` (한국어 글자 세로 분해 방지)
- **PGN 1회 파싱 헬퍼** (`parsePgnSummary`) — chess.js로 한 번 로드해 마지막 위치 FEN/마지막 수/수 카운트 동시 추출. countMovesFromPgn 중복 호출 제거
- 출처 뱃지(chess.com/lichess/PGN) 미사용 (handoff 명시)

**분석 캐시 lookup → 정확도/chips 자동 노출:**
- 카드 렌더 직후 `decorateCardWithAnalysisAsync(card, game, isUserWhite)` fire-and-forget
- `computePgnHash(game.pgn)` (SHA-256) → `loadAnalysisCache(hash)` (storage.js, localStorage 우선 + Supabase fallback)
- `computeMyStatsFromCache(moves, isUserWhite)` — 캐시된 `moves[].engineLines[0].scoreNum` (백 기준 cp)을 `cpToWhiteWinPct`로 winPct 변환 → Lichess 식 정확도(`103.1668 × exp(-0.04354 × loss) - 3.1669`)를 사용자 수만 필터해서 평균. 분류 카운트(Brilliant/Great/Mistake/Blunder)도 같이 집계. ply index 0 = 백, isMyMove = `(i%2 === 0) === isUserWhite`
- 분석 캐시 hit 시 우측 "분석" 버튼이 정확도%로 교체, 본문 하단에 move-class chips 출현 (6×6 dot + 카운트, 0인 분류는 비표시)
- 캐시 miss는 그대로 "분석" 버튼 — 카드 본체 또는 버튼 클릭 모두 분석 트리거 (handoff 노트: "개발자 판단" 항목)

**시간대 드롭다운 필터 (헤더 우측):**
- `래피드 ⌄` 트리거 (text + chevron-down), `[aria-expanded="true"]`에서 chevron 180° 회전
- 클릭 시 4 옵션 popover (래피드 / 블리츠 / 불렛 / 전체) — 상하 4px 패딩
- 선택된 옵션은 `font-weight: 600` + ✓
- `setHomeTcFilter(tc)`가 4개 동기화: 카드 리스트 + form strip + 레이팅 pill + 트리거 라벨/aria-checked
- 외부 클릭 / Esc / 옵션 선택 시 자동 닫힘 (document-level click handler, `.home-tc-filter` closest 검사로 self-click 무시)
- 기본값 `'rapid'` — Phase 17의 기존 설정 유지
- form strip도 필터 인지 — tc='blitz' 선택 시 블리츠 마지막 15경기로 갱신

**"모두 보기" 토글 (4 → 15):**
- 카드 리스트 하단 중앙 작은 텍스트 링크 (헤더에 있던 위치에서 이동 — 드롭다운에 자리 양보)
- 필터된 게임 수 > 4일 때만 노출, 클릭 시 `homeRecentExpanded = true`로 15개까지 펼침 + 버튼 hidden
- 핸드오프는 4개 + "모두 보기" → 라이브러리 화면 진입을 의도했지만 라이브러리는 다음 PR이라 inline 펼치기로 stopgap
- 필터 변경 시 `homeRecentExpanded = false` 리셋해서 재진입 시 다시 4개부터

**제거된 dead code:**
- `homeProfileCard`/`profileName`/`profilePlatform`/`profileRapid`/`profileAvatar`/`profileTier`/`profileRecord` HTML 블록 + 6개 함수(`renderProfileTier`, `applyProfileRatingForFilter`, `updateProfileRatingLabel`, `setProfileAvatar`, `resetProfileRecord`, `updateProfileRecord`)
- `home-recent-card`/`home-recent-rows`/`home-recent-row`/`home-recent-pawn`/`home-recent-meta` CSS 그룹 + 폰 SVG path
- `home-recent-skeleton-card` height 64 → 112px (새 카드 비율 맞춤)
- `loadMoreHomeRecent` / `updateScrollFade` — 무한 스크롤 → 4 + 모두 보기로 대체
- `homeFeedbackFab` HTML/CSS/handler
- `homeSearchBtn` HTML (모달 자체는 보존 — 라이브러리 PR에서 재연결)
- `topbar-right-group` wrapper — + 버튼 1개라 직접 grid 슬롯에 배치
- `home-hero--user` modifier (프로필 표시 분기 사라짐)
- `username-input-wrap--small` modifier
- `loadMoreHomeRecent`/scroll listener — 인피니트 스크롤 폐기

**레이아웃 원칙 준수:**
- "발견성 > 시각적 대칭" — AI/검색 같은 진입점은 없어졌지만, "분석" 버튼은 텍스트 라벨 유지(아이콘 안 씀)
- "한 요소가 한 간격 소유" — `.home-hero` 한 곳만 padding `24px 20px 28px`, 카드 자체가 자기 padding(`14px`) 들고 있음
- "flex chain wrapper 주의" — `main { display: contents }` 유지로 `.app-container` flex column이 `#homeView`까지 자연 전달

**i18n (KO + EN):**
- `hero_title_line1` / `hero_title_line2` — 2줄 분리 (`<br>` HTML 보존)
- `home_last_15` — "최근 15" / "Last 15"
- `home_see_all` — "모두 보기" / "See all"
- `home_show_less` — 추후 토글 텍스트 ("접기" / "Show less", 현재 미사용)
- `home_analyze_btn` — "분석" / "Analyze"
- `home_filter_all` — "전체" / "All"

**검증:**
- preview에서 모바일 viewport(375×812)로 시각 확인 — 38px 히어로 / 1101 래피드 pill / 15 form strip 막대 / 4 카드(84px 보드 + 결과 칩 + 상대 + 오프닝 + 수 + "분석") / "모두 보기" 클릭 → 15개 / 시간대 드롭다운 → 블리츠 선택 → pill·strip·카드 모두 동기 갱신 / 카드 1개에 정확도 87% + chips 1·2·1 모의 주입해 분석된 상태 시각도 확인
- console 에러 0개

**다음 단계 (별도 PR):**
- 라이브러리 화면 (Vault + Saved 통합) — 이게 들어와야 검색·"모두 보기" 진입점이 자연스러워짐
- 3탭 nav (홈 / 라이브러리 / 통계) — 현재 4탭에서 Vault+Saved 합치면서 전환
- 분석 진행 중 상태 UI (handoff 미포함, 카드 클릭 → 분석 트리거 시 30초~1분 무피드백)
- 빈 상태 (분석된 게임 0개) 처리

## Phase 34 — Lichess 멀티 플랫폼 지원 + DB 격리 (`51d0170`)

지금까지 Chess.com 단일 소스이던 게임/통계 흐름을 chess.com / lichess 2개 플랫폼으로 확장. 단일 사용자 한 ID가 두 플랫폼 모두 가질 수 있는 가정으로, **(user_id, platform) 쌍**을 모든 영속 레이어의 격리 키로 추가.

**왜:** Lichess 사용자 요청 + 한 사용자가 두 플랫폼을 같이 쓰는 케이스. 데이터가 섞이지 않게 하려면 user_id 단독으로는 부족.

**`chessApi.js` → router (어댑터 패턴):**
- 신규 `chesscom.js` / `lichess.js`로 플랫폼별 fetcher 분리. `chessApi.js`는 router 역할만
- Lichess는 NDJSON 응답을 chess.com normalized shape(`white` / `black` / `time_class` / `end_time`)으로 매핑 — 호출자 코드 무수정

**DB 격리 (`api/db.js` + `storage.js`):**
- `vault_items` / `saved_games` / `analyzed_games` / `username_logs` 4개 테이블에 `platform` 컬럼 추가
- 모든 CRUD가 `(user_id, platform)` 쌍으로 필터/insert
- `analyzed_games` UNIQUE 키 `(user_id, pgn_hash)` → `(user_id, platform, pgn_hash)`로 갱신 (같은 PGN을 두 플랫폼에서 분석해도 충돌 안 남)
- localStorage 폴백도 platform 태깅 — 네트워크 에러 시에도 다른 플랫폼 데이터가 새지 않음
- `addVaultItemsBatch`는 단일 read+write로 localStorage thrashing 방지

**`api/_platform.js` (신규):** `normalizePlatform` 헬퍼 공유. Edge runtime에서 `storage.js` import 불가하므로 별도 모듈로 추출.

**자동 주입 (`callDB`):**
- 호출자가 platform 신경 안 써도 `callDB`가 현재 활성 플랫폼을 자동 주입 → 격리 호출 사이트 추가 없음

**UI:**
- 온보딩에 Chess.com / Lichess text-tab 토글 (메모리 톤 'text-tab > pill' 따름)
- 프로필 카드에 platform 인디케이터
- i18n 키 `strings.js`에 8개 신규

**호환:**
- 기존 vault/saved 데이터는 `platform = 'chesscom'` 디폴트로 안전 마이그레이션 (격리 도입 전 = 모두 chesscom 가정)

## Phase 33 — 유지보수 배치: a11y + 시맨틱 + dead code 정리 (May 1-2)

홈 hi-fi 리디자인(Phase 32)·Lichess 지원(Phase 34) 직전 한 차례 청소. 단일 기능 추가 없음 — a11y / 시맨틱 / CSS·JS dead code / 잔재 회귀 fix.

**a11y + 시맨틱 (`c5c4378`):**
- form input/textarea/select 12건에 `label for` / `aria-label` / `aria-labelledby` 부여 (onboarding, input view, user search, settings 토글, save game/move 모달)
- 페이지 outline 정리: 브랜드 로고 h1 → div, view-container들을 `<main>`으로 감싸고 modal/nav는 밖으로 분리, sr-only h1 추가
- 카테고리 picker에 `role="radiogroup"` + `aria-labelledby`
- nav `aria-label` "Main" → "주요 메뉴/Primary" (`strings.js nav_primary`)
- `.sr-only` 유틸 클래스. CSS는 모두 class selector 기반이라 시각적 회귀 0

**flex chain 회귀 fix (`ba2d039`) — 메모리 항목과 동일 패턴:**
- a11y 커밋이 view-container들을 `<main>`으로 감쌌는데, `.app-container`가 `display: flex`이고 view-container들이 `flex: 1`로 viewport 높이를 나눠 받던 구조라 `<main>` 기본 `display: block`이 flex chain을 끊음 → 홈 게임 목록 스크롤 불가, 피드백 FAB 밀려남
- `main { display: contents }`로 layout에서 main 박스 제거 — ARIA landmark 시맨틱은 보존, view-container들은 다시 `.app-container`의 직접 flex 자식처럼 동작
- 메모리 'flex chain wrapper 주의' 그대로의 사례 (display:contents 검토 권고)

**CSS 정리 (`80e0557`):**
- `-webkit-appearance` → `appearance` (3곳), 표준 같이 있는 `-webkit-user-select` 중복 제거 (2곳)
- `.saved-game-card` 중복/dead 11줄 제거 (그룹 셀렉터 `.home-recent-card,.vault-card,.saved-game-card` 와 동일하게 묶임)
- `.insight-col-bar--empty height` / `.textarea-short height` `!important` 제거 — modifier cascade / specificity로 충분
- 모두 spec-equivalent (Chrome/Edge/Safari 15.4+ / Firefox 80+ 시각·동작 동일)

**vault filter tabs `<template>` 통합 (`1424b8f`):**
- 동일한 옵션을 가진 `#vaultPuzzleFilterTabs` / `#vaultBlunderFilterTabs` HTML 중복 제거
- `<template id="vaultFilterTabsTemplate">` 한 곳에 정의, vault.js가 module load 시점에 두 컨테이너로 clone
- `applyLocale` 호출 전 clone 완료 → i18n 정상 적용. 이벤트 위임은 부모 컨테이너 등록이라 자식 채우는 방식 무관

**console / keyframes 정리 (`168d328`):**
- 디버그 `console.log` 9건 제거 (main.js Nav/Vault/PGN/SW + autoBlunders 자동수집 로그)
- catch 안 `console.log` 13건 → `console.warn` (storage.js Supabase 폴백 + main.js 분석 캐시)
- 미사용 `@keyframes fadeInDown` 제거 (animation 참조 0건)

**JS placeholder 제거 (`cc61f88`):**
- `updateSavedGamesCount`(main.js) / `initHomeVaultBadge`(vault.js) — 본문 비어 있고 호출돼도 동작 0인 placeholder
- main.js에서 두 await 제거 → `refreshHomeCounts` 일반 함수로, `initSavedGames` callback 매핑 정리
- savedGames.js destructure 인자에서 사용 0건이던 `initHomeVaultBadge` 제거
- 추가 audit 결과 var 0건 / 디버그 로그 0건 / 미사용 변수 0건 / 리스너 중복 등록 0건

**`.gitignore` (`1617545`):** `.claude/` 로컬 설정 디렉토리 무시.

**무한 스크롤 시도 → Phase 32 흡수 (`8d5ab0c` → `90497db`):**
- 5월 2일 새벽 100판 캐시에서 15개씩 점진 append하는 무한 스크롤 도입(`HOME_RECENT_PAGE_SIZE`, `appendHomeRecentBatch`, scroll listener 바닥 100px 트리거)
- 같은 날 진행한 hi-fi 리디자인(Phase 32)이 4 + "모두 보기" 패턴을 채택하면서 `loadMoreHomeRecent` / `updateScrollFade` 폐기

## Phase 31 — 분석 화면 엔진 라인 빈 행 패딩 (`4458b0e`)

- MultiPV=3 기준 `TARGET_ROWS=3` 패딩 — 메이트/소수 합법수로 라인이 1~2개만 와도 항상 3행 유지 → UI 점프 없음
- placeholder는 `engine-line--empty` 클래스, score `—`, moves 빈칸
- `aria-hidden="true"`로 스크린리더 무시
- click 핸들러는 `data-index` 검사로 자연 스킵 (placeholder엔 미부여), hover 핸들러는 uci 빈 문자열로 자연 스킵

## Phase 22 — 수 분류 알고리즘 freechess 포팅 + WDL win% 도입

기존 CPL 기반 4-tier(Best/Excellent/Good/Inaccuracy/Mistake/Blunder)를 폐기하고 chess.com review 라벨 체계 미러링 — [WintrCat/freechess](https://github.com/WintrCat/freechess)의 알고리즘 1:1 포팅.

**왜 포팅:** 자체 휴리스틱(WCL 임계 + 1-ply SEE)으로 Brilliant/Great를 만들어보다가 false positive 잡으려고 가드를 5+ 추가한 끝에 whack-a-mole 패턴이 됨. freechess는 chess.com 클론 목표로 reverse-engineered되어 같은 라벨 체계(8 + Forced)에 검증된 임계값을 갖고 있음.

- **`engine.js`** — `setoption UCI_ShowWDL true` + `parseEvalLine`이 `wdl <w> <d> <l>` 토큰 파싱. SF의 NN이 직접 출력하는 W/D/L permille (STM 시점)
- **`analysis.js`** — engineLine에 `whiteWinPct` 채움 (WDL → 백 시점 win%; 미지원시 cp 시그모이드 fallback). `buildQueueFromPgn`이 `promotion` 필드 캐시(1순위 일치 비교 UCI에 필요)
- **`utils.js` board 헬퍼 (freechess board.ts 포팅):**
  - `pieceValues` (king=Infinity, m=0)
  - `getAttackers(fen, square)` — STM 뒤집어서 캡처 합법수 enumerate + 인접 적 킹 처리(legal capture or 다른 공격자 존재 시 포함)
  - `getDefenders(fen, square)` — testAttacker 시뮬레이션 후 그 자리 attacker 재검색
  - `isPieceHanging(lastFen, fen, square)` — 등가 트레이드/룩-마이너 유리 트레이드/폰 디펜더 케이스 모두 처리
  - 모듈 레벨 chess.js 인스턴스 7개 재사용 — Brilliant 검사가 64칸 × N회 도는 hot path라 alloc 절감
- **`utils.js` classifyMove (freechess analysis.ts loop body 포팅):**
  - 1순위 일치 → Best
  - 미일치 + cp→cp → quadratic CPL 임계 (`getEvaluationLossThreshold`): `0.0002 × prev² + 0.36 × prev + 108` 식. prevEval 클수록 임계 ↑ → 이미 +5 우세 포지션에서 100cp 손실은 거의 페널티 없음 (시그모이드 saturation과 동등)
  - mate↔cp 4가지 케이스(cp→mate / mate→cp / mate→mate / 같은 mate) 명시적 분기
  - **Brilliant** — 1순위 일치 + winning AND not winningAnyways(2nd가 700+cp 또는 둘 다 mate면 제외) + 비프로모션 + 체크 안 받는 상태 + 마이너 이상 우리 행잉 기물 존재 + 그 기물이 viably capturable (공격자 핀 없음, 룩 미만이면 mate-in-1 안 만들어짐)
  - **Great** — 1순위 일치 + 직전 상대 수가 Blunder + 1-2 ≥ 150cp + 둔 자리 안 행잉
  - **Forced** — 합법수 1개 (engine이 secondLine 못 채움)
  - **Blunder 디그레이드** — `|absEval| ≥ 600`이면 Good (이미 결판났거나 여전히 winning)
- **8 + Forced 라벨 체계:** Brilliant(!!) / Great(!) / Best(✦) / Excellent(✓) / Good / Inaccuracy(?!) / Mistake(?) / Blunder(??) / Forced(□)
  - `BADGE_MAP`에 Excellent ✓ + Forced □ 심볼
  - i18n KO/EN 키 모두 추가
- **WDL은 분류엔 안 씀 — 중간 바 win% 표시용으로만.** 정확도 점수도 동일 소스(`getWhiteWinPct` 헬퍼)로 통일해서 표시 ↔ 라벨 모순 제거

---

## 핵심 아키텍처 메모

### 모듈 책임

| 파일 | 역할 |
|------|------|
| `main.js` | 앱 컨트롤러 — 이벤트 와이어링, 뷰 네비(`renderScreen`이 모든 view 표시/숨김 단독 관리), 분석 큐 오케스트레이션 |
| `analysis.js` | 엔진 + 큐 라이프사이클. 배치는 EnginePool 기반 병렬, scheduleRestart는 explore 전용 |
| `board.js` | 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes) |
| `modes.js` | 동작 모드 (appMode, exploration, simulation, preview) |
| `vault.js` | 복기 — 실수/메이트/기타 카테고리 stories deck, 보조 리스트 뷰, 데이터 로드(`loadVaultData`) |
| `autoBlunders.js` | 분석 완료 직후 워스트 2 + missed_mate(≤4) 자동 수집, position_fen dedup, fire-and-forget |
| `savedGames.js` | 저장 게임 — 데이터 로드 |
| `insights.js` | 통계 — 진영/시간제어/오프닝 등 집계 |
| `ui.js` | DOM 렌더링 (상태 변경 없음) |
| `utils.js` | 순수 로직 — eval 파싱, 수 분류(freechess 포팅), FEN/PGN, `rootOpeningName`, 클럭 파싱, board 헬퍼(getAttackers/getDefenders/isPieceHanging) |
| `engine.js` | `StockfishEngine` (단일) + `EnginePool` (N워커 병렬), UCI 파싱 (cp/mate) |
| `gemini.js` | `/api/analyze` SSE, 결과 캐시, 자체 상태 |
| `chessApi.js` | Chess.com REST (캐시 공유). 캐노니컬 username을 displayName으로 반환 |
| `storage.js` | localStorage CRUD — **데이터 계층**. user_id는 read/write 양쪽 lowercase 정규화. Supabase 전환 시 이 파일만 교체 |
| `quotes.js` | 로딩 화면 명언 카드 데이터(100선, `quote.json`) |
| `api/analyze.js` | Gemini 프록시 (Vercel Edge) |
| `api/feedback.js` | Supabase PostgREST 피드백 저장 |
| `api/db.js` | Supabase 데이터 액세스 (user_id lowercase + 검증) |
| `api/log-username.js` | username_logs fire-and-forget INSERT (anon RLS) |

### 데이터 흐름

```
Input (PGN/Chess.com/board)
  → Chess.js parse → analysisQueue[]
  → FEN → EnginePool 워커 N개 병렬 (MultiPV=3, depth=14 기본, Hash=32MB)
  → cp/mate → engineLines (scoreStr/scoreNum)
  → classifyMove() (freechess 포팅 — quadratic CPL + 8 라벨 + Forced)
  → cpToWhiteWinPct (Lichess 시그모이드 단일 소스 → win% 표시 / 정확도)
  → ui.js 렌더
  → 실수 시 /api/analyze SSE → Gemini 해설
  → 해설은 analysisQueue[i].geminiExplanation에 캐시
  → onComplete: collectAutoBlunders → analyzed_games 1행 + vault_items(source='auto') N행
  → vault/saved games는 localStorage 영속
```

### 수 분류 (freechess 포팅 — chess.com review 미러)

8 + Forced 라벨: **Brilliant(!!) / Great(!) / Best(✦) / Excellent(✓) / Good / Inaccuracy(?!) / Mistake(?) / Blunder(??) / Forced(□)**.

**핵심 흐름** (`utils.js classifyMove`):
1. **1순위 일치** → Best 후 Brilliant/Great 후보 검사
2. **미일치 + cp→cp** → `getEvaluationLossThreshold(class, |prevEval|)` quadratic 임계 비교, 첫 통과하는 분류 부여 (Best/Excellent/Good/Inaccuracy/Mistake/Blunder)
3. **mate↔cp 전환** 4가지 케이스 명시적 분기
4. **Brilliant** — winning + not-winning-anyways + 비프로모션 + 체크 안 받는 상태 + 마이너 이상 우리 기물 행잉 + viably capturable
5. **Great** — 직전 상대 수가 Blunder + 1-2 ≥ 150cp + 둔 자리 안 행잉
6. **Forced** — 합법수 1개
7. **Blunder 디그레이드** — `|absEval| ≥ 600` 또는 prev ≤ -600이면 Good

**Win% 표시 / accuracy**: `cpToWhiteWinPct(scoreNum)` 단일 소스 (Lichess 시그모이드, `0.00368208 * cp`). 표시 cp는 SF raw 그대로(엔진 그대로), win%는 그 cp의 시그모이드. 두 표시 항상 일치. SF18 WDL은 cp와 다른 모델이라 사용하지 않음 (Phase 23에서 freechess 본가 방식으로 회귀).

### 분석 화면 핵심 바

- **상단 바** (`.analysis-top-bar`) — 뒤로가기, 타이틀, 기보(☰)
- **중간 바** (`.unified-controls` / `#panelTabs`, height 52px) — 좌(AI 토글, 저장) · 중앙(분류 라벨/승률) · 우(이전, 다음). 모든 버튼 44×44
- **리뷰 모드** — `isReviewMode = true` (인덱스 -1) = 전체화면 4단계 리포트 (헤더/차트/통계표/CTA)

### Supabase 스키마

- `vault_items`: id(uuid), user_id(text), move, classification, notes, position_fen, pgn, created_at — 추가 필드: move_index, move_number, best_move, game_title, source('manual'|'auto'), analyzed_game_id, cp_loss, mate_in, played_date(자동·수동 공통 정렬 키)
- `analyzed_games`: id(uuid), user_id, pgn_hash(SHA-256, upsert 키), pgn, headers_json, played_date, created_at — 한 게임당 1행, vault_items(source='auto')가 analyzed_game_id로 참조
- `saved_games`: id, user_id, title, category(my_game/otb/opening/pro), pgn, notes, created_at
- `username_logs`: id, username, source(onboarding/search/cached), user_agent, created_at — anon INSERT only RLS
- `user_id`는 localStorage `blundermate_user_id` (Chess.com ID 또는 커스텀 ID, 인증 없음). **항상 lowercase로 저장/쿼리** — 클라이언트(`storage.js`)와 서버(`api/db.js`) 양쪽에서 진입 시점 정규화
- 모든 쿼리는 user_id 필터, try/catch 필수, 실패 시 localStorage 폴백

### 핵심 제약

- 모바일 우선 (`100dvh`, 터치 친화)
- 프론트엔드 npm 의존성 금지 — Chessground/Chess.js는 CDN/static
- `escapeHtml()` 필수 (XSS 방지)
- Gemini API 키는 절대 클라이언트로 가지 않음
- localStorage는 try/catch
- UI는 한국어
