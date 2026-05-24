const boardEl = document.querySelector("#board");
const modeEl = document.querySelector("#mode");
const colorEl = document.querySelector("#color");
const difficultyEl = document.querySelector("#difficulty");
const newGameEl = document.querySelector("#newGame");
const turnTextEl = document.querySelector("#turnText");
const gameTextEl = document.querySelector("#gameText");
const moveListEl = document.querySelector("#moveList");

const cp = code => String.fromCodePoint(code);
const symbols = {
  wk: cp(0x2654), wq: cp(0x2655), wr: cp(0x2656), wb: cp(0x2657), wn: cp(0x2658), wp: cp(0x2659),
  bk: cp(0x265a), bq: cp(0x265b), br: cp(0x265c), bb: cp(0x265d), bn: cp(0x265e), bp: cp(0x265f)
};

const pieceValue = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const files = "abcdefgh";
let state;
let selected = null;
let legalTargets = [];
let thinking = false;

function newState() {
  return {
    board: [
      ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
      ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
      ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"]
    ],
    turn: "w",
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    over: false,
    moves: []
  };
}

function cloneGame(game) {
  return {
    board: game.board.map(row => row.slice()),
    turn: game.turn,
    castling: { ...game.castling },
    enPassant: game.enPassant ? { ...game.enPassant } : null,
    halfmove: game.halfmove,
    fullmove: game.fullmove,
    over: game.over,
    moves: game.moves.slice()
  };
}

function colorOf(piece) {
  return piece ? piece[0] : null;
}

function typeOf(piece) {
  return piece ? piece[1] : null;
}

