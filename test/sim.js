// CPU同士の自己対戦で勝率を測る。 node test/sim.js [倍率]   （ジョブは並列の子プロセスで実行）
'use strict';
const L = require('../logic.js');
const { execFile } = require('child_process');
const MUL = +process.argv[2] || 1, ITERS = 150;   // アストラウルトラは1手あたり 150 回の早送り（ゲーム中は時間で 1.2 秒ぶん）
const JOBS = [];
const LVS = ['weak', 'normal', 'strong', 'ultra'];
for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) JOBS.push({ name: '2人 ' + LVS[b] + ' vs ' + LVS[a], focal: LVS[b], other: LVS[a], np: 2, n: LVS[b] === 'ultra' ? 400 : 2000 });
JOBS.push({ name: '3人 ultra×1 vs strong×2', focal: 'ultra', other: 'strong', np: 3, n: 300 });
JOBS.push({ name: '4人 ultra×1 vs strong×3', focal: 'ultra', other: 'strong', np: 4, n: 240 });
JOBS.push({ name: '5人 ultra×1 vs strong×4', focal: 'ultra', other: 'strong', np: 5, n: 150 });
JOBS.push({ name: '4人 strong×1 vs normal×3', focal: 'strong', other: 'normal', np: 4, n: 1200 });
JOBS.push({ name: '2人 ultra vs strong（ブルーノ式）', focal: 'ultra', other: 'strong', np: 2, n: 300, bruno: true });
JOBS.push({ name: '2人 ultra vs strong（シャハト式初期配置）', focal: 'ultra', other: 'strong', np: 2, n: 300, setup: 'michael' });
JOBS.push({ name: '4人 混成 weak/normal/strong/ultra', mixed: ['weak', 'normal', 'strong', 'ultra'], np: 4, n: 240 });
JOBS.push({ name: '2人 strong vs strong（先手の有利）', focal: 'strong', other: 'strong', np: 2, n: 3000, firstSeat: true });
function run(j) {
  const n = Math.round(j.n * MUL), t0 = Date.now(), score = {}, cnt = {}; let turns = 0, deckEnd = 0, first = 0;
  for (let i = 0; i < n; i++) {
    let lv;
    if (j.mixed) { const r = i % j.np; lv = j.mixed.map((_, q) => j.mixed[(q + r) % j.np]); }
    else { const seat = i % j.np; lv = Array.from({ length: j.np }, (_, q) => q === seat ? j.focal : j.other); }
    const start = Math.floor(i / j.np) % j.np;
    const S = L.simMatch(lv, L.mulberry(9000 + i * 7919), { start, iters: ITERS, bruno: j.bruno, setup: j.setup });
    lv.forEach((l, q) => { cnt[l] = (cnt[l] || 0) + 1; if (S.winners.includes(q)) score[l] = (score[l] || 0) + 1 / S.winners.length; });
    turns += S.ev.filter(e => e.k === 'draw' || (e.k === 'place' && e.from === 'pool')).length; if (S.result.why === 'deck') deckEnd++;
    if (S.winners.includes(start)) first += 1 / S.winners.length;
  }
  const out = {};
  for (const l in cnt) out[l] = { win: +(100 * (score[l] || 0) / n).toFixed(1), seats: cnt[l] / n };
  return { name: j.name, games: n, rate: out, fair: +(100 / j.np).toFixed(1), firstPlayerWin: +(100 * first / n).toFixed(1), deckEndPct: +(100 * deckEnd / n).toFixed(1), sec: +((Date.now() - t0) / 1000).toFixed(1) };
}
if (process.argv[3] != null) { process.stdout.write(JSON.stringify(run(JOBS[+process.argv[3]]))); return; }
const res = []; let next = 0, live = 0, cpus = Math.max(1, require('os').cpus().length - 1);
function pump() {
  while (live < cpus && next < JOBS.length) {
    const k = next++; live++;
    execFile(process.execPath, [__filename, String(MUL), String(k)], { maxBuffer: 1 << 24 }, (err, so) => {
      live--; if (err) { console.error(JOBS[k].name, err.message); process.exitCode = 1; } else { res[k] = JSON.parse(so); const r = res[k];
        console.log(r.name + '（' + r.games + '戦, ' + r.sec + '秒）: ' + Object.keys(r.rate).map(l => l + ' ' + r.rate[l].win + '%' + (r.rate[l].seats > 1 ? '(' + r.rate[l].seats + '席合計)' : '')).join(' / ') + '  均等=' + r.fair + '%  先手勝率' + r.firstPlayerWin + '%  山切れ' + r.deckEndPct + '%'); }
      if (next < JOBS.length) pump(); else if (!live) require('fs').writeFileSync(__dirname + '/sim-report.json', JSON.stringify(res, null, 1));
    });
  }
}
pump();
