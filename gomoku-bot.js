/**
 * NHI71 Gomoku Bot (Renju Rules)
 *
 * Rules:
 *   Black (first player): 3-3, 4-4, overline(6+) are forbidden moves
 *   White (second player): no restrictions
 *
 * Usage: Chrome DevTools > Sources > Snippets > Cmd+Enter
 * Stop:  window._botRunning = false
 */

window._botRunning = false;
window._myColor = null;

var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cnRqZXhkcmh6cmthZ21weXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTgwMzYsImV4cCI6MjA5Njc3NDAzNn0.p2ArFmzl-OaBapjcrbzhplCjn3pHfPIISGPv7vi0zN0';
var BASE = 'https://cwrtjexdrhzrkagmpyvj.supabase.co/rest/v1';
var SIZE = 15;
var DIRS = [[1,0],[0,1],[1,1],[1,-1]];

// --- Auth ---

function getToken() {
  try { return JSON.parse(localStorage.getItem('sb-cwrtjexdrhzrkagmpyvj-auth-token')).access_token; }
  catch(e) { return null; }
}

function getH() {
  var t = getToken();
  if (!t) return null;
  return {
    'apikey': ANON,
    'authorization': 'Bearer ' + t,
    'content-type': 'application/json',
    'accept-profile': 'public'
  };
}

function getRoomId() { return location.pathname.split('/').pop(); }
function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// --- Line counting ---

function countLine(board, r, c, dr, dc, color) {
  var cnt = 0, nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cnt++; nr += dr; nc += dc; }
  return { cnt: cnt, open: inBounds(nr, nc) && board[nr][nc] === null };
}

// Count consecutive stones including [r][c] in one axis (both directions)
function lineLength(board, r, c, dr, dc, color) {
  var f = countLine(board, r, c, dr, dc, color);
  var b = countLine(board, r, c, -dr, -dc, color);
  return { total: f.cnt + b.cnt + 1, fOpen: f.open, bOpen: b.open };
}

// --- Renju forbidden move detection (black only) ---

// Count how many "fours" placing at [r][c] creates
function countFours(board, r, c, color) {
  var count = 0;
  for (var i = 0; i < DIRS.length; i++) {
    var dr = DIRS[i][0], dc = DIRS[i][1];
    var ln = lineLength(board, r, c, dr, dc, color);
    if (ln.total === 4 && (ln.fOpen || ln.bOpen)) { count++; }
    // Broken four: _OO_O_ or _O_OO_ pattern
    // Check if skipping one gap in direction gives 4-in-row
    if (ln.total === 3) {
      var nr = r + (countLine(board, r, c, dr, dc, color).cnt + 1) * dr;
      var nc = c + (countLine(board, r, c, dr, dc, color).cnt + 1) * dc;
      if (inBounds(nr, nc) && board[nr][nc] === null) {
        var beyond = countLine(board, nr, nc, dr, dc, color);
        if (beyond.cnt >= 1) { count++; }
      }
    }
  }
  return count;
}

// Count how many "open threes" placing at [r][c] creates
function countOpenThrees(board, r, c, color) {
  var count = 0;
  for (var i = 0; i < DIRS.length; i++) {
    var dr = DIRS[i][0], dc = DIRS[i][1];
    var ln = lineLength(board, r, c, dr, dc, color);
    // Open three: exactly 3 in a row, both ends open
    if (ln.total === 3 && ln.fOpen && ln.bOpen) { count++; }
  }
  return count;
}

// Returns true if placing black at [r][c] is a forbidden move
function isForbidden(board, r, c) {
  board[r][c] = 'black';

  var forbidden = false;

  // Overline (6 or more)
  for (var i = 0; i < DIRS.length; i++) {
    var ln = lineLength(board, r, c, DIRS[i][0], DIRS[i][1], 'black');
    if (ln.total >= 6) { forbidden = true; break; }
  }

  // 4-4
  if (!forbidden && countFours(board, r, c, 'black') >= 2) { forbidden = true; }

  // 3-3
  if (!forbidden && countOpenThrees(board, r, c, 'black') >= 2) { forbidden = true; }

  board[r][c] = null;
  return forbidden;
}

