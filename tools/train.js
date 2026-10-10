// 自己対戦で「強い」の評価の重みを調整する。 node tools/train.js [iters=40] [games=2400]
// 候補の重みを1席に、残りの席は今のベストにして対戦（2〜4人を混ぜる）。同じ乱数の対局どうしで比べ、勝率が有意に上がったら採用（山登り）。
'use strict';
const fs = require('fs'), path = require('path');
const L = require('../logic.js');
const { execFile } = require('child_process');
if (process.argv[2] === '--eval') {
  const W = JSON.parse(process.argv[3]), B = JSON.parse(process.argv[4]), from = +process.argv[5], to = +process.argv[6];
  let win = 0, fair = 0;
  for (let i = from; i < to; i++) {
    const np = [2, 3, 4, 2, 3][i % 5], seat = i % np;
    const lv = Array.from({ length: np }, (_, q) => (S, p) => L.aiAct(S, p, 'strong', { W: q === seat ? W : B, rng: S.rng }));
    const S = L.simMatch(lv, L.mulberry(77000 + i * 131), { start: Math.floor(i / 5) % np, bruno: i % 7 === 3, setup: i % 11 === 5 ? 'michael' : 'auto' });
    if (S.winners.includes(seat)) win += 1 / S.winners.length;
    fair += 1 / np;
  }
  process.stdout.write(JSON.stringify({ win, fair, n: to - from }));
  return;
}
const ITERS = +(process.argv[2] || 40), G = +(process.argv[3] || 2400), CPUS = Math.max(1, require('os').cpus().length - 1);
const log = []; const say = s => { console.log(s); log.push(s); };
function evalPar(W, B, seed) {
  const chunk = Math.ceil(G / CPUS), jobs = [];
  for (let k = 0; k < CPUS; k++) {
    const from = seed + k * chunk, to = seed + Math.min(G, (k + 1) * chunk);
    if (to <= from) continue;
    jobs.push(new Promise((res, rej) => execFile(process.execPath, [__filename, '--eval', JSON.stringify(W), JSON.stringify(B), from, to], { maxBuffer: 1 << 22 }, (e, so) => e ? rej(e) : res(JSON.parse(so)))));
  }
  return Promise.all(jobs).then(rs => { const r = rs.reduce((a, b) => ({ win: a.win + b.win, fair: a.fair + b.fair, n: a.n + b.n }), { win: 0, fair: 0, n: 0 }); return { rate: r.win / r.n, fair: r.fair / r.n, adv: (r.win - r.fair) / r.n, n: r.n }; });
}
const KEYS = ['f', 'a', 'd', 'm', 'i', 't', 'deny', 'th', 'ex', 'near'];
(async () => {
  let best = Object.assign({}, L.W), rng = L.mulberry(4242);
  // 出発点：初期値の強さを「普通」と比べて記録
  say('初期の重み: ' + JSON.stringify(best));
  let accepted = 0;
  for (let it = 0; it < ITERS; it++) {
    const cand = Object.assign({}, best), ks = [];
    const nk = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < nk; j++) { const k = KEYS[Math.floor(rng() * KEYS.length)]; if (ks.includes(k)) continue; ks.push(k); const f = Math.exp((rng() * 2 - 1) * 0.45); cand[k] = +(Math.max(0.005, best[k] * f + (best[k] < 0.05 ? (rng() - 0.3) * 0.1 : 0))).toFixed(3); }
    const r = await evalPar(cand, best, 100000 + it * G);
    const se = Math.sqrt(0.2 / r.n);   // ざっくりの標準誤差
    const ok = r.adv > 1.6 * se;
    say(`#${it} ${ks.map(k => k + ':' + best[k] + '→' + cand[k]).join(' ')}  勝率 ${(100 * r.rate).toFixed(1)}%（均等 ${(100 * r.fair).toFixed(1)}%、差 ${(100 * r.adv).toFixed(2)}pt ±${(100 * se).toFixed(2)}）${ok ? ' ✔採用' : ''}`);
    if (ok) {
      // 別の乱数でもう一度確かめる
      const r2 = await evalPar(cand, best, 900000 + it * G);
      if (r2.adv > 0) { best = cand; accepted++; say(`   確認 ${(100 * r2.adv).toFixed(2)}pt → 採用`); } else say(`   確認 ${(100 * r2.adv).toFixed(2)}pt → 見送り`);
    }
  }
  // 最終：初期値と比べる
  const fin = await evalPar(best, L.W0, 5000000);
  say(`最終：調整後 vs 初期値 … 勝率 ${(100 * fin.rate).toFixed(1)}%（均等 ${(100 * fin.fair).toFixed(1)}%、差 ${(100 * fin.adv).toFixed(2)}pt、${fin.n}戦）  採用 ${accepted}回`);
  fs.writeFileSync(path.join(__dirname, '..', 'weights.js'), '// 自己対戦で調整した「強い」の評価の重み（tools/train.js が生成）\n(typeof window !== \'undefined\' ? window : globalThis).LN_WEIGHTS = ' + JSON.stringify(best) + ';\n');
  fs.writeFileSync(path.join(__dirname, 'train-report.json'), JSON.stringify({ best, initial: L.W0, final: fin, log }, null, 1));
})();
