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
    const loaded = pvChess.load(fen);
    if (!loaded) return '';
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
 * Lichess CPL(Centipawn Loss) 방식으로 수를 평가합니다.
 *
 * CPL = 이전 포지션 평가 − 현재 포지션 평가 (수를 둔 플레이어 시점, centipawn 단위)
 *
 * 분류 기준:
 *   Best       엔진 1순위 수와 일치
 *   Excellent  CPL ≤ 10  (1순위 아님)
 *   Good       CPL ≤ 50
 *   Inaccuracy CPL ≤ 100
 *   Mistake    CPL ≤ 200
 *   Blunder    CPL > 200
 */
export function classifyMove(index, analysisQueue, isUserWhite) {
    if (index < 0) return '';
    const move = analysisQueue[index];
    if (!move.engineLines || !move.engineLines[0]) return '';

    const isWhite = move.isWhite;
    const currEval = move.engineLines[0];

    let prevEval = { scoreNum: isUserWhite ? 0.2 : -0.2, scoreStr: isUserWhite ? '+0.20' : '-0.20' };
    let prevLines = [];
    if (index > 0) {
        const prevMove = analysisQueue[index - 1];
        if (!prevMove.engineLines || !prevMove.engineLines[0]) return '';
        prevEval = prevMove.engineLines[0];
        prevLines = prevMove.engineLines;
    }

    const perspectiveMultiplier = (isUserWhite === isWhite) ? 1 : -1;

    // --- 메이트 표기 파싱 ---
    const getMate = (str) => {
        if (!str) return null;
        if (str.startsWith('+M')) return parseInt(str.substring(2));
        if (str.startsWith('-M')) return -parseInt(str.substring(2));
        return null;
    };

    const prevMate = getMate(prevEval.scoreStr) !== null ? getMate(prevEval.scoreStr) * perspectiveMultiplier : null;
    const currMate = getMate(currEval.scoreStr) !== null ? getMate(currEval.scoreStr) * perspectiveMultiplier : null;

    // --- 메이트 엣지 케이스 ---
    if (prevMate !== null) {
        if (prevMate > 0) {
            if (currMate !== null && currMate > 0) return currMate <= prevMate ? 'Best' : 'Good';
            return 'Blunder';
        } else {
            if (currMate !== null && currMate < 0) return currMate > prevMate ? 'Blunder' : 'Best';
            return 'Best';
        }
    } else {
        if (currMate !== null && currMate < 0) return 'Blunder';
        if (currMate !== null && currMate > 0) return 'Best';
    }

    // --- CPL 계산 ---
    const prevCp = prevEval.scoreNum * perspectiveMultiplier * 100;
    const currCp = currEval.scoreNum * perspectiveMultiplier * 100;
    const cpl = Math.max(0, prevCp - currCp);

    // 엔진 1순위 수 일치 여부
    const engineTopSan = prevLines[0]?.pv?.split(' ')[0];
    if (engineTopSan && engineTopSan === move.san) return 'Best';

    // --- Lichess CPL 기준 분류 ---
    if (cpl > 200) return 'Blunder';
    if (cpl > 100) return 'Mistake';
    if (cpl >  50) return 'Inaccuracy';
    if (cpl <= 10) return 'Excellent';
    return 'Good';
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
 * PGN 헤더에서 오프닝 정보(이름, ECO 코드)를 추출합니다.
 * Chess.com PGN은 [Opening] 태그가 없고 [ECOUrl] 태그의 슬러그를 변환합니다.
 */
export function parseOpeningFromPgn(pgn) {
    const eco = pgn.match(/\[ECO "([^"]+)"\]/)?.[1] || '';
    const ecoUrl = pgn.match(/\[ECOUrl "([^"]+)"\]/)?.[1] || '';

    let name = '';
    if (ecoUrl) {
        const slug = ecoUrl.split('/openings/')[1] || '';
        name = slug
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(':', ': ');
    }

    return { name, eco };
}

/**
 * PGN 스트링 또는 단순 텍스트 기보를 Chess 인스턴스에 로드하고 결과와 PGN 텍스트를 반환합니다.
 */
export function parseAndLoadPgn(chessInstance, pgnText) {
    try {
        const loaded = chessInstance.load_pgn(pgnText);
        if (loaded) return { success: true, pgn: chessInstance.pgn() };
    } catch (e) {
        console.error('PGN parse error:', e);
    }

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