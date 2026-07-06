/**
 * NHI71 Gomoku Bot (Freestyle Rules) - v2
 *
 * Usage: Chrome DevTools > Sources > Snippets > Cmd+Enter
 * Stop:  window._botRunning = false
 * Tune:  window._maxDepth (default 8), window._timeLimit ms (default 50000)
 */

window._botRunning = false;
window._myColor = null;
window._maxDepth = 8;
window._timeLimit = 50000;

var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cnRqZXhkcmh6cmthZ21weXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTgwMzYsImV4cCI6MjA5Njc3NDAzNn0.p2ArFmzl-OaBapjcrbzhplCjn3pHfPIISGPv7vi0zN0';
var BASE = 'https://cwrtjexdrhzrkagmpyvj.supabase.co/rest/v1';
var SIZE = 15;
var DIRS = [[1,0],[0,1],[1,1],[1,-1]];
var MAX_CANDS = 15;
var ROOT_CANDS = 20;
var CENTER = 7;

var _startTime = 0;
var _callCount = 0;
var _timeout = false;

// --- Auth ---

function getToken() {
  try { return JSON.parse(localStorage.getItem('sb-cwrtjexdrhzrkagmpyvj-auth-token')).access_token; }
  catch(e) { return null; }
}

function getH() {
  var t = getToken();
  if (!t) return null;
  return { 'apikey': ANON, 'authorization': 'Bearer ' + t, 'content-type': 'application/json', 'accept-profile': 'public' };
}

function getRoomId() { return location.pathname.split('/').pop(); }
function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// --- Line counting ---

function countLine(board, r, c, dr, dc, color) {
  var cnt = 0, nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cnt++; nr += dr; nc += dc; }
  return { cnt: cnt, open: inBounds(nr, nc) && board[nr][nc] === null };
}

// --- Scoring ---
// open-4 (2000000) >> half-open-4 (200000) >> open-3 (20000) >> ...
// 기존 코드: half-open-4 == open-3 == 50000 이었던 버그 수정

function scoreAt(board, r, c, color) {
  board[r][c] = color;
  var score = 0;
  for (var i = 0; i < DIRS.length; i++) {
    var dr = DIRS[i][0], dc = DIRS[i][1];
    var f = countLine(board, r, c, dr, dc, color);
    var b = countLine(board, r, c, -dr, -dc, color);
    var total = f.cnt + b.cnt + 1;
    var opens = (f.open ? 1 : 0) + (b.open ? 1 : 0);
    if      (total >= 5) score += 10000000;
    else if (total === 4) score += opens === 2 ? 2000000 : opens === 1 ? 200000 : 100;
    else if (total === 3) score += opens === 2 ? 20000   : opens === 1 ? 2000   : 10;
    else if (total === 2) score += opens === 2 ? 200     : opens === 1 ? 20     : 1;
  }
  board[r][c] = null;
  return score;
}

// --- Win check ---

function checkWinAt(board, r, c, color) {
  for (var i = 0; i < DIRS.length; i++) {
    var f = countLine(board, r, c, DIRS[i][0], DIRS[i][1], color);
    var b = countLine(board, r, c, -DIRS[i][0], -DIRS[i][1], color);
    if (f.cnt + b.cnt + 1 >= 5) return true;
  }
  return false;
}

// --- Candidate generation ---

function getCandidates(board) {
  var cands = [], seen = {};
  for (var r = 0; r < SIZE; r++) {
    for (var c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) {
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var nr = r + dr, nc = c + dc;
            var key = nr * SIZE + nc;
            if (inBounds(nr, nc) && board[nr][nc] === null && !seen[key]) {
              seen[key] = true;
              cands.push([nr, nc]);
            }
          }
        }
      }
    }
  }
  return cands;
}

// --- Static board evaluation (leaf node) ---

function boardEval(board, myColor, oppColor) {
  var cands = getCandidates(board);
  var score = 0;
  for (var i = 0; i < cands.length; i++) {
    var r = cands[i][0], c = cands[i][1];
    score += scoreAt(board, r, c, myColor);
    score -= scoreAt(board, r, c, oppColor);
    // 중앙 우선 타이브레이킹
    score += Math.max(0, 3 - Math.abs(r - CENTER) - Math.abs(c - CENTER));
  }
  return score;
}

// --- Minimax with alpha-beta pruning ---
// 타임아웃 시 null 반환 (보드 상태는 반드시 복구 후 반환)

function minimax(board, depth, alpha, beta, isMaximizing, myColor, oppColor) {
  if (_timeout) return null;
  if ((++_callCount & 0x3FF) === 0) {
    if (Date.now() - _startTime >= (window._timeLimit || 50000)) {
      _timeout = true;
      return null;
    }
  }

  if (depth === 0) return boardEval(board, myColor, oppColor);

  var cands = getCandidates(board);
  if (cands.length === 0) return 0;

  // 휴리스틱 점수로 정렬 (알파-베타 효율 극대화)
  cands.sort(function(a, b) {
    var sa = scoreAt(board, a[0], a[1], myColor) + scoreAt(board, a[0], a[1], oppColor);
    var sb = scoreAt(board, b[0], b[1], myColor) + scoreAt(board, b[0], b[1], oppColor);
    return sb - sa;
  });
  if (cands.length > MAX_CANDS) cands.length = MAX_CANDS;

  var color = isMaximizing ? myColor : oppColor;
  var best = isMaximizing ? -Infinity : Infinity;

  for (var i = 0; i < cands.length; i++) {
    var r = cands[i][0], c = cands[i][1];
    board[r][c] = color;
    var val;
    if (checkWinAt(board, r, c, color)) {
      val = isMaximizing ? 10000000 + depth : -10000000 - depth;
    } else {
      val = minimax(board, depth - 1, alpha, beta, !isMaximizing, myColor, oppColor);
    }
    board[r][c] = null;
    if (val === null) return null; // 타임아웃: 상위로 null 전파

    if (isMaximizing) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }

  return (isMaximizing && best === -Infinity) ? -9999999
       : (!isMaximizing && best === Infinity)  ? 9999999
       : best;
}

