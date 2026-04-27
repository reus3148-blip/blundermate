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
 * cp(폰 단위) 평가를 백 기준 win% (0~100)로 변환 — freechess와 동일한 Lichess 시그모이드.
 * 표시되는 cp ↔ 표시되는 win%가 항상 같은 함수에서 파생되도록 단일 소스로 사용.
 * mate scoreNum(±999)도 자연스럽게 ~0/100 으로 수렴.
 *
 * 표시 cp는 SF의 raw cp 그대로(엔진 그대로의 정직한 값), win%는 그 cp를 시그모이드로 변환.
 * SF18 NN의 WDL 분포는 cp와 다른 모델이라 둘을 섞으면 표시 모순이 발생해서 사용하지 않음.
 *
 * @param {number} scoreNum  백 기준 폰 단위 평가
 * @returns {number | null}
 */
export function cpToWhiteWinPct(scoreNum) {
    if (scoreNum === undefined || scoreNum === null || Number.isNaN(scoreNum)) return null;
    const cp = Math.max(-99900, Math.min(99900, scoreNum * 100));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * engineLine에서 백 기준 win%를 추출 — scoreNum 기반 단일 시그모이드.
 */
export function getWhiteWinPct(engineLine) {
    if (!engineLine) return null;
    return cpToWhiteWinPct(engineLine.scoreNum);
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

// ============================================================
// freechess(WintrCat/freechess) board + classification 헬퍼 포팅.
// 원본 TypeScript를 거의 1:1로 옮긴 자바스크립트 버전.
//
// 호출 패턴이 재진입 없으므로(getDefenders가 getAttackers 호출 후 결과만 사용),
// 각 함수 전용 chess.js 인스턴스를 모듈 레벨에 두고 load/move로 재사용해 alloc 비용을 줄인다.
// Brilliant 검사가 64칸 × N회 돌아서 hot path.
// ============================================================

/**
 * 기물 가치 — 폰 1, 마이너 3, 룩 5, 퀸 9, 킹 Infinity (절대 잡히지 않음).
 * 'm' = "missing"(빈칸 placeholder, 0).
 */
export const pieceValues = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity, m: 0,
};

const promotions = [undefined, 'b', 'n', 'r', 'q'];

// 모듈 레벨 재사용 인스턴스 — 함수별로 독립.
const _atkChess     = new window.Chess();
const _defChess     = new window.Chess();
const _hangA        = new window.Chess();
const _hangB        = new window.Chess();
const _classifyA    = new window.Chess(); // classifyMove의 prev 보드
const _classifyB    = new window.Chess(); // classifyMove의 curr 보드
const _captureChess = new window.Chess(); // Brilliant 검사 capture 시뮬레이터

function flipStmInFen(fen, color) {
    return fen
        .replace(/(?<= )(?:w|b)(?= )/g, color)
        .replace(/ [a-h][1-8] /g, ' - ');
}

function getBoardCoords(square) {
    return { x: 'abcdefgh'.indexOf(square[0]), y: parseInt(square[1], 10) - 1 };
}

function coordsToSquare(c) {
    return 'abcdefgh'.charAt(c.x) + (c.y + 1).toString();
}

/**
 * `square`를 공격하는 상대 기물들을 enumerate. 인접한 적 킹도 (legal capture or 다른 공격자 존재 시) 포함.
 * 동작: FEN의 STM 필드를 적 색으로 뒤집어 chess.js로 합법수 enumerate, to===square인 캡처들을 모은다.
 */
export function getAttackers(fen, square) {
    const attackers = [];
    if (!_atkChess.load(fen)) return attackers;
    const piece = _atkChess.get(square);
    if (!piece) return attackers;

    if (!_atkChess.load(flipStmInFen(fen, piece.color === 'w' ? 'b' : 'w'))) return attackers;

    for (const m of _atkChess.moves({ verbose: true })) {
        if (m.to === square) attackers.push({ square: m.from, color: m.color, type: m.piece });
    }

    // 인접 적 킹 처리 — 다른 공격자 있거나 킹 캡처가 합법이면 attacker로 추가
    const oppColor = piece.color === 'w' ? 'b' : 'w';
    const c = getBoardCoords(square);
    let oppKing = null;
    outer: for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff === 0 && yOff === 0) continue;
            const sq = coordsToSquare({
                x: Math.min(Math.max(c.x + xOff, 0), 7),
                y: Math.min(Math.max(c.y + yOff, 0), 7),
            });
            const p = _atkChess.get(sq);
            if (p && p.color === oppColor && p.type === 'k') {
                oppKing = { color: p.color, square: sq, type: 'k' };
                break outer;
            }
        }
    }
    if (!oppKing) return attackers;

    let kingCaptureLegal = false;
    try {
        if (_atkChess.move({ from: oppKing.square, to: square })) kingCaptureLegal = true;
    } catch {}

    if (attackers.length > 0 || kingCaptureLegal) attackers.push(oppKing);
    return attackers;
}

