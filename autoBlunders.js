// 자동 블런더 수집기.
// 분석 onComplete 직후 호출. 사용자 수만 대상으로:
//   1) classification ∈ {Mistake, Blunder} 워스트 2개 (winChanceDrop 내림차순).
//   2) prev top eval이 mate-in-1~4 였는데 사용자가 그 수를 두지 않은 경우(missed_mate).
//
// 각 후보는 `solution`(시퀀스 + 정답 후보 라인들)을 포함:
//   - 우위(blunder/mistake): 베스트 라인의 PV에서 최대 5플라이 + 끝쪽 forced trim.
//                            상위 multiPV 라인 중 베스트 대비 승률 ≤10%p 떨어진 라인은 정답 후보로 인정.
//   - 메이트(missed_mate):    PV를 체크메이트까지 풀 시퀀스로 저장 (자르지 않음). mate를 주는 라인만 정답.
//
// 노이즈 컷:
//   - 연속된 user 수가 모두 missed_mate면 첫 수만 저장 (M3 놓침 → M4 놓침 도미노 제거).
//   - 직전·이후 모두 user 승률 ≥0.9 또는 ≤0.1 이면 우위 후보 스킵 (이미 결판난 포지션).
//   - position_fen 기준 dedup — 같은 포지션이 다른 게임에서 재발해도 한 번만.

import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { computePgnHash, upsertAnalyzedGame, addVaultItemsBatch, getVaultItems } from './storage.js';
import { lineToEval, winChance } from './utils.js';

const MAX_BLUNDER_PLIES = 5;
const ACCEPT_GAP = 0.10;            // 베스트 대비 승률 갭 ≤ 0.10이면 같은 정답 라인으로 인정
const ALREADY_DECIDED_HI = 0.9;     // 양쪽 다 ≥0.9면 이미 이긴 판
const ALREADY_DECIDED_LO = 0.1;     // 양쪽 다 ≤0.1면 이미 진 판

// 폰 단위(센티폰) 손실 — 표시/정렬 보조용. winChanceDrop이 주 정렬키.
function computeCpLoss(prevEval, postEval, isWhite) {
    if (!prevEval || !postEval) return null;
    if (prevEval.type !== 'cp' || postEval.type !== 'cp') return null;
    return isWhite ? (prevEval.value - postEval.value) : (postEval.value - prevEval.value);
}

// PV(SAN 공백 구분)를 plies 시퀀스로 빌드. fen에서 출발해 각 SAN을 chess.js로 검증해 verbose move 추출.
// `firstSide`는 시퀀스 첫 수의 측 — 일반적으로 'user' (vault 후보는 항상 user의 차례에서 시작).
function buildSequenceFromPv(prevFen, pvSan, { maxPlies, stopOnMate, firstSide = 'user' }) {
    if (!prevFen || !pvSan) return [];
    const tmp = new Chess(prevFen);
    const sanList = pvSan.split(/\s+/).filter(Boolean);
    const moves = [];
    for (const s of sanList) {
        if (moves.length >= maxPlies) break;
        const r = tmp.move(s);
        if (!r) break;
        const side = (moves.length % 2 === 0) ? firstSide : (firstSide === 'user' ? 'opponent' : 'user');
        moves.push({
            san: r.san,
            uci: r.from + r.to + (r.promotion || ''),
            side,
        });
        if (stopOnMate && tmp.isCheckmate()) break;
    }
    return moves;
}

// queue 인덱스 i 주변 ±N ply 윈도우를 게임 컨텍스트로 추출.
// 각 ply: { san, uci, fen(post-move), side: 'user'|'opponent', classification }
// 반환 { plies, blunderIndex (배열 내 i 위치) }. 게임 시작/끝 부근이면 윈도우는 자동으로 잘림.
// export — 수동 저장(main.js)에서도 동일 로직 재사용.
export function buildGameContext(queue, i, isUserWhite, halfWindow = 3) {
    const startIdx = Math.max(0, i - halfWindow);
    const endIdx = Math.min(queue.length - 1, i + halfWindow);
    const plies = [];
    for (let k = startIdx; k <= endIdx; k++) {
        const m = queue[k];
        if (!m) continue;
        plies.push({
            san: m.san || '',
            uci: `${m.from || ''}${m.to || ''}${m.promotion || ''}`,
            fen: m.fen || '',
            side: (m.isWhite === isUserWhite) ? 'user' : 'opponent',
            classification: m.classification || '',
        });
    }
    return { plies, blunderIndex: i - startIdx };
}