function enemy(color) {
  return color === "w" ? "b" : "w";
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function squareName(r, c) {
  return `${files[c]}${8 - r}`;
}

function orientation() {
  if (modeEl.value === "human") return state.turn === "w" ? "w" : "b";
  return colorEl.value === "white" ? "w" : "b";
}

function render() {
  boardEl.innerHTML = "";
  const view = orientation();
  const rows = view === "w" ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
  const cols = view === "w" ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
  const check = findKing(state, state.turn);
  const inCheckNow = check && isSquareAttacked(state, check.r, check.c, enemy(state.turn));

  for (const r of rows) {
    for (const c of cols) {
      const button = document.createElement("button");
      const piece = state.board[r][c];
      const legal = legalTargets.find(m => m.to.r === r && m.to.c === c);
      button.className = `square ${(r + c) % 2 ? "dark" : "light"}`;
      button.dataset.r = r;
      button.dataset.c = c;
      button.setAttribute("aria-label", `${squareName(r, c)} ${piece ? symbols[piece] : "empty"}`);
      button.textContent = piece ? symbols[piece] : "";
      if (selected && selected.r === r && selected.c === c) button.classList.add("selected");
      if (legal) {
        button.classList.add("legal");
        if (piece || legal.enPassant) button.classList.add("capture");
      }
      if (inCheckNow && check.r === r && check.c === c) button.classList.add("check");
      if ((view === "w" && (r === 7 || c === 0)) || (view === "b" && (r === 0 || c === 7))) {
        const coord = document.createElement("span");
        coord.className = "coord";
        coord.textContent = squareName(r, c);
        button.appendChild(coord);
      }
      button.addEventListener("click", () => onSquareClick(r, c));
      boardEl.appendChild(button);
    }
  }

  boardEl.classList.toggle("thinking", thinking);
  turnTextEl.textContent = `${state.turn === "w" ? "White" : "Black"} to move`;
  renderMoves();
  updateStatus();
}

function renderMoves() {
  moveListEl.innerHTML = "";
  for (const move of state.moves) {
    const item = document.createElement("li");
    item.textContent = move;
    moveListEl.appendChild(item);
  }
  moveListEl.parentElement.scrollTop = moveListEl.parentElement.scrollHeight;
}

function updateStatus() {
  const moves = legalMoves(state);
  if (!moves.length) {
    const king = findKing(state, state.turn);
    state.over = true;
    gameTextEl.textContent = king && isSquareAttacked(state, king.r, king.c, enemy(state.turn))
      ? `Checkmate. ${state.turn === "w" ? "Black" : "White"} wins.`
      : "Stalemate.";
    return;
  }
  const king = findKing(state, state.turn);
  gameTextEl.textContent = king && isSquareAttacked(state, king.r, king.c, enemy(state.turn))
    ? "Check."
    : modeEl.value === "computer" && isComputerTurn()
      ? "Computer is thinking..."
      : "Choose a piece.";
}

function onSquareClick(r, c) {
  if (thinking || state.over) return;
  if (modeEl.value === "computer" && isComputerTurn()) return;
  const piece = state.board[r][c];

  if (selected) {
    const move = legalTargets.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      playMove(move);
      return;
    }
  }

  if (piece && colorOf(piece) === state.turn) {
    selected = { r, c };
    legalTargets = legalMoves(state).filter(m => m.from.r === r && m.from.c === c);
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function playMove(move) {
  const notation = notationFor(state, move);
  applyMove(state, move);
  state.moves.push(notation);
  selected = null;
  legalTargets = [];
  render();
  maybeComputerMove();
}

function maybeComputerMove() {
  if (state.over || modeEl.value !== "computer" || !isComputerTurn()) return;
  thinking = true;
  render();
  window.setTimeout(() => {
    const move = chooseComputerMove();
    if (move) playMove(move);
    thinking = false;
    render();
  }, 280);
}

function isComputerTurn() {
  const human = colorEl.value === "white" ? "w" : "b";
  return state.turn !== human;
}

function legalMoves(game) {
  const moves = pseudoMoves(game, game.turn);
  return moves.filter(move => {
    const copy = cloneGame(game);
    applyMove(copy, move, true);
    const king = findKing(copy, game.turn);
    return king && !isSquareAttacked(copy, king.r, king.c, enemy(game.turn));
  });
}

function pseudoMoves(game, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = game.board[r][c];
      if (colorOf(piece) !== color) continue;
      const type = typeOf(piece);
      if (type === "p") pawnMoves(game, r, c, moves);
      if (type === "n") stepMoves(game, r, c, moves, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
      if (type === "b") slideMoves(game, r, c, moves, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      if (type === "r") slideMoves(game, r, c, moves, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
      if (type === "q") slideMoves(game, r, c, moves, [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
      if (type === "k") kingMoves(game, r, c, moves);
    }
  }
  return moves;
}

function addMove(game, moves, from, to, extra = {}) {
  const piece = game.board[from.r][from.c];
  const target = game.board[to.r][to.c];
  if (target && colorOf(target) === colorOf(piece)) return;
  moves.push({ from, to, piece, capture: target, ...extra });
}

function pawnMoves(game, r, c, moves) {
  const piece = game.board[r][c];
  const color = colorOf(piece);
  const dir = color === "w" ? -1 : 1;
  const start = color === "w" ? 6 : 1;
  const promoteRow = color === "w" ? 0 : 7;
  const one = r + dir;

  if (inBounds(one, c) && !game.board[one][c]) {
    addMove(game, moves, { r, c }, { r: one, c }, one === promoteRow ? { promotion: "q" } : {});
    const two = r + dir * 2;
    if (r === start && !game.board[two][c]) addMove(game, moves, { r, c }, { r: two, c }, { doublePawn: true });
  }

  for (const dc of [-1, 1]) {
    const nr = r + dir;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = game.board[nr][nc];
    if (target && colorOf(target) !== color) {
      addMove(game, moves, { r, c }, { r: nr, c: nc }, nr === promoteRow ? { promotion: "q" } : {});
    }
    if (game.enPassant && game.enPassant.r === nr && game.enPassant.c === nc) {
      addMove(game, moves, { r, c }, { r: nr, c: nc }, { enPassant: true });
    }
  }
}

function stepMoves(game, r, c, moves, deltas) {
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) addMove(game, moves, { r, c }, { r: nr, c: nc });
  }
}

function slideMoves(game, r, c, moves, deltas) {
  const color = colorOf(game.board[r][c]);
  for (const [dr, dc] of deltas) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const target = game.board[nr][nc];
      if (!target) {
        addMove(game, moves, { r, c }, { r: nr, c: nc });
      } else {
        if (colorOf(target) !== color) addMove(game, moves, { r, c }, { r: nr, c: nc });
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

function kingMoves(game, r, c, moves) {
  const color = colorOf(game.board[r][c]);
  stepMoves(game, r, c, moves, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
  if (isSquareAttacked(game, r, c, enemy(color))) return;
  const row = color === "w" ? 7 : 0;
  if (r !== row || c !== 4) return;
  if (game.castling[`${color}k`] && !game.board[row][5] && !game.board[row][6]
    && !isSquareAttacked(game, row, 5, enemy(color)) && !isSquareAttacked(game, row, 6, enemy(color))) {
    addMove(game, moves, { r, c }, { r: row, c: 6 }, { castle: "k" });
  }
  if (game.castling[`${color}q`] && !game.board[row][1] && !game.board[row][2] && !game.board[row][3]
    && !isSquareAttacked(game, row, 3, enemy(color)) && !isSquareAttacked(game, row, 2, enemy(color))) {
    addMove(game, moves, { r, c }, { r: row, c: 2 }, { castle: "q" });
  }
}

function applyMove(game, move, silent = false) {
  const piece = game.board[move.from.r][move.from.c];
  const target = game.board[move.to.r][move.to.c];
  game.board[move.from.r][move.from.c] = null;
  game.board[move.to.r][move.to.c] = move.promotion ? `${colorOf(piece)}${move.promotion}` : piece;

  if (move.enPassant) game.board[move.from.r][move.to.c] = null;
  if (move.castle === "k") {
    game.board[move.to.r][5] = game.board[move.to.r][7];
    game.board[move.to.r][7] = null;
  }
  if (move.castle === "q") {
    game.board[move.to.r][3] = game.board[move.to.r][0];
    game.board[move.to.r][0] = null;
  }

  updateCastling(game, piece, move, target);
  game.enPassant = move.doublePawn ? { r: (move.from.r + move.to.r) / 2, c: move.from.c } : null;
  game.halfmove = typeOf(piece) === "p" || target || move.enPassant ? 0 : game.halfmove + 1;
  if (game.turn === "b") game.fullmove++;
  game.turn = enemy(game.turn);
  if (!silent) game.over = false;
}

function updateCastling(game, piece, move, target) {
  const color = colorOf(piece);
  if (typeOf(piece) === "k") {
    game.castling[`${color}k`] = false;
    game.castling[`${color}q`] = false;
  }
  if (typeOf(piece) === "r") {
    if (move.from.r === 7 && move.from.c === 0) game.castling.wq = false;
    if (move.from.r === 7 && move.from.c === 7) game.castling.wk = false;
    if (move.from.r === 0 && move.from.c === 0) game.castling.bq = false;
    if (move.from.r === 0 && move.from.c === 7) game.castling.bk = false;
  }
  if (target && typeOf(target) === "r") {
    if (move.to.r === 7 && move.to.c === 0) game.castling.wq = false;
    if (move.to.r === 7 && move.to.c === 7) game.castling.wk = false;
    if (move.to.r === 0 && move.to.c === 0) game.castling.bq = false;
    if (move.to.r === 0 && move.to.c === 7) game.castling.bk = false;
  }
}

function findKing(game, color) {
  const king = `${color}k`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.board[r][c] === king) return { r, c };
    }
  }
  return null;
}

function isSquareAttacked(game, r, c, byColor) {
  const pawnDir = byColor === "w" ? -1 : 1;
  for (const dc of [-1, 1]) {
    const pr = r - pawnDir;
    const pc = c - dc;
    if (inBounds(pr, pc) && game.board[pr][pc] === `${byColor}p`) return true;
  }
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && game.board[nr][nc] === `${byColor}n`) return true;
  }
  if (rayAttacked(game, r, c, byColor, [[-1, -1], [-1, 1], [1, -1], [1, 1]], ["b", "q"])) return true;
  if (rayAttacked(game, r, c, byColor, [[-1, 0], [1, 0], [0, -1], [0, 1]], ["r", "q"])) return true;
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const kr = r + dr;
    const kc = c + dc;
    if (inBounds(kr, kc) && game.board[kr][kc] === `${byColor}k`) return true;
  }
  return false;
}