/**
 * `square`를 보호하는 우리 기물들을 enumerate.
 * 트릭: 한 명의 attacker가 캡처했다고 가정한 상태에서, 그 자리의 attacker를 다시 잡을 수 있는 우리 기물을 찾음.
 * attacker가 없으면 placeholder로 적 퀸을 그 칸에 두고 attacker 검색.
 */
export function getDefenders(fen, square) {
    if (!_defChess.load(fen)) return [];
    const piece = _defChess.get(square);
    if (!piece) return [];

    const testAtt = getAttackers(fen, square)[0];
    if (testAtt) {
        if (!_defChess.load(flipStmInFen(fen, testAtt.color))) return [];
        for (const promo of promotions) {
            try {
                if (_defChess.move({ from: testAtt.square, to: square, promotion: promo })) {
                    return getAttackers(_defChess.fen(), square);
                }
            } catch {}
        }
    } else {
        if (!_defChess.load(flipStmInFen(fen, piece.color))) return [];
        try {
            _defChess.put({ color: piece.color === 'w' ? 'b' : 'w', type: 'q' }, square);
        } catch { return []; }
        return getAttackers(_defChess.fen(), square);
    }
    return [];
}

/**
 * `square` 위 기물이 행잉인지 판정. freechess의 핵심 검사.
 * 등가 트레이드, 룩-마이너 유리 트레이드, 폰 디펜더 케이스를 모두 처리.
 */
export function isPieceHanging(lastFen, fen, square) {
    if (!_hangA.load(lastFen) || !_hangB.load(fen)) return false;

    const lastPiece = _hangA.get(square);
    const piece = _hangB.get(square);
    if (!piece) return false;

    const attackers = getAttackers(fen, square);
    const defenders = getDefenders(fen, square);

    // 등가 또는 더 좋은 거래 후 = 행잉 아님
    if (lastPiece && pieceValues[lastPiece.type] >= pieceValues[piece.type] && lastPiece.color !== piece.color) {
        return false;
    }
    // 룩이 디펜더 1명짜리 마이너를 잡은 케이스 — 유리 트레이드
    if (
        piece.type === 'r'
        && lastPiece && pieceValues[lastPiece.type] === 3
        && attackers.length === 1
        && attackers.every(a => pieceValues[a.type] === 3)
    ) return false;

    // 더 싼 공격자 → 행잉
    if (attackers.some(a => pieceValues[a.type] < pieceValues[piece.type])) return true;

    if (attackers.length > defenders.length) {
        let minAtk = Infinity;
        for (const a of attackers) minAtk = Math.min(pieceValues[a.type], minAtk);

        // 잡으러 들어가는 게 자체 sac이고 우리 디펜더가 더 싸면 행잉 아님
        if (
            pieceValues[piece.type] < minAtk
            && defenders.some(d => pieceValues[d.type] < minAtk)
        ) return false;

        // 폰 디펜더 = 사실상 폰만 잃는 거래 → 행잉 아님
        if (defenders.some(d => pieceValues[d.type] === 1)) return false;

        return true;
    }
    return false;
}

// freechess 분류 임계 — Best/Excellent/Good/Inaccuracy/Mistake 순으로 평가하면서
// 첫 번째 통과하는 임계의 분류를 부여. 임계 미달은 fallthrough → Blunder.
const CENTIPAWN_CLASSES = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake'];

