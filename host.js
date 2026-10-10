/* すくすくガーデン：ホスト側のゲーム進行（authoritative）。山・進行・CPUの思考はここだけ */
'use strict';
function hostId(code) { return ID_PREFIX + code; }
function defCpu() { return CH_KEYS.map(function (c) { return { lv: 'normal', ch: c }; }); }
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', opts: { np: solo ? 3 : 4, setup: 'auto', bruno: false, tour: false, cpu: defCpu() }, nextSid: 2, gameNo: 0,
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (resumeRoom && resumeRoom.G) { resumeRoom.G.cpuAt = 0; resumeRoom.G.nextAt = 0; resumeRoom.G.S.rng = Math.random; }
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 80);
}
function npOf(seats, opts) { return Math.min(L.NP[1], Math.max(opts.np, seats.length, L.NP[0])); }
// 席：人間が参加順に前から。残りは CPU（キャラは opts.cpu の順）
function planOwners(seats, opts) {
  var np = npOf(seats, opts), out = [], ci = 0;
  for (var i = 0; i < np; i++) {
    var h = seats[i];
    if (h) out.push({ kind: 'human', sid: h.sid, name: h.name });
    else { var c = opts.cpu[ci++] || { lv: 'normal', ch: 'fuu' }; out.push({ kind: 'cpu', lv: c.lv, ch: c.ch, name: CH[c.ch].name, e: CH[c.ch].e }); }
  }
  return out;
}
function hostStartGame() {
  var R = host.room;
  if (!R.seats.length) return;
  if (R.seats.length > L.NP[1]) { toast(L.NP[1] + '人までです'); return; }
  R.gameNo++; R.lobbyReq = null;
  var owners = planOwners(R.seats, R.opts), ultraI = -1;
  owners.forEach(function (o, i) { if (o.kind === 'cpu' && o.lv === 'ultra' && ultraI < 0) ultraI = i; });
  var S = L.newMatch({ np: owners.length, setup: R.opts.setup, bruno: R.opts.bruno, tour: R.opts.tour });
  L.startGame(S);
  R.G = { S: S, owners: owners, ultra: ultraI >= 0 ? owners[ultraI].ch : null, startAt: Date.now() + (ultraI >= 0 ? T.awaken : 600), started: false, cpuAt: 0, cpuP: -1, nextAt: 0, endAt: 0, say: null, seenEv: S.evId };
  R.phase = 'game';
  hostBroadcast();
}
function say(p, key, o) {
  var G = host.room.G, ow = G.owners[p]; if (!ow || ow.kind !== 'cpu') return;
  var lines = CH[ow.ch].L[key]; if (!lines) return;
  G.say = { id: (G.say ? G.say.id : 0) + 1, p: p, text: fill(pick(lines), o || {}) + (ow.lv === 'ultra' && Math.random() < 0.5 ? '😎' : '') };
}
function isCpu(p) { var o = host.room.G.owners[p]; return o && o.kind === 'cpu'; }
// 新しく起きた出来事に CPU がひとこと
function afterEvents() {
  var G = host.room.G, S = G.S;
  S.ev.forEach(function (e) {
    if (e.id <= G.seenEv) return;
    G.seenEv = e.id;
    var r = Math.random();
    if (e.k === 'place' && isCpu(e.p)) {
      if (e.n === 15) say(e.p, 'reach');
      else if (e.extra) say(e.p, 'extra');
      else if (e.from === 'pool' && r < 0.4) say(e.p, 'take', { v: e.v });
      else if (e.old && r < 0.3) say(e.p, 'swap', { v: e.old });
      else if (!e.old && r < 0.12) say(e.p, 'good');
    } else if (e.k === 'discard' && isCpu(e.p) && r < 0.3) say(e.p, 'discard', { v: e.v });
    else if (e.k === 'end') {
      var w = e.winners.filter(isCpu), ls = G.owners.map(function (o, i) { return i; }).filter(function (q) { return isCpu(q) && e.winners.indexOf(q) < 0; });
      if (w.length) say(pick(w), 'win'); else if (ls.length) say(pick(ls), 'lose');
    } else if (e.k === 'game' && e.game === 1) { var cs = G.owners.map(function (o, i) { return i; }).filter(isCpu); if (cs.length) say(pick(cs), 'greet'); }
  });
}
function delayFor() {
  var S = host.room.G.S, e = S.ev[S.ev.length - 1], d = 800;
  if (!e) return 500;
  if (e.k === 'draw') d = 0;   // 引いたあとの「置く」はCPUの考える時間で調整
  else if (e.k === 'place') d = e.old ? 1100 : 800;
  else if (e.k === 'discard') d = 900;
  else if (e.k === 'extra') d = 1200;
  else if (e.k === 'setupPlace') d = 200;
  else if (e.k === 'setupDraw' || e.k === 'setup') d = 1000;
  return d * T.k;
}
function applyAct(p, a) {
  var G = host.room.G, S = G.S;
  var err = L.act(S, p, a); if (err) return err;
  afterEvents(); G.nextAt = Date.now() + delayFor(); G.cpuAt = 0;
  if (S.phase === 'end') G.endAt = Date.now() + T.end + 1600 * T.k;
  hostBroadcast(); return null;
}
function hostAction(sid, m) {
  var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
  var S = G.S, nd = S.need;
  if (Date.now() < G.startAt || !nd) return null;
  var me = -1; G.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === sid) me = i; });
  if (me < 0) return '観戦中です';
  if (S.phase === 'setup') { if (nd.ps.indexOf(me) < 0) return 'ほかの人を待っています'; }
  else if (nd.p !== me) return 'あなたの番ではありません';
  var v = m.v || {}, a;
  if (m.a === 'draw') a = { a: 'draw' };
  else if (m.a === 'take') a = { a: 'take', v: +v.v, cell: +v.cell };
  else if (m.a === 'place') a = { a: 'place', cell: +v.cell };
  else if (m.a === 'discard') a = { a: 'discard' };
  else if (m.a === 'setup') a = { a: 'setup', cell: +v.cell };
  else return '不明な操作です';
  return applyAct(me, a);
}
function proxyOf(p) { var G = host.room.G, o = G.owners[p]; if (o.kind === 'cpu') return 'cpu'; var s = seatBySid(o.sid); return s && s.kind === 'remote' && !s.connected ? 'proxy' : null; }
function hostTick() {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  if (now < G.startAt) return;
  if (!G.started) { G.started = true; G.nextAt = now + 300; afterEvents(); hostBroadcast(); return; }
  var S = G.S;
  if ((S.phase === 'play' || S.phase === 'setup') && S.need) {
    var p = -1, kind = null;
    if (S.phase === 'setup') { for (var j = 0; j < S.need.ps.length; j++) { var kk = proxyOf(S.need.ps[j]); if (kk) { p = S.need.ps[j]; kind = kk; break; } } }
    else { p = S.need.p; kind = proxyOf(p); }
    if (!kind) { G.cpuAt = 0; return; }
    if (now < G.nextAt) return;
    if (!G.cpuAt || G.cpuP !== p) { G.cpuP = p; G.cpuAt = now + (kind === 'cpu' ? (S.need.k === 'place' ? T.draw + rand(T.cpu) * 0.6 : S.phase === 'setup' ? rand(T.cpu) * 0.6 : rand(T.cpu)) : T.off); hostBroadcast(); return; }
    if (now < G.cpuAt) return;
    G.cpuAt = 0;
    var o = G.owners[p], seat = o.kind === 'human' ? seatBySid(o.sid) : null;
    if (kind === 'proxy') toastAll('切断中の ' + seat.name + ' のかわりに CPU が動かしました');
    var a = L.aiAct(S, p, kind === 'cpu' ? o.lv : 'normal', { budget: TURBO ? 150 : 1200 });
    if (applyAct(p, a)) applyAct(p, L.legal(S, p)[0]);
    if (kind === 'cpu' && o.lv === 'ultra') ultraFx(p, S);
    return;
  }
  if (S.phase === 'end') {
    if (!G.endAt) G.endAt = now + T.end;
    if (now >= G.endAt) {
      G.endAt = 0;
      if (S.matchOver) R.phase = 'end';
      else { L.nextGame(S); G.nextAt = now + 1200 * T.k; afterEvents(); }
      hostBroadcast();
    } else if (now - (G.tickAt || 0) > 1000) { G.tickAt = now; hostBroadcast(); }
  }
}
// アストラウルトラの決め手（リーチ・完成）はカットインで全員に知らせる
function ultraFx(p, S) {
  var G = host.room.G, e = S.ev[S.ev.length - 1]; if (!e) return;
  if (e.k === 'place' && e.p === p && e.n === 15) G.cut = { id: (G.cut ? G.cut.id : 0) + 1, p: p, t: 'リーチ！', l: 'あと1マス…読みどおり' };
  if (e.k === 'end' && e.winners.indexOf(p) >= 0) G.cut = { id: (G.cut ? G.cut.id : 0) + 1, p: p, t: 'お庭 完成！', l: 'すべて計算どおり' };
}
function viewFor(sid) {
  var R = host.room, G = R.G, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: JSON.parse(JSON.stringify(R.opts)),
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !G) return v;
  var S = G.S, me = -1;
  G.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === sid) me = i; });
  v.g = L.viewFor(S);   // ← みんなに見えている情報だけ（裏向きの山は枚数のみ）
  v.g.me = me;
  v.g.owners = G.owners.map(function (o) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { kind: o.kind, sid: o.sid, name: o.name, lv: o.lv, ch: o.ch, e: o.e, connected: !s || s.kind !== 'remote' || s.connected }; });
  v.g.ultra = G.ultra; v.g.wait = Math.max(0, G.startAt - now); v.g.say = G.say; v.g.cut = G.cut || null;
  v.g.thinking = G.cpuAt ? G.cpuP : -1;
  v.g.nextIn = G.endAt ? Math.max(0, G.endAt - now) : null;
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() {
  var now = Date.now(); if (now - saveT < 700 && host.room.phase === 'game') return; saveT = now;
  try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: now }, function (k, v) { return k === 'rng' ? undefined : v; })); } catch (e) {}
}
