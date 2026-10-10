/* すくすくガーデン：ルールエンジン＋CPU思考（DOMに依存しない。ブラウザでも Node でも動く）
 * 盤（にわ）は 16マスの配列 g[0..15]（0＝空き、i = 行*4 + 列）。
 * 秘密の情報は「裏向きの山の並び順」だけ。山（S.deck）はホストの S の中だけにあり、画面へは viewFor(S) で枚数だけを渡す。
 * CPU は observe(S, p)（＝viewFor から作る公開情報）だけで考える。山の中身は「見えていない札の枚数」から数えるだけで、並び順はのぞかない。
 */
(function (root) {
'use strict';
var L = {};
L.MAXV = 20; L.NP = [2, 5]; L.DIAG = [0, 5, 10, 15];
L.mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
L.shuffle = shuffle;
var IDEAL = []; for (var i0 = 0; i0 < 16; i0++) IDEAL[i0] = 1 + ((i0 >> 2) + (i0 & 3)) * 19 / 6;
L.IDEAL = IDEAL;

// ---------------- 置き方のルール ----------------
// v をマス i に置けるか（i に今ある札は無視＝入れかえも同じ判定）。行は左→右、列は上→下に「より大きい」（同じ数は不可）
function fits(g, i, v) {
  var r = i >> 2, c = i & 3, k, x;
  for (k = 0; k < 4; k++) { if (k === c) continue; x = g[r * 4 + k]; if (x && (k < c ? x >= v : x <= v)) return false; }
  for (k = 0; k < 4; k++) { if (k === r) continue; x = g[k * 4 + c]; if (x && (k < r ? x >= v : x <= v)) return false; }
  return true;
}
L.fits = fits;
// 置ける場所（空きマス＋入れかえ）。同じ数との入れかえは何も変わらないので除く
L.spots = function (g, v) { var out = []; for (var i = 0; i < 16; i++) if (g[i] !== v && fits(g, i, v)) out.push(i); return out; };
L.validGrid = function (g) { for (var i = 0; i < 16; i++) if (g[i] && !fits(g, i, g[i])) return false; return true; };
L.filled = function (g) { var n = 0; for (var i = 0; i < 16; i++) if (g[i]) n++; return n; };
L.empties = function (g) { return 16 - L.filled(g); };
// ブルーノ・カタラのヴァリアント：置いた札と同じ数が「ななめ隣」にあれば、もう1回
L.diagPair = function (g, i) {
  var r = i >> 2, c = i & 3, v = g[i];
  for (var dr = -1; dr <= 1; dr += 2) for (var dc = -1; dc <= 1; dc += 2) { var rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4 && g[rr * 4 + cc] === v) return true; }
  return false;
};

// ---------------- ゲームの進行 ----------------
// o: { np, setup:'auto'|'michael', bruno:bool, tour:bool, start, rng }
L.newMatch = function (o) {
  var np = Math.max(L.NP[0], Math.min(L.NP[1], o.np | 0));
  var S = { np: np, opts: { setup: o.setup === 'michael' ? 'michael' : 'auto', bruno: !!o.bruno, tour: !!o.tour }, rng: o.rng || Math.random,
    game: 0, games: o.tour ? np : 1, score: new Array(np).fill(0), results: [], ev: [], evId: 0, k: 0, start0: o.start != null ? o.start : -1 };
  return S;
};
function ev(S, e) { e.id = ++S.evId; S.ev.push(e); if (S.ev.length > 80) S.ev.splice(0, S.ev.length - 80); return e; }
L.startGame = function (S) {
  S.game++;
  if (S.start0 < 0) S.start0 = Math.floor(S.rng() * S.np);
  S.start = (S.start0 + S.game - 1) % S.np;
  var deck = []; for (var s = 0; s < S.np; s++) for (var v = 1; v <= L.MAXV; v++) deck.push(v);
  S.deck = shuffle(deck, S.rng);
  S.grids = []; for (var p = 0; p < S.np; p++) S.grids.push(new Array(16).fill(0));
  S.pool = []; S.held = null; S.last = false; S.stall = 0; S.winners = null; S.result = null; S.setupTile = null; S.lastMove = null;
  ev(S, { k: 'game', game: S.game, games: S.games, start: S.start });
  if (S.opts.setup === 'michael') {
    S.phase = 'setup'; S.setupStep = 0; nextSetupStep(S);
  } else {
    for (var q = 0; q < S.np; q++) {
      var pq = (S.start + q) % S.np, t = [S.deck.pop(), S.deck.pop(), S.deck.pop(), S.deck.pop()].sort(function (a, b) { return a - b; });
      L.DIAG.forEach(function (c, j) { S.grids[pq][c] = t[j]; });
    }
    ev(S, { k: 'setup', auto: true });
    S.phase = 'play'; S.need = { p: S.start, k: 'choose' };
  }
  S.k++;
};
function nextSetupStep(S) {
  S.setupStep++;
  S.setupTile = []; for (var q = 0; q < S.np; q++) S.setupTile[(S.start + q) % S.np] = S.deck.pop();
  S.need = { k: 'setup', ps: [] }; for (var p = 0; p < S.np; p++) S.need.ps.push(p);
  ev(S, { k: 'setupDraw', step: S.setupStep, tiles: S.setupTile.slice() });
}
// 合法な操作の一覧（CPU・テスト用）
L.legal = function (S, p) {
  var out = [], nd = S.need; if (!nd || (S.phase !== 'play' && S.phase !== 'setup')) return out;
  if (S.phase === 'setup') { if (nd.ps.indexOf(p) >= 0) L.DIAG.forEach(function (c) { if (!S.grids[p][c]) out.push({ a: 'setup', cell: c }); }); return out; }
  if (nd.p !== p) return out;
  var g = S.grids[p];
  if (nd.k === 'choose') {
    if (S.deck.length) out.push({ a: 'draw' });
    uniq(S.pool).forEach(function (v) { L.spots(g, v).forEach(function (c) { out.push({ a: 'take', v: v, cell: c }); }); });
  } else if (nd.k === 'place') {
    L.spots(g, S.held.v).forEach(function (c) { out.push({ a: 'place', cell: c }); });
    out.push({ a: 'discard' });
  }
  return out;
};
function uniq(a) { var s = {}, o = []; a.forEach(function (v) { if (!s[v]) { s[v] = 1; o.push(v); } }); return o.sort(function (x, y) { return x - y; }); }
L.uniq = uniq;
// 操作を実行。エラーなら文字列を返す
L.act = function (S, p, a) {
  if (!a || typeof a !== 'object') return '不明な操作です';
  var nd = S.need;
  if (S.phase === 'setup') {
    if (a.a !== 'setup' || !nd || nd.ps.indexOf(p) < 0) return 'いまは置けません';
    var c = +a.cell; if (L.DIAG.indexOf(c) < 0 || S.grids[p][c]) return 'そのマスには置けません';
    S.grids[p][c] = S.setupTile[p]; nd.ps.splice(nd.ps.indexOf(p), 1);
    ev(S, { k: 'setupPlace', p: p, v: S.setupTile[p], cell: c }); S.k++;
    if (!nd.ps.length) {
      if (S.setupStep >= 4) { S.setupTile = null; S.phase = 'play'; S.need = { p: S.start, k: 'choose' }; ev(S, { k: 'setup', auto: false }); }
      else nextSetupStep(S);
    }
    return null;
  }
  if (S.phase !== 'play' || !nd || nd.p !== p) return 'あなたの番ではありません';
  var g = S.grids[p];
  if (nd.k === 'choose') {
    if (a.a === 'draw') {
      if (!S.deck.length) return '山がありません';
      var v = S.deck.pop(); S.held = { v: v }; S.stall = 0;
      if (!S.deck.length) S.last = true;
      S.need = { p: p, k: 'place' }; ev(S, { k: 'draw', p: p, v: v, left: S.deck.length }); S.k++;
      return null;
    }
    if (a.a === 'take') {
      var tv = +a.v, cell = +a.cell, ix = S.pool.indexOf(tv);
      if (ix < 0) return 'その札は場にありません';
      if (!(cell >= 0 && cell < 16) || g[cell] === tv || !fits(g, cell, tv)) return 'そこには置けません（小さい順のルール）';
      S.pool.splice(ix, 1); S.stall++;
      return place(S, p, tv, cell, 'pool');
    }
    return 'いまは「山から引く」か「場の札を取る」です';
  }
  if (nd.k === 'place') {
    var hv = S.held.v;
    if (a.a === 'place') {
      var c2 = +a.cell;
      if (!(c2 >= 0 && c2 < 16) || g[c2] === hv || !fits(g, c2, hv)) return 'そこには置けません（小さい順のルール）';
      S.held = null; return place(S, p, hv, c2, 'deck');
    }
    if (a.a === 'discard') { S.held = null; S.pool.push(hv); ev(S, { k: 'discard', p: p, v: hv }); S.lastMove = { p: p, cell: -1, v: hv }; return endTurn(S, p, false); }
    return '引いた札を置くか、場に出してください';
  }
  return '不明な操作です';
};
function place(S, p, v, cell, from) {
  var g = S.grids[p], old = g[cell];
  g[cell] = v; if (old) S.pool.push(old);
  var full = L.filled(g) === 16, extra = !full && S.opts.bruno && L.diagPair(g, cell);
  ev(S, { k: 'place', p: p, v: v, cell: cell, old: old || 0, from: from, n: L.filled(g), extra: extra });
  S.lastMove = { p: p, cell: cell, v: v };
  if (full) { finish(S, [p], 'full'); return null; }
  return endTurn(S, p, extra);
}
function endTurn(S, p, extra) {
  S.k++;
  if (S.last) {
    var e = S.grids.map(L.empties), mn = Math.min.apply(null, e), w = [];
    e.forEach(function (x, q) { if (x === mn) w.push(q); });
    finish(S, w, 'deck'); return null;
  }
  S.need = { p: extra ? p : (p + 1) % S.np, k: 'choose' };
  if (extra) ev(S, { k: 'extra', p: p });
  return null;
}
function finish(S, winners, why) {
  var emp = S.grids.map(L.empties), gain = emp.map(function (x, q) { return winners.indexOf(q) >= 0 ? 2 : -x; });
  if (S.opts.tour) gain.forEach(function (x, q) { S.score[q] += x; }); else winners.forEach(function (q) { S.score[q] += 1; });
  S.winners = winners; S.phase = 'end'; S.need = null; S.held = null;
  S.result = { game: S.game, winners: winners, why: why, empties: emp, gain: S.opts.tour ? gain : null, score: S.score.slice() };
  S.results.push(S.result);
  S.matchOver = S.game >= S.games;
  if (S.matchOver) { var mx = Math.max.apply(null, S.score); S.champions = []; S.score.forEach(function (x, q) { if (x === mx) S.champions.push(q); }); }
  ev(S, { k: 'end', winners: winners, why: why, empties: emp });
  S.k++;
}
L.nextGame = function (S) { if (S.phase === 'end' && !S.matchOver) L.startGame(S); };

// ---------------- 見せる情報（山の並びは渡さない） ----------------
L.viewFor = function (S) {
  return { np: S.np, opts: { setup: S.opts.setup, bruno: S.opts.bruno, tour: S.opts.tour }, phase: S.phase, game: S.game, games: S.games, start: S.start,
    grids: S.grids.map(function (g) { return g.slice(); }), pool: S.pool.slice(), deckN: S.deck.length, held: S.held ? { v: S.held.v } : null,
    need: S.need ? JSON.parse(JSON.stringify(S.need)) : null, last: S.last, setupTile: S.setupTile ? S.setupTile.slice() : null, setupStep: S.setupStep || 0,
    score: S.score.slice(), results: JSON.parse(JSON.stringify(S.results)), result: S.result ? JSON.parse(JSON.stringify(S.result)) : null,
    winners: S.winners ? S.winners.slice() : null, matchOver: !!S.matchOver, champions: S.champions ? S.champions.slice() : null,
    stall: S.stall || 0, lastMove: S.lastMove ? { p: S.lastMove.p, cell: S.lastMove.cell, v: S.lastMove.v } : null,
    ev: S.ev.slice(-40).map(function (e) { return JSON.parse(JSON.stringify(e)); }), k: S.k };
};
// 見えていない札（＝山に残っている札）の枚数。公開情報だけから数える
L.unseen = function (v) {
  var U = new Array(L.MAXV + 1).fill(v.np); U[0] = 0;
  v.grids.forEach(function (g) { g.forEach(function (x) { if (x) U[x]--; }); });
  v.pool.forEach(function (x) { U[x]--; });
  if (v.held) U[v.held.v]--;
  if (v.setupTile) v.setupTile.forEach(function (x, q) { if (x && v.need && v.need.ps && v.need.ps.indexOf(q) >= 0) U[x]--; });
  return U;
};
// CPU が使う公開情報
L.observe = function (S, p) { var v = L.viewFor(S); v.me = p; v.U = L.unseen(v); return v; };

// ---------------- CPU：盤の評価 ----------------
var W0 = { f: 1.0, a: 0.30, d: 0.9, m: 0.35, i: 0.25, t: 1.2, deny: 0.9, win: 40, th: 0.05, ex: 0.6, near: 0.35 };
L.W = Object.assign({}, W0);
var LOG1P = []; for (var a0 = 0; a0 < 200; a0++) LOG1P[a0] = Math.log(1 + a0);
function prefix(A) { var pre = new Array(22); pre[0] = 0; for (var v = 1; v <= 20; v++) pre[v] = pre[v - 1] + (A[v] > 0 ? A[v] : 0); pre[21] = pre[20]; return pre; }
L.prefix = prefix;
// 盤の良さ（大きいほど良い）。pre：手に入る見込みのある札（山＋場）の累積枚数
function evalGrid(g, pre, W) {
  var fill = 0, av = 0, dead = 0, mis = 0, inv = 0, tight = 0, i, r, c, k, x, lo, hi, a, lastA = 0;
  for (i = 0; i < 16; i++) {
    var v = g[i];
    if (v) { fill++; mis += v > IDEAL[i] ? v - IDEAL[i] : IDEAL[i] - v; continue; }
    r = i >> 2; c = i & 3; lo = 0; hi = 21;
    for (k = 0; k < c; k++) { x = g[r * 4 + k]; if (x > lo) lo = x; }
    for (k = c + 1; k < 4; k++) { x = g[r * 4 + k]; if (x && x < hi) hi = x; }
    for (k = 0; k < r; k++) { x = g[k * 4 + c]; if (x > lo) lo = x; }
    for (k = r + 1; k < 4; k++) { x = g[k * 4 + c]; if (x && x < hi) hi = x; }
    a = hi - lo > 1 ? pre[hi - 1] - pre[lo] : 0;
    if (!a) dead++; else { av += LOG1P[a < 200 ? a : 199]; inv += 1 / a; }
    lastA = a;
  }
  if (fill === 16) return 1e6;
  // 行・列の「空きの並び」に入る数が足りるか
  for (var line = 0; line < 8; line++) {
    var prev = 0, run = 0;
    for (k = 0; k <= 4; k++) {
      x = k < 4 ? (line < 4 ? g[line * 4 + k] : g[k * 4 + line - 4]) : 21;
      if (!x) { run++; continue; }
      if (run && x - prev - 1 < run) tight++;
      prev = x; run = 0;
    }
  }
  var s = W.f * fill + W.a * av - W.d * dead - W.m * mis / 10 - W.i * inv * 4 - W.t * tight;
  if (fill === 15) s += W.near * (lastA > 0 ? LOG1P[lastA < 200 ? lastA : 199] : -2);
  return s;
}
L.evalGrid = evalGrid;
// 置いたらどうなるか（g を一時的に書きかえて評価）
function evalAt(g, cell, v, pre, W) { var old = g[cell]; g[cell] = v; var s = evalGrid(g, pre, W); g[cell] = old; return s; }
// 相手 q にとって札 x がどれだけうれしいか（場に出すと取られるかもしれない）
function oppGain(gq, x, pre, W) {
  var emp = 0, last = -1; for (var i = 0; i < 16; i++) if (!gq[i]) { emp++; last = i; }
  if (emp === 1 && fits(gq, last, x)) return W.win;
  var base = evalGrid(gq, pre, W), best = 0;
  for (var c = 0; c < 16; c++) if (gq[c] !== x && fits(gq, c, x)) { var s = evalAt(gq, c, x, pre, W) - base; if (s > best) best = s; }
  return best;
}
// 札 x を場に出したときの損（次の人ほど重く）
function denyTable(ob, p, pre, W) {
  var T = new Array(21).fill(0), np = ob.np;
  for (var d = 1; d < np; d++) {
    var q = (p + d) % np, wq = d === 1 ? 1 : d === 2 ? 0.6 : 0.4, gq = ob.grids[q];
    for (var x = 1; x <= 20; x++) T[x] += wq * oppGain(gq, x, pre, W);
  }
  return T;
}
L.denyTable = denyTable;
function availOf(ob) { var A = ob.U.slice(); ob.pool.forEach(function (x) { A[x]++; }); return A; }
// 札 v を手にしたときの最善（置く／入れかえ／場に出す）。mustPlace なら場に出せない
function bestFor(g, v, pre, W, deny, mustPlace, extraOn) {
  var best = mustPlace ? -1e9 : evalGrid(g, pre, W) - W.deny * deny[v], bc = -1;
  for (var c = 0; c < 16; c++) {
    if (g[c] === v || !fits(g, c, v)) continue;
    var old = g[c]; g[c] = v;
    var s = evalGrid(g, pre, W) - (old ? W.deny * deny[old] : 0);
    if (extraOn && L.diagPair(g, c)) s += W.ex;
    g[c] = old;
    if (s > best) { best = s; bc = c; }
  }
  return { s: best, cell: bc };
}
// 「強い」：引いたときの期待値と、場の札を取る手を比べる
function strongChoose(ob, p, W, opt) {
  var g = ob.grids[p].slice(), A = availOf(ob), pre = prefix(A), deny = opt && opt.noDeny ? new Array(21).fill(0) : denyTable(ob, p, pre, W);
  var cands = [];
  if (ob.deckN > 0) {
    var tot = 0, ev = 0;
    for (var v = 1; v <= 20; v++) if (ob.U[v] > 0) { tot += ob.U[v]; ev += ob.U[v] * bestFor(g, v, pre, W, deny, false, ob.opts.bruno).s; }
    cands.push({ a: { a: 'draw' }, s: ev / tot });
  }
  uniq(ob.pool).forEach(function (v) {
    for (var c = 0; c < 16; c++) {
      if (g[c] === v || !fits(g, c, v)) continue;
      var old = g[c]; g[c] = v;
      var s = evalGrid(g, pre, W) - (old ? W.deny * deny[old] : 0) + W.deny * deny[v] * 0.5 + W.th;
      if (ob.opts.bruno && L.diagPair(g, c)) s += W.ex;
      if (old && ob.stall >= 2 * ob.np && ob.deckN) s -= 1000;   // 入れかえのくり返し（千日手）を避ける
      g[c] = old;
      cands.push({ a: { a: 'take', v: v, cell: c }, s: s });
    }
  });
  cands.sort(function (x, y) { return y.s - x.s; });
  return cands;
}
function strongPlace(ob, p, W, opt) {
  var g = ob.grids[p].slice(), A = availOf(ob), pre = prefix(A), deny = opt && opt.noDeny ? new Array(21).fill(0) : denyTable(ob, p, pre, W), v = ob.held.v, cands = [];
  cands.push({ a: { a: 'discard' }, s: evalGrid(g, pre, W) - W.deny * deny[v] });
  for (var c = 0; c < 16; c++) {
    if (g[c] === v || !fits(g, c, v)) continue;
    var old = g[c]; g[c] = v;
    var s = evalGrid(g, pre, W) - (old ? W.deny * deny[old] : 0);
    if (ob.opts.bruno && L.diagPair(g, c)) s += W.ex;
    g[c] = old; cands.push({ a: { a: 'place', cell: c }, s: s });
  }
  cands.sort(function (x, y) { return y.s - x.s; });
  return cands;
}
// 「普通」：場の札が空きマスにぴったりなら取る。引いた札は「理想の位置」に近い空きマスへ
var WN = { f: 1.0, a: 0, d: 0.6, m: 0.5, i: 0, t: 1.0, deny: 0, win: 0, th: 0.25, ex: 0.3, near: 0 };
var ONE = prefix(new Array(21).fill(1));
// 初期配置（シャハトの初期配置のとき）：ななめのマスのどこに置くか
function setupChoice(ob, p, lv, rng) {
  var g = ob.grids[p], v = ob.setupTile[p], free = L.DIAG.filter(function (c) { return !g[c]; });
  if (lv === 'weak') return free[Math.floor(rng() * free.length)];
  // ななめも最後は小さい順でないと埋まらない → 並びが保てるマスのうち、理想の値に近いところ
  var ok = free.filter(function (c) { var j = L.DIAG.indexOf(c); for (var t = 0; t < 4; t++) { var x = g[L.DIAG[t]]; if (!x) continue; if (t < j ? x >= v : x <= v) return false; } return true; });
  var pool = ok.length ? ok : free, best = pool[0], bd = 1e9;
  if (lv === 'strong' || lv === 'ultra') {
    // 残りの空きにも、ありそうな数が入る余地を残す：v の順位（見えていない札の中で）から位置を決める
    var U = ob.U, less = 0, tot = 0; for (var x2 = 1; x2 <= 20; x2++) { tot += U[x2]; if (x2 < v) less += U[x2]; }
    var q = tot ? (less + 0.5 * U[v]) / tot : v / 21;
    pool.forEach(function (c) {
      var j = L.DIAG.indexOf(c), lo = -1, hi = 4;
      for (var t = 0; t < 4; t++) { if (!g[L.DIAG[t]]) continue; if (t < j) lo = t; else if (t > j && hi === 4) hi = t; }
      // 区間 (lo,hi) の中で j が占める相対位置と q のずれ
      var qlo = lo < 0 ? 0 : g[L.DIAG[lo]] / 21, qhi = hi > 3 ? 1 : g[L.DIAG[hi]] / 21, pos = qlo + (qhi - qlo) * (j - lo) / (hi - lo);
      var d = Math.abs(q - pos); if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  pool.forEach(function (c) { var d = Math.abs(v - IDEAL[c]); if (d < bd) { bd = d; best = c; } });
  return best;
}
// ---------------- CPU の入口 ----------------
// lv: weak / normal / strong / ultra。o: { rng, budget(ms), iters(固定回数), W }
L.aiAct = function (S, p, lv, o) {
  o = o || {}; var rng = o.rng || S.rng || Math.random, W = o.W || L.W;
  var ob = L.observe(S, p);   // ← 公開情報だけ（山の並びは入っていない）
  return L.aiDecide(ob, p, lv, o, rng, W);
};
L.aiDecide = function (ob, p, lv, o, rng, W) {
  var nd = ob.need;
  if (ob.phase === 'setup') return { a: 'setup', cell: setupChoice(ob, p, lv, rng) };
  var g = ob.grids[p];
  if (lv === 'weak') {
    // 「弱い」：数の大きさだけを見て「だいたいこのへん」に置く子どもっぽい打ち方（先は読まない・ときどき気まぐれ）
    var near = function (v, c) { return Math.abs(v - IDEAL[c]); };
    if (nd.k === 'choose') {
      var opts = [];
      uniq(ob.pool).forEach(function (v) { for (var c = 0; c < 16; c++) if (!g[c] && fits(g, c, v) && near(v, c) <= 2.5) opts.push({ a: 'take', v: v, cell: c, d: near(v, c) }); });
      opts.sort(function (x, y) { return x.d - y.d; });
      if (opts.length && (rng() < 0.7 || !ob.deckN)) { var t = opts[0]; return { a: 'take', v: t.v, cell: t.cell }; }
      if (ob.deckN) return { a: 'draw' };
      var any = []; uniq(ob.pool).forEach(function (v) { L.spots(g, v).forEach(function (c) { any.push({ a: 'take', v: v, cell: c }); }); });
      return any[0];
    }
    var v0 = ob.held.v, em = [], sw = [];
    for (var c0 = 0; c0 < 16; c0++) if (g[c0] !== v0 && fits(g, c0, v0)) (g[c0] ? sw : em).push(c0);
    var byNear = function (a, b) { return near(v0, a) - near(v0, b); };
    em.sort(byNear); sw = sw.filter(function (c) { return near(v0, c) + 1 < near(g[c], c); }).sort(byNear);
    if (em.length && rng() < 0.3) return { a: 'place', cell: em[Math.floor(rng() * em.length)] };
    if (em.length && (near(v0, em[0]) <= 4 || !sw.length)) return { a: 'place', cell: em[0] };
    if (sw.length && rng() < 0.6) return { a: 'place', cell: sw[0] };
    if (em.length) return { a: 'place', cell: em[0] };
    return { a: 'discard' };
  }
  if (lv === 'normal') {
    var obN = Object.assign({}, ob, { U: new Array(21).fill(1), pool: ob.pool });
    var cs = nd.k === 'choose' ? strongChooseSimple(obN, p, rng) : strongPlace(Object.assign({}, obN, { U: ob.U }), p, WN, { noDeny: true });
    return pickNoisy(cs, rng, 0.25);
  }
  if (lv === 'strong' || !o || (o.budget === 0 && !o.iters)) {
    var cs2 = nd.k === 'choose' ? strongChoose(ob, p, W) : strongPlace(ob, p, W);
    return pickNoisy(cs2, rng, W.noise || 0);
  }
  return ultraDecide(ob, p, o, rng, W);
};
// 普通の「取るか引くか」：空きマスにきれいに入る場の札があれば取る
function strongChooseSimple(ob, p, rng) {
  var g = ob.grids[p].slice(), base = evalGrid(g, ONE, WN), best = null, bs = WN.th;
  uniq(ob.pool).forEach(function (v) { for (var c = 0; c < 16; c++) { if (g[c] || !fits(g, c, v)) continue; var s = evalAt(g, c, v, ONE, WN) - base; if (s > bs) { bs = s; best = { a: 'take', v: v, cell: c }; } } });
  if (best) return [{ a: best, s: bs }];
  if (ob.deckN) return [{ a: { a: 'draw' }, s: 0 }];
  var any = []; uniq(ob.pool).forEach(function (v) { L.spots(g, v).forEach(function (c) { any.push({ a: { a: 'take', v: v, cell: c }, s: evalAt(g, c, v, ONE, WN) }); }); });
  return any.sort(function (x, y) { return y.s - x.s; });
}
function pickNoisy(cs, rng, noise) {
  if (!noise || cs.length < 2) return cs[0].a;
  var b = cs[0], best = -1e9; cs.forEach(function (c) { var s = c.s + noise * (rng() * 2 - 1); if (s > best) { best = s; b = c; } }); return b.a;
}

// ---------------- アストラウルトラ：モンテカルロ先読み ----------------
// 見えていない札（＝山の中身）から「ありえる山の並び」をランダムに作り、候補の手ごとに最後まで（または一定手数）早送りして勝率を比べる。
// 候補どうしで同じ山の並びを使う（比較のぶれを減らす）。山の本当の並びは使わない。
var WR = null;   // 早送り用の軽い評価（L.W から作る）
function rolloutPolicyChoose(R, p, pre) {
  var stall = R.stall >= 2 * R.np, g = R.g[p], base = evalGrid(g, pre, WR), best = null, bs = WR.th + 0.15, pool = R.pool;
  for (var j = 0; j < pool.length; j++) {
    var v = pool[j]; if (j && pool.indexOf(v) < j) continue;
    for (var c = 0; c < 16; c++) {
      if (g[c] === v || (stall && g[c]) || !fits(g, c, v)) continue;
      var old = g[c]; g[c] = v; var s = evalGrid(g, pre, WR) - base; g[c] = old;
      if (old && givesWin(R, p, old)) s -= 50;
      if (s > bs) { bs = s; best = [v, c]; }
    }
  }
  return best;
}
function givesWin(R, p, x) {
  for (var d = 1; d < R.np; d++) { var gq = R.g[(p + d) % R.np], emp = 0, last = -1; for (var i = 0; i < 16; i++) if (!gq[i]) { emp++; last = i; } if (emp === 1 && fits(gq, last, x)) return true; }
  return false;
}
function rolloutPlace(R, p, v, pre) {
  var g = R.g[p], best = evalGrid(g, pre, WR) - (givesWin(R, p, v) ? 50 : 0), bc = -1;
  for (var c = 0; c < 16; c++) {
    if (g[c] === v || !fits(g, c, v)) continue;
    var old = g[c]; g[c] = v; var s = evalGrid(g, pre, WR); if (s >= 1e6) { g[c] = old; return c; }
    if (old && givesWin(R, p, old)) s -= 50;
    if (R.bruno && L.diagPair(g, c)) s += WR.ex;
    g[c] = old; if (s > best) { best = s; bc = c; }
  }
  return bc;
}
// R = { np, g:[grids], pool:[], deck:[], bruno }。turn の手番から始める。勝者の配列を返す（maxTurns で打ち切ったら評価で決める）
function rRemove(a, v) { var i = a.indexOf(v); if (i >= 0) a.splice(i, 1); }
function rPut(R, p, v, c) { var g = R.g[p], old = g[c]; g[c] = v; if (old) R.pool.push(old); return old; }
function rollout(R, turn, maxTurns, A) {
  var pre = prefix(A), n = 0, p = turn;
  while (n++ < maxTurns) {
    var extra = false, ch = rolloutPolicyChoose(R, p, pre), c, v;
    if (ch || !R.deck.length) {
      if (!ch) { // 山がない（通常は起きない）
        break;
      }
      v = ch[0]; c = ch[1]; rRemove(R.pool, v); rPut(R, p, v, c); R.stall++;
      A[v]--; pre = prefix(A);
    } else {
      v = R.deck.pop(); R.stall = 0; c = rolloutPlace(R, p, v, pre);
      if (c >= 0) { rPut(R, p, v, c); A[v]--; pre = prefix(A); } else R.pool.push(v);
    }
    if (c >= 0) {
      if (L.filled(R.g[p]) === 16) return [p];
      extra = R.bruno && L.diagPair(R.g[p], c);
    }
    if (!R.deck.length) { var e = R.g.map(L.empties), mn = Math.min.apply(null, e), w = []; e.forEach(function (x, q) { if (x === mn) w.push(q); }); return w; }
    if (!extra) p = (p + 1) % R.np;
  }
  return null;   // 打ち切り
}
function leafShare(R, me, A) {   // 打ち切ったときの勝ちの見込み（評価の softmax）
  var pre = prefix(A), s = R.g.map(function (g) { return evalGrid(g, pre, WR); }), mx = Math.max.apply(null, s), z = 0, mine = 0;
  s.forEach(function (x, q) { var e = Math.exp((x - mx) * (WR.beta || 1.2)); z += e; if (q === me) mine = e; });
  return mine / z;
}
function ultraDecide(ob, p, o, rng, W) {
  WR = Object.assign({}, W);
  var nd = ob.need, cands = nd.k === 'choose' ? strongChoose(ob, p, W) : strongPlace(ob, p, W);
  if (cands.length === 1) return cands[0].a;
  var K = nd.k === 'choose' ? 4 : 5, top = cands.slice(0, K);
  if (nd.k === 'choose' && ob.deckN && !top.some(function (c) { return c.a.a === 'draw'; })) top[top.length - 1] = cands.filter(function (c) { return c.a.a === 'draw'; })[0];
  if (nd.k === 'place' && !top.some(function (c) { return c.a.a === 'discard'; })) top.push(cands.filter(function (c) { return c.a.a === 'discard'; })[0]);
  // 早送りの長さ：終盤ほど最後まで
  var minEmp = Math.min.apply(null, ob.grids.map(L.empties)), maxTurns = minEmp <= 4 ? 400 : ob.np * 6;
  var unseenList = []; for (var v = 1; v <= 20; v++) for (var k = 0; k < ob.U[v]; k++) unseenList.push(v);
  var score = top.map(function () { return 0; }), cnt = 0, t0 = Date.now(), budget = o.budget || 1500, iters = o.iters || 0;
  var Abase = availOf(ob); if (ob.held) Abase[ob.held.v] = Abase[ob.held.v] || 0;
  while (iters ? cnt < iters : (Date.now() - t0 < budget && cnt < 4000)) {
    var deck = shuffle(unseenList.slice(), rng);
    for (var ci = 0; ci < top.length; ci++) {
      var a = top[ci].a, R = { np: ob.np, g: ob.grids.map(function (g) { return g.slice(); }), pool: ob.pool.slice(), deck: deck.slice(), bruno: ob.opts.bruno, stall: ob.stall || 0 }, A = Abase.slice(), extra = false, c = -1, v2, done = null;
      if (a.a === 'draw') {
        if (!R.deck.length) continue;
        v2 = R.deck.pop(); R.stall = 0; c = rolloutPlace(R, p, v2, prefix(A));
        if (c >= 0) { rPut(R, p, v2, c); A[v2]--; } else R.pool.push(v2);
      } else if (a.a === 'take') { v2 = a.v; c = a.cell; rRemove(R.pool, v2); rPut(R, p, v2, c); A[v2]--; R.stall++; }
      else if (a.a === 'place') { v2 = ob.held.v; c = a.cell; rPut(R, p, v2, c); }
      else if (a.a === 'discard') { R.pool.push(ob.held.v); A[ob.held.v]++; }
      if (c >= 0 && L.filled(R.g[p]) === 16) done = [p];
      else {
        if (c >= 0) extra = R.bruno && L.diagPair(R.g[p], c);
        if (!R.deck.length || ob.last) { var e = R.g.map(L.empties), mn = Math.min.apply(null, e); done = []; e.forEach(function (x, q) { if (x === mn) done.push(q); }); }
        else done = rollout(R, extra ? p : (p + 1) % ob.np, maxTurns, A);
      }
      score[ci] += done ? (done.indexOf(p) >= 0 ? 1 / done.length : 0) : leafShare(R, p, A);
    }
    cnt++;
  }
  var bi = 0; for (var i = 1; i < top.length; i++) if (score[i] > score[bi] + 1e-9) bi = i;
  L.lastUltra = { n: cnt, cands: top.map(function (c, i) { return { a: c.a, s: +c.s.toFixed(3), win: +(score[i] / Math.max(1, cnt)).toFixed(3) }; }) };
  return top[bi].a;
}

// ---------------- 自己対戦（シミュレーション・調整用） ----------------
// levels：席ごとの強さ（文字列 or 関数 (S,p)=>action）
L.simMatch = function (levels, rng, o) {
  o = o || {};
  var S = L.newMatch({ np: levels.length, setup: o.setup, bruno: o.bruno, tour: o.tour, start: o.start, rng: rng });
  L.startGame(S);
  for (;;) {
    var guard = 0;
    while ((S.phase === 'play' || S.phase === 'setup') && guard++ < 3000) {
      var p = S.phase === 'setup' ? S.need.ps[0] : S.need.p, lv = levels[p];
      var a = typeof lv === 'function' ? lv(S, p) : L.aiAct(S, p, lv, { rng: rng, budget: o.budget, iters: o.iters, W: o.W && o.W[p] });
      var e = L.act(S, p, a); if (e) throw new Error('AI illegal: ' + e + ' ' + JSON.stringify(a));
      if (o.check) o.check(S);
    }
    if (S.phase !== 'end') throw new Error('stuck ' + S.phase);
    if (S.matchOver) break;
    L.nextGame(S);
  }
  return S;
};
L.setWeights = function (w) { L.W = Object.assign({}, W0, w || {}); };
L.W0 = W0;
if (typeof module !== 'undefined' && module.exports && !root.LN_WEIGHTS) { try { require('./weights.js'); } catch (e) {} }
var G_ = typeof globalThis !== 'undefined' ? globalThis : root;
if (G_.LN_WEIGHTS) L.setWeights(G_.LN_WEIGHTS);
if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.LN = L;
})(typeof window !== 'undefined' ? window : this);