/**
 * freechess의 quadratic CPL 임계 — prevEval(절댓값, cp 단위)이 클수록 임계도 커진다.
 * 이미 +5 우세인 포지션에서 100cp 손실은 평균적 결과에 거의 영향 없음 → Best 통과 가능.
 */
function getEvaluationLossThreshold(classif, prevEval) {
    prevEval = Math.abs(prevEval);
    let t = 0;
    switch (classif) {
        case 'Best':       t = 0.0001 * prevEval ** 2 + 0.0236 * prevEval - 3.7143; break;
        case 'Excellent':  t = 0.0002 * prevEval ** 2 + 0.1231 * prevEval + 27.5455; break;
        case 'Good':       t = 0.0002 * prevEval ** 2 + 0.2643 * prevEval + 60.5455; break;
        case 'Inaccuracy': t = 0.0002 * prevEval ** 2 + 0.3624 * prevEval + 108.0909; break;
        case 'Mistake':    t = 0.0003 * prevEval ** 2 + 0.4027 * prevEval + 225.8182; break;
        default:           t = Infinity;
    }
    return Math.max(t, 0);
}

/**
 * 우리 engineLine({scoreStr, scoreNum, ...})을 freechess의 evaluation({type, value}) 포맷으로 변환.
 *   type: 'cp' | 'mate'
 *   value: cp는 백 기준 정수 cp, mate는 부호 있는 mate 수 (+ = 백 mate)
 */
function lineToEval(line) {
    if (!line) return null;
    const s = line.scoreStr || '';
    if (s.includes('M')) {
        const sign = s.startsWith('-') ? -1 : 1;
        const n = parseInt(s.replace(/[^\d]/g, ''), 10);
        return { type: 'mate', value: sign * (Number.isFinite(n) ? n : 0) };
    }
    return { type: 'cp', value: Math.round((line.scoreNum || 0) * 100) };
}

/**
 * 수 평가 — freechess(WintrCat/freechess) 알고리즘 포팅.
 * 체스닷컴의 review 라벨 체계(Brilliant/Great/Best/Excellent/Good/Inaccuracy/Mistake/Blunder + Forced)를
 * 가장 가깝게 흉내내도록 reverse-engineered된 휴리스틱.
 *
 * 흐름:
 *   1) 1순위 일치 → Best (그 다음 Brilliant/Great 후보 검사)
 *   2) 미일치:
 *      - cp→cp: getEvaluationLossThreshold로 CPL 임계 비교
 *      - cp→mate: blundered into mate, absoluteEvaluation 으로 분류
 *      - mate→cp: missed mate, absoluteEvaluation 으로 분류
 *      - mate→mate: prevAbs/curr 비교
 *   3) 후보가 1개뿐(secondMove 없음) → Forced
 *   4) Best일 때 Brilliant 검사: winning + 비프로모션 + 체크 아닌 상태에서, 마이너 이상 행잉 기물 존재
 *      + 그 기물이 "viably capturable"(공격자 핀 없음, 마이너 이하면 mate-in-1 안 만들어짐)
 *   5) Best일 때 Great 검사: 직전 상대 수가 Blunder + 1-2 ≥ 150cp + 둔 자리 안 행잉
 *   6) Blunder 디그레이드: |currEval| ≥ 600 이면 Good (winning 유지) / prev ≤ -600 이면 Good (이미 lost)
 */
