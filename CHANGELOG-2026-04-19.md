# 2026-04-19 작업 내역

## 1. Vault 저장 버그 수정 (`4561386`)

**문제:** 🔖 버튼으로 특정 수를 Vault에 저장하면, 해당 수가 아닌 게임의 마지막 수(최종 포지션)가 저장됨.

**원인:** `confirmSaveBtn` 핸들러가 저장 시점에 `currentlyViewedIndex`를 다시 읽어서, 모달이 열린 후 인덱스가 변경되면 잘못된 수가 저장됨.

**수정:**
- `vaultSnapshot` 변수 도입 — 모달 열릴 때 수 데이터(moveIndex, fen, san, prevFen, bestMove 등)를 즉시 캡처
- `confirmSaveBtn`에서 `currentlyViewedIndex` 재참조 대신 스냅샷 값만 사용
- 모달 닫힘(확인/취소) 시 스냅샷 정리

**파일:** `main.js`

---

## 2. Vault 조회 버그 수정 (`c1664a9`)

**문제:** Vault에서 저장된 오답 카드를 클릭하면, 저장된 포지션이 아닌 게임의 마지막 수가 표시됨. DB(Supabase)에는 올바른 `position_fen`이 저장되어 있지만 화면에 반영되지 않음.

**원인:** Supabase `vault_items` 테이블에 `moveIndex` 컬럼이 없어서 `normalizeVaultItem()`이 `moveIndex`를 반환하지 않음 → `openVaultItem()`에서 `typeof item.moveIndex === 'number'` 실패 → `vaultDetailFens.length - 1`(마지막 수)로 폴백.

**수정:**
- `vault.js`에 `findMoveIndexByFen()` 헬퍼 추가 — 정확 일치 → 기물 배치(FEN 첫 필드) 폴백
- `openVaultItem()`에서 3단계 인덱스 결정: moveIndex 직접 → FEN 매칭 → 최종 폴백
- `storage.js`의 `normalizeVaultItem()`에 누락 필드 복원 (gameTitle, bestMove, isUserWhite, moveIndex 등)
- `addVaultItem()`에서 추가 필드(move_index, move_number, best_move, game_title 등)도 Supabase에 저장

**파일:** `vault.js`, `storage.js`

---

## 3. 홈 화면 최근 게임 카드 개선 (`d3962b0`)

**변경 내용:**
- **진영 아이콘:** 카드에 ♙(백)/♟(흑) 표시 추가
- **상대 레이팅:** "vs flowsir (1432)" 형식으로 표시
- **레이팅 변화:** 같은 `time_class` 연속 게임 간 diff 계산, +N(초록)/-N(빨강) 색상 구분
- **타임컨트롤 변환:** "600" → "10분", "300+3" → "5+3" 등
- **상대 날짜:** 오늘/어제/N일 전/절대날짜
- **내 레이팅 표시:** 헤더에 Chess.com stats API로 Rapid/Blitz/Bullet 레이팅 표시

**파일:** `main.js`, `chessApi.js`, `utils.js`, `strings.js`, `styles.css`, `index.html`

---

## 4. 홈 화면 인사말 간소화 + 세로바 진영 전환 + 카드 세부 개선 (미푸시 → 본 커밋)

**인사말 간소화:**
- "안녕하세요, bywxx" + "오늘은 어떤 게임을 분석할까요?" 2줄 → `bywxx · Rapid 1120 · Blitz 694 · Bullet 364` 1줄로 통합
- 미사용 strings 키 제거 (`home_greeting`, `home_greeting_sub`)
- `#heroRating` div 제거 (hero-title 내부로 통합)

**세로바 의미 재할당:**
- 승/무/패 색상(초록/회색/빨강) → 진영 색상(백: `--tx`, 흑: `--tx3`)
- 카드 텍스트의 ♙/♟ 진영 아이콘 제거 (세로바가 담당)

**카드 세부 개선 (8개):**
1. 상단 메타 줄 공백 — flex gap 4px 적용
2. 세로바 좌측 끝 붙이기 — indicator div → `::before` 의사 요소로 전환
3. 흑 세로바 색 밝게 — `var(--tx3)` → `var(--tx2)`
4. 승/무/패 라벨 크기 통일 — 12px/700 → 11px/600
5. 카드 좌/우 균형 — 기존 flex 구조 유지 (이미 적절)
6. 카드 gap 축소 — 8px → 6px
7. 메타~최근게임 간격 축소 — 8px → 6px
8. 상단 여백 축소 — 24px → 18px

**파일:** `main.js`, `styles.css`, `strings.js`, `index.html`
