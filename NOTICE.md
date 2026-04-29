# Blundermate — Third-Party Notices

Blundermate는 체스 게임 리뷰 웹앱으로, 다음 오픈소스 프로젝트를 사용합니다.

## 라이선스 (License)

본 프로젝트는 **GNU General Public License v3.0** (GPL-3.0)으로 배포됩니다.
Stockfish 및 Chessground가 GPL v3로 라이선싱되어 있어, 이를 포함하는 본 프로젝트도 동일 라이선스를 따릅니다.
전체 라이선스 텍스트는 [`LICENSE`](./LICENSE) 파일을 참조하세요.

소스 코드: <https://github.com/reus3148-blip/blundermate>

---

## 사용 오픈소스 (Open Source Libraries)

### Stockfish.js 18 — 체스 엔진

- **저작권**: © 2026 Chess.com, LLC
- **라이선스**: GPL v3
- **저장소**: <https://github.com/nmrugg/stockfish.js>
- **원본**: [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) by T. Romstad, M. Costalba, J. Kiiski, G. Linscott 외 contributors
- **신경망 (NNUE)**: by Linmiao Xu (linrock)
- **사용 위치**: `engine/stockfish-18-lite-single.js`, `engine/stockfish-18-lite-single.wasm`

### Chessground — 체스 보드 UI

- **저작권**: © Lichess
- **라이선스**: GPL v3
- **저장소**: <https://github.com/lichess-org/chessground>
- **사용 위치**: CDN으로 로드 (`unpkg.com/chessground@9.0.0`)

### Chess.js — 체스 로직 (이동 검증, PGN 파싱)

- **저작권**: © Jeff Hlywa
- **라이선스**: BSD 2-Clause
- **저장소**: <https://github.com/jhlywa/chess.js>
- **사용 위치**: CDN으로 로드 (`cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3`)

### freechess — 수 분류 알고리즘

- **저작권**: © WintrCat
- **라이선스**: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
- **저장소**: <https://github.com/WintrCat/freechess>
- **참고**: `utils.js`의 `classifyMove`, `getAttackers`, `getDefenders`, `isPieceHanging` 등 수 분류 관련 헬퍼는 freechess의 `analysis.ts` / `board.ts`를 1:1 포팅한 것입니다 (Phase 22). CC BY-NC-SA 4.0 라이선스 조건에 따라:
  - 출처 표시 (Attribution) — 본 NOTICE에 명시
  - 비영리 사용 (NonCommercial) — 본 프로젝트는 비영리로 운영됨
  - 동일 라이선스 (ShareAlike) — 해당 코드 영역은 동일 조건으로 재배포 가능

### marked — 마크다운 렌더러

- **라이선스**: MIT
- **저장소**: <https://github.com/markedjs/marked>
- **사용 위치**: CDN으로 로드 (`cdn.jsdelivr.net/npm/marked`)

---

## 외부 서비스 (External Services)

### Chess.com Public Data API

- 사용자 게임 데이터 조회 (`api.chess.com/pub/player/...`)
- 약관: <https://www.chess.com/legal/api>

### Google Gemini API

- AI 해설 생성 (`api/analyze.js` Edge Function 경유)
- 약관: <https://ai.google.dev/terms>

### Supabase

- 피드백, vault, saved games 데이터 저장
- <https://supabase.com>

---

## 변경 사항 (Modifications)

GPL v3 의무에 따라 명시:

- **Stockfish.js / Chessground / Chess.js / marked**: 변경 없이 원본 그대로 사용
- **freechess**: 수 분류 알고리즘을 JavaScript로 포팅하여 본 프로젝트의 `utils.js`에 통합. 함수 시그니처와 보조 헬퍼는 본 프로젝트 컨벤션에 맞게 조정되었으나, 핵심 분류 로직(quadratic CPL 임계, Brilliant/Great 판정 조건)은 원본을 그대로 따름
