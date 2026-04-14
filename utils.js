/**
 * 엔진 평가값(CP, Mate)을 사용자의 플레이 색상(백/흑) 기준에 맞게 파싱합니다.
 */
export function parseEvalData(evalData, isBlackToMove, isUserWhite) {
    let scoreStr = '';
    let scoreNum = 0;
    
    let invert = isBlackToMove === isUserWhite;
    
    if (evalData.type === 'cp') {
        let score = evalData.value;
        if (invert) score = -score;
        scoreNum = score;
        scoreStr = score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    } else if (evalData.type === 'mate') {
        let mateIn = evalData.value;
        if (invert) mateIn = -mateIn;
        scoreNum = mateIn > 0 ? 999 : -999;
        scoreStr = `M${Math.abs(mateIn)}`;
        scoreStr = mateIn > 0 ? `+${scoreStr}` : `-${scoreStr}`;
    }
    return { scoreStr, scoreNum };
}

/**
 * 체스판 위에서 합법적으로 움직일 수 있는 칸(Dests)을 계산합니다.
 */
export function getDests(tempChess) {
    const dests = new Map();
    tempChess.SQUARES.forEach(s => {
        const ms = tempChess.moves({ square: s, verbose: true });
        if (ms.length) dests.set(s, ms.map(m => m.to));
    });
    return dests;
}

const pvChess = new window.Chess(); // 매번 생성하지 않고 재사용하여 메모리 최적화

/**
 * 엔진이 보내준 UCI 형식의 경로를 보기 쉬운 SAN 형식 기보로 변환합니다.
 */
export function convertPvToSan(pv, fen) {
    if (!pv) return '';
    pvChess.load(fen);
    const moves = pv.split(' ');
    const sanMoves = [];
    
    // UI에서 최대 5수만 보여주므로, 성능을 위해 앞의 5수만 변환합니다.
    const limit = Math.min(moves.length, 5); 
    
    for (let i = 0; i < limit; i++) {
        const uci = moves[i];
        if (!uci) continue;
        
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
        
        const moveRes = pvChess.move({ from, to, promotion });
        if (moveRes) sanMoves.push(moveRes.san);
        else break;
    }
    return sanMoves.join(' ');
}

/**
 * Chess.com의 EPL(Expected Points Loss) 방식에 준하여 수를 평가합니다.
 *
 * 승률 공식 (Lichess 공개): 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)  [0~100%]
 * EPL ≈ WPL(Win% Loss). Chess.com은 EPL 0~1 스케일, 여기서는 0~100% 스케일 사용.
 *
 * 분류 기준 (Chess.com EPL 기준):
 *   Blunder    WPL ≥ 20%  (EPL ≥ 0.20)
 *   Mistake    WPL ≥ 10%  (EPL ≥ 0.10)
 *   Inaccuracy WPL ≥  5%  (EPL ≥ 0.05)
 *   Good       WPL ≥  2%  (EPL ≥ 0.02)
 *   Excellent  WPL <  2%  — 엔진 1순위 수가 아닌 경우
 *   Best       WPL <  2%  — 엔진 1순위 수와 일치
 */
