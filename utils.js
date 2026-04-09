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
 * 승률 변동폭(WPL)과 평가 점수 손실(CPL)을 분석하여 사용자의 수를 평가(Blunder 등)합니다.
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

    const getMate = (str) => {
        if (!str) return null;
        if (str.startsWith('+M')) return parseInt(str.substring(2));
        if (str.startsWith('-M')) return -parseInt(str.substring(2));
        return null;
    };

    const rawPrevMate = getMate(prevEval.scoreStr);
    const rawCurrMate = getMate(currEval.scoreStr);
    const perspectiveMultiplier = (isUserWhite === isWhite) ? 1 : -1;

    const prevMate = rawPrevMate !== null ? (perspectiveMultiplier === 1 ? rawPrevMate : -rawPrevMate) : null;
    const currMate = rawCurrMate !== null ? (perspectiveMultiplier === 1 ? rawCurrMate : -rawCurrMate) : null;
    
    const prevCp = prevEval.scoreNum * perspectiveMultiplier * 100;
    const currCp = currEval.scoreNum * perspectiveMultiplier * 100;

    // Edge Case: 체크메이트 보정
    if (prevMate !== null) {
        if (prevMate > 0) {
            if (currMate !== null && currMate > 0) {
                if (currMate <= prevMate) return 'Best';
                else return 'Good';
            } else if (currMate === null) return 'Missed Win';
            else return 'Blunder';
        } else {
            if (currMate !== null && currMate < 0) {
                if (currMate > prevMate) return 'Blunder';
                else return 'Best';
            } else return 'Best';
        }
    } else {
        if (currMate !== null && currMate < 0) return 'Blunder';
        if (currMate !== null && currMate > 0) return 'Best';
    }

    // Edge Case: Sigmoid 승률 보정
    const wp = (cp) => 1 / (1 + Math.exp(-0.00368208 * cp));
    const prevWp = wp(prevCp);
    const currWp = wp(currCp);
    
    const cpl = prevCp - currCp;
    const wpl = prevWp - currWp;

    let gradeCpl = 0;
    if (cpl >= 300) gradeCpl = 4; else if (cpl >= 100) gradeCpl = 3; else if (cpl >= 50) gradeCpl = 2; else if (cpl >= 10) gradeCpl = 1;

    let gradeWpl = 0;
    if (wpl >= 0.20) gradeWpl = 4; else if (wpl >= 0.10) gradeWpl = 3; else if (wpl >= 0.05) gradeWpl = 2; else if (wpl >= 0.02) gradeWpl = 1;

    if (prevLines && prevLines.length > 1 && prevLines[1]) {
        const bestScore = prevLines[0].scoreNum * perspectiveMultiplier * 100;
        const secondScore = prevLines[1].scoreNum * perspectiveMultiplier * 100;
        if (bestScore > 150 && (bestScore - secondScore >= 150) && wpl >= 0.10) return 'Missed Win';
    }

    const finalGrade = Math.min(gradeCpl, gradeWpl);
    switch (finalGrade) {
        case 4: return 'Blunder';
        case 3: return 'Mistake';
        case 2: return 'Inaccuracy';
        case 1: return 'Good';
        case 0: return 'Best';
        default: return 'Best';
    }
}