export function classifyMove(index, analysisQueue, isUserWhite) {
    if (index < 0) return '';
    const move = analysisQueue[index];
    if (!move) return '';
    if (move.isFenOnly) return '';

    // 종국 처리: engine eval 없으면 mate/스테일메이트 가능성 — 체크메이트면 Best
    if (!move.engineLines || !move.engineLines[0]) {
        try {
            if (_classifyA.load(move.fen) && _classifyA.isCheckmate()) return 'Best';
        } catch {}
        return '';
    }

    const isWhite = move.isWhite;
    const moverColor = isWhite ? 'w' : 'b';
    const moverSign = isWhite ? 1 : -1;

    // 현재 포지션 평가
    let evaluation = lineToEval(move.engineLines[0]);

    // 이전 포지션 평가 + top/second 정보
    let previousEvaluation, prevTopMoveUci, prevSecondMoveEval, prevFen, prevMoveData;
    if (index > 0) {
        prevMoveData = analysisQueue[index - 1];
        if (!prevMoveData.engineLines || !prevMoveData.engineLines[0]) return '';
        previousEvaluation = lineToEval(prevMoveData.engineLines[0]);
        prevTopMoveUci = prevMoveData.engineLines[0].uci || '';
        if (prevMoveData.engineLines[1]) prevSecondMoveEval = lineToEval(prevMoveData.engineLines[1]);
        prevFen = prevMoveData.fen;
    } else {
        // 시작 포지션 — 표준 +0.20 baseline. top/second 정보 없음 → Brilliant/Great 자동 스킵.
        previousEvaluation = { type: 'cp', value: 20 };
        prevTopMoveUci = '';
        prevSecondMoveEval = null;
        prevFen = '';
    }
    if (!previousEvaluation || !evaluation) return '';

    const absoluteEvaluation = evaluation.value * moverSign;
    const previousAbsoluteEvaluation = previousEvaluation.value * moverSign;
    const absoluteSecondEvaluation = (prevSecondMoveEval ? prevSecondMoveEval.value : 0) * moverSign;

    // --- Forced: 합법수가 1개뿐 (engine이 secondLine 못 채움)
    if (!prevSecondMoveEval && index > 0) return 'Forced';

    // 둔 수의 UCI (포팅 시 1순위 일치 비교용)
    const playedUci = move.from && move.to ? `${move.from}${move.to}${move.promotion || ''}` : '';
    const playedTopMove = prevTopMoveUci && playedUci && playedUci === prevTopMoveUci;

    const noMate = previousEvaluation.type === 'cp' && evaluation.type === 'cp';
    let classification = null;

    if (playedTopMove) {
        classification = 'Best';
    } else if (noMate) {
        const evalLoss = isWhite
            ? previousEvaluation.value - evaluation.value
            : evaluation.value - previousEvaluation.value;
        for (const cls of CENTIPAWN_CLASSES) {
            if (evalLoss <= getEvaluationLossThreshold(cls, previousEvaluation.value)) {
                classification = cls;
                break;
            }
        }
        if (!classification) classification = 'Blunder';
    } else if (previousEvaluation.type === 'cp' && evaluation.type === 'mate') {
        // cp → mate: 메이트로 끌려갔거나, 내가 메이트를 만든 케이스
        if (absoluteEvaluation > 0)       classification = 'Best';
        else if (absoluteEvaluation >= -2) classification = 'Blunder';
        else if (absoluteEvaluation >= -5) classification = 'Mistake';
        else                              classification = 'Inaccuracy';
    } else if (previousEvaluation.type === 'mate' && evaluation.type === 'cp') {
        // mate → cp: 메이트 라인을 놓쳤음
        if (previousAbsoluteEvaluation < 0 && absoluteEvaluation < 0) classification = 'Best';
        else if (absoluteEvaluation >= 400)  classification = 'Good';
        else if (absoluteEvaluation >= 150)  classification = 'Inaccuracy';
        else if (absoluteEvaluation >= -100) classification = 'Mistake';
        else                                 classification = 'Blunder';
    } else {
        // mate → mate
        if (previousAbsoluteEvaluation > 0) {
            if (absoluteEvaluation <= -4)                              classification = 'Mistake';
            else if (absoluteEvaluation < 0)                           classification = 'Blunder';
            else if (absoluteEvaluation < previousAbsoluteEvaluation)  classification = 'Best';
            else if (absoluteEvaluation <= previousAbsoluteEvaluation + 2) classification = 'Excellent';
            else                                                       classification = 'Good';
        } else {
            classification = (absoluteEvaluation === previousAbsoluteEvaluation) ? 'Best' : 'Good';
        }
    }

    // --- Brilliant 검사: 현재 분류가 Best일 때만 ---
    if (classification === 'Best' && prevFen) {
        const winningAnyways = (
            (absoluteSecondEvaluation >= 700 && previousEvaluation.type === 'cp')
            || (previousEvaluation.type === 'mate' && prevSecondMoveEval && prevSecondMoveEval.type === 'mate')
        );

        if (absoluteEvaluation >= 0 && !winningAnyways && !move.san?.includes('=')) {
            try {
                if (_classifyA.load(prevFen) && _classifyB.load(move.fen) && !_classifyA.isCheck()) {
                    const lastPiece = _classifyA.get(move.to) || { type: 'm' };
                    const sacrificedPieces = [];

                    for (const row of _classifyB.board()) {
                        for (const piece of row) {
                            if (!piece) continue;
                            if (piece.color !== moverColor) continue;
                            if (piece.type === 'k' || piece.type === 'p') continue;
                            // 잡은 기물 ≥ 우리 기물이면 등가 트레이드 — 행잉 후보 아님
                            if (pieceValues[lastPiece.type] >= pieceValues[piece.type]) continue;
                            if (isPieceHanging(prevFen, move.fen, piece.square)) sacrificedPieces.push(piece);
                        }
                    }

                    if (sacrificedPieces.length > 0) {
                        const maxSackedValue = Math.max(...sacrificedPieces.map(p => pieceValues[p.type]));
                        let viablyCapturable = false;

                        outer: for (const sacked of sacrificedPieces) {
                            const attackers = getAttackers(move.fen, sacked.square);
                            for (const attacker of attackers) {
                                for (const promo of promotions) {
                                    if (!_captureChess.load(move.fen)) continue;
                                    let moved;
                                    try {
                                        moved = _captureChess.move({
                                            from: attacker.square,
                                            to: sacked.square,
                                            promotion: promo,
                                        });
                                    } catch { moved = null; }
                                    if (!moved) continue;

                                    // attacker가 핀이라 잡은 후 ≥ maxSacked 가치의 기물이 행잉이면 invalid
                                    let attackerPinned = false;
                                    pinScan: for (const row of _captureChess.board()) {
                                        for (const enemy of row) {
                                            if (!enemy) continue;
                                            if (enemy.color === _captureChess.turn()) continue;
                                            if (enemy.type === 'k' || enemy.type === 'p') continue;
                                            if (
                                                isPieceHanging(move.fen, _captureChess.fen(), enemy.square)
                                                && pieceValues[enemy.type] >= maxSackedValue
                                            ) { attackerPinned = true; break pinScan; }
                                        }
                                    }

                                    if (pieceValues[sacked.type] >= 5) {
                                        // 룩 이상 sac은 mate-in-1 검사 면제
                                        if (!attackerPinned) { viablyCapturable = true; break outer; }
                                    } else if (
                                        !attackerPinned
                                        && !_captureChess.moves().some(m => m.endsWith('#'))
                                    ) {
                                        viablyCapturable = true;
                                        break outer;
                                    }
                                }
                            }
                        }

                        if (viablyCapturable) classification = 'Brilliant';
                    }
                }
            } catch {}
        }
    }

    // --- Great 검사: 현재 분류가 Best이고 Brilliant 안 됐을 때 ---
    if (classification === 'Best' && prevMoveData && prevFen && prevSecondMoveEval) {
        try {
            if (
                noMate
                && prevMoveData.classification === 'Blunder'
                && Math.abs(previousEvaluation.value - prevSecondMoveEval.value) >= 150
                && !isPieceHanging(prevFen, move.fen, move.to)
            ) classification = 'Great';
        } catch {}
    }

    // --- Blunder 디그레이드: 여전히 winning이거나 이미 결판난 lost면 Good
    if (classification === 'Blunder' && absoluteEvaluation >= 600) classification = 'Good';
    if (
        classification === 'Blunder'
        && previousAbsoluteEvaluation <= -600
        && previousEvaluation.type === 'cp'
        && evaluation.type === 'cp'
    ) classification = 'Good';

    return classification || 'Best';
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
 * 풀 오프닝 이름을 루트 오프닝(메인 라인)으로 단축.
 * 통계 그룹화용 — chess.com 슬러그가 변종까지 포함하면 같은 루트가 분산되어 통계 의미가 약해짐.
 *
 * 알고리즘:
 *   1) 첫 root 키워드(Gambit/Defense/Game/Opening/System/Attack) 만나는 지점까지 자르기 (최대 3단어).
 *   2) 키워드 미발견 시 첫 두 단어 fallback.
 *
 * 예: "Italian Game Giuoco Pianissimo" → "Italian Game"
 *     "Sicilian Defense Najdorf" → "Sicilian Defense"
 *     "King's Indian Defense Advance" → "King's Indian Defense"
 *     "Ruy Lopez Berlin Defense" → fallback → "Ruy Lopez"
 */
