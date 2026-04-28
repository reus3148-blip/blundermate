// 자동 블런더 수집기.
// 분석 onComplete 직후 호출. 사용자 수만 대상으로:
//   1) classification ∈ {Mistake, Blunder} 워스트 2개 (CPL 내림차순).
//   2) prev top eval이 mate-in-1~4 였는데 사용자가 그 수를 두지 않은 경우(missed_mate).
//
// 노이즈 컷:
//   - 연속된 user 수가 모두 missed_mate면 첫 수만 저장 (M3 놓침 → M4 놓침 도미노 제거).
//   - 직전·이후 모두 같은 쪽 |cp|≥600 (≈ win% 90/10)이면 cp 후보 스킵 (이미 결판난 포지션의 실수).
//   - position_fen 기준 dedup — 같은 포지션이 다른 게임에서 재발해도 한 번만.
//
// 반환: { worstTwo, missedMates }. collectAutoBlunders가 upsertAnalyzedGame → addVaultItemsBatch로 영속화.

import { computePgnHash, upsertAnalyzedGame, addVaultItemsBatch, getVaultItems } from './storage.js';

// engineLines 항목 → {type:'cp'|'mate', value(white-perspective)} 변환.
// scoreStr 'M3'/'+M2'/'-M5' 또는 cp 정수 형식. parseEvalData가 white-perspective로 정규화해둠.
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

// CPL: 사용자(=mover) 관점의 손실. 양수면 손실.
function computeCpLoss(prevEval, postEval, isWhite) {
    if (!prevEval || !postEval) return null;
    if (prevEval.type !== 'cp' || postEval.type !== 'cp') return null;
    return isWhite ? (prevEval.value - postEval.value) : (postEval.value - prevEval.value);
}

export function extractAutoCandidates(queue, isUserWhite) {
    if (!Array.isArray(queue) || queue.length === 0) return { worstTwo: [], missedMates: [] };

    const userMoves = [];
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].isWhite === isUserWhite) userMoves.push(i);
    }

    const missedMates = [];
    const cpCandidates = [];

    // 연속된 user 수가 모두 missed_mate면 첫 수만 저장. M3 놓침 → M4 놓침 → ... 도미노 노이즈 제거.
    let prevWasMissedMate = false;

    for (const i of userMoves) {
        if (i === 0) { prevWasMissedMate = false; continue; } // 직전 포지션 분석이 필요
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

        // missed_mate: mover가 ≤4수 메이트를 보유했는데 그 수를 안 둠
        if (prevEval.type === 'mate' && !playedTopMove) {
            const mateForMover = prevEval.value * moverSign; // 양수 = mover에게 mate
            if (mateForMover > 0 && mateForMover <= 4) {
                if (!prevWasMissedMate) {
                    const bestSan = (prevTopLine.pv || '').split(' ')[0] || '';
                    missedMates.push({
                        moveIndex: i,
                        bestSan,
                        bestUci: prevTopUci,
                        mateIn: mateForMover,
                    });
                }
                prevWasMissedMate = true;
                continue; // missed_mate면 cp 후보에 다시 넣지 않음
            }
        }
        prevWasMissedMate = false;

        // 워스트 후보: classification이 Mistake/Blunder만
        const cls = m.classification || '';
        if (cls !== 'Mistake' && cls !== 'Blunder') continue;

        // 이미 결판난 포지션의 실수는 학습 가치 낮음 — 직전·이후 모두 같은 쪽 |cp|≥600 (≈ win% 90/10).
        // 예: +10 → +7은 스킵. +10 → 0 같은 진짜 역전은 post가 600 아래로 내려와 통과.
        // missed_mate는 위 분기에서 이미 처리(continue)되므로 영향 없음.
        if (prevEval.type === 'cp' && postEval?.type === 'cp') {
            const userPrev = prevEval.value * moverSign;
            const userPost = postEval.value * moverSign;
            const bothWinning = userPrev >= 600 && userPost >= 600;
            const bothLosing = userPrev <= -600 && userPost <= -600;
            if (bothWinning || bothLosing) continue;
        }

        const cpLoss = computeCpLoss(prevEval, postEval, isUserWhite);
        // cp→mate(메이트로 끌려간 케이스)는 cpLoss 계산 불가 — 큰 가상값으로 정렬 보장
        const sortKey = cpLoss != null ? cpLoss : 9999;
        const bestSan = (prevTopLine.pv || '').split(' ')[0] || '';
        cpCandidates.push({
            moveIndex: i,
            bestSan,
            bestUci: prevTopUci,
            cpLoss,
            sortKey,
            classification: cls.toLowerCase(),
        });
    }

    cpCandidates.sort((a, b) => b.sortKey - a.sortKey);
    const worstTwo = cpCandidates.slice(0, 2);

    // dedup: missed_mate가 우선이지만 위 루프에서 continue로 이미 분리되었으므로 여기선 추가 처리 불필요
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
        mateIn: candidate.mateIn ?? null, // missed_mate에 한해 plies 단위로 채워짐 (1~4)
        playedDate: playedDate || null,
    };
}

// 분석 완료 후 메인 진입점. 게임 PGN + 큐 + 사용자 색을 받아 자동 수집을 백그라운드로 처리.
// errors는 조용히 흡수 — 토스트 없음.
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

        // 풀 전체와 position_fen으로 dedup — 같은 포지션이 다른 게임에서 재발해도 한 번만.
        let existingFens = new Set();
        try {
            const existing = await getVaultItems({ source: 'auto' });
            existingFens = new Set(existing.map(it => it.fen));
        } catch {}

        const items = [];
        const seenFens = new Set();
        const pushIfNew = (row) => {
            if (existingFens.has(row.fen) || seenFens.has(row.fen)) return;
            seenFens.add(row.fen);
            items.push(row);
        };

        for (const c of missedMates) {
            pushIfNew(buildVaultRow({
                candidate: c,
                queue,
                gameTitle,
                isUserWhite,
                analyzedGameId,
                classification: 'missed_mate',
                playedDate,
            }));
        }
        for (const c of worstTwo) {
            pushIfNew(buildVaultRow({
                candidate: c,
                queue,
                gameTitle,
                isUserWhite,
                analyzedGameId,
                classification: c.classification,
                playedDate,
            }));
        }

        if (items.length > 0) {
            console.log('[Auto blunders]', { gameId: analyzedGameId, count: items.length, items: items.map(i => ({ idx: i.moveIndex, cat: i.category })) });
            addVaultItemsBatch(items);
        }
    } catch (e) {
        console.warn('Auto blunder collection failed:', e);
    }
}
