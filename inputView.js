import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { showAlert } from './dialogs.js';
import { getIsCoordsEnabled } from './storage.js';
import { getDests, isValidFen, parseAndLoadPgn } from './utils.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';

const inputViewBackBtn = document.getElementById('inputViewBackBtn');
const inputViewMovesBtn = document.getElementById('inputViewMovesBtn');
const inputBoardContainer = document.getElementById('inputBoardContainer');
const inputBoardPgn = document.getElementById('inputBoardPgn');
const inputViewUndoBtnBottom = document.getElementById('inputViewUndoBtnBottom');
const inputViewResetBtn = document.getElementById('inputViewResetBtn');
const inputViewAnalyzeBtn = document.getElementById('inputViewAnalyzeBtn');
const inputPrevMoveBtn = document.getElementById('inputPrevMoveBtn');
const inputNextMoveBtn = document.getElementById('inputNextMoveBtn');

let inputChess = new Chess();
let inputStartFen = null;
let inputViewIndex = 0;
let inputCg = null;
let initialized = false;
let deps = {};

function resetInputState() {
    inputChess = new Chess();
    inputStartFen = null;
    inputViewIndex = 0;
    if (inputBoardPgn) inputBoardPgn.value = '';
}

function getInputViewChess() {
    const c = new Chess();
    if (inputStartFen) c.load(inputStartFen);
    const hist = inputChess.history({ verbose: true });
    const limit = Math.min(inputViewIndex, hist.length);
    for (let i = 0; i < limit; i++) {
        c.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    return c;
}

function handleInputBoardMove(orig, dest) {
    const hist = inputChess.history({ verbose: true });
    if (inputViewIndex < hist.length) {
        const newChess = new Chess();
        if (inputStartFen) newChess.load(inputStartFen);
        for (let i = 0; i < inputViewIndex; i++) {
            newChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
        }
        const result = newChess.move({ from: orig, to: dest, promotion: 'q' });
        if (!result) return;
        inputChess = newChess;
    } else {
        const result = inputChess.move({ from: orig, to: dest, promotion: 'q' });
        if (!result) return;
    }
    inputViewIndex++;
    updateInputBoard();
}

function handleInputPrev() {
    if (inputViewIndex <= 0) return;
    inputViewIndex--;
    updateInputBoard();
}

function handleInputNext() {
    if (inputViewIndex >= inputChess.history().length) return;
    inputViewIndex++;
    updateInputBoard();
}

function updateInputNavButtons() {
    const historyLen = inputChess.history().length;
    if (inputPrevMoveBtn) inputPrevMoveBtn.disabled = inputViewIndex === 0;
    if (inputNextMoveBtn) inputNextMoveBtn.disabled = inputViewIndex >= historyLen;
    if (inputViewUndoBtnBottom) inputViewUndoBtnBottom.disabled = inputViewIndex === 0;
}

function updateInputBoard() {
    if (!inputCg || !inputBoardPgn) return;
    const viewChess = getInputViewChess();
    const turnColor = viewChess.turn() === 'w' ? 'white' : 'black';

    let lastMove = [];
    if (inputViewIndex > 0) {
        const hist = inputChess.history({ verbose: true });
        const m = hist[inputViewIndex - 1];
        if (m) lastMove = [m.from, m.to];
    }

    inputCg.set({
        fen: viewChess.fen(),
        turnColor,
        lastMove,
        movable: { color: turnColor, free: false, dests: getDests(viewChess) },
        drawable: { autoShapes: [] }
    });
    inputBoardPgn.value = inputChess.pgn();
    inputBoardPgn.scrollTop = inputBoardPgn.scrollHeight;
    updateInputNavButtons();
}

function doUndoInput() {
    if (inputViewIndex === 0) return;
    const hist = inputChess.history({ verbose: true });
    const newChess = new Chess();
    if (inputStartFen) newChess.load(inputStartFen);
    for (let i = 0; i < inputViewIndex - 1; i++) {
        newChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    inputChess = newChess;
    inputViewIndex--;
    updateInputBoard();
}

function buildInputMovesQueue() {
    const history = inputChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

function handlePgnTextInput() {
    if (!inputBoardPgn) return;
    const text = inputBoardPgn.value.trim();
    if (!text) {
        resetInputState();
        if (inputCg) updateInputBoard();
        return;
    }
    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, text);
    if (result.success) {
        inputChess = tempChess;
        inputStartFen = null;
        inputViewIndex = inputChess.history().length;
        if (inputCg) updateInputBoard();
        return;
    }
    if (isValidFen(text)) {
        const fenChess = new Chess();
        fenChess.load(text);
        inputChess = fenChess;
        inputStartFen = text;
        inputViewIndex = 0;
        if (inputCg) updateInputBoard();
    }
}

function handleAnalyzeClick() {
    const text = inputBoardPgn?.value.trim() || '';
    if (text && isValidFen(text)) {
        deps.requestColorChoice?.((isWhite) => deps.handleFenReviewStart?.(text, isWhite));
        return;
    }
    const pgn = text || inputChess.pgn();
    if (!pgn) {
        showAlert(t('analysis_no_moves'));
        return;
    }
    if (deps.pgnInput) deps.pgnInput.value = pgn;
    deps.requestColorChoice?.((isWhite) => deps.handlePgnReviewStart?.(null, isWhite));
}

function showInputMoves() {
    deps.showMovesOverlay?.({
        getPgn: () => inputBoardPgn?.value.trim() || inputChess.pgn(),
        renderBody: () => renderMovesTable(
            deps.movesBody,
            buildInputMovesQueue(),
            () => deps.closeMovesOverlay?.()
        ),
    });
}

export function initInputView(config) {
    deps = config || {};
    if (initialized) return;
    initialized = true;

    inputViewBackBtn?.addEventListener('click', () => history.back());
    inputViewUndoBtnBottom?.addEventListener('click', doUndoInput);
    inputViewResetBtn?.addEventListener('click', () => {
        resetInputState();
        updateInputBoard();
    });
    inputPrevMoveBtn?.addEventListener('click', handleInputPrev);
    inputNextMoveBtn?.addEventListener('click', handleInputNext);
    inputBoardPgn?.addEventListener('input', handlePgnTextInput);
    inputViewAnalyzeBtn?.addEventListener('click', handleAnalyzeClick);
    inputViewMovesBtn?.addEventListener('click', showInputMoves);
}

export function onInputViewEnter() {
    resetInputState();
    if (!inputCg && inputBoardContainer) {
        inputCg = Chessground(inputBoardContainer, {
            animation: { enabled: true, duration: 250 },
            movable: { free: false },
            coordinates: getIsCoordsEnabled(),
            events: { move: handleInputBoardMove },
        });
    }
    updateInputBoard();
    setTimeout(() => inputCg?.redrawAll(), 50);
}