// 시퀀스 끝쪽이 강제수(legal moves === 1)면 iterative하게 pop. 메이트 시퀀스에는 호출하지 않음.
// 입력 moves는 mutate. 시퀀스 길이는 1 미만으로는 줄지 않음.
function trimTrailingForced(prevFen, moves) {
    if (!moves || moves.length <= 1) return moves;
    const tmp = new Chess(prevFen);
    for (const m of moves) tmp.move(m.san);
    while (moves.length > 1) {
        // 마지막 수를 undo하면 그 수가 "강제였는지" 검사 가능
        tmp.undo();
        const legal = tmp.moves();
        if (legal.length === 1) {
            moves.pop(); // 강제수 — 학습 가치 없음
        } else {
            // 다시 두기 (state 일관 — 사실 더 진행 안 하니 break면 충분)
            break;
        }
    }
    return moves;
}

// 상위 라인들 중 베스트 대비 user winChance 갭 ≤ ACCEPT_GAP인 것만 정답 후보로.
// 메이트 퍼즐인 경우(`requireMate=true`) mate를 주는 라인만 인정.
// export — 수동 저장(main.js)에서도 동일 로직 재사용.
export function buildAcceptableLines(prevFen, prevEngineLines, isUserWhite, { maxPlies, stopOnMate, requireMate }) {
    if (!Array.isArray(prevEngineLines) || prevEngineLines.length === 0) return [];
    const evals = prevEngineLines.map(l => lineToEval(l));
    const wcs = evals.map(e => winChance(e, isUserWhite));
    const bestWc = wcs[0];
    if (bestWc == null) return [];
    const acceptable = [];
    for (let k = 0; k < prevEngineLines.length; k++) {
        const line = prevEngineLines[k];
        const ev = evals[k];
        const wc = wcs[k];
        if (wc == null || !line.pv) continue;
        if (requireMate) {
            const moverMate = ev?.type === 'mate' && (ev.value * (isUserWhite ? 1 : -1)) > 0;
            if (!moverMate) continue;
        } else if (bestWc - wc > ACCEPT_GAP) {
            continue;
        }
        const seq = buildSequenceFromPv(prevFen, line.pv, { maxPlies, stopOnMate });
        if (seq.length === 0) continue;
        if (!requireMate) trimTrailingForced(prevFen, seq);
        acceptable.push({
            san: seq[0].san,
            uci: seq[0].uci,
            winChance: wc,
            moves: seq,
        });
    }
    return acceptable;
}

// queue → { worstTwo, missedMates } — 각 후보에 solution(시퀀스+정답 라인들) 포함.
export function extractAutoCandidates(queue, isUserWhite) {
    if (!Array.isArray(queue) || queue.length === 0) return { worstTwo: [], missedMates: [] };

    const userMoveIndices = [];
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].isWhite === isUserWhite) userMoveIndices.push(i);
    }

    const missedMates = [];
    const blunderCandidates = [];
    let prevWasMissedMate = false;

    for (const i of userMoveIndices) {
        if (i === 0) { prevWasMissedMate = false; continue; }
        const m = queue[i];
        const prev = queue[i - 1];
        if (!prev?.engineLines?.[0]) { prevWasMissedMate = false; continue; }

        const prevTopLine = prev.engineLines[0];
        const prevEval = lineToEval(prevTopLine);
        const postEval = m.engineLines?.[0] ? lineToEval(m.engineLines[0]) : null;
        if (!prevEval) { prevWasMissedMate = false; continue; }

        const moverSign = isUserWhite ? 1 : -1;
        const prevTopUci = prevTopLine.uci || '';
        const playedUci = `${m.from || ''}${m.to || ''}${m.promotion || ''}`;
        const playedTopMove = !!prevTopUci && playedUci === prevTopUci;

        // ── missed_mate path ──
        if (prevEval.type === 'mate' && !playedTopMove) {
            const mateForMover = prevEval.value * moverSign;
            if (mateForMover > 0 && mateForMover <= 4) {
                if (!prevWasMissedMate) {
                    const acceptable = buildAcceptableLines(prev.fen, prev.engineLines, isUserWhite, {
                        maxPlies: mateForMover * 2,   // M_n = 2n-1 plies; 여유로 2n까지
                        stopOnMate: true,
                        requireMate: true,
                    });
                    if (acceptable.length > 0) {
                        const canonical = acceptable[0];
                        missedMates.push({
                            moveIndex: i,
                            mateIn: mateForMover,
                            bestSan: canonical.san,
                            bestUci: canonical.uci,
                            prevFen: prev.fen,
                            solution: { acceptable, gameContext: buildGameContext(queue, i, isUserWhite) },
                            // 표시용
                            winChanceDrop: 1 - (winChance(postEval, isUserWhite) ?? 0),
                        });
                    }
                }
                prevWasMissedMate = true;
                continue;
            }
        }
        prevWasMissedMate = false;

        // ── blunder/mistake path ──
        const cls = m.classification || '';
        if (cls !== 'Mistake' && cls !== 'Blunder') continue;

        const prevWc = winChance(prevEval, isUserWhite);
        const postWc = winChance(postEval, isUserWhite);
        if (prevWc == null || postWc == null) continue;

        // 이미 결판난 포지션의 실수는 학습 가치 낮음
        if (prevWc >= ALREADY_DECIDED_HI && postWc >= ALREADY_DECIDED_HI) continue;
        if (prevWc <= ALREADY_DECIDED_LO && postWc <= ALREADY_DECIDED_LO) continue;

        const drop = prevWc - postWc;
        if (drop <= 0) continue;

        const acceptable = buildAcceptableLines(prev.fen, prev.engineLines, isUserWhite, {
            maxPlies: MAX_BLUNDER_PLIES,
            stopOnMate: true,         // 메이트가 PV에 있으면 거기서 멈춤
            requireMate: false,
        });
        if (acceptable.length === 0) continue;

        const canonical = acceptable[0];
        blunderCandidates.push({
            moveIndex: i,
            bestSan: canonical.san,
            bestUci: canonical.uci,
            prevFen: prev.fen,
            solution: { acceptable, gameContext: buildGameContext(queue, i, isUserWhite) },
            cpLoss: computeCpLoss(prevEval, postEval, isUserWhite),
            winChanceDrop: drop,
            classification: cls.toLowerCase(),
        });
    }

    blunderCandidates.sort((a, b) => b.winChanceDrop - a.winChanceDrop);
    const worstTwo = blunderCandidates.slice(0, 2);
    return { worstTwo, missedMates };
}

