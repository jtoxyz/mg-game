// オンライン対戦の通信（PeerJS / WebRTC）。ホスト1台がゲームを進め、参加者は操作を送って状態を受け取る。
// PeerJS は js/vendor に同梱（MITライセンス）。相手探しには PeerJS が無料公開しているサーバーを使う。
'use strict';

const Net = (() => {
  const PREFIX = 'mgdigital-jr-';
  const PEERJS = 'js/vendor/peerjs.min.js';
  const CID_RE = /^[\w-]{6,64}$/;

  let loading = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    if (!loading) {
      loading = new Promise((res, rej) => {
        const el = document.createElement('script');
        el.src = PEERJS;
        el.onload = res;
        el.onerror = () => { loading = null; rej(new Error('通信ライブラリを読み込めませんでした（ページを読み込み直してください）')); };
        document.head.appendChild(el);
      });
    }
    return loading;
  }

  function errLabel(e) {
    const map = {
      network: '通信サーバーに接続できません（インターネット接続を確認してください）',
      'server-error': '通信サーバーが応答しません。少し待ってから試してください',
      'socket-error': '通信サーバーとの接続でエラーが起きました',
      'socket-closed': '通信サーバーとの接続が切れました',
      'browser-incompatible': 'このブラウザはオンライン対戦に対応していません',
      webrtc: 'ブラウザ同士の接続に失敗しました（ネットワークで止められている可能性があります）',
    };
    return map[e && e.type] || '通信エラー：' + (e && e.type);
  }

  // ---------- ホスト ----------
  // h = { onMsg(msg), onStatus(ok, label, code), onPeer(cid, online) }
  // 参加者は最初の hello で名乗った端末IDに接続ごとに固定し、以降のメッセージの送り主はそのIDとして扱う
  async function host(code, h) {
    await loadPeer();
    let closed = false;
    const conns = new Set();
    const peer = new window.Peer(PREFIX + code, { debug: 0 });
    const onlineCids = () => new Set([...conns].filter(c => c.open && c.cid).map(c => c.cid));
    peer.on('open', () => h.onStatus(true, '部屋を公開中'));
    peer.on('disconnected', () => {
      if (closed) return;
      h.onStatus(false, '再接続しています');
      setTimeout(() => { if (!closed && !peer.destroyed) peer.reconnect(); }, 1500);
    });
    peer.on('error', (e) => {
      if (closed) return;
      if (e.type === 'unavailable-id') h.onStatus(false, 'この部屋コードは使用中です。少し待ってから開き直すか、別の部屋を作ってください', 'taken');
      else if (e.type !== 'peer-unavailable') h.onStatus(false, errLabel(e));
    });
    peer.on('connection', (conn) => {
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return;
        if (d.t === 'hello') {
          if (typeof d.from !== 'string' || !CID_RE.test(d.from)) return;
          if (conn.cid && conn.cid !== d.from) return;   // 1つの接続で別の人にはなれない
          const wasOnline = onlineCids().has(d.from);
          conn.cid = d.from;
          conns.add(conn);
          if (!wasOnline && h.onPeer) h.onPeer(conn.cid, true);
        }
        if (!conn.cid) return;
        h.onMsg({ ...d, from: conn.cid });
      });
      const drop = () => {
        if (!conns.delete(conn) || !conn.cid || closed) return;
        if (!onlineCids().has(conn.cid) && h.onPeer) h.onPeer(conn.cid, false);
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    // to：端末ID（1人）または端末IDの配列。省略すると接続中の全員
    const send = (msg, to) => {
      const list = to == null ? null : Array.isArray(to) ? to : [to];
      const m = { ...msg, from: 'host' };
      conns.forEach(c => { if (c.open && (!list || list.includes(c.cid))) { try { c.send(m); } catch (e) { /* 送れない接続は close で外れる */ } } });
    };
    return { send, online: () => [...onlineCids()], close: () => { closed = true; peer.destroy(); } };
  }

  // ---------- 参加者 ----------
  // h = { onMsg(msg), onStatus(ok, label), hello: { company, ceo } }
  async function guest(code, cid, h) {
    await loadPeer();
    let closed = false, conn = null, retry = null;
    const peer = new window.Peer({ debug: 0 });
    const schedule = (ms) => { clearTimeout(retry); retry = setTimeout(connect, ms); };
    function connect() {
      if (closed || peer.destroyed) return;
      if (conn) { try { conn.close(); } catch (e) { /* noop */ } }
      const c = conn = peer.connect(PREFIX + code, { reliable: true });
      c.on('open', () => {
        if (c !== conn) return;
        h.onStatus(true, '接続中');
        c.send({ t: 'hello', ...(h.hello || {}), from: cid });
      });
      c.on('data', (d) => { if (c === conn && d && typeof d === 'object') h.onMsg(d); });
      c.on('close', () => { if (c !== conn || closed) return; h.onStatus(false, '再接続しています'); schedule(2000); });
      c.on('error', () => { if (c !== conn || closed) return; schedule(3000); });
    }
    peer.on('open', connect);
    peer.on('disconnected', () => { if (!closed) setTimeout(() => { if (!closed && !peer.destroyed) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      if (closed) return;
      if (e.type === 'peer-unavailable') { h.onStatus(false, '部屋が見つかりません。コードを確認するか、ホストが部屋を開くまで待ってください'); schedule(4000); }
      else h.onStatus(false, errLabel(e));
    });
    const send = (msg) => {
      if (!conn || !conn.open) return false;
      conn.send({ ...msg, from: cid });
      return true;
    };
    return { send, close: () => { closed = true; clearTimeout(retry); peer.destroy(); } };
  }

  return { host, guest };
})();
