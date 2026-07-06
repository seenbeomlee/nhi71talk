/**
 * NHI71 Gomoku Bot
 *
 * Usage: Paste into Chrome DevTools > Sources > Snippets and run with Cmd+Enter
 * The bot automatically clicks the black button and plays optimal moves.
 *
 * Stop: window._botRunning = false
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

// --- AI ---

function countLine(board, r, c, dr, dc, color) {
  var cnt = 0, nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === color) { cnt++; nr += dr; nc += dc; }
  return { cnt: cnt, open: inBounds(nr, nc) && board[nr][nc] === null };
}

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

// Returns [row, col] of best move using attack/defense heuristic scoring
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
  var best = -Infinity, move = [7, 7];
  for (var i = 0; i < cands.length; i++) {
    var cr = cands[i][0], cc = cands[i][1];
    var s1 = scoreAt(board, cr, cc, myColor);
    var s2 = scoreAt(board, cr, cc, oppColor);
    var score = s1 > s2 ? s1 : s2;
    if (score > best) { best = score; move = [cr, cc]; }
  }
  return move;
}

// --- API ---

// Submits a move via Supabase RPC.
// p_x = col (horizontal), p_y = row (vertical)
function makeMove(row, col) {
  var H = getH();
  if (!H) return Promise.resolve(false);
  return fetch(BASE + '/rpc/place_gomoku_stone', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_room_id: getRoomId(), p_x: col, p_y: row })
  }).then(function(res) {
    if (res.ok) { console.log('ok [' + row + ',' + col + ']'); return true; }
    return res.text().then(function(t) { console.error('fail ' + res.status + ' ' + t); return false; });
  });
}

// Finds and clicks the black (first player) button
function clickBlack() {
  var btns = Array.from(document.querySelectorAll('button'));
  // 흥 = 흑 in Unicode
  var btn = btns.find(function(b) { return b.textContent.indexOf('흥') !== -1; });
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

      // Game not started yet: try to click black button
      if (room.status !== 'playing') {
        if (!clickBlack()) { console.log('waiting...'); }
        setTimeout(botLoop, 1500);
        return;
      }

      if (room.winner_id || room.result_is_draw) { console.log('game over'); return; }
      if (!window._myColor) { setTimeout(botLoop, 1000); return; }

      var myColor = window._myColor;
      var oppColor = myColor === 'black' ? 'white' : 'black';

      if (room.current_turn_color === myColor) {
        var move = getBestMove(room.board_state, myColor, oppColor);
        makeMove(move[0], move[1]).then(function() { setTimeout(botLoop, 1500); });
      } else {
        setTimeout(botLoop, 1500);
      }
    })
    .catch(function(e) { console.error(e); setTimeout(botLoop, 2000); });
}

window._botRunning = true;
console.log('bot started - stop: window._botRunning = false');
botLoop();