// 후보를 vault_item 레코드로 변환. analyzed_game_id가 들어가야 하므로 호출측에서 합성.
function buildVaultRow({ candidate, queue, gameTitle, isUserWhite, analyzedGameId, classification, playedDate }) {
    const i = candidate.moveIndex;
    const m = queue[i];
    return {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        // source='auto'는 PGN을 analyzed_games에서 가져오므로 vault row에는 PGN 미포함
        pgn: null,
        moveIndex: i,
        gameTitle: gameTitle || '',
        isUserWhite,
        fen: m.fen,
        san: m.san,
        bestMove: candidate.bestSan,
        moveNumber: m.moveNumber,
        isWhite: m.isWhite,
        category: classification, // 'mistake' | 'blunder' | 'missed_mate'
        notes: '',
        source: 'auto',
        analyzedGameId,
        cpLoss: candidate.cpLoss ?? null,
        mateIn: candidate.mateIn ?? null,
        playedDate: playedDate || null,
        prevFen: candidate.prevFen || null,
        solution: candidate.solution || null,
        winChanceDrop: candidate.winChanceDrop ?? null,
    };
}

// 분석 완료 후 메인 진입점. errors는 조용히 흡수 — 토스트 없음.
export async function collectAutoBlunders({ pgn, queue, isUserWhite, headers }) {
    try {
        if (!pgn || !Array.isArray(queue) || queue.length === 0) return;

        const { worstTwo, missedMates } = extractAutoCandidates(queue, isUserWhite);
        if (worstTwo.length === 0 && missedMates.length === 0) return;

        const pgnHash = await computePgnHash(pgn);
        const gameTitle = (headers && headers.White && headers.Black && headers.White !== '?' && headers.Black !== '?')
            ? `${headers.White} vs ${headers.Black}`
            : '';
        const playedDate = headers?.UTCDate || headers?.Date || null;

        const analyzedGameId = await upsertAnalyzedGame({
            pgn,
            pgnHash,
            headersJson: headers || null,
            playedDate,
        });

        let existingFens = new Set();
        try {
            const existing = await getVaultItems({ source: 'auto' });
            existingFens = new Set(existing.map(it => it.fen));
        } catch (e) {
            // dedup 조회 실패 시 빈 set으로 진행 — 동일 게임 재분석 시 중복 row 가능.
            console.warn('Auto blunder dedup lookup failed (proceeding without dedup):', e);
        }

        const items = [];
        const seenFens = new Set();
        const pushIfNew = (row) => {
            if (existingFens.has(row.fen) || seenFens.has(row.fen)) return;
            seenFens.add(row.fen);
            items.push(row);
        };

        for (const c of missedMates) {
            pushIfNew(buildVaultRow({
                candidate: c, queue, gameTitle, isUserWhite, analyzedGameId,
                classification: 'missed_mate', playedDate,
            }));
        }
        for (const c of worstTwo) {
            pushIfNew(buildVaultRow({
                candidate: c, queue, gameTitle, isUserWhite, analyzedGameId,
                classification: c.classification, playedDate,
            }));
        }

        if (items.length > 0) {
            addVaultItemsBatch(items);
        }
    } catch (e) {
        console.warn('Auto blunder collection failed:', e);
    }
}