export function rootOpeningName(fullName) {
    if (!fullName) return '';
    const m = fullName.match(/^((?:\S+\s+){1,2}?(?:Gambit|Defense|Defence|Game|Opening|System|Attack))\b/);
    if (m) return m[1];
    return fullName.split(/\s+/).slice(0, 2).join(' ');
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

// ──────────────────────────────────────────────────────────────────
// Clock annotations from chess.com PGN
// ──────────────────────────────────────────────────────────────────
// chess.com의 PGN은 각 수 뒤에 {[%clk H:MM:SS.s]}로 그 수를 둔 직후의 본인 잔여 시계를 기록한다.
// 사고 시간(timeSpent) = prev(같은 색)Clock - clockAfter + increment.
// 첫 수의 prev는 TimeControl 헤더의 base time.
// 클럭 주석 자체가 없는 게임(daily/correspondence 등)은 null 반환 — 통계에서 스킵.

// PGN 본문에서 모든 클럭을 ply 순서대로 초 단위 배열로 반환.
export function extractClocks(pgn) {
    if (!pgn) return [];
    const clocks = [];
    const regex = /\{\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]\}/g;
    let m;
    while ((m = regex.exec(pgn)) !== null) {
        clocks.push(parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]));
    }
    return clocks;
}

// "600+5" / "300" / "1/259200" (correspondence) 등에서 base 초 추출.
// correspondence(1/...)나 0이면 null — 통계 의미 없음.
export function parseInitialTime(tc) {
    if (!tc) return null;
    const str = String(tc);
    if (str.includes('/')) return null; // daily/correspondence
    const base = Number(str.split('+')[0]);
    return Number.isFinite(base) && base > 0 ? base : null;
}

