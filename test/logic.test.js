// ルール・情報漏れ・CPUの公平さのテスト。 node test/logic.test.js
'use strict';
const L = require('../logic.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' : ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function G(rows) { return rows.flat(); }
function counts(S) {   // 札の総数の保存
  const c = new Array(21).fill(0);
  S.grids.forEach(g => g.forEach(x => x && c[x]++)); S.pool.forEach(x => c[x]++); S.deck.forEach(x => c[x]++); if (S.held) c[S.held.v]++;
  if (S.phase === 'setup' && S.setupTile) S.setupTile.forEach((x, q) => { if (S.need.ps.includes(q)) c[x]++; });
  return c;
}
function mk(np, o) { const S = L.newMatch(Object.assign({ np, rng: L.mulberry(5), start: 0 }, o || {})); L.startGame(S); return S; }

// --- 置き方のルール ---
{
  const g = G([[2, 0, 0, 13], [0, 9, 0, 0], [0, 0, 0, 15], [10, 0, 16, 0]]);
  ok(L.fits(g, 1, 5), '2 の右・9 の上に 5 は置ける');
  ok(!L.fits(g, 1, 2), '同じ列に同じ数（2）は置けない（狭義の昇順）');
  ok(!L.fits(g, 1, 9), '同じ列に同じ数（9）は置けない');
  ok(!L.fits(g, 1, 1), '2 より小さい数は 2 の右に置けない');
  ok(!L.fits(g, 2, 13), '13 の左に 13 は置けない');
  ok(L.fits(g, 2, 12), '13 の左・9 より右下でなくてもよい（列は空き）');
  ok(!L.fits(g, 15, 15), '15 の下に 15 は置けない');
  ok(L.fits(g, 15, 17), '右下に 17 は置ける');
  ok(L.fits(g, 0, 9) && !L.fits(g, 0, 11), '入れかえの判定：左上の 2 を 9 にはできるが 11 にはできない（下に 10）');
  eq(L.spots(G([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 2), [5, 6, 7, 9, 10, 11, 13, 14, 15], '同じ数との入れかえ・同じ行や列には置けない');
  ok(L.validGrid(G([[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]])), '対角に同じ数があってもよい（行・列だけを見る）');
  ok(!L.validGrid(G([[1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])), '行に同じ数は不可');
  ok(L.validGrid(G([[0, 0, 0, 20], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]])), '離れた札どうしは行・列が違えば関係なし');
}
// --- 準備 ---
for (const np of [2, 3, 4, 5]) {
  const S = mk(np);
  ok(S.deck.length === np * 20 - 4 * np, np + '人：札は1人20枚（1〜20）×人数、4枚ずつ配る');
  const c = counts(S); ok(c.slice(1).every(x => x === np), np + '人：1〜20 が人数ぶんずつ');
  ok(S.grids.every(g => { const d = L.DIAG.map(i => g[i]); return d.every((x, i) => i === 0 || x >= d[i - 1]) && L.filled(g) === 4; }), np + '人：ななめに小さい順');
  ok(S.phase === 'play' && S.need.p === 0 && S.need.k === 'choose', '最初の手番');
}
// --- 手番 ---
{
  const S = mk(2);
  ok(L.act(S, 1, { a: 'draw' }) !== null, '手番でない人は動けない');
  ok(L.act(S, 0, { a: 'take', v: 5, cell: 1 }) !== null, '場にない札は取れない');
  ok(L.act(S, 0, { a: 'discard' }) !== null, '引く前に場には出せない');
  const n0 = S.deck.length; ok(L.act(S, 0, { a: 'draw' }) === null && S.deck.length === n0 - 1 && S.held, '山から引く');
  ok(L.act(S, 0, { a: 'draw' }) !== null, '2枚は引けない');
  const v = S.held.v; ok(L.act(S, 0, { a: 'discard' }) === null && S.pool.includes(v) && S.need.p === 1, '植えずに場へ → 次の人');
  // 場の札を取ったら必ず植える：置けないマスは拒否
  const g1 = S.grids[1]; const bad = [...Array(16).keys()].find(i => !L.fits(g1, i, v) || g1[i] === v);
  if (bad != null) ok(L.act(S, 1, { a: 'take', v, cell: bad }) !== null, '場の札は置けるマスにしか置けない');
  const good = L.spots(g1, v);
  if (good.length) { const old = g1[good[0]]; ok(L.act(S, 1, { a: 'take', v, cell: good[0] }) === null && g1[good[0]] === v && (!old || S.pool.includes(old)), '場の札を取って植える（入れかえた札は場へ）'); }
  ok(counts(S).slice(1).every(x => x === 2), '札の数は保存される');
}
// 入れかえ
{
  const S = mk(2); S.grids[0] = G([[3, 0, 0, 0], [0, 8, 0, 0], [0, 0, 12, 0], [0, 0, 0, 18]]);
  S.deck.push(10); L.act(S, 0, { a: 'draw' });
  ok(L.act(S, 0, { a: 'place', cell: 10 }) === null && S.grids[0][10] === 10 && S.pool.includes(12), '引いた札で入れかえ → 古い札は表向きで場へ');
}
// 完成でその場で勝ち
{
  const S = mk(3); S.grids[1] = G([[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 0]]);
  S.need = { p: 1, k: 'choose' }; S.pool.push(9);
  ok(L.act(S, 1, { a: 'take', v: 9, cell: 15 }) === null && S.phase === 'end' && JSON.stringify(S.winners) === '[1]' && S.result.why === 'full', '16マス目を植えたらすぐ勝ち');
}
// 山の最後の1枚
{
  const S = mk(3); S.deck = [7]; S.grids[0] = G([[1, 0, 0, 0], [0, 6, 0, 0], [0, 0, 11, 0], [0, 0, 0, 19]]);
  S.grids[1] = G([[1, 2, 0, 0], [0, 6, 0, 0], [0, 0, 11, 0], [0, 0, 0, 19]]); S.grids[2] = G([[1, 2, 0, 0], [0, 6, 0, 0], [0, 0, 11, 0], [0, 0, 0, 19]]);
  L.act(S, 0, { a: 'draw' }); ok(S.phase === 'play' && S.last, '最後の1枚を引いても、その番は続ける');
  L.act(S, 0, { a: 'place', cell: 2 });
  ok(S.phase === 'end' && S.result.why === 'deck' && JSON.stringify(S.winners) === '[0,1,2]', '山がなくなったら空きの少ない人の勝ち（同点は全員）: ' + JSON.stringify(S.winners));
}
{
  const S = mk(2); S.deck = [20]; S.grids[1][1] = 0;
  L.act(S, 0, { a: 'draw' }); L.act(S, 0, { a: 'discard' });
  ok(S.phase === 'end' && S.result.why === 'deck', '最後の1枚を場に出しても終わり');
}
// シャハト式の初期配置
{
  const S = mk(3, { setup: 'michael' });
  ok(S.phase === 'setup' && S.need.ps.length === 3 && S.setupTile.every(x => x >= 1), 'シャハト式：全員が1枚ずつ引く');
  ok(L.act(S, 0, { a: 'setup', cell: 1 }) !== null, 'ななめ以外には置けない');
  for (let step = 1; step <= 4; step++) {
    for (const p of [2, 0, 1]) { const free = L.DIAG.filter(c => !S.grids[p][c]); const t = S.setupTile[p]; ok(L.act(S, p, { a: 'setup', cell: free[free.length - 1] }) === null && S.grids[p][free[free.length - 1]] === t, 'シャハト式：好きなななめに置く'); }
    ok(counts(S).slice(1).every(x => x === 3), 'シャハト式：札の数');
  }
  ok(S.phase === 'play' && S.grids.every(g => L.filled(g) === 4), 'シャハト式：4枚置いたら開始');
  ok(L.act(S, 0, { a: 'setup', cell: 0 }) !== null, '置いたあとは動かせない');
}
// ブルーノ式
{
  const S = mk(2, { bruno: true }); S.grids[0] = G([[2, 0, 0, 0], [0, 7, 0, 0], [0, 0, 12, 0], [0, 0, 0, 18]]);
  S.pool.push(7); ok(L.act(S, 0, { a: 'take', v: 7, cell: 3 }) === null, 'ブルーノ：7 を右上へ（7 と ななめ隣ではない）');
  ok(S.need.p === 1, 'ななめに同じ数がなければ次の人');
  S.grids[1] = G([[2, 0, 0, 0], [0, 9, 0, 0], [0, 0, 12, 0], [0, 0, 0, 18]]); S.pool.push(12);
  ok(L.act(S, 1, { a: 'take', v: 12, cell: 7 }) === null && S.grids[1][7] === 12, 'ブルーノ：12 を植える');
  ok(S.need.p === 1 && S.ev.some(e => e.k === 'extra'), 'ブルーノ：置いた 12 の ななめ隣に 12 → もう1回');
  const S2 = mk(2, { bruno: false }); S2.grids[0] = G([[2, 0, 0, 0], [0, 9, 0, 0], [0, 0, 12, 0], [0, 0, 0, 18]]); S2.pool.push(12);
  L.act(S2, 0, { a: 'take', v: 12, cell: 7 }); ok(S2.need.p === 1, 'ブルーノ式オフなら続けない');
}
// トーナメント
{
  const S = L.simMatch(['strong', 'strong', 'normal'], L.mulberry(9), { tour: true, start: 1 });
  ok(S.results.length === 3 && S.matchOver, 'トーナメント：人数ぶん遊ぶ');
    const starts = []; { const T = L.newMatch({ np: 3, tour: true, rng: L.mulberry(2), start: 1 }); for (let i = 0; i < 3; i++) { L.startGame(T); starts.push(T.start); T.phase = 'end'; } }
  eq(starts, [1, 2, 0], 'トーナメント：全員が1回ずつ先手');
  const sum = [0, 0, 0]; S.results.forEach(r => r.empties.forEach((e, q) => { sum[q] += r.winners.includes(q) ? 2 : -e; }));
  eq(S.score, sum, 'トーナメント：勝ち +2、ほかは空きマス1つ −1');
}
// --- 情報漏れ ---
{
  const S = mk(4); L.act(S, 0, { a: 'draw' });
  const v = L.viewFor(S), js = JSON.stringify(v);
  ok(!('deck' in v) && !/"deck"/.test(js), 'ビューに山の中身がない');
  const S2 = JSON.parse(JSON.stringify(S, (k, x) => k === 'rng' ? undefined : x)); S2.rng = S.rng; S2.deck = L.shuffle(S2.deck.slice(), L.mulberry(77));
  ok(JSON.stringify(L.viewFor(S2)) === js, '山の並びが違ってもビューは同じ');
  const U = L.unseen(v), c = new Array(21).fill(0); S.deck.forEach(x => c[x]++);
  eq(U, c, '見えていない札の数＝山の中身（並びは不明）');
}
// --- CPU：公平さ（山の並びを変えても同じ手） ---
for (const lv of ['weak', 'normal', 'strong', 'ultra']) {
  let same = 0, tot = 0;
  // 途中局面を作る
  for (let t = 0; t < 25; t++) {
    const S = mk(3, { rng: L.mulberry(400 + t) });
    for (let k = 0; k < 6 + t; k++) { if (S.phase !== 'play') break; const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'strong', { rng: L.mulberry(k) })); }
    if (S.phase !== 'play') continue;
    const p = S.need.p, S2 = Object.assign({}, S, { deck: L.shuffle(S.deck.slice(), L.mulberry(999 + t)) });
    const a1 = L.aiAct(S, p, lv, { rng: L.mulberry(1), iters: 40 }), a2 = L.aiAct(S2, p, lv, { rng: L.mulberry(1), iters: 40 });
    tot++; if (JSON.stringify(a1) === JSON.stringify(a2)) same++;
  }
  ok(tot > 10 && same === tot, lv + '：山の並びを変えても同じ判断（' + same + '/' + tot + '）');
}
// --- CPU：合法手だけ・札の保存・盤は常に正しい ---
{
  let games = 0;
  const lvs = ['weak', 'normal', 'strong', 'ultra'];
  for (let i = 0; i < 60; i++) {
    const np = 2 + (i % 4), lv = Array.from({ length: np }, (_, q) => lvs[(i + q) % 4]);
    L.simMatch(lv, L.mulberry(1000 + i), { iters: 15, setup: i % 3 === 0 ? 'michael' : 'auto', bruno: i % 2 === 0, check: S => {
      if (!S.grids.every(L.validGrid)) throw new Error('invalid grid');
      if (!counts(S).slice(1).every(x => x === np)) throw new Error('count');
    } });
    games++;
  }
  ok(games === 60, 'CPU 全レベル×2〜5人×オプションで60戦：反則なし・札の数OK・盤は常に昇順');
}
// --- 千日手よけ ---
{
  const S = mk(2); S.grids[0] = G([[2, 0, 5, 9], [0, 3, 8, 13], [4, 0, 9, 17], [10, 12, 17, 20]]); S.grids[1] = G([[2, 5, 6, 7], [4, 6, 0, 11], [7, 10, 11, 14], [8, 13, 14, 20]]);
  S.pool = [18, 18, 19, 19, 3, 16, 12, 15, 16]; S.stall = 10;
  const a = L.aiAct(S, 0, 'strong', {}); ok(a.a === 'draw' || (a.a === 'take' && !S.grids[0][a.cell]), '入れかえが続いたら CPU は山を引く（または空きマスへ）');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
