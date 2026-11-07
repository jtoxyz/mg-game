// コントローラー：画面遷移・入力・CPU進行・オンライン同期・保存
'use strict';

const App = (() => {
  const E = Engine;
  const SAVE_KEY = 'mgdigital-save';
  const CID_KEY = 'mgdigital-cid';
  const JOIN_KEY = 'mgdigital-join';
  const SPEED_KEY = 'mgdigital-speed';
  const DELAY = { slow: 3000, normal: 1800, fast: 600 };
  const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  // 端末ID：オンライン対戦で自分の会社を見分けるための秘密の値（他の参加者には送らない）
  const newCid = () => {
    try { return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24); } catch (e) { return 'c' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  };
  const cid = (() => {
    let id = store.get(CID_KEY);
    if (typeof id !== 'string' || !/^[\w-]{6,64}$/.test(id) || id.length < 16) { id = newCid(); store.set(CID_KEY, id); }
    return id;
  })();

  const st = {
    view: 'title', mode: 'local', s: null, setup: null, join: null,
    ui: { choice: null, f: {}, err: null, revealed: null, pending: false }, sig: '',
    viewPid: null, lastActor: null, modal: null, card: null, cardTimer: null, cardQueue: [],
    speed: hasOwn(DELAY, store.get(SPEED_KEY)) ? store.get(SPEED_KEY) : 'normal',
    net: null, code: '', connOk: false, connLabel: '',
    cpuTimer: null, lastCardKey: '', lastAuctionKey: '', pendingTimer: null,
    myPids: [],        // 参加者：自分の会社（ホストから知らされる）
    online: {},        // ホスト：端末IDごとの接続状況
    wasRemote: {},     // ホスト：CPUに交代した参加者の会社
    hist: {},          // 参加者：受け取った決算の履歴
    histSig: '',       // ホスト：最後に全員へ送った履歴
    modalKey: '', focusReturn: null, shownView: '',
  };

  // ---------- 便利関数 ----------
  const $app = () => document.getElementById('app');
  function toast(msg, err) {
    const box = document.getElementById('toast');
    const el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  const localPids = () => {
    const s = st.s; if (!s) return [];
    if (st.mode === 'guest') return st.myPids.filter(id => s.players[id] && s.players[id].ctrl === 'remote');
    return s.order.filter(id => s.players[id].ctrl === 'local');
  };
  const actorOf = () => {
    if (!st.s) return null;
    const mine = localPids();
    return E.waitingFor(st.s).find(id => mine.includes(id)) || null;
  };
  const humanLocalCount = () => st.s ? st.s.order.filter(id => st.s.players[id].ctrl === 'local').length : 0;
  const randomCode = () => {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const r = new Uint32Array(4);
    try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < 4; i++) r[i] = Math.floor(Math.random() * 1e9); }
    return Array.from(r, x => A[x % A.length]).join('');
  };
  // ホスト：参加者（端末ID）→ 会社
  const pidsOf = (c) => (st.s ? st.s.order.filter(id => st.s.players[id].owner === c) : []);
  const onlineByPid = () => {
    if (st.mode !== 'host' || !st.s) return null;
    const o = {};
    for (const id of st.s.order) { const P = st.s.players[id]; if (P.owner) o[id] = !!st.online[P.owner]; }
    return o;
  };

  // ---------- 差分描画 ----------
  // 画面を作り直す代わりに、今ある要素を新しい HTML に合わせて書き換える。
  // これでボタン・入力欄・スクロール位置がそのまま残り、入力中の数字やクリックが消えない。
  function morph(root, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    patchChildren(root, tpl.content);
  }
  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
    return a.nodeType !== 1 || (a.getAttribute('data-key') || '') === (b.getAttribute('data-key') || '');
  }
  // ボタンや入力欄の「名札」。途中にメッセージが増えたり減ったりしても、同じ部品を使い続けるために使う
  function idOf(x) {
    if (x.nodeType !== 1) return '';
    if (x.id) return '#' + x.id;
    const d = x.dataset;
    return d && d.a ? `${x.nodeName}:${d.a}:${d.v || ''}:${d.k || ''}:${d.d || ''}` : '';
  }
  function findAhead(start, id, limit) {
    for (let k = start, i = 0; k && i < limit; k = k.nextSibling, i++) if (idOf(k) === id) return k;
    return null;
  }
  function patchChildren(from, to) {
    const b = [...to.childNodes];
    let o = from.firstChild;
    b.forEach((n, i) => {
      if (!o) { from.appendChild(n); return; }
      const io = idOf(o), inn = idOf(n);
      if (sameNode(o, n) && io === inn) { const next = o.nextSibling; patchNode(o, n); o = next; return; }
      // 古い側に同じ部品が少し先にある → 間の古い要素を消して使う
      const hit = inn ? findAhead(o.nextSibling, inn, 6) : null;
      if (hit && sameNode(hit, n)) {
        while (o !== hit) { const nx = o.nextSibling; from.removeChild(o); o = nx; }
        const next = o.nextSibling; patchNode(o, n); o = next; return;
      }
      // 今の古い部品が新しい側の少し先にある → 新しい要素をその前に差し込む
      if (io && b.slice(i + 1, i + 7).some(x => idOf(x) === io)) { from.insertBefore(n, o); return; }
      const next = o.nextSibling;
      from.replaceChild(n, o);
      o = next;
    });
    while (o) { const nx = o.nextSibling; from.removeChild(o); o = nx; }
  }
  function patchNode(o, n) {
    if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
    for (const { name, value } of [...n.attributes]) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
    patchChildren(o, n);
    const focused = o === document.activeElement;
    if (o.nodeName === 'INPUT' && !focused && o.value !== n.value) o.value = n.value;
    if (o.nodeName === 'SELECT' && !focused) {
      const sel = n.querySelector('option[selected]') || n.querySelector('option');
      if (sel && o.value !== sel.value) o.value = sel.value;
    }
  }

  // ---------- 描画 ----------
  function saveInfo() {
    const sv = store.get(SAVE_KEY);
    if (!sv || !sv.s) return null;
    const s = E.migrate(JSON.parse(JSON.stringify(sv.s)));
    const where = sv.mode === 'host' ? `オンライン（ホスト・部屋${sv.code}）` : 'この端末';
    const at = sv.at ? new Date(sv.at).toLocaleString('ja-JP') : '';
    if (!s) return { ok: false, label: '古い版のデータのため、続きから遊べません' };
    const over = s.phase === 'over';
    return { ok: true, over, label: `${where}・${over ? '終了' : `第${s.period}期`}・${at}` };
  }

  function render() {
    const app = $app();
    let html = '';
    if (st.view === 'title') html = UI.title({ save: saveInfo() });
    else if (st.view === 'setup') html = UI.setup({ setup: st.setup });
    else if (st.view === 'host') html = UI.hostLobby({ setup: st.setup, code: st.code, connLabel: connText(), connOk: st.connOk, online: st.online });
    else if (st.view === 'join') html = UI.join({ join: st.join });
    else if (st.view === 'game') {
      const s = st.s, actor = actorOf(), pd = s.pending;
      const sig = [s.period, s.phase, s.step, s.cur, actor, pd ? pd.parent || pd.pid : '', pd ? (pd.stage || '') + (pd.round || '') : ''].join('|');
      if (sig !== st.sig) { st.sig = sig; st.ui = { choice: null, f: {}, err: null, revealed: st.ui.revealed, pending: st.ui.pending }; }
      if (!st.viewPid || !s.players[st.viewPid]) st.viewPid = localPids()[0] || s.order[0];
      html = UI.game({
        s, mode: st.mode, actor, ui: st.ui, viewPid: st.viewPid, speed: st.speed,
        needCover: humanLocalCount() > 1, canAdvance: st.mode !== 'guest',
        connLabel: st.mode === 'local' ? '' : connText(), connOk: st.connOk,
        isHost: st.mode === 'host', online: onlineByPid(),
      });
    }
    const oldLog = app.querySelector('.log');
    const logStick = !oldLog || oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight < 40;
    morph(app, html);
    // 画面が切り替わったら先頭から見せる
    if (st.view !== st.shownView) { st.shownView = st.view; window.scrollTo(0, 0); }
    const newLog = app.querySelector('.log');
    if (newLog && logStick) newLog.scrollTop = newLog.scrollHeight;
    renderModal();
  }
  function connText() {
    if (st.mode === 'local') return '';
    return (st.mode === 'host' ? `部屋 ${st.code}：` : '') + (st.connLabel || '接続準備中');
  }

  function modalHtml() {
    const m = st.modal, s = st.s;
    if (m.kind === 'books' && s) return UI.books({ s, modal: m, viewPid: st.viewPid });
    if (m.kind === 'rules') return UI.rules();
    if (m.kind === 'guide') return UI.guide();
    if (m.kind === 'auction' && s && s.lastAuction) return UI.auctionModal(s, s.lastAuction);
    if (m.kind === 'menu') return UI.menu({ s, mode: st.mode, isHost: st.mode === 'host', code: st.code, speed: st.speed, online: onlineByPid(), wasRemote: st.wasRemote });
    if (m.kind === 'confirm') return UI.confirm(m);
    return '';
  }
  function renderModal() {
    const root = document.getElementById('modal-root');
    let html = st.modal ? modalHtml() : '';
    if (st.card && st.s) html += UI.cardPop(st.s, st.card, st.cardQueue.length);
    morph(root, html);
    // フォーカス：開いたら中へ、閉じたら元の場所へ
    const dlg = root.querySelector('.modal-back, .card-pop.risk-back');
    const key = dlg ? dlg.getAttribute('data-key') : '';
    if (key && key !== st.modalKey) {
      if (!st.modalKey) st.focusReturn = document.activeElement;
      const target = dlg.querySelector('[data-autofocus]') || dlg.querySelector('button, [tabindex]');
      if (target) target.focus({ preventScroll: true });
    } else if (!key && st.modalKey) {
      const back = st.focusReturn;
      st.focusReturn = null;
      if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    }
    st.modalKey = key;
  }

  // ---------- 状態変化の後処理 ----------
  function afterChange(fromNet) {
    const s = st.s;
    // カード演出：カードを引いた回ごとに1回だけ
    if (s.lastCard) {
      const key = String(s.lastCard.n);
      if (key !== st.lastCardKey) {
        st.lastCardKey = key;
        const show = s.lastCard.kind === 'risk' || localPids().includes(s.lastCard.pid);
        if (show) showCard({ ...s.lastCard });
      }
    }
    // 入札結果：自分（この端末の人間）が関わったら表示
    if (s.lastAuction) {
      const ak = String(s.lastAuction.n);
      if (ak !== st.lastAuctionKey) {
        st.lastAuctionKey = ak;
        const mine = localPids();
        const involved = s.lastAuction.results.some(r => r.entries.some(e => mine.includes(e.pid)));
        if (involved && !st.modal) st.modal = { kind: 'auction' };
      }
    }
    // 手番の人間に会社盤を合わせる
    const actor = actorOf();
    if (actor && actor !== st.lastActor) st.viewPid = actor;
    st.lastActor = actor;
    if (st.mode !== 'guest') save();
    if (st.mode === 'host' && !fromNet) broadcastState();
    render();
    scheduleCpu();
  }

  // リスクカードはクリックされるまで表示し続ける（その間CPUは止まる）。重なったら順番に出す
  const riskShown = () => !!(st.card && st.card.kind === 'risk');
  function showCard(card) {
    if (card.kind === 'risk') {
      if (riskShown()) { st.cardQueue.push(card); return; }
      clearTimeout(st.cardTimer);
      st.card = card;
      return;
    }
    if (riskShown()) return;
    st.card = card;
    clearTimeout(st.cardTimer);
    st.cardTimer = setTimeout(() => { if (!riskShown()) { st.card = null; renderModal(); } }, 1200);
  }
  function closeCard() {
    clearTimeout(st.cardTimer);
    st.card = riskShown() && st.cardQueue.length ? st.cardQueue.shift() : null;
    renderModal();
    scheduleCpu();
  }

  function save() {
    if (!st.s) return;
    store.set(SAVE_KEY, { mode: st.mode, s: st.s, code: st.code, at: Date.now() });
  }

  function scheduleCpu() {
    if (st.mode === 'guest' || !st.s || st.cpuTimer || riskShown()) return;
    const s = st.s;
    const pid = E.waitingFor(s).find(id => s.players[id].ctrl === 'cpu');
    if (!pid) return;
    const base = DELAY[st.speed] || DELAY.normal;
    const delay = s.phase === 'turn' && s.step === 'pre' ? base * 0.6 : s.phase === 'auction' ? base * 0.6 : base;
    st.cpuTimer = setTimeout(() => {
      st.cpuTimer = null;
      if (!st.s || st.s !== s || st.view !== 'game' || riskShown()) return;
      if (!E.waitingFor(s).includes(pid) || s.players[pid].ctrl !== 'cpu') { scheduleCpu(); return; }
      const a = AI.decide(s, pid);
      if (!a || E.act(s, a)) E.act(s, AI.fallback(s, pid));
      afterChange();
    }, delay);
  }

  function dispatch(action) {
    if (!st.s || !action.pid) return false;
    if (st.mode === 'guest') {
      if (st.ui.pending) return false;
      if (!st.net || !st.net.send({ t: 'act', a: action })) { toast('ホストに接続されていません', true); return false; }
      st.ui.pending = true; st.ui.err = null;
      clearTimeout(st.pendingTimer);
      st.pendingTimer = setTimeout(() => {
        if (!st.ui.pending) return;
        st.ui.pending = false;
        st.ui.err = 'ホストから返事がありません。通信を確認して、もう一度操作してください';
        render();
      }, 10000);
      render();
      return true;
    }
    const err = E.act(st.s, action);
    if (err) { st.ui.err = err; render(); return false; }
    afterChange();
    return true;
  }

  // ---------- オンライン：ホスト ----------
  const memberCids = () => (st.s ? [...new Set(st.s.order.map(id => st.s.players[id].owner).filter(Boolean))] : []);
  const histSig = (s) => s.order.map(id => s.players[id].history.length).join(',');
  const lobbySeats = () => st.setup.seats.map(x => ({ company: x.company, ceo: x.ceo, ctrl: x.ctrl }));

  // to を指定するとその参加者だけに、自分の会社と決算の履歴も付けて送る
  function broadcastState(to) {
    if (!st.net) return;
    if (st.view === 'host') { st.net.send({ t: 'lobby', seats: lobbySeats() }); return; }
    if (!st.s) return;
    const s = st.s;
    const msg = { t: 'state', s: E.publicView(s, { history: false }) };
    const hist = () => Object.fromEntries(s.order.map(id => [id, s.players[id].history]));
    if (to != null) { st.net.send({ ...msg, hist: hist(), you: pidsOf(to) }, to); return; }
    const sig = histSig(s);
    if (sig !== st.histSig) { st.histSig = sig; msg.hist = hist(); }
    st.net.send(msg, memberCids());
  }

  function hostOnMsg(m) {
    if (!m || typeof m.from !== 'string') return;
    if (m.t === 'hello') {
      if (st.view === 'host') {
        const seats = st.setup.seats;
        let seat = seats.find(x => x.owner === m.from) || seats.find(x => x.ctrl === 'open');
        if (!seat && seats.length < MG.RULE.maxSeats) { seat = {}; seats.push(seat); }
        if (!seat) { st.net.send({ t: 'err', msg: '満員です' }, m.from); return; }
        const isNew = seat.owner !== m.from;
        Object.assign(seat, { ctrl: 'remote', owner: m.from, company: clip(m.company, 14) || '参加者の会社', ceo: clip(m.ceo, 10) });
        render();
        broadcastState();
        if (isNew) toast(`${seat.company}が参加しました`);
      } else if (st.s) {
        const mine = pidsOf(m.from);
        if (!mine.length) { st.net.send({ t: 'err', msg: 'ゲームはすでに始まっています' }, m.from); return; }
        // CPUに交代していた会社は、参加者が戻ってきたら参加者に戻す
        const back = mine.filter(id => st.s.players[id].ctrl === 'cpu' && st.wasRemote[id]);
        back.forEach(id => { st.s.players[id].ctrl = 'remote'; delete st.wasRemote[id]; });
        if (back.length) { toast(`${back.map(id => st.s.players[id].company).join('・')}の参加者が戻りました`); afterChange(); }
        broadcastState(m.from);
      }
      return;
    }
    if (m.t === 'act' && st.s && m.a && typeof m.a === 'object') {
      const P = hasOwn(st.s.players, m.a.pid) ? st.s.players[m.a.pid] : null;
      if (!P || P.owner !== m.from || P.ctrl !== 'remote' || m.a.type === 'nextPeriod') { st.net.send({ t: 'err', msg: 'その操作はできません' }, m.from); broadcastState(m.from); return; }
      let err;
      try { err = E.act(st.s, m.a); } catch (e) { err = '処理できない操作です'; }
      if (err) { st.net.send({ t: 'err', msg: err }, m.from); broadcastState(m.from); return; }
      afterChange();
    }
  }

  function hostOnPeer(c, online) {
    st.online[c] = online;
    if (st.s && !online) {
      const names = pidsOf(c).filter(id => st.s.players[id].ctrl === 'remote').map(id => st.s.players[id].company);
      if (names.length) toast(`${names.join('・')}の通信が切れました`, true);
    }
    render();
  }

  async function startNet(role, code, h) {
    closeNet();
    st.connOk = false; st.connLabel = '接続準備中';
    const handlers = {
      ...h,
      onStatus: (ok, label) => {
        st.connOk = ok; st.connLabel = label;
        if (role === 'host' && ok) broadcastState();
        if (role === 'guest' && st.join && st.view === 'join') {
          if (ok) { st.join.stage = 'waiting'; st.join.err = ''; } else st.join.err = label;
        }
        render();
      },
    };
    try {
      st.net = role === 'host' ? await Net.host(code, handlers) : await Net.guest(code, cid, handlers);
    } catch (e) {
      st.connOk = false; st.connLabel = e.message;
      if (st.join) { st.join.stage = 'form'; st.join.err = e.message; }
      render();
    }
  }
  function closeNet() {
    if (st.net) { try { st.net.close(); } catch (e) { /* noop */ } st.net = null; }
  }

  // ---------- オンライン：参加者 ----------
  function guestOnMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'lobby') {
      if (st.join) { st.join.lobby = Array.isArray(m.seats) ? m.seats.slice(0, MG.RULE.maxSeats) : []; st.join.stage = 'waiting'; st.join.err = ''; }
      render();
    } else if (m.t === 'state' && m.s && m.s.players && Array.isArray(m.s.order)) {
      if (m.hist && typeof m.hist === 'object') st.hist = m.hist;
      if (Array.isArray(m.you)) {
        const before = st.myPids.join();
        st.myPids = m.you.filter(id => typeof id === 'string');
        if (before !== st.myPids.join()) st.viewPid = null;
      }
      const s = m.s;
      for (const id of s.order) if (s.players[id]) s.players[id].history = Array.isArray(st.hist[id]) ? st.hist[id] : [];
      const first = st.view !== 'game';
      st.s = s; st.mode = 'guest'; st.view = 'game';
      if (first) {
        st.viewPid = localPids()[0] || s.order[0];
        st.lastCardKey = s.lastCard ? String(s.lastCard.n) : '';
        st.lastAuctionKey = s.lastAuction ? String(s.lastAuction.n) : '';
      }
      st.ui.pending = false; clearTimeout(st.pendingTimer);
      afterChange(true);
    } else if (m.t === 'err') {
      st.ui.pending = false; clearTimeout(st.pendingTimer);
      if (st.view === 'game') { st.ui.err = String(m.msg || ''); render(); } else if (st.join) { st.join.err = String(m.msg || ''); render(); }
    } else if (m.t === 'kicked' || m.t === 'closed') {
      closeNet();
      st.s = null; st.mode = 'local'; st.modal = null; st.card = null;
      if (st.join) { st.join.stage = 'form'; st.join.lobby = null; st.join.err = m.t === 'kicked' ? 'ホストが参加枠を外しました' : 'ホストが部屋を閉じました'; st.view = 'join'; } else st.view = 'title';
      render();
    }
  }

  // ---------- 入力の読み取り ----------
  function num(key, def) {
    const f = st.ui.f;
    if (f[key] != null) return f[key];
    const el = document.getElementById('f-' + key);
    if (el) return parseInt(el.value, 10) || 0;
    return def || 0;
  }
  function clampInput(el, v) {
    const min = +el.dataset.min, max = +el.dataset.max, step = +el.dataset.step || 1;
    v = Math.round((isNaN(v) ? min : v) / step) * step;
    return Math.max(min, Math.min(max, v));
  }

  // ---------- 画面遷移 ----------
  function goTitle() {
    if (st.mode === 'host' && st.net) st.net.send({ t: 'closed' });
    closeNet();
    clearTimeout(st.cpuTimer); st.cpuTimer = null;
    clearTimeout(st.cardTimer); clearTimeout(st.pendingTimer);
    st.view = 'title'; st.s = null; st.modal = null; st.card = null; st.cardQueue = []; st.mode = 'local';
    st.myPids = []; st.online = {}; st.wasRemote = {}; st.hist = {}; st.histSig = '';
    st.ui = { choice: null, f: {}, err: null, revealed: null, pending: false };
    render();
  }

  const CPU_NAMES = ['北斗製作所', '青葉工業', '大和精機', '浪速産業', '博多工作所', '名城機工'];
  function newSetup(kind) {
    const seats = kind === 'cpu'
      ? [{ company: 'わが社', ceo: '', ctrl: 'local' }, { company: CPU_NAMES[0], ctrl: 'cpu', ai: '' }, { company: CPU_NAMES[1], ctrl: 'cpu', ai: '' }, { company: CPU_NAMES[2], ctrl: 'cpu', ai: '' }]
      : ['A社', 'B社', 'C社', 'D社'].map(c => ({ company: c, ceo: '', ctrl: 'local' }));
    return { kind, seats, cfg: { periods: 3, rounds: 10 } };
  }

  function seatsForGame(seats) {
    return seats.map((x, i) => ({
      company: clip(x.company, 14) || `${i + 1}番目の会社`, ceo: clip(x.ceo, 10), ctrl: x.ctrl, owner: x.owner || null, ai: x.ai || '',
    }));
  }

  // 確認ダイアログ。then はハンドラー名
  function ask(title, msg, yes, then, danger) {
    st.modal = { kind: 'confirm', title, msg, yes, then, danger };
    renderModal();
  }
  // 続きのデータが残っていれば、上書きする前に確かめる
  function confirmOverwrite(then) {
    const sv = saveInfo();
    if (sv && sv.ok && !sv.over) { ask('新しいゲームを始めますか？', `前回の続きのデータ（${sv.label}）は消えます。`, '始める', then, true); return true; }
    return false;
  }

  function enterGame() {
    st.view = 'game'; st.viewPid = null; st.sig = ''; st.modal = null;
    st.lastCardKey = st.s.lastCard ? String(st.s.lastCard.n) : '';
    st.lastAuctionKey = st.s.lastAuction ? String(st.s.lastAuction.n) : '';
  }

  // ---------- イベント ----------
  const handlers = {
    home: () => {
      if (st.view === 'game' && st.s) {
        const msg = st.mode === 'host' ? '部屋を閉じます。参加者の接続も切れます（ゲームはこの端末に保存され、「続きから」で同じ部屋を開き直せます）。'
          : st.mode === 'guest' ? 'ゲームから抜けます。同じ部屋コードで参加し直せば続きから遊べます。'
            : st.s.phase === 'over' ? 'タイトルに戻ります。' : 'ゲームはこの端末に保存されています。「続きから」で再開できます。';
        if (st.s.phase === 'over' && st.mode === 'local') { goTitle(); return; }
        ask('タイトルへ戻りますか？', msg, 'タイトルへ戻る', 'doHome', st.mode !== 'local');
      } else if (st.view === 'host') ask('部屋を閉じますか？', '参加している人の接続も切れます。', '部屋を閉じる', 'doHome', true);
      else goTitle();
    },
    doHome: () => goTitle(),
    confirmYes: () => { const m = st.modal; st.modal = null; renderModal(); if (m && handlers[m.then]) handlers[m.then](); },
    dropSave: () => ask('前回のデータを削除しますか？', '削除すると元に戻せません。', '削除する', 'doDropSave', true),
    doDropSave: () => { store.del(SAVE_KEY); render(); },
    goSetup: (v) => { st.setup = newSetup(v === 'hotseat' ? 'hotseat' : 'cpu'); st.view = 'setup'; render(); },
    goHost: () => {
      st.mode = 'host'; st.code = randomCode(); st.online = {};
      st.setup = { kind: 'host', seats: [{ company: 'わが社', ceo: '', ctrl: 'local' }, { company: '（募集中）', ctrl: 'open' }, { company: '（募集中）', ctrl: 'open' }, { company: CPU_NAMES[0], ctrl: 'cpu', ai: '' }], cfg: { periods: 3, rounds: 10 } };
      st.view = 'host'; render();
      startNet('host', st.code, { onMsg: hostOnMsg, onPeer: hostOnPeer });
    },
    goJoin: () => {
      const last = store.get(JOIN_KEY) || {};
      st.join = { stage: 'form', code: clip(last.code, 4), company: clip(last.company, 14), ceo: clip(last.ceo, 10), err: '' };
      st.view = 'join'; render();
    },
    doJoin: () => {
      const j = st.join;
      j.code = (j.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(j.code)) { j.err = '部屋コードは英数字4文字です'; return render(); }
      if (!j.company.trim()) { j.err = '社名を入力してください'; return render(); }
      store.set(JOIN_KEY, { code: j.code, company: j.company, ceo: j.ceo });
      j.stage = 'connecting'; j.err = ''; j.lobby = null; st.mode = 'guest'; st.myPids = []; st.hist = {}; render();
      startNet('guest', j.code, { onMsg: guestOnMsg, hello: { company: clip(j.company, 14), ceo: clip(j.ceo, 10) } });
    },
    resume: () => {
      const sv = store.get(SAVE_KEY);
      const s = sv && sv.s ? E.migrate(sv.s) : null;
      if (!s) { toast('このデータは続きから遊べません', true); return; }
      st.s = s; st.mode = sv.mode === 'host' ? 'host' : 'local'; st.code = sv.code || '';
      st.online = {}; st.wasRemote = {}; st.histSig = '';
      enterGame();
      if (st.mode === 'host') startNet('host', st.code, { onMsg: hostOnMsg, onPeer: hostOnPeer });
      afterChange();
    },
    rules: () => { st.modal = { kind: 'rules' }; renderModal(); },
    guide: () => { st.modal = { kind: 'guide' }; renderModal(); },
    menu: () => { st.modal = { kind: 'menu' }; renderModal(); },
    closeModal: () => { st.modal = null; renderModal(); },
    closeCard: () => closeCard(),
    showAuction: () => { st.modal = { kind: 'auction' }; renderModal(); },
    books: (v) => { st.modal = { kind: 'books', tab: v, pid: (st.modal && st.modal.pid) || st.viewPid }; renderModal(); },
    booksPid: (v) => { st.modal.pid = v; renderModal(); },
    booksPeriod: (v) => { st.modal.period = +v; renderModal(); },
    view: (v) => { st.viewPid = v; render(); },
    toCpu: (v) => {
      const P = st.s && hasOwn(st.s.players, v) ? st.s.players[v] : null;
      if (!P || st.mode !== 'host' || P.ctrl !== 'remote') return;
      P.ctrl = 'cpu'; st.wasRemote[v] = true;
      if (st.modal && st.modal.kind === 'menu') st.modal = null;
      toast(`${P.company}をCPUに交代しました`);
      afterChange();
    },

    seatType: (v, el) => {
      const seat = st.setup.seats[+el.dataset.i];
      if (!seat || seat.ctrl === 'remote' || !['local', 'cpu', 'open'].includes(v)) return;
      seat.ctrl = v;
      if (v === 'open') seat.company = '（募集中）';
      else if (v === 'cpu' && /募集中/.test(seat.company)) seat.company = CPU_NAMES[+el.dataset.i % CPU_NAMES.length];
      render(); if (st.view === 'host') broadcastState();
    },
    seatDel: (v, el) => {
      const [gone] = st.setup.seats.splice(+el.dataset.i, 1);
      if (gone && gone.owner && st.net) st.net.send({ t: 'kicked' }, gone.owner);
      render(); if (st.view === 'host') broadcastState();
    },
    seatAdd: () => {
      const i = st.setup.seats.length;
      if (i >= MG.RULE.maxSeats) return;
      st.setup.seats.push(st.setup.kind === 'hotseat' ? { company: String.fromCharCode(65 + i) + '社', ceo: '', ctrl: 'local' } : st.setup.kind === 'host' ? { company: '（募集中）', ctrl: 'open' } : { company: CPU_NAMES[i % CPU_NAMES.length], ctrl: 'cpu', ai: '' });
      render(); if (st.view === 'host') broadcastState();
    },
    startLocal: () => { if (!confirmOverwrite('doStartLocal')) handlers.doStartLocal(); },
    doStartLocal: () => {
      st.s = E.newGame(st.setup.cfg, seatsForGame(st.setup.seats));
      st.mode = 'local';
      enterGame();
      afterChange();
    },
    startHost: () => {
      if (st.setup.seats.filter(x => x.ctrl !== 'open').length < 2) return toast('2社以上で開始できます', true);
      if (!confirmOverwrite('doStartHost')) handlers.doStartHost();
    },
    doStartHost: () => {
      const seats = seatsForGame(st.setup.seats.filter(x => x.ctrl !== 'open'));
      st.s = E.newGame(st.setup.cfg, seats);
      enterGame();
      st.histSig = '';
      // 参加者それぞれに、自分の会社がどれかを伝えてから始める
      memberCids().forEach(c => broadcastState(c));
      afterChange();
    },

    // ゲーム中
    reveal: (v) => { st.ui.revealed = v; render(); },
    choose: (v) => { st.ui.choice = st.ui.choice === v && v.startsWith('B:') ? null : v; st.ui.f = {}; st.ui.err = null; render(); },
    step: (v, el) => {
      const key = el.dataset.k, input = document.getElementById('f-' + key);
      const cur = st.ui.f[key] != null ? st.ui.f[key] : input ? parseInt(input.value, 10) || 0 : 0;
      st.ui.f[key] = clampInput(el, cur + (+el.dataset.d) * (+el.dataset.step || 1));
      st.ui.err = null; render();
    },
    trDir: (v) => { st.ui.f.trDir = v === 's2w' ? 's2w' : 'w2s'; st.ui.f.tr = 0; render(); },
    draw: () => dispatch({ type: 'draw', pid: actorOf() }),
    chip: (v) => dispatch({ type: 'chip', pid: actorOf(), chip: v }),
    doTransfer: () => {
      const n = num('tr');
      if (n > 0 && dispatch({ type: 'transfer', pid: actorOf(), dir: st.ui.f.trDir === 's2w' ? 's2w' : 'w2s', n })) { st.ui.f.tr = 0; render(); }
    },
    sellMachine: (v, el) => dispatch({ type: 'sellMachine', pid: actorOf(), mid: v, part: el.dataset.part || 'machine' }),
    doBorrow: () => { if (dispatch({ type: 'borrow', pid: actorOf(), amt: num('borrow') })) { st.ui.f.borrow = 0; render(); } },
    doRepay: () => { if (dispatch({ type: 'repay', pid: actorOf(), amt: num('repay') })) { st.ui.f.repay = 0; render(); } },
    doBuyMat: () => {
      const buys = {};
      [...MG.MARKETS.map(m => m.id), 'stocker'].forEach(id => { const q = num('m_' + id); if (q) buys[id] = q; });
      dispatch({ type: 'buyMat', pid: actorOf(), buys });
    },
    doBuyEquip: () => {
      const P = st.s.players[actorOf()];
      const small = num('small');
      const free = P ? P.machines.filter(m => m.type === 'small' && !m.att).length + small : 0;
      dispatch({ type: 'buyEquip', pid: actorOf(), small, attach: Math.min(num('attach'), free), large: num('large') });
    },
    doProduce: () => dispatch({ type: 'produce', pid: actorOf(), complete: num('complete'), insert: num('insert') }),
    doHire: () => dispatch({ type: 'hire', pid: actorOf(), w: num('w'), s: num('s') }),
    doAd: () => dispatch({ type: 'ad', pid: actorOf(), n: num('n', 1) }),
    doRd: () => dispatch({ type: 'rd', pid: actorOf() }),
    doPass: () => dispatch({ type: 'pass', pid: actorOf() }),
    doSell: () => {
      const offers = MG.MARKETS.map(mk => ({ m: mk.id, q: num('q_' + mk.id) })).filter(o => o.q > 0);
      dispatch({ type: 'sell', pid: actorOf(), offers });
    },
    joinAuction: (v) => {
      const pd = st.s.pending;
      const joins = v === 'none' ? [] : pd.offers.map(o => ({ m: o.m, q: Math.min(num('jq_' + o.m), o.q) })).filter(j => j.q > 0);
      dispatch({ type: 'join', pid: actorOf(), joins });
    },
    setPrices: () => {
      const pd = st.s.pending, me = actorOf();
      const markets = me === pd.parent ? E.parentPriceMarkets(st.s) : (pd.joins[me] || []).map(j => j.m);
      if (dispatch({ type: 'price', pid: me, prices: markets.map(m => ({ m, p: num('pp_' + m, E.MK[m].cap) })) })) st.ui.revealed = null;
    },
    rebid: (v) => {
      const pd = st.s.pending, me = actorOf(), P = st.s.players[me];
      const prices = v === 'none' ? [] : Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(me))
        .map(([m, r]) => ({ m, p: num('rp_' + m, Math.max(1, Math.min(E.MK[m].cap, r.comp + MG.RULE.blueEdge * P.chips.blue - 1))) }));
      if (dispatch({ type: 'rebid', pid: me, prices })) st.ui.revealed = null;
    },
    doRisk: () => dispatch({ type: 'riskChoice', pid: actorOf(), qty: num('rq') }),
    nextPeriod: () => { st.modal = null; dispatch({ type: 'nextPeriod', pid: st.s.order[0] }); },
  };

  function onClick(e) {
    const el = e.target.closest('[data-a],[data-stop]');
    if (!el || (el.dataset.stop && !el.dataset.a)) return;
    if (el.classList.contains('modal-back') && e.target !== el) return;
    const fn = handlers[el.dataset.a];
    if (!fn || el.disabled) return;
    e.preventDefault();
    fn(el.dataset.v, el);
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.seat != null && st.setup) { const seat = st.setup.seats[+el.dataset.seat]; if (seat) seat[el.dataset.k] = el.value; return; }
    if (el.dataset.join && st.join) { st.join[el.dataset.join] = el.value; return; }
    // 数字を打つたびに金額などを更新する（入力中の欄は書き換えないので、打ち途中の数字は消えない）
    if (el.dataset.f) {
      const v = parseInt(el.value, 10);
      if (!isNaN(v)) { st.ui.f[el.dataset.f] = clampInput(el, v); st.ui.err = null; render(); }
    }
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset.cfg && st.setup) { st.setup.cfg[el.dataset.cfg] = +el.value; return; }
    if (el.dataset.seatAi != null && st.setup) {
      const seat = st.setup.seats[+el.dataset.seatAi];
      if (seat) seat.ai = MG.AI_TYPES.includes(el.value) ? el.value : '';
      return;
    }
    if (el.dataset.seat != null && st.view === 'host') { broadcastState(); return; }
    if (el.dataset.speed) {
      if (hasOwn(DELAY, el.value)) { st.speed = el.value; store.set(SPEED_KEY, el.value); render(); }
      return;
    }
    if (el.dataset.f) {
      st.ui.f[el.dataset.f] = clampInput(el, parseInt(el.value, 10));
      st.ui.err = null; render();
    }
  }

  function onKey(e) {
    if (st.card && st.card.kind === 'risk' && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); closeCard(); return; }
    if (e.key === 'Escape' && st.modal) { st.modal = null; renderModal(); return; }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f) { e.target.blur(); return; }
    if (e.key === 'Enter' && st.view === 'join' && e.target.dataset && e.target.dataset.join) { handlers.doJoin(); return; }
    // モーダルの中でフォーカスを回す
    if (e.key === 'Tab' && st.modal) {
      const dlg = document.querySelector('#modal-root .modal');
      if (!dlg) return;
      const items = [...dlg.querySelectorAll('button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    // タブを閉じるときは接続をきちんと切る（相手側がすぐに気づけるように）
    window.addEventListener('pagehide', (e) => { if (!e.persisted) closeNet(); });
    if (location.hash === '#rules') st.modal = { kind: 'rules' };
    if (location.hash === '#guide') st.modal = { kind: 'guide' };
    render();
    // オフラインでも遊べるように（http/https で開いたときだけ）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 使えない環境では何もしない */ });
    }
  }

  return { init, _st: st, _render: render };
})();

document.addEventListener('DOMContentLoaded', App.init);
