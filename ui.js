/* すくすくガーデン：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, cutId: 0, endKey: '', resKey: '', resShownAt: 0, peek: false, sel: null, selK: -1, flash: {}, freshPool: 0, myTurnK: -1 };
function render(v) {
  lastView = v; window.__ln.view = v;
  BGM.want(v.phase === 'game' && v.g ? (v.g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase !== 'game') { overlay('roundModal', false); overlay('gridsModal', false); }
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
// ---------------- ロビー ----------------
function lvSelect(c, lv) { return '<select data-c="' + c + '" data-k="lv" class="' + (lv === 'ultra' ? 'ultra' : '') + '" aria-label="CPUの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function chSelect(c, ch) { return '<select data-c="' + c + '" data-k="ch" aria-label="キャラクター">' + CH_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === ch ? ' selected' : '') + '>' + CH[k].e + ' ' + CH[k].name + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length, o = v.opts;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you && s.name !== 'あなた' ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  var np = npOf(v.seats, o), ks = [];
  for (var k = L.NP[0]; k <= L.NP[1]; k++) ks.push(k);
  $('npSeg').innerHTML = ks.map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人<small>' + (k === 5 ? 'デラックス版' : '札' + k * 20 + '枚') + '</small></button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  var owners = planOwners(v.seats, o), ci = 0;
  $('cpuList').innerHTML = owners.map(function (ow, c) {
    if (ow.kind !== 'cpu') return '<div class="crow"><span class="av" style="background:#3d8b37">' + (c + 1) + '</span><span class="nm">' + esc(ow.name) + (ow.sid === v.sid && ow.name !== 'あなた' ? '（あなた）' : '') + '</span></div>';
    var i = ci++;
    return '<div class="crow"><span class="av" style="background:' + CH[ow.ch].col + '">' + CH[ow.ch].e + '</span>' +
      (isHost ? chSelect(i, ow.ch) + '<span class="nm"></span>' + lvSelect(i, ow.lv) : '<span class="nm">' + esc(ow.name) + '</span><span class="lv ' + ow.lv + '">' + LV[ow.lv] + '</span>') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + (k === 'ultra' ? 'アストラ<br>ウルトラ😎' : LV[k]) + '</button>'; }).join('');
  $('lvAllBox').style.display = ci && isHost ? '' : 'none';
  $('setupSeg').innerHTML = ['auto', 'michael'].map(function (k) { var u = OPT_UI.setup[k]; return '<button data-v="' + k + '" class="' + (o.setup === k ? 'on' : '') + '"' + (isHost ? '' : ' disabled') + '>' + u.n + (k === 'auto' ? '（おすすめ）' : '') + '<small>' + u.s + '</small></button>'; }).join('');
  $('optSeg').innerHTML = ['bruno', 'tour'].map(function (k) { var u = OPT_UI[k]; return '<button data-v="' + k + '" class="' + (o[k] ? 'on' : '') + '"' + (isHost ? '' : ' disabled') + '>' + (o[k] ? '✅ ' : '⬜ ') + u.n + '<small>' + u.s + '</small></button>'; }).join('');
  $('setupSeg').classList.toggle('ro', !isHost); $('optSeg').classList.toggle('ro', !isHost);
  $('seatHint').textContent = v.solo ? '' : '2〜5人で遊べます。空いた席は CPU が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1 || n > L.NP[1];
}
// ---------------- ゲーム画面 ----------------
function nm(g, p) { var o = g.owners[p]; if (!o) return '?'; if (p === g.me) return 'あなた'; return o.kind === 'cpu' ? o.e + o.name + (o.lv === 'ultra' ? '😎' : '') : o.name; }
function tc(v) { return '<span class="tc" style="--h:' + hueOf(v) + '">' + v + '</span>'; }
function myTurn(g) { return g.wait <= 0 && g.phase === 'play' && g.need && g.need.p === g.me; }
function mySetup(g) { return g.wait <= 0 && g.phase === 'setup' && g.need && g.need.ps.indexOf(g.me) >= 0; }
function gridHtml(g, o) {
  o = o || {};
  var h = '<div class="grid' + (o.dim ? ' dim' : '') + '">';
  for (var i = 0; i < 16; i++) {
    var v = g[i], cls = 'cell' + (L.DIAG.indexOf(i) >= 0 ? ' dg' : ''), inner = '';
    if (o.legal && o.legal.indexOf(i) >= 0) cls += v ? ' sw' : ' ok';
    if (v) inner = tileHtml(v, o.flash === i ? 'flash' : '');
    else if (o.ranges) { var r = rangeOf(g, i); inner = r[0] > r[1] ? '<span class="rg no">×</span>' : '<span class="rg">' + (r[0] === r[1] ? r[0] : r[0] + '<br>〜' + r[1]) + '</span>'; }
    h += '<div class="' + cls + '" data-cell="' + i + '">' + inner + '</div>';
  }
  return h + '</div>';
}
function evText(g, e) {
  var N = function (p) { return esc(nm(g, p)); }, s = '', cls = '';
  if (e.k === 'game') { cls = 'sys'; s = '―― ' + (e.games > 1 ? 'ゲーム' + e.game + '/' + e.games + ' ' : '') + 'スタート（' + N(e.start) + 'から）――'; }
  else if (e.k === 'setup') s = e.auto ? '🌱 みんな4枚を ななめに小さい順で植えました' : '🌱 初期配置が終わりました';
  else if (e.k === 'setupDraw') s = '🌱 シャハト式：' + e.step + '枚目を引きました';
  else if (e.k === 'setupPlace') return '';
  else if (e.k === 'draw') s = N(e.p) + '：山から ' + tc(e.v) + ' を引いた' + (e.left === 0 ? '（<b>最後の1枚！</b>）' : '');
  else if (e.k === 'place') s = N(e.p) + '：' + (e.from === 'pool' ? '場の ' + tc(e.v) + ' を取って' : tc(e.v) + ' を') + (e.old ? ' ' + tc(e.old) + ' と入れかえ（' + tc(e.old) + 'は場へ）' : '植えた') + (e.n === 15 ? ' 🔔<b>あと1マス！</b>' : '');
  else if (e.k === 'discard') s = N(e.p) + '：' + tc(e.v) + ' は植えずに場へ';
  else if (e.k === 'extra') s = '✨ ' + N(e.p) + '：ななめに同じ数！もう1回';
  else if (e.k === 'end') { cls = 'sys'; s = '🏁 ' + (e.why === 'full' ? N(e.winners[0]) + ' の庭が完成！' : '山がなくなった！ ' + e.winners.map(N).join('・') + ' の勝ち（空き ' + e.empties[e.winners[0]] + '）'); }
  else return '';
  return '<div class="ln ' + cls + '">' + s + '</div>';
}
function oppHtml(g, p, cs) {
  var o = g.owners[p], gr = g.grids[p], emp = L.empties(gr), cls = 'op';
  if (g.need && (g.phase === 'play' ? g.need.p === p : g.need.ps && g.need.ps.indexOf(p) >= 0)) cls += ' cur';
  if (o.kind === 'cpu' && o.lv === 'ultra') cls += ' ultra';
  if (emp === 1) cls += ' reach';
  if (!o.connected) cls += ' off';
  var fl = ui.flash[p] && Date.now() - ui.flash[p].at < 1400 ? ui.flash[p].cell : -1;
  var hold = g.held && g.need && g.need.p === p && g.phase === 'play' ? '<div class="hold">' + tileHtml(g.held.v) + '</div>' : '';
  if (g.phase === 'setup' && g.setupTile && g.need.ps.indexOf(p) >= 0) hold = '<div class="hold">' + tileHtml(g.setupTile[p]) + '</div>';
  return '<div class="' + cls + '" data-p="' + p + '"><div class="oh"><span class="fc">' + (o.kind === 'cpu' ? o.e : '👤') + '</span><span class="on">' + esc(o.name) + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '') + (o.connected ? '' : '📵') + '</span><span class="em">' + (emp === 1 ? '🔔1' : '空' + emp) + '</span></div>' +
    '<div style="--cs:' + cs + 'px">' + gridHtml(gr, { flash: fl }) + '</div>' + (g.thinking === p ? '<span class="think">💭</span>' : '') + hold + '</div>';
}
function legalFor(g) {   // いま光らせるマス
  var me = g.me; if (me < 0) return null;
  var gr = g.grids[me];
  if (mySetup(g)) return L.DIAG.filter(function (c) { return !gr[c]; });
  if (!myTurn(g)) return null;
  if (g.need.k === 'place' && g.held) return L.spots(gr, g.held.v);
  if (g.need.k === 'choose' && ui.sel != null) return L.spots(gr, ui.sel);
  return null;
}
function fitGrid() {
  var box = $('meBox'), head = $('myHead'); if (!box.clientHeight) return;
  var h = box.clientHeight - head.offsetHeight - 8, w = box.clientWidth - 16;
  var cs = Math.floor(Math.min((w - 20) / 4, (h - 20) / 4));
  cs = Math.max(40, Math.min(86, cs));
  $('myGrid').style.setProperty('--cs', cs + 'px'); $('myGrid').style.setProperty('--gp', Math.max(3, Math.round(cs / 14)) + 'px');
}
window.addEventListener('resize', function () { if (lastView && lastView.phase === 'game') fitGrid(); });
function renderGame(v) {
  var g = v.g, me = g.me, gk = v.code + ':' + v.gameNo;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0; ui.cutId = g.cut ? g.cut.id : 0; ui.resKey = ''; ui.flash = {}; ui.sel = null;
    if (g.ultra && g.wait > 600) awaken(g.ultra);
  }
  if (ui.selK !== g.k) { if (!(myTurn(g) && g.need.k === 'choose' && ui.sel != null && g.pool.indexOf(ui.sel) >= 0)) ui.sel = null; ui.selK = g.k; }
  var evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) ui.lastEv = evs[evs.length - 1].id;
  evs.forEach(function (e, j) { onEvent(v, e, evs.length < 6 || j >= evs.length - 2); });
  $('phLabel').textContent = (g.games > 1 ? '🏆 ' + g.game + '/' + g.games + '戦・' : '') + '山 ' + g.deckN + '枚' + (g.opts.bruno ? '・ブルーノ式' : '') + (g.opts.setup === 'michael' ? '・シャハト式' : '');
  // 相手の庭（小さく）
  var opp = g.owners.map(function (o, p) { return p; }).filter(function (p) { return p !== me; });
  var W = Math.min(560, window.innerWidth) - 12, per = (W - (opp.length - 1) * 4) / opp.length, cs = Math.max(13, Math.min(24, Math.floor((Math.min(per, 150) - 18) / 4)));
  $('opps').innerHTML = opp.map(function (p) { return oppHtml(g, p, cs); }).join('');
  // 場
  var myC = myTurn(g) && g.need.k === 'choose';
  $('deck').className = myC && g.deckN ? 'can' : '';
  $('deck').innerHTML = tileHtml(0) + '<span class="dn">山 ' + g.deckN + '枚</span>' + (myC && g.deckN ? '<span class="dn" style="background:#e8590c">タップで引く</span>' : '');
  var hd = $('held'), showHeld = g.phase === 'play' && g.held, showSetup = g.phase === 'setup' && g.setupTile && me >= 0;
  hd.classList.toggle('show', !!(showHeld || showSetup));
  var hk = showHeld ? 'h' + g.k : showSetup ? 's' + g.setupStep + ':' + (mySetup(g) ? 1 : 0) : '';
  if (hd.dataset.k !== hk) {
    hd.dataset.k = hk;
    if (showHeld) hd.innerHTML = tileHtml(g.held.v) + '<span class="who">' + (g.need.p === me ? 'あなたが引いた' : esc(nm(g, g.need.p)) + 'が引いた') + '</span>';
    else if (showSetup) hd.innerHTML = mySetup(g) ? tileHtml(g.setupTile[me]) + '<span class="who">' + g.setupStep + '枚目</span>' : '<span class="who">' + g.setupStep + '枚目：待ち</span>';
    else hd.innerHTML = '';
  }
  var pv = g.pool.slice().sort(function (a, b) { return a - b; }), gr = me >= 0 ? g.grids[me] : null;
  $('pool').classList.toggle('my', myC);
  $('poolN').textContent = g.pool.length + '枚';
  var lm = g.lastMove, freshV = lm && lm.cell < 0 ? lm.v : null, selDone = false;
  $('pool').innerHTML = pv.length ? pv.map(function (x) {
    var c = '';
    if (myC) c = L.spots(gr, x).length ? 'can' : 'no';
    if (ui.sel === x && !selDone) { c += ' sel'; selDone = true; }
    return tileHtml(x, c, ' data-v="' + x + '"');
  }).join('') : '<span class="none">まだありません（入れかえた札・置かなかった札がここに並びます）</span>';
  // 自分の庭
  var legal = legalFor(g);
  if (me >= 0) {
    var emp = L.empties(gr);
    $('myHead').className = emp === 1 ? 'reach' : '';
    $('myHead').innerHTML = '<span>' + (g.owners[me].name === 'あなた' ? 'あなたの庭' : esc(g.owners[me].name) + '（あなた）の庭') + '</span><span class="em">' + (emp === 1 ? '🔔 あと1マス！' : '空き ' + emp) + '</span>' + (g.games > 1 ? '<span class="em">' + g.score[me] + '点</span>' : '');
    var fl = ui.flash[me] && Date.now() - ui.flash[me].at < 1400 ? ui.flash[me].cell : -1;
    $('myGrid').innerHTML = gridHtml(gr, { legal: legal, dim: !!legal, ranges: true, flash: fl });
  } else { $('myHead').textContent = '観戦中'; $('myGrid').innerHTML = ''; }
  fitGrid();
  renderAct(g, legal); paintStatus(g, legal);
  var lastLine = ''; for (var j = g.ev.length - 1; j >= 0 && !lastLine; j--) lastLine = evText(g, g.ev[j]);
  $('ticker').innerHTML = lastLine.replace(/^<div class="ln[^"]*">|<\/div>$/g, '');
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble' + (o && o.lv === 'ultra' ? ' ultra' : ''); b.textContent = (o ? o.e + o.name : '') + '「' + g.say.text + '」';
    var gw = document.querySelector('#game .gwrap'); gw.querySelectorAll('.bubble').forEach(function (x) { x.remove(); });
    b.style.top = ($('field').offsetTop + 4) + 'px'; gw.appendChild(b); setTimeout(function () { b.remove(); }, 3200);
  }
  if (g.cut && g.cut.id !== ui.cutId) { ui.cutId = g.cut.id; var co = g.owners[g.cut.p]; if (co) cutin(co.name + ' ' + g.cut.t, g.cut.l, co.e); }
  // 自分の番になった合図
  if (myTurn(g) && g.need.k === 'choose' && ui.myTurnK !== g.k) { ui.myTurnK = g.k; sfx.turn(); vibrate(30); }
  // ゲームの結果
  if (g.phase === 'end' && g.result) {
    var rk = gk + ':' + g.game, dl = 1500 * (TURBO ? 0.2 : 1);
    if (ui.resKey !== rk) { ui.resKey = rk; ui.peek = false; ui.resShownAt = Date.now() + dl; setTimeout(function () { if (lastView && lastView.phase === 'game') renderGame(lastView); }, dl + 50); }
    if (Date.now() >= ui.resShownAt) { renderResult(v, g.result, true); overlay('roundModal', true); }
  } else if (ui.peek && g.results.length) { renderResult(v, g.results[g.results.length - 1], false); overlay('roundModal', true); }
  else overlay('roundModal', false);
  if ($('gridsModal').classList.contains('active')) renderGrids();
  if ($('logModal').classList.contains('active')) renderLog();
}
function renderAct(g, legal) {
  var h = '';
  if (myTurn(g) && g.need.k === 'place') h = '<button class="btn sub" id="discardBtn"' + (pending ? ' disabled' : '') + '>🍂 植えずに場に出す</button>';
  else if (myTurn(g) && ui.sel != null) h = '<button class="btn" id="cancelSel">やめる（ほかの札をえらぶ）</button>';
  else if (myTurn(g)) h = '<div class="tip">山をタップ＝1枚引く／光っている場の札＝取って植える<br>（場の札は 取ったら必ず植えます）</div>';
  else if (mySetup(g)) h = '<div class="tip">ななめの光っているマスをタップ。置いたら動かせません</div>';
  else h = '<div class="tip">🎯 右へ・下へ、数が大きくなるように！　マスの小さい数字＝入れられる範囲</div>';
  if ($('actBar').dataset.h !== h) { $('actBar').innerHTML = h; $('actBar').dataset.h = h; }
}
function paintStatus(g, legal) {
  var st = '', cls = '', nd = g.need;
  if (g.wait > 0) st = g.ultra ? '…なにかが 目覚めようとしている…' : 'まもなく開始…';
  else if (g.phase === 'end') st = '🏁 ゲーム終了！';
  else if (g.phase === 'setup') { if (mySetup(g)) { cls = 'mine'; st = '🌱 ' + g.setupTile[g.me] + ' を ななめの好きなマスに植えてね（' + g.setupStep + '/4）'; } else st = '🌱 ほかの人が植えるのを待っています…'; }
  else if (myTurn(g)) {
    cls = 'mine';
    if (nd.k === 'place') st = legal && legal.length ? '引いた ' + g.held.v + ' をどこに植える？（光っているマス）' : g.held.v + ' は植えられる場所がありません → 場に出そう';
    else if (ui.sel != null) st = '場の ' + ui.sel + ' をどこに植える？（⇄＝入れかえ）';
    else st = 'あなたの番！ 山から引く？ 場の札を取る？';
  } else if (nd) {
    var ow = g.owners[nd.p];
    st = ow.kind === 'cpu' ? ow.e + ' ' + esc(nm(g, nd.p)) + ' が考え中…' : esc(nm(g, nd.p)) + ' の番です' + (ow.connected ? '' : '（切断中）');
  }
  $('status').innerHTML = st; $('status').className = 'status ' + cls;
}
function popText(text, cls) { var p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go ' + (cls || ''); }
function onEvent(v, e, live) {
  var g = v.g, o = e.p != null ? g.owners[e.p] : null;
  if (e.k === 'place') { ui.flash[e.p] = { cell: e.cell, at: Date.now() }; if (!live) return; sfx.card(); if (e.n === 15) { popText('🔔 ' + nm(g, e.p) + ' あと1マス！', 'good'); if (e.p !== g.me) vibrate(40); } }
  else if (e.k === 'setupPlace') { ui.flash[e.p] = { cell: e.cell, at: Date.now() }; if (live) sfx.card(); }
  else if (e.k === 'draw') { if (live) sfx.card(); }
  else if (e.k === 'discard') { if (live && e.p !== g.me) sfx.card(); }
  else if (e.k === 'extra') { if (live) popText('✨ ななめ おそろい！もう1回', 'good'); }
  else if (e.k === 'end') { if (live) { if (e.winners.indexOf(g.me) >= 0) { sfx.win(); popText('🌻 あなたの勝ち！', 'good'); } else { sfx.safe(); popText('🏁 ' + nm(g, e.winners[0]) + (e.why === 'full' ? ' 完成！' : ' の勝ち'), 'info'); } } }
  else if (e.k === 'game') { if (live) popText(e.games > 1 ? 'ゲーム ' + e.game + '/' + e.games : 'スタート！', 'info'); }
}
// ---------------- 結果 ----------------
function renderResult(v, r, live) {
  var g = v.g, last = r.game === g.game && live, grids = last ? g.grids : null;
  $('rdTitle').textContent = (g.games > 1 ? 'ゲーム' + r.game + '/' + g.games + ' の結果' : '🏁 結果');
  $('rdHead').innerHTML = r.why === 'full' ? '🌻 ' + esc(nm(g, r.winners[0])) + ' の庭が完成！' : '山がなくなった！ 空きマスがいちばん少ない人の勝ち';
  $('rdGrids').innerHTML = grids ? g.owners.map(function (o, p) { return '<div class="ag' + (r.winners.indexOf(p) >= 0 ? ' win' : '') + '"><span>' + (o.kind === 'cpu' ? o.e : '👤') + esc(p === g.me ? 'あなた' : o.name) + '</span>' + gridHtml(grids[p]) + '</div>'; }).join('') : '';
  $('rdList').innerHTML = g.owners.map(function (o, p) {
    var win = r.winners.indexOf(p) >= 0, gain = r.gain ? r.gain[p] : null;
    return '<div class="rr' + (win ? ' win' : '') + '"><span>' + (o.kind === 'cpu' ? o.e : '👤') + '</span><span class="nm">' + esc(p === g.me ? 'あなた' : o.name + (o.kind === 'cpu' && o.lv === 'ultra' ? '😎' : '')) + (win ? ' 👑' : '') + '</span><span>空き ' + r.empties[p] + '</span>' +
      (gain != null ? '<span class="gain' + (gain < 0 ? ' neg' : '') + '">' + (gain > 0 ? '+' : '') + gain + '</span><span class="sc">計 ' + r.score[p] + '点</span>' : '') + '</div>';
  }).join('');
  var next = '';
  if (live && g.nextIn != null) next = g.matchOver ? 'まもなく結果発表…' : '次のゲームまで ' + Math.ceil(g.nextIn / 1000) + '秒';
  $('rdNext').textContent = next;
  $('rdGo').style.display = live && g.phase === 'end' ? '' : 'none';
  $('rdGo').textContent = g.matchOver ? '▶ 結果を見る' : '▶ 次のゲームへ';
  $('rdClose').style.display = live ? 'none' : '';
}
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var me = g.me, tour = g.games > 1, champs = g.champions || g.winners || [];
  var rows = g.owners.map(function (o, p) { return { o: o, p: p, sc: tour ? g.score[p] : -L.empties(g.grids[p]) + (champs.indexOf(p) >= 0 ? 100 : 0) }; }).sort(function (a, b) { return b.sc - a.sc; });
  var rank = 0;
  $('rankList').innerHTML = rows.map(function (r, i) {
    if (i === 0 || r.sc < rows[i - 1].sc) rank = i + 1;
    return '<div class="rk' + (champs.indexOf(r.p) >= 0 ? ' first' : '') + '"><span class="md">' + (['🥇', '🥈', '🥉'][rank - 1] || rank) + '</span><span class="nm">' + (r.o.kind === 'cpu' ? r.o.e + ' ' : '') + esc(r.o.name) +
      (r.o.kind === 'cpu' ? ' <span class="lv ' + r.o.lv + '" style="font-size:10px">' + LV[r.o.lv] + '</span>' : '') + (r.p === me && r.o.name !== 'あなた' ? '<small>あなた</small>' : '') + '</span><span class="sc">' + (tour ? g.score[r.p] + '点' : '空き' + L.empties(g.grids[r.p])) + '</span></div>';
  }).join('');
  var w0 = g.owners[champs[0]], txt;
  if (champs.length > 1) txt = '🤝 ' + champs.map(function (p) { return esc(nm(g, p)); }).join('・') + ' の同時優勝！';
  else if (w0.kind === 'cpu') txt = w0.e + '「' + esc(pick(CH[w0.ch].L.mwin)) + '」';
  else { var loser = g.owners.filter(function (o) { return o.kind === 'cpu'; })[0]; txt = '🎉 ' + esc(w0.name) + ' の庭が いちばんに育った！' + (loser ? ' ' + loser.e + '「' + esc(pick(CH[loser.ch].L.mlose)) + '」' : ''); }
  $('rankList').innerHTML += '<p class="mid">' + txt + '</p>';
  $('histLine').innerHTML = tour ? (g.results || []).map(function (r) { return 'ゲーム' + r.game + '：' + r.winners.map(function (p) { return esc(nm(g, p)); }).join('・') + (r.why === 'full' ? '' : '（山切れ）'); }).join('<br>') : '';
  $('endGrids').innerHTML = g.owners.map(function (o, p) { return '<div class="ag' + ((g.winners || []).indexOf(p) >= 0 ? ' win' : '') + '"><span>' + (o.kind === 'cpu' ? o.e : '👤') + esc(p === me ? 'あなた' : o.name) + '</span>' + gridHtml(g.grids[p]) + '</div>'; }).join('');
  $('leaveBtn2').textContent = host ? (host.room.solo ? '🚪 タイトルへ' : '🚪 部屋を閉じる') : '🚪 部屋を出る';
  var key = v.code + ':' + v.gameNo;
  if (ui.endKey !== key) { ui.endKey = key; if (champs.indexOf(me) >= 0) { confetti(80); sfx.win(); } else sfx.safe(); }
}
// みんなの庭（大きめ）＋ 見えていない札の数
function renderGrids() {
  var v = lastView, g = v && v.g; if (!g) return;
  $('gridsList').innerHTML = g.owners.map(function (o, p) { return '<div class="ag"><span>' + (o.kind === 'cpu' ? o.e : '👤') + esc(p === g.me ? 'あなた' : o.name) + '（空き' + L.empties(g.grids[p]) + '）</span>' + gridHtml(g.grids[p]) + '</div>'; }).join('');
  var U = L.unseen(g), parts = [];
  for (var x = 1; x <= 20; x++) parts.push(tc(x) + '×' + U[x]);
  $('gridsNote').innerHTML = '山に残っている札（見えていない札）：<br>' + parts.join(' ');
}
function renderLog() { var g = lastView && lastView.g; if (!g) return; $('logList').innerHTML = g.ev.map(function (e) { return evText(g, e); }).filter(Boolean).reverse().join('') || '<div class="ln">まだありません</div>'; }