// "600+5" → 5, "300" → 0
export function parseIncrement(tc) {
    if (!tc) return 0;
    const m = String(tc).match(/\+(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) || 0 : 0;
}

// 사용자 색의 모든 수에 대해 { userMoveNumber, clockBefore, clockAfter, timeSpent } 반환.
// 클럭 주석/타임컨트롤 없으면 null. timeSpent는 음수면 0으로 클램프(프리무브 등).
export function extractMoveTimesForUser(pgn, isUserWhite) {
    const clocks = extractClocks(pgn);
    if (clocks.length === 0) return null;
    const tcMatch = pgn && pgn.match(/\[TimeControl\s+"([^"]+)"\]/);
    if (!tcMatch) return null;
    const initialTime = parseInitialTime(tcMatch[1]);
    if (initialTime == null) return null;
    const increment = parseIncrement(tcMatch[1]);
    const out = [];
    const startPly = isUserWhite ? 0 : 1;
    for (let i = startPly; i < clocks.length; i += 2) {
        const clockAfter = clocks[i];
        const clockBefore = i >= 2 ? clocks[i - 2] : initialTime;
        const timeSpent = Math.max(0, clockBefore - clockAfter + increment);
        out.push({
            userMoveNumber: Math.floor(i / 2) + 1,
            clockBefore,
            clockAfter,
            timeSpent,
        });
    }
    return out;
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

export const TIERS = [
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

// PGN의 full move number(백+흑 한 쌍을 1수)를 chess.js로 정확히 계산한다.
// 정규식 방식은 PGN 헤더의 날짜 점([Date "2024.10.07"] 등)이나 흑 수 표기(1... e5)에
// 잘못 매치돼 카운트가 부풀려지는 문제가 있어, chess.js 파싱으로 통일했다.
// 잘못된 PGN이면 0을 반환한다.
export function countMovesFromPgn(pgn) {
    if (!pgn) return 0;
    try {
        const c = new Chess();
        if (!c.load_pgn(pgn)) return 0;
        const ply = c.history().length;
        return Math.ceil(ply / 2);
    } catch {
        return 0;
    }
}