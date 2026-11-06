// コントローラー：画面遷移・入力・CPU進行・オンライン同期・保存
'use strict';

const App = (() => {
  const E = Engine;
  const SAVE_KEY = 'mgdigital-save';
  const CID_KEY = 'mgdigital-cid';
  const JOIN_KEY = 'mgdigital-join';
  const DELAY = { slow: 3000, normal: 1800, fast: 600 };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  const cid = (() => {
    let id = store.get(CID_KEY);
    if (!id) { id = 'c' + Math.random().toString(36).slice(2, 10); store.set(CID_KEY, id); }
    return id;
  })();

  const st = {
    view: 'title', mode: 'local', s: null, setup: null, join: null,
    ui: { choice: null, f: {}, err: null, revealed: null }, sig: '',
    viewPid: null, modal: null, card: null, cardTimer: null, cardQueue: [],
    speed: 'normal', net: null, code: '', connOk: false, connLabel: '',
    cpuTimer: null, lastCardKey: '', lastAuctionKey: '',
  };

  // ---------- 便利関数 ----------
  const $app = () => document.getElementById('app');
  function toast(msg, err) {
    const box = document.getElementById('toast');
    const el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  const localPids = () => {
    const s = st.s; if (!s) return [];
    return s.order.filter(id => st.mode === 'guest' ? s.players[id].owner === cid : s.players[id].ctrl === 'local');
  };
  const actorOf = () => {
    if (!st.s) return null;
    const mine = localPids();
    return E.waitingFor(st.s).find(id => mine.includes(id)) || null;
  };
  const humanLocalCount = () => st.s ? st.s.order.filter(id => st.s.players[id].ctrl === 'local').length : 0;
  const randomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

  // ---------- 描画 ----------
  function render() {
    const app = $app();
    let html = '';
    if (st.view === 'title') {
      const sv = store.get(SAVE_KEY);
      html = UI.title({ hasSave: !!(sv && sv.s), saveLabel: sv && sv.s ? `${sv.mode === 'host' ? 'オンライン（ホスト）' : 'この端末'}・第${sv.s.period}期・${new Date(sv.at).toLocaleString('ja-JP')}` : '' });
    } else if (st.view === 'setup') html = UI.setup({ setup: st.setup });
    else if (st.view === 'host') html = UI.hostLobby({ setup: st.setup, code: st.code, connLabel: connText() });
    else if (st.view === 'join') html = UI.join({ join: st.join });
    else if (st.view === 'game') {
      const actor = actorOf();
      const sig = [st.s.period, st.s.phase, st.s.step, st.s.cur, actor, st.s.pending ? st.s.pending.parent || st.s.pending.pid : '', st.s.pending ? st.s.pending.round || 1 : ''].join('|');
      if (sig !== st.sig) { st.sig = sig; st.ui = { choice: null, f: {}, err: null, revealed: st.ui.revealed }; }
      if (!st.viewPid || !st.s.players[st.viewPid]) st.viewPid = localPids()[0] || st.s.order[0];
      html = UI.game({
        s: st.s, mode: st.mode, actor, ui: st.ui, viewPid: st.viewPid, speed: st.speed,
        needCover: humanLocalCount() > 1, canAdvance: st.mode !== 'guest',
        connLabel: st.mode === 'local' ? '' : connText(), connOk: st.connOk,
      });
    }
    // 入力中の要素とスクロール位置を保つ
    const focusId = document.activeElement && document.activeElement.id;
    const oldLog = app.querySelector('.log');
    const logStick = !oldLog || oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight < 40;
    const logTop = oldLog ? oldLog.scrollTop : 0;
    app.innerHTML = html;
    const newLog = app.querySelector('.log');
    if (newLog) newLog.scrollTop = logStick ? newLog.scrollHeight : logTop;
    if (focusId) { const el = document.getElementById(focusId); if (el && el.tagName === 'INPUT' && el.type !== 'number') el.focus(); }
    renderModal();
  }
  function connText() {
    if (st.mode === 'local') return '';
    return (st.mode === 'host' ? `部屋 ${st.code}：` : '') + (st.connLabel || '接続準備中');
  }
  function renderModal() {
    const root = document.getElementById('modal-root');
    let html = '';
    if (st.modal) {
      if (st.modal.kind === 'books' && st.s) html = UI.books({ s: st.s, modal: st.modal, viewPid: st.viewPid });
      else if (st.modal.kind === 'rules') html = UI.rules();
      else if (st.modal.kind === 'auction' && st.s && st.s.lastAuction) html = UI.auctionModal(st.s, st.s.lastAuction);
      else if (st.modal.kind === 'menu') html = UI.modal(`<div class="modal-head"><h2>メニュー</h2><button class="btn small" data-a="closeModal">閉じる</button></div>
        ${st.mode === 'host' ? `<p>部屋コード <b class="room-code" style="font-size:28px">${UI.esc(st.code)}</b></p>
          ${st.s ? st.s.order.filter(id => st.s.players[id].ctrl === 'remote').map(id => `<div class="row"><span>${UI.esc(st.s.players[id].company)}（参加者）</span><button class="btn small" data-a="toCpu" data-v="${id}">CPUに交代</button></div>`).join('') : ''}
          ${st.s && st.s.order.some(id => st.s.players[id].ctrl === 'remote') ? '<p class="note">通信が切れて戻れない参加者がいるときは、その会社をCPUに任せて続けられます。</p>' : ''}` : ''}
        <div class="row"><button class="btn" data-a="books" data-v="rank">順位表</button><button class="btn" data-a="rules">ルール</button><button class="btn danger" data-a="home">タイトルへ戻る</button></div>
        <p class="note">${st.mode === 'guest' ? 'タイトルに戻っても、同じ部屋コードで参加し直せば続きから遊べます。' : 'ゲームはこの端末に自動保存されます。タイトルの「続きから」で再開できます。'}</p>`, true);
    }
    if (st.card && st.s) html += UI.cardPop(st.s, st.card, st.cardQueue.length);
    root.innerHTML = html;
  }

  // ---------- 状態変化の後処理 ----------
  function afterChange(fromNet) {
    const s = st.s;
    // カード演出
    if (s.lastCard) {
      const key = s.rev + ':' + s.lastCard.pid + ':' + s.lastCard.kind;
      const cardKey = JSON.stringify(s.lastCard) + s.period + ':' + s.turnsLeft;
      if (cardKey !== st.lastCardKey) {
        st.lastCardKey = cardKey;
        const P = s.players[s.lastCard.pid];
        const show = s.lastCard.kind === 'risk' || (P && localPids().includes(P.id));
        if (show && key) {
          const last = s.log[s.log.length - 1];
          showCard({ ...s.lastCard, detail: last && last.pid === s.lastCard.pid && s.lastCard.kind === 'risk' ? last.t : '' });
        }
      }
    }
    // 入札結果：自分（この端末の人間）が関わったら表示
    if (s.lastAuction) {
      const ak = s.period + ':' + s.lastAuction.at;
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
    const base = DELAY[st.speed] || 650;
    const delay = s.phase === 'turn' && s.step === 'pre' ? base * 0.6 : s.phase === 'auction' ? base * 0.6 : base;
    st.cpuTimer = setTimeout(() => {
      st.cpuTimer = null;
      if (!st.s || st.s !== s || st.view !== 'game' || riskShown()) return;
      if (!E.waitingFor(s).includes(pid)) return scheduleCpu();
      const a = AI.decide(s, pid);
      if (!a || E.act(s, a)) E.act(s, AI.fallback(s, pid));
      afterChange();
    }, delay);
  }

  function dispatch(action) {
    if (!st.s) return;
    if (st.mode === 'guest') {
      if (!st.net) return toast('ホストに接続されていません', true);
      st.net.send({ t: 'act', a: action });
      st.ui.pending = true;
      return;
    }
    const err = E.act(st.s, action);
    if (err) { st.ui.err = err; render(); return; }
    afterChange();
  }

  // ---------- オンライン：ホスト ----------
  function broadcastState(to) {
    if (!st.net) return;
    if (st.view === 'host') st.net.send({ t: 'lobby', seats: st.setup.seats.map(x => ({ company: x.company, ceo: x.ceo, ctrl: x.ctrl })), to });
    else if (st.s) st.net.send({ t: 'state', s: E.publicView(st.s), to });
  }

  function hostOnMsg(m) {
    if (!m || !m.from) return;
    if (m.t === 'hello') {
      if (st.view === 'host') {
        const seats = st.setup.seats;
        let seat = seats.find(x => x.owner === m.from);
        if (!seat) seat = seats.find(x => x.ctrl === 'open');
        if (!seat && seats.length < 6) { seat = {}; seats.push(seat); }
        if (!seat) { st.net.send({ t: 'err', to: m.from, msg: '満員です' }); return; }
        Object.assign(seat, { ctrl: 'remote', owner: m.from, company: String(m.company || '参加者の会社').slice(0, 14), ceo: String(m.ceo || '').slice(0, 10) });
        render();
        broadcastState();
        toast(`${seat.company}が参加しました`);
      } else if (st.s) {
        const known = st.s.order.some(id => st.s.players[id].owner === m.from);
        if (!known) { st.net.send({ t: 'err', to: m.from, msg: 'ゲームはすでに始まっています' }); return; }
        broadcastState(m.from);
      }
      return;
    }
    if (m.t === 'act' && st.s && m.a) {
      const P = st.s.players[m.a.pid];
      if (!P || P.owner !== m.from || m.a.type === 'nextPeriod') { st.net.send({ t: 'err', to: m.from, msg: 'その操作はできません' }); return; }
      const err = E.act(st.s, m.a);
      if (err) { st.net.send({ t: 'err', to: m.from, msg: err }); broadcastState(m.from); return; }
      afterChange();
    }
  }

  async function startNet(role, code, onMsg, hello) {
    if (st.net) { try { st.net.close(); } catch (e) { /* noop */ } st.net = null; }
    st.connOk = false; st.connLabel = '接続準備中';
    try {
      st.net = await Net.open(role, code, cid, {
        onMsg, hello,
        onStatus: (ok, label) => {
          st.connOk = ok; st.connLabel = label;
          if (role === 'host' && ok) broadcastState();
          if (role === 'guest' && st.join && st.view === 'join') {
            if (ok) { st.join.stage = 'waiting'; st.join.err = ''; } else st.join.err = label;
          }
          render();
        },
      });
    } catch (e) {
      st.connOk = false; st.connLabel = e.message;
      if (st.join) { st.join.stage = 'form'; st.join.err = e.message; }
      render();
    }
  }

  // ---------- オンライン：参加者 ----------
  function guestOnMsg(m) {
    if (m.t === 'lobby') {
      if (st.join) { st.join.lobby = m.seats; st.join.stage = 'waiting'; }
      if (st.view === 'game') { st.view = 'join'; st.s = null; }
      render();
    } else if (m.t === 'state') {
      const first = st.view !== 'game';
      st.s = m.s; st.mode = 'guest'; st.view = 'game';
      if (first) {
        const mine = st.s.order.find(id => st.s.players[id].owner === cid);
        st.viewPid = mine || st.s.order[0];
        st.lastCardKey = st.s.lastCard ? JSON.stringify(st.s.lastCard) + st.s.period + ':' + st.s.turnsLeft : '';
        st.lastAuctionKey = st.s.lastAuction ? st.s.period + ':' + st.s.lastAuction.at : '';
      }
      st.ui.pending = false;
      afterChange(true);
    } else if (m.t === 'err') {
      if (st.view === 'game') { st.ui.err = m.msg; st.ui.pending = false; render(); }
      else if (st.join) { st.join.err = m.msg; render(); }
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
    if (st.net) { try { st.net.close(); } catch (e) { /* noop */ } st.net = null; }
    clearTimeout(st.cpuTimer); st.cpuTimer = null;
    st.view = 'title'; st.s = null; st.modal = null; st.card = null; st.mode = 'local';
    render();
  }

  function newSetup(kind) {
    const seats = kind === 'cpu'
      ? [{ company: 'わが社', ceo: '', ctrl: 'local' }, { company: '北斗製作所', ctrl: 'cpu' }, { company: '青葉工業', ctrl: 'cpu' }, { company: '大和精機', ctrl: 'cpu' }]
      : [{ company: 'A社', ceo: '', ctrl: 'local' }, { company: 'B社', ceo: '', ctrl: 'local' }, { company: 'C社', ceo: '', ctrl: 'local' }, { company: 'D社', ceo: '', ctrl: 'local' }];
    return { kind, seats, cfg: { periods: 3, rounds: 10 } };
  }
  const CPU_NAMES = ['北斗製作所', '青葉工業', '大和精機', '浪速産業', '博多工作所', '名城機工'];

  function seatsForGame(seats) {
    return seats.map((x, i) => ({
      company: (x.company || '').trim() || `${i + 1}番目の会社`, ceo: (x.ceo || '').trim(), ctrl: x.ctrl, owner: x.owner || null,
    }));
  }

  // ---------- イベント ----------
  const handlers = {
    home: () => goTitle(),
    goSetup: (v) => { st.setup = newSetup(v); st.view = 'setup'; render(); },
    goHost: () => {
      st.mode = 'host'; st.code = randomCode();
      st.setup = { kind: 'host', seats: [{ company: 'わが社', ceo: '', ctrl: 'local' }, { company: '（募集中）', ctrl: 'open' }, { company: '（募集中）', ctrl: 'open' }, { company: CPU_NAMES[0], ctrl: 'cpu' }], cfg: { periods: 3, rounds: 10 } };
      st.view = 'host'; render();
      startNet('host', st.code, hostOnMsg);
    },
    goJoin: () => {
      const last = store.get(JOIN_KEY) || {};
      st.join = { stage: 'form', code: last.code || '', company: last.company || '', ceo: last.ceo || '', err: '' };
      st.view = 'join'; render();
    },
    doJoin: () => {
      const j = st.join;
      j.code = (j.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,6}$/.test(j.code)) { j.err = '部屋コードは4文字です'; return render(); }
      if (!j.company.trim()) { j.err = '社名を入力してください'; return render(); }
      store.set(JOIN_KEY, { code: j.code, company: j.company, ceo: j.ceo });
      j.stage = 'connecting'; j.err = ''; st.mode = 'guest'; render();
      startNet('guest', j.code, guestOnMsg, { company: j.company, ceo: j.ceo });
    },
    resume: () => {
      const sv = store.get(SAVE_KEY);
      if (!sv || !sv.s) return;
      st.s = sv.s; st.mode = sv.mode === 'host' ? 'host' : 'local'; st.code = sv.code || '';
      st.view = 'game'; st.viewPid = null; st.lastCardKey = JSON.stringify(st.s.lastCard) + st.s.period + ':' + st.s.turnsLeft;
      st.lastAuctionKey = st.s.lastAuction ? st.s.period + ':' + st.s.lastAuction.at : '';
      if (st.mode === 'host') startNet('host', st.code, hostOnMsg);
      afterChange();
    },
    rules: () => { st.modal = { kind: 'rules' }; renderModal(); },
    menu: () => { st.modal = { kind: 'menu' }; renderModal(); },
    closeModal: () => { st.modal = null; renderModal(); },
    closeCard: () => closeCard(),
    showAuction: () => { st.modal = { kind: 'auction' }; renderModal(); },
    books: (v) => { st.modal = { kind: 'books', tab: v, pid: (st.modal && st.modal.pid) || st.viewPid }; renderModal(); },
    booksPid: (v) => { st.modal.pid = v; renderModal(); },
    booksPeriod: (v) => { st.modal.period = +v; renderModal(); },
    view: (v) => { st.viewPid = v; render(); },
    toCpu: (v) => {
      const P = st.s && st.s.players[v];
      if (!P || st.mode !== 'host') return;
      P.ctrl = 'cpu'; P.owner = null;
      st.modal = null;
      toast(`${P.company}をCPUに交代しました`);
      afterChange();
    },

    seatType: (v, el) => { st.setup.seats[+el.dataset.i].ctrl = v; if (v === 'open') st.setup.seats[+el.dataset.i].company = '（募集中）'; else if (v === 'cpu' && /募集中/.test(st.setup.seats[+el.dataset.i].company)) st.setup.seats[+el.dataset.i].company = CPU_NAMES[+el.dataset.i % 6]; render(); },
    seatDel: (v, el) => { st.setup.seats.splice(+el.dataset.i, 1); render(); if (st.view === 'host') broadcastState(); },
    seatAdd: () => {
      const i = st.setup.seats.length;
      st.setup.seats.push(st.setup.kind === 'hotseat' ? { company: String.fromCharCode(65 + i) + '社', ceo: '', ctrl: 'local' } : st.setup.kind === 'host' ? { company: '（募集中）', ctrl: 'open' } : { company: CPU_NAMES[i % 6], ctrl: 'cpu' });
      render(); if (st.view === 'host') broadcastState();
    },
    startLocal: () => {
      const seats = seatsForGame(st.setup.seats);
      st.s = E.newGame(st.setup.cfg, seats);
      st.mode = 'local'; st.view = 'game'; st.viewPid = null; st.sig = ''; st.lastCardKey = ''; st.lastAuctionKey = '';
      afterChange();
    },
    startHost: () => {
      const seats = seatsForGame(st.setup.seats.filter(x => x.ctrl !== 'open'));
      if (seats.length < 2) return toast('2社以上で開始できます', true);
      st.s = E.newGame(st.setup.cfg, seats);
      st.view = 'game'; st.viewPid = null; st.sig = ''; st.lastCardKey = ''; st.lastAuctionKey = '';
      afterChange();
    },

    // ゲーム中
    reveal: (v) => { st.ui.revealed = v; render(); },
    choose: (v) => { st.ui.choice = st.ui.choice === v && v.startsWith('B:') ? null : v; st.ui.f = {}; st.ui.err = null; render(); },
    step: (v, el) => {
      const key = el.dataset.k, input = document.getElementById('f-' + key);
      const cur = input ? parseInt(input.value, 10) || 0 : 0;
      st.ui.f[key] = clampInput(el, cur + (+el.dataset.d) * (+el.dataset.step || 1));
      st.ui.err = null; render();
    },
    draw: () => dispatch({ type: 'draw', pid: actorOf() }),
    chip: (v) => dispatch({ type: 'chip', pid: actorOf(), chip: v }),
    doTransfer: () => {
      const pid = actorOf(), a = num('w2s'), b = num('s2w');
      if (a) dispatch({ type: 'transfer', pid, dir: 'w2s', n: a });
      if (b) dispatch({ type: 'transfer', pid, dir: 's2w', n: b });
      st.ui.f = {};
    },
    sellMachine: (v, el) => dispatch({ type: 'sellMachine', pid: actorOf(), mid: v, part: el.dataset.part || 'machine' }),
    doBorrow: () => { dispatch({ type: 'borrow', pid: actorOf(), amt: num('borrow') }); st.ui.f = {}; },
    doRepay: () => { dispatch({ type: 'repay', pid: actorOf(), amt: num('repay') }); st.ui.f = {}; },
    doBuyMat: () => {
      const buys = {};
      [...MG.MARKETS.map(m => m.id), 'stocker'].forEach(id => { const q = num('m_' + id); if (q) buys[id] = q; });
      dispatch({ type: 'buyMat', pid: actorOf(), buys });
    },
    doBuyEquip: () => dispatch({ type: 'buyEquip', pid: actorOf(), small: num('small'), attach: num('attach'), large: num('large') }),
    doProduce: () => dispatch({ type: 'produce', pid: actorOf(), complete: num('complete'), insert: num('insert') }),
    doHire: () => dispatch({ type: 'hire', pid: actorOf(), w: num('w'), s: num('s') }),
    doAd: () => dispatch({ type: 'ad', pid: actorOf(), n: num('n', 1) }),
    doRd: () => dispatch({ type: 'rd', pid: actorOf() }),
    doPass: () => dispatch({ type: 'pass', pid: actorOf() }),
    doSell: () => {
      const offers = MG.MARKETS.map(mk => ({ m: mk.id, q: num('q_' + mk.id), p: num('p_' + mk.id, mk.cap) })).filter(o => o.q > 0);
      dispatch({ type: 'sell', pid: actorOf(), offers });
    },
    doBid: (v) => {
      const pd = st.s.pending, me = actorOf();
      if (pd.round === 2) {
        const bids = v === 'none' ? [] : Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(me))
          .map(([m, r]) => ({ m, p: num('rp_' + m, Math.max(1, r.comp + 2 * st.s.players[me].chips.blue - 1)) }));
        dispatch({ type: 'bid', pid: me, bids });
        st.ui.revealed = null;
        return;
      }
      const bids = v === 'none' ? [] : pd.offers.map(o => ({ m: o.m, q: num('bq_' + o.m), p: num('bp_' + o.m, Engine.MK[o.m].cap) })).filter(b => b.q > 0);
      dispatch({ type: 'bid', pid: actorOf(), bids });
      st.ui.revealed = null;
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
    if (el.dataset.seat != null && st.setup) { st.setup.seats[+el.dataset.seat][el.dataset.k] = el.value; return; }
    if (el.dataset.join && st.join) { st.join[el.dataset.join] = el.value; }
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset.cfg && st.setup) { st.setup.cfg[el.dataset.cfg] = +el.value; return; }
    if (el.dataset.seat != null && st.view === 'host') { broadcastState(); return; }
    if (el.dataset.speed) { st.speed = el.value; return; }
    if (el.dataset.f) {
      st.ui.f[el.dataset.f] = clampInput(el, parseInt(el.value, 10));
      st.ui.err = null; render();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && st.card) { closeCard(); return; }
    if (e.key === 'Escape' && st.modal) { st.modal = null; renderModal(); }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f) e.target.blur();
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    if (location.hash === '#rules') st.modal = { kind: 'rules' };
    render();
  }

  return { init, _st: st, _render: render };
})();

document.addEventListener('DOMContentLoaded', App.init);
