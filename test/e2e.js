// E2E: すくすくガーデン — ひとり用（390×844・5人・アストラウルトラ）、375×667（2人・シャハト式＋ブルーノ式＋トーナメント）、ホスト＋参加者のオンライン（PeerJS＋ローカルSTUN）
// usage: node test/stun.js <box-ip> 3478 &  python3 -m http.server 8941 &  node test/e2e.js <box-ip> 8941
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8941;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__ln.view && JSON.parse(JSON.stringify(window.__ln.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__ln.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a, .cell').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const inGame = document.body.classList.contains('in-game');
      const cells = [...document.querySelectorAll('#myGrid .cell')].map(c => c.getBoundingClientRect());
      const ab = document.getElementById('actBar').getBoundingClientRect();
      const wide = [...scr.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#pop') && !e.closest('.bubble') && !e.closest('.cell')).map(e => e.id || e.className).slice(0, 3);
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY, fab: !!fr, hits, inGame, wide,
        cellMin: cells.length ? Math.min(...cells.map(c => c.width)) : 99, cellMaxBottom: cells.length ? Math.max(...cells.map(c => c.bottom)) : 0, actBottom: ab.bottom, vh: innerHeight,
        opps: document.querySelectorAll('#opps .op').length, oppCell: (document.querySelector('#opps .cell') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.wide.length) fail(`[${tag}] elements overflow horizontally: ${r.wide.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.cellMaxBottom > r.vh + 0.5 || r.cellMin < 40 || r.actBottom > r.vh + 0.5) fail(`[${tag}] my garden off-screen/small ${JSON.stringify(r)}`);
      if (r.opps && r.oppCell < 12) fail(`[${tag}] opponent mini gardens too small ${r.oppCell}`);
    }
    return r;
  }
  // 自分の番を本物のタップで進める（山をタップ → 光ったマス／場の札 → マス／入れかえの確認／シャハト式の初期配置）
  async function humanTurns(p, who, n, shots) {
    let done = 0; const kinds = {}; const t0 = Date.now();
    while (done < n && Date.now() - t0 < 150000) {
      const st = await p.waitForFunction(() => {
        const v = window.__ln.view; if (!v || v.phase !== 'game') return 'over';
        const act = id => document.getElementById(id).classList.contains('active');
        if (act('confirmModal')) return 'confirm';
        if (act('roundModal')) return 'round';
        const g = v.g; if (g.wait > 0) return false;
        if (g.phase === 'setup' && g.need.ps.includes(g.me)) return 'setup';
        if (g.phase !== 'play' || !g.need || g.need.p !== g.me) return false;
        return g.need.k;
      }, null, { timeout: 90000, polling: 60 }).then(h => h.jsonValue(), async () => { const d = await p.evaluate(() => { const v = window.__ln.view, g = v.g; return JSON.stringify({ ph: v.phase, gp: g && g.phase, need: g && g.need, me: g && g.me, wait: g && g.wait, ov: [...document.querySelectorAll('.ov.active')].map(e => e.id), st: document.getElementById('status').textContent }); }); fail(`[${who}] stuck waiting for my turn: ${d}`); return 'over'; });
      if (st === 'over') break;
      if (st === 'confirm') { await p.tap('#cfYes'); await sleep(100); continue; }
      if (st === 'round') { if (shots && !kinds.round) { await sleep(300); await p.screenshot({ path: SS + shots + '_result_modal.png' }); } kinds.round = 1; if (await p.isVisible('#rdGo')) await p.tap('#rdGo', { timeout: 3000 }).catch(() => {}); await sleep(400); continue; }
      const k = await p.evaluate(() => window.__ln.view.g.k);
      if (st === 'setup') {
        if (shots && !kinds.setup) await p.screenshot({ path: SS + shots + '_setup.png' });
        const st0 = await p.evaluate(() => window.__ln.view.g.setupStep);
        await p.tap('#myGrid .cell.ok'); kinds.setup = 1;
        await p.waitForFunction(s => { const g = window.__ln.view.g; return g.phase !== 'setup' || g.setupStep !== s || !g.need.ps.includes(g.me); }, st0, { timeout: 10000 }).catch(() => fail(`[${who}] setup tap had no effect`));
        done++; continue;
      }
      if (st === 'choose') {
        const can = await p.$('#pool .tl.can');
        if (can && Math.random() < 0.6) {
          await can.tap(); await sleep(80);
          if (shots && !kinds.select) { await p.screenshot({ path: SS + shots + '_select_pool.png' }); }
          kinds.select = 1;
          const cell = await p.$('#myGrid .cell.ok') || await p.$('#myGrid .cell.sw');
          if (!cell) { fail(`[${who}] selected pool tile but no lit cell`); await p.tap('#cancelSel').catch(() => {}); }
          else { const sw = await cell.evaluate(c => c.classList.contains('sw')); await cell.tap(); if (sw) { await p.waitForSelector('#confirmModal.active', { timeout: 3000 }); if (shots && !kinds.swapc) await p.screenshot({ path: SS + shots + '_swap_confirm.png' }); kinds.swapc = 1; await p.tap('#cfYes'); kinds.swap = 1; } kinds.take = 1; }
        } else { await p.tap('#deck'); kinds.draw = 1; }
      } else if (st === 'place') {
        if (shots && !kinds.place) await p.screenshot({ path: SS + shots + '_place.png' });
        const cell = await p.$('#myGrid .cell.ok');
        if (cell) { await cell.tap(); kinds.place = 1; }
        else { await p.tap('#discardBtn'); kinds.discard = 1; }
      }
      await p.waitForFunction(k => { const v = window.__ln.view; return !v.g || v.g.k !== k; }, k, { timeout: 10000 }).catch(() => fail(`[${who}] tap had no effect (${st})`));
      done++;
    }
    ok(`[${who}] ${done} actions by real taps (${Object.keys(kinds).join('／')})`);
  }
  async function autoplayToEnd(p, label, ms) {
    await p.evaluate(() => { window.__ln.autoplay = true; });
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 300000)) {
      const v = await view(p); if (v.phase === 'end') break;
      if (await p.isVisible('#confirmModal')) await p.tap('#cfYes').catch(() => {});
      if (await p.isVisible('#roundModal') && await p.isVisible('#rdGo')) await p.tap('#rdGo').catch(() => {});
      await sleep(500);
    }
    await p.evaluate(() => { window.__ln.autoplay = false; });
    return { v: await view(p), sec: (Date.now() - t0) / 1000 };
  }

  // ================= 1) ひとり用 390×844, ?from=portal, 5人・アストラウルトラ =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    const L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.tap('#npSeg button[data-v="5"]');
    await waitV(p, 'v.opts.np === 5');
    const nCpu = await p.$$eval('#cpuList select[data-k="ch"]', s => s.length);
    if (nCpu !== 4) fail('5人 should give 4 CPU rows, got ' + nCpu); else ok('5人 → CPU 4人');
    await p.selectOption('select[data-c="0"][data-k="ch"]', 'kon');
    await p.tap('#lvAllSeg button[data-v="strong"]'); await p.selectOption('select[data-c="1"][data-k="lv"]', 'ultra');
    await waitV(p, "v.opts.cpu[1].lv === 'ultra' && v.opts.cpu[0].ch === 'kon'");
    const chs = await p.evaluate(() => window.__ln.view.opts.cpu.slice(0, 4).map(c => c.ch));
    if (new Set(chs).size !== 4) fail('duplicate characters after swap ' + chs); else ok('character select swaps instead of duplicating: ' + chs.join(','));
    await p.screenshot({ path: SS + 'lobby_solo.png', fullPage: true });
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 });
    const dur = await p.evaluate(() => Math.max.apply(null, document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#awaken')).map(x => x.effect.getComputedTiming().endTime)));
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => ({ txt: document.getElementById('awaken').textContent.replace(/\s+/g, ' ').slice(0, 70), parts: document.querySelectorAll('#awParts i').length, bgm: window.__ln.bgm() }));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (!(dur > 5000 && dur < 9000)) fail('awakening length ' + dur); else ok(`覚醒 cinematic ${(dur / 1000).toFixed(1)}s, ${aw.parts} particles 「${aw.txt.trim()}」`);
    if (aw.bgm.cur) fail('BGM should wait for the cinematic');
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 8000); await sleep(1200);
    const b = await p.evaluate(() => ({ s: window.__ln.bgm(), lv: window.__ln.bgmLevel() }));
    if (b.s.cur !== 'epic') fail('boss BGM not playing ' + JSON.stringify(b)); else ok(`boss BGM playing after awakening (level ${(+b.lv || 0).toFixed(3)})`);
    if (!(await p.$('.op.ultra'))) fail('ultra garden aura missing'); else ok('アストラウルトラ の庭にオーラ枠');
    const lg = await layout(p, 'game390'); ok(`390×844 5人：自分の庭 ${lg.cellMin.toFixed(0)}px/マス、相手4人の庭 ${lg.oppCell.toFixed(0)}px/マス、ページはスクロールしない`);
    await p.screenshot({ path: SS + 'game_5p.png' });
    await p.tap('#gridsBtn'); await sleep(200);
    if (!(await p.isVisible('#gridsModal'))) fail('みんなの庭 not reachable'); else { await p.screenshot({ path: SS + 'all_gardens.png' }); ok('👀 みんなの庭（大きく）＋山の残り枚数 opens during play'); }
    await p.tap('#gridsClose');
    await humanTurns(p, 'solo390', 8, 'solo');
    await layout(p, 'game390-later'); await p.screenshot({ path: SS + 'game_5p_later.png' });
    await p.evaluate(() => window.__ln.cutin('ふーさん リーチ！', 'テスト', '🐻')); await sleep(150);
    if (!(await p.$('#cutin.on'))) fail('ultra cut-in not shown'); else ok('ultra cut-in renders');
    await sleep(1700);
    const r = await autoplayToEnd(p, 'solo390');
    if (r.v.phase !== 'end') fail('solo 390 game did not finish: ' + r.v.phase);
    else {
      const g = r.v.g;
      ok(`solo 5-player game finished (${r.sec.toFixed(0)}s): ${g.result.why === 'full' ? '庭が完成' : '山切れ'}、winners ${g.winners.map(q => g.owners[q].name).join('・')}、空き ${g.result.empties.join('/')}`);
      if (g.result.why === 'full' && L_empty(g.grids[g.winners[0]]) !== 0) fail('winner grid not full');
      await sleep(400); await p.screenshot({ path: SS + 'result.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen');
    }
    await p.context().close();
  }
  function L_empty(g) { return g.filter(x => !x).length; }

  // ================= 2) ひとり用 375×667（iPhone SE）、2人・シャハト式＋ブルーノ式＋トーナメント =================
  {
    const p = await phone('solo375', 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await p.tap('#npSeg button[data-v="2"]'); await p.tap('#lvAllSeg button[data-v="strong"]');
    await p.tap('#setupSeg button[data-v="michael"]'); await p.tap('#optSeg button[data-v="bruno"]'); await p.tap('#optSeg button[data-v="tour"]');
    await waitV(p, `v.opts.np === 2 && v.opts.setup === 'michael' && v.opts.bruno && v.opts.tour`);
    await layout(p, 'lobby375'); await p.screenshot({ path: SS + 'lobby_375_options.png', fullPage: true });
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await layout(p, 'game375-setup');
    await p.tap('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.tap('#menuRules'); await sleep(150);
    if (!hub || !(await p.isVisible('#rulesModal'))) fail('⋯ menu: rules / ひろば not reachable'); else ok('⋯ menu has 🏠 ひろばへ and あそびかた during play');
    await p.screenshot({ path: SS + 'rules_375.png' });
    await p.tap('#rulesClose');
    await humanTurns(p, 'solo375', 4, 'm375');
    await waitV(p, 'v.g.phase !== "setup"', 15000).catch(() => {});
    const v0 = await view(p);
    if (v0.g.phase !== 'play' || L_empty(v0.g.grids[0]) > 12) fail('シャハト式 setup did not finish: ' + v0.g.phase); else ok('シャハト式の初期配置：4枚をタップで ななめへ → 本編へ');
    await humanTurns(p, 'solo375', 8, 'g375');
    await layout(p, 'game375'); await p.screenshot({ path: SS + 'game_375.png' });
    const r = await autoplayToEnd(p, 'solo375');
    if (r.v.phase !== 'end') fail('375 tournament did not finish');
    else ok(`375×667 2人トーナメント（シャハト式＋ブルーノ式）finished: ${r.v.g.results.length} games, score ${r.v.g.score.join(' / ')}, extra turns seen: ${r.v.g.ev.some(e => e.k === 'extra')}`);
    if (r.v.g.results.length !== 2) fail('tournament should be 2 games for 2 players');
    await sleep(300); await p.screenshot({ path: SS + 'result_375_tour.png', fullPage: true });
    await p.context().close();
  }

  // ================= 3) オンライン：ホスト＋参加者 =================
  {
    const host = await phone('host'), guest = await phone('guest', 375, 667);
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) fail('room could not be created (signaling blocked?)');
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      if (!(await host.$('#qr svg, #qr canvas, #qr img'))) fail('QR code missing'); else ok('invite QR code shown');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
      await waitV(guest, "v.opts.np === 3 && v.opts.cpu[0].lv === 'ultra'");
      if (!/アストラウルトラ/.test(await guest.textContent('#cpuList'))) fail('guest lobby does not show CPU level'); else ok('guest lobby shows CPU = アストラウルトラ😎');
      await host.screenshot({ path: SS + 'lobby_online.png', fullPage: true });
      await host.tap('#startBtn');
      await guest.waitForSelector('#awaken.on', { timeout: 10000 }).then(() => ok('覚醒 cinematic plays on the guest too'), () => fail('no cinematic on guest'));
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      await guest.tap('#awaken').catch(() => {}); await host.tap('#awaken').catch(() => {});
      const leak = await guest.evaluate(() => { const g = window.__ln.view.g; return { deck: 'deck' in g, json: /"deck"\s*:/.test(JSON.stringify(window.__ln.view)), n: g.deckN }; });
      if (leak.deck || leak.json) fail('guest view contains the face-down pile'); else ok(`guest view carries only the pile size (${leak.n}), never its order`);
      await Promise.all([[guest, 'guest', 5, 'guest'], [host, 'host', 4, null]].map(async ([p, who, n, sh]) => { await humanTurns(p, who, n, sh); await p.evaluate(() => { window.__ln.autoplay = true; }); }));
      await host.evaluate(() => { window.__ln.autoplay = false; }); await guest.evaluate(() => { window.__ln.autoplay = false; });
      await sleep(800);
      const hv = await view(host), gv = await view(guest);
      if (JSON.stringify(hv.g.grids) !== JSON.stringify(gv.g.grids) || hv.g.deckN !== gv.g.deckN || JSON.stringify(hv.g.pool) !== JSON.stringify(gv.g.pool)) fail('host/guest out of sync'); else ok('host and guest views in sync (gardens, pool, pile size)');
      await layout(guest, 'guest375'); await guest.screenshot({ path: SS + 'online_guest_375.png' });
      // 順番でないときの操作は無視される
      await waitV(host, 'v.g.phase === "play" && v.g.need && v.g.need.p !== 1', 30000).catch(() => {});
      const before = await view(host);
      if (before.g.phase === 'play' && before.g.need.p !== 1) {
        await guest.evaluate(() => window.__ln.act('draw')); await sleep(400);
        const after = await view(host), last = before.g.ev[before.g.ev.length - 1].id;
        if (after.g.ev.some(e => e.id > last && e.p === 1 && e.k === 'draw' && after.g.ev.filter(x => x.id > last && x.p === 1).indexOf(e) === 0 && !after.g.ev.some(x => x.id > last && x.id < e.id && x.k !== 'draw' && x.p === 0)) && before.g.need.p !== 1 && after.g.ev.filter(x => x.id > last)[0].p === 1) fail('out-of-turn action accepted'); else ok('out-of-turn action is ignored by the host');
      }
      await host.evaluate(() => { window.__ln.autoplay = true; }); await guest.evaluate(() => { window.__ln.autoplay = true; });
      const t0 = Date.now();
      while (Date.now() - t0 < 300000) {
        const v = await view(guest); if (v.phase === 'end') break;
        if (await host.isVisible('#roundModal') && await host.isVisible('#rdGo')) await host.tap('#rdGo').catch(() => {});
        await sleep(600);
      }
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: winners ${eh.g.winners.map(q => eh.g.owners[q].name).join('・')}`);
        if (JSON.stringify(eh.g.grids) !== JSON.stringify(ev.g.grids)) fail('final gardens differ host/guest');
        await sleep(400); await guest.screenshot({ path: SS + 'result_online_guest.png' });
      }
      await host.evaluate(() => { window.__ln.autoplay = false; }); await guest.evaluate(() => { window.__ln.autoplay = false; });
      // 「ロビーに戻りたい」 → ホストが中断
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      const clear = async p => { for (let i = 0; i < 20; i++) { if (await p.$('#awaken.on')) await p.tap('#awaken').catch(() => {}); else break; await sleep(200); } };
      await clear(guest); await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr]:not([data-lr="no"])', { timeout: 10000 }); await clear(host);
      await host.tap('#lobbyReqBar button[data-lr]:not([data-lr="no"])'); await host.tap('#cfYes');
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      // ゲーム中にニックネームで入り直す
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game" && v.g.me === 1', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname (same seat)'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
