import { t } from './strings.js';

/**
 * 엔진 평가값(CP, Mate)을 백 기준 관례(+ = 백 유리)로 파싱합니다.
 * Stockfish는 side-to-move 기준으로 반환하므로 흑 차례이면 부호를 반전합니다.
 */
export function parseEvalData(evalData, isBlackToMove) {
    let scoreStr = '';
    let scoreNum = 0;

    const invert = isBlackToMove;

    if (evalData.type === 'cp') {
        let score = evalData.value;
        if (invert) score = -score;
        scoreNum = score;
        scoreStr = score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    } else if (evalData.type === 'mate') {
        let mateIn = evalData.value;
        if (mateIn === 0) {
            scoreNum = invert ? 999 : -999;
            scoreStr = invert ? '+M0' : '-M0';
        } else {
            if (invert) mateIn = -mateIn;
            scoreNum = mateIn > 0 ? 999 : -999;
            scoreStr = `M${Math.abs(mateIn)}`;
            scoreStr = mateIn > 0 ? `+${scoreStr}` : `-${scoreStr}`;
        }
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
    if (!move) return '';
    // FEN 단일 포지션 분석은 이전 수 비교 대상이 없으므로 분류 생략
    if (move.isFenOnly) return '';
    if (!move.engineLines || !move.engineLines[0]) return '';

    const isWhite = move.isWhite;
    const currEval = move.engineLines[0];

    let prevEval = { scoreNum: 0.2, scoreStr: '+0.20' };
    let prevLines = [];
    if (index > 0) {
        const prevMove = analysisQueue[index - 1];
        if (!prevMove.engineLines || !prevMove.engineLines[0]) return '';
        prevEval = prevMove.engineLines[0];
        prevLines = prevMove.engineLines;
    }

    // scoreNum/scoreStr는 백 기준 → 수를 둔 쪽 기준으로 변환
    const perspectiveMultiplier = isWhite ? 1 : -1;

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
    // mate 0 = 체크메이트 완료 — 수를 둔 쪽이 메이트를 완성한 것이므로 항상 Best
    if (currMate !== null && currMate === 0) return 'Best';

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
 * 슬러그 뒤에 붙는 수순 notation(예: -4.c3-Nf6-5.d3)은 제거하여 루트 오프닝명만 노출한다.
 */
export function parseOpeningFromPgn(pgn) {
    const eco = pgn.match(/\[ECO "([^"]+)"\]/)?.[1] || '';
    const ecoUrl = pgn.match(/\[ECOUrl "([^"]+)"\]/)?.[1] || '';

    let name = '';
    if (ecoUrl) {
        const slug = ecoUrl.split('/openings/')[1] || '';
        name = slug
            .replace(/-\d+\..*$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(':', ': ');
    }

    return { name, eco };
}

/**
 * PGN 스트링 또는 단순 텍스트 기보를 Chess 인스턴스에 로드하고 결과와 PGN 텍스트를 반환합니다.
 */
// chess.js의 validate_fen으로 FEN 문자열의 유효성을 판별한다.
// PGN 파싱 실패 시 fallback으로 FEN 입력을 수용하기 위한 것.
export function isValidFen(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return false;
    try {
        const c = new window.Chess();
        const res = c.validate_fen(trimmed);
        return !!(res && res.valid);
    } catch { return false; }
}

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

export function formatTimeControl(tc) {
    const str = String(tc);
    if (str.includes('+')) {
        const [base, inc] = str.split('+');
        const mins = Number(base) / 60;
        return `${Number.isInteger(mins) ? mins : mins.toFixed(1)}+${inc}`;
    }
    const seconds = Number(str);
    if (!isFinite(seconds) || seconds <= 0) return str;
    const mins = seconds / 60;
    if (Number.isInteger(mins)) return t('time_min').replace('{n}', mins);
    if (seconds < 60) return t('time_sec').replace('{n}', seconds);
    return t('time_min').replace('{n}', mins.toFixed(1));
}

export function formatRelativeDate(dateStr, strings) {
    const d = typeof dateStr === 'number' ? new Date(dateStr * 1000) : new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart - dStart) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return strings.dateToday;
    if (diffDays === 1) return strings.dateYesterday;
    if (diffDays < 8) return strings.dateDaysAgo.replace('{n}', diffDays);
    return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

const TIERS = [
    { key: 'pawn',    min: 0,    glyph: '\u265F' },
    { key: 'knight',  min: 400,  glyph: '\u265E' },
    { key: 'bishop',  min: 700,  glyph: '\u265D' },
    { key: 'rook',    min: 1000, glyph: '\u265C' },
    { key: 'queen',   min: 1400, glyph: '\u265B' },
    { key: 'king',    min: 1800, glyph: '\u265A' },
    { key: 'emperor', min: 2200, glyph: '\u2655' },
];

export function getTier(rapidRating) {
    const r = Number(rapidRating);
    if (!isFinite(r) || r <= 0) return null;
    let tier = TIERS[0];
    for (const t of TIERS) {
        if (r >= t.min) tier = t;
    }
    return { key: tier.key, glyph: tier.glyph, isEmperor: tier.key === 'emperor' };
}

// ==========================================
// Chess.com game helpers
// ==========================================

const LOSS_CODES = ['checkmated', 'timeout', 'resigned', 'abandoned', 'bughousepartnerlose', 'lose'];

// chess.com 게임에서 사용자가 백을 잡았는지 판별. main.js의 분석용 전역 변수 isUserWhite와 충돌을 피하려고 다른 이름 사용.
export function isWhitePlayer(game, userLower) {
    return game.white.username.toLowerCase() === userLower;
}

// chess.com 게임에서 내 결과를 'win' | 'loss' | 'draw'로 단순화.
// 무승부 코드(agreed/repetition/stalemate/insufficient/50move/timevsinsufficient 등)는 win/loss가 아니면 모두 draw 처리.
export function classifyGameResult(game, userLower) {
    const isWhite = isWhitePlayer(game, userLower);
    const rc = (isWhite ? game.white : game.black).result;
    if (rc === 'win') return 'win';
    if (LOSS_CODES.includes(rc)) return 'loss';
    return 'draw';
}

// PGN의 수 번호를 정확히 계산. 시계 주석({[%clk 0:09:59.9]})의 소수점이
// /\d+\./에 잘못 매치되어 blitz/bullet 게임 길이가 부풀려지는 것을 방지하기 위해
// {} 주석을 먼저 제거한다.
export function countMovesFromPgn(pgn) {
    if (!pgn) return 0;
    const cleaned = pgn.replace(/\{[^}]*\}/g, '');
    return (cleaned.match(/\d+\./g) || []).length;
}