export function classifyMove(index, analysisQueue, isUserWhite) {
    if (index < 0) return '';
    const move = analysisQueue[index];
    if (!move.engineLines || !move.engineLines[0]) return '';

    const isWhite = move.isWhite;
    const currEval = move.engineLines[0];

    // 첫 번째 수는 초기 국면 평가(백 미세 우세)를 기준점으로 사용
    let prevEval = { scoreNum: isUserWhite ? 0.2 : -0.2, scoreStr: isUserWhite ? '+0.20' : '-0.20' };
    let prevLines = [];
    if (index > 0) {
        const prevMove = analysisQueue[index - 1];
        if (!prevMove.engineLines || !prevMove.engineLines[0]) return '';
        prevEval = prevMove.engineLines[0];
        prevLines = prevMove.engineLines;
    }

    // scoreNum은 사용자 시점 기준이므로, 수를 둔 쪽이 사용자가 아니면 부호 반전
    const perspectiveMultiplier = (isUserWhite === isWhite) ? 1 : -1;

    // --- 메이트 표기 파싱 ---
    const getMate = (str) => {
        if (!str) return null;
        if (str.startsWith('+M')) return parseInt(str.substring(2));
        if (str.startsWith('-M')) return -parseInt(str.substring(2));
        return null;
    };

    // 양수 = 현재 수를 둔 플레이어가 메이트 선언 중
    const prevMate = getMate(prevEval.scoreStr) !== null ? getMate(prevEval.scoreStr) * perspectiveMultiplier : null;
    const currMate = getMate(currEval.scoreStr) !== null ? getMate(currEval.scoreStr) * perspectiveMultiplier : null;

    // --- 메이트 엣지 케이스 ---
    if (prevMate !== null) {
        if (prevMate > 0) {
            if (currMate !== null && currMate > 0) return currMate <= prevMate ? 'Best' : 'Good';
            if (currMate === null) return 'Missed Win';
            return 'Blunder';
        } else {
            if (currMate !== null && currMate < 0) return currMate > prevMate ? 'Blunder' : 'Best';
            return 'Best';
        }
    } else {
        if (currMate !== null && currMate < 0) return 'Blunder';
        if (currMate !== null && currMate > 0) return 'Best';
    }

    // --- 승률 계산 ---
    // ±1000 CP 클램핑으로 포화 구간(압도적 우세/열세)에서의 왜곡 방지
    const clamp = (v) => Math.max(-1000, Math.min(1000, v));
    const prevCp = clamp(prevEval.scoreNum * perspectiveMultiplier * 100);
    const currCp = clamp(currEval.scoreNum * perspectiveMultiplier * 100);
    const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    const prevWp = winPct(prevCp);
    const currWp = winPct(currCp);
    const wpl = prevWp - currWp; // Win% 손실 (양수 = 악수)

    // --- Missed Win 감지 ---
    // 엔진 1순위 수가 유일한 승리 수(1·2순위 WP 차이 ≥ 15%)였고, 그걸 놓쳐서 WPL ≥ 15%
    if (prevLines.length > 1 && prevLines[1]) {
        const bestWp   = winPct(clamp(prevLines[0].scoreNum * perspectiveMultiplier * 100));
        const secondWp = winPct(clamp(prevLines[1].scoreNum * perspectiveMultiplier * 100));
        if (bestWp > 65 && (bestWp - secondWp) >= 15 && wpl >= 15) return 'Missed Win';
    }

    // --- Chess.com EPL 기준 분류 ---
    if (wpl >= 20) return 'Blunder';
    if (wpl >= 10) return 'Mistake';
    if (wpl >=  5) return 'Inaccuracy';
    if (wpl >=  2) return 'Good';

    // WPL < 2%: Best / Excellent / Brilliant 구분
    const engineTopSan = prevLines[0]?.pv?.split(' ')[0];
    const isTopMove = engineTopSan && engineTopSan === move.san;

    if (isTopMove) {
        // ── Brilliant 감지 (Chess.com 기준) ─────────────────────────────────
        // 조건: 엔진 1순위 수 + 기물/교환 희생 + 압도적 우세 국면이 아님
        // - 폰 희생은 제외 (move.movedPiece === 'p')
        // - 직전 WP 75% 초과 = 이미 완전 우세 → Brilliant 해당 없음
        if (move.isSacrifice && move.movedPiece !== 'p' && prevWp <= 75) {
            return 'Brilliant';
        }
        return 'Best';
    }
    return 'Excellent';
}

/**
 * HTML 특수문자를 이스케이프하여 XSS 공격을 방지합니다.
 */
export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 마크다운 텍스트를 HTML로 변환합니다. marked 라이브러리 사용.
 */
export function formatMarkdownToHtml(text) {
    if (typeof window !== 'undefined' && window.marked) {
        return window.marked.parse(text);
    }
    // fallback: basic markdown
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

/**
 * PGN 스트링 또는 단순 텍스트 기보를 Chess 인스턴스에 로드하고 결과와 PGN 텍스트를 반환합니다.
 */
export function parseAndLoadPgn(chessInstance, pgnText) {
    if (chessInstance.load_pgn(pgnText)) return { success: true, pgn: chessInstance.pgn() };

    chessInstance.reset();
    const cleanedText = pgnText.replace(/\.(?=[a-zA-Z])/g, '. ');
    const tokens = cleanedText.replace(/\n/g, ' ').split(/\s+/).filter(t => t);
    let validMoves = 0;
    
    for (const token of tokens) {
        if (/^\d+\.*$/.test(token)) continue;
        if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;
        
        let cleanToken = token;
        if (cleanToken === '0-0') cleanToken = 'O-O';
        if (cleanToken === '0-0-0') cleanToken = 'O-O-O';
        
        try {
            if (chessInstance.move(cleanToken)) validMoves++;
            else break;
        } catch (err) {
            break;
        }
    }
    
    if (validMoves > 0) {
        return { success: true, pgn: chessInstance.pgn() };
    }
    return { success: false };
}