function rayAttacked(game, r, c, color, deltas, attackers) {
  for (const [dr, dc] of deltas) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const piece = game.board[nr][nc];
      if (piece) return colorOf(piece) === color && attackers.includes(typeOf(piece));
      nr += dr;
      nc += dc;
    }
  }
  return false;
}

function notationFor(game, move) {
  const piece = game.board[move.from.r][move.from.c];
  if (move.castle === "k") return "O-O";
  if (move.castle === "q") return "O-O-O";
  const name = typeOf(piece) === "p" ? "" : typeOf(piece).toUpperCase();
  const capture = game.board[move.to.r][move.to.c] || move.enPassant ? "x" : "";
  const pawnFile = typeOf(piece) === "p" && capture ? files[move.from.c] : "";
  const promo = move.promotion ? "=Q" : "";
  return `${pawnFile}${name}${capture}${squareName(move.to.r, move.to.c)}${promo}`;
}

function chooseComputerMove() {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (difficultyEl.value === "easy") return moves[Math.floor(Math.random() * moves.length)];
  const depth = difficultyEl.value === "medium" ? 2 : 4;
  const color = state.turn;
  let best = null;
  let bestScore = -Infinity;
  const ordered = orderMoves(state, moves);
  for (const move of ordered) {
    const copy = cloneGame(state);
    applyMove(copy, move, true);
    const score = -negamax(copy, depth - 1, -Infinity, Infinity, enemy(color));
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best || moves[0];
}

function negamax(game, depth, alpha, beta, color) {
  const moves = legalMoves(game);
  if (depth === 0 || !moves.length) return evaluate(game, color, moves);
  let best = -Infinity;
  for (const move of orderMoves(game, moves)) {
    const copy = cloneGame(game);
    applyMove(copy, move, true);
    const score = -negamax(copy, depth - 1, -beta, -alpha, enemy(color));
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

function evaluate(game, color, cachedMoves = null) {
  const moves = cachedMoves || legalMoves(game);
  if (!moves.length) {
    const king = findKing(game, game.turn);
    if (king && isSquareAttacked(game, king.r, king.c, enemy(game.turn))) {
      return game.turn === color ? -999999 : 999999;
    }
    return 0;
  }
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = game.board[r][c];
      if (!piece) continue;
      const sign = colorOf(piece) === color ? 1 : -1;
      const center = 14 - (Math.abs(3.5 - r) + Math.abs(3.5 - c)) * 2;
      score += sign * (pieceValue[typeOf(piece)] + center);
    }
  }
  return score + moves.length * (game.turn === color ? 2 : -2);
}

function orderMoves(game, moves) {
  return moves.slice().sort((a, b) => moveScore(game, b) - moveScore(game, a));
}

function moveScore(game, move) {
  const target = game.board[move.to.r][move.to.c];
  const piece = game.board[move.from.r][move.from.c];
  let score = 0;
  if (target) score += pieceValue[typeOf(target)] - pieceValue[typeOf(piece)] / 10;
  if (move.promotion) score += 850;
  if (move.castle) score += 40;
  return score;
}

function startGame() {
  state = newState();
  selected = null;
  legalTargets = [];
  thinking = false;
  difficultyEl.disabled = modeEl.value !== "computer";
  colorEl.disabled = modeEl.value !== "computer";
  render();
  maybeComputerMove();
}

modeEl.addEventListener("change", startGame);
colorEl.addEventListener("change", startGame);
difficultyEl.addEventListener("change", startGame);
newGameEl.addEventListener("click", startGame);
startGame();