// --- 반복 심화(Iterative Deepening) ---
// 깊이 1 → maxDepth까지 탐색, 각 깊이 완료 후 결과로 루트 후보 재정렬

function getBestMove(board, myColor, oppColor) {
  _startTime = Date.now();
  _callCount = 0;
  _timeout = false;

  var cands = getCandidates(board);
  if (cands.length === 0) return [7, 7];

  cands.sort(function(a, b) {
    var sa = scoreAt(board, a[0], a[1], myColor) + scoreAt(board, a[0], a[1], oppColor);
    var sb = scoreAt(board, b[0], b[1], myColor) + scoreAt(board, b[0], b[1], oppColor);
    return sb - sa;
  });

  // 즉시 승리 수 체크 (탐색 생략)
  for (var i = 0; i < cands.length; i++) {
    var r = cands[i][0], c = cands[i][1];
    board[r][c] = myColor;
    var win = checkWinAt(board, r, c, myColor);
    board[r][c] = null;
    if (win) { console.log('win! [' + r + ',' + c + ']'); return [r, c]; }
  }

  var rootCands = cands.slice(0, ROOT_CANDS);
  var bestMove = rootCands[0];
  var maxDepth = window._maxDepth || 8;

  for (var depth = 1; depth <= maxDepth; depth++) {
    if (_timeout) break;

    var depthBest = -Infinity, depthMove = null, alpha = -Infinity;
    var scored = [];

    for (var i = 0; i < rootCands.length; i++) {
      if (_timeout) break;
      var r = rootCands[i][0], c = rootCands[i][1];
      board[r][c] = myColor;
      var score;
      if (checkWinAt(board, r, c, myColor)) {
        score = 10000000 + depth;
      } else {
        score = minimax(board, depth - 1, alpha, Infinity, false, myColor, oppColor);
      }
      board[r][c] = null;
      if (score === null) break;

      scored.push({ move: [r, c], score: score });
      if (score > depthBest) { depthBest = score; depthMove = [r, c]; }
      if (score > alpha) alpha = score;
    }

    // 완전히 탐색된 깊이만 결과 반영
    if (!_timeout && depthMove) {
      bestMove = depthMove;
      // 다음 깊이를 위해 이번 깊이 결과로 루트 후보 재정렬
      scored.sort(function(a, b) { return b.score - a.score; });
      rootCands = scored.map(function(x) { return x.move; });
      console.log('depth ' + depth + ': score=' + depthBest + ' move=[' + bestMove + '] t=' + (Date.now() - _startTime) + 'ms');
    }

    if (depthBest >= 10000000) { console.log('forced win found at depth ' + depth); break; }
  }

  return bestMove;
}

// --- API ---

function makeMove(row, col) {
  var H = getH();
  if (!H) return Promise.resolve(false);
  return fetch(BASE + '/rpc/place_gomoku_stone', {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_room_id: getRoomId(), p_x: col, p_y: row })
  }).then(function(res) {
    if (res.ok) { console.log('placed [' + row + ',' + col + ']'); return true; }
    return res.text().then(function(t) { console.error('fail ' + res.status + ' ' + t); return false; });
  });
}

function clickBlack() {
  var btns = Array.from(document.querySelectorAll('button'));
  var btn = btns.find(function(b) { return b.textContent.indexOf('흑') !== -1; });
  if (btn) { btn.click(); window._myColor = 'black'; console.log('black selected'); return true; }
  return false;
}

// --- Main loop ---

function botLoop() {
  if (!window._botRunning) { console.log('stopped'); return; }
  var H = getH();
  if (!H) { setTimeout(botLoop, 3000); return; }

  fetch(BASE + '/gomoku_rooms?select=*&id=eq.' + getRoomId(), { headers: H })
    .then(function(r) { return r.json(); })
    .then(function(a) {
      var room = a[0];
      if (!room) { setTimeout(botLoop, 2000); return; }

      if (room.status !== 'playing') {
        if (!clickBlack()) { console.log('waiting...'); }
        setTimeout(botLoop, 1500);
        return;
      }

      if (room.winner_id || room.result_is_draw) { console.log('game over'); return; }

      if (!window._myColor) {
        window._myColor = room.current_turn_color;
        console.log('color: ' + window._myColor);
      }

      var myColor = window._myColor;
      var oppColor = myColor === 'black' ? 'white' : 'black';

      if (room.current_turn_color === myColor) {
        console.log('my turn (maxDepth=' + (window._maxDepth || 8) + ', limit=' + (window._timeLimit || 50000) + 'ms)...');
        var move = getBestMove(room.board_state, myColor, oppColor);
        console.log('final move: [' + move[0] + ',' + move[1] + '] total=' + (Date.now() - _startTime) + 'ms');
        makeMove(move[0], move[1]).then(function() { setTimeout(botLoop, 1500); });
      } else {
        setTimeout(botLoop, 1500);
      }
    })
    .catch(function(e) { console.error(e); setTimeout(botLoop, 2000); });
}

window._botRunning = true;
console.log('bot started (freestyle, maxDepth=' + (window._maxDepth || 8) + ', timeLimit=' + (window._timeLimit || 50000) + 'ms)');
console.log('stop: window._botRunning = false');
botLoop();