// --- AI scoring ---

function scoreAt(board, r, c, color) {
  board[r][c] = color;
  var score = 0;
  for (var i = 0; i < DIRS.length; i++) {
    var dr = DIRS[i][0], dc = DIRS[i][1];
    var f = countLine(board, r, c, dr, dc, color);
    var b = countLine(board, r, c, -dr, -dc, color);
    var total = f.cnt + b.cnt + 1;
    var opens = (f.open ? 1 : 0) + (b.open ? 1 : 0);
    if (total >= 5) { score += 10000000; }
    else if (total === 4) { score += opens === 2 ? 500000 : opens === 1 ? 50000 : 100; }
    else if (total === 3) { score += opens === 2 ? 50000 : opens === 1 ? 5000 : 10; }
    else if (total === 2) { score += opens === 2 ? 500 : opens === 1 ? 50 : 1; }
  }
  board[r][c] = null;
  return score;
}

// Returns [row, col] of best move, skipping forbidden moves for black
function getBestMove(board, myColor, oppColor) {
  var cands = [], seen = {};
  for (var r = 0; r < SIZE; r++) {
    for (var c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) {
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var nr = r + dr, nc = c + dc;
            var key = nr + '_' + nc;
            if (inBounds(nr, nc) && board[nr][nc] === null && !seen[key]) {
              seen[key] = true;
              cands.push([nr, nc]);
            }
          }
        }
      }
    }
  }
  if (cands.length === 0) return [7, 7];

  var best = -Infinity, move = null;
  for (var i = 0; i < cands.length; i++) {
    var cr = cands[i][0], cc = cands[i][1];

    // Skip forbidden moves when playing black (Renju rules)
    if (myColor === 'black' && isForbidden(board, cr, cc)) {
      console.log('skip forbidden [' + cr + ',' + cc + ']');
      continue;
    }

    var s1 = scoreAt(board, cr, cc, myColor);
    var s2 = scoreAt(board, cr, cc, oppColor);
    var score = s1 > s2 ? s1 : s2;
    if (score > best) { best = score; move = [cr, cc]; }
  }

  // Fallback: if all moves are forbidden (rare), pick any empty cell
  if (!move) {
    for (var i = 0; i < cands.length; i++) { move = cands[i]; break; }
  }
  return move || [7, 7];
}

// --- API ---

function makeMove(row, col) {
  var H = getH();
  if (!H) return Promise.resolve(false);
  return fetch(BASE + '/rpc/place_gomoku_stone', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_room_id: getRoomId(), p_x: col, p_y: row })
  }).then(function(res) {
    if (res.ok) { console.log('placed [' + row + ',' + col + ']'); return true; }
    return res.text().then(function(t) { console.error('fail ' + res.status + ' ' + t); return false; });
  });
}

// Clicks the black (first player) button. 흑 = 흑
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
        if (!clickBlack()) { console.log('waiting for opponent...'); }
        setTimeout(botLoop, 1500);
        return;
      }

      if (room.winner_id || room.result_is_draw) { console.log('game over'); return; }
      if (!window._myColor) { setTimeout(botLoop, 1000); return; }

      var myColor = window._myColor;
      var oppColor = myColor === 'black' ? 'white' : 'black';

      if (room.current_turn_color === myColor) {
        console.log('my turn, calculating...');
        var move = getBestMove(room.board_state, myColor, oppColor);
        makeMove(move[0], move[1]).then(function() { setTimeout(botLoop, 1500); });
      } else {
        setTimeout(botLoop, 1500);
      }
    })
    .catch(function(e) { console.error(e); setTimeout(botLoop, 2000); });
}

window._botRunning = true;
console.log('bot started (renju rules) - stop: window._botRunning = false');
botLoop();
