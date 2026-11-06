// オンライン対戦の通信。ホスト1台がゲームを進め、参加者はアクションを送って状態を受け取る。
// 既定は PeerJS（WebRTC・サーバー設定不要）。config.js に Supabase を設定するとそちらを使う。
'use strict';

const Net = (() => {
  const PREFIX = 'mgdigital-jr-';
  const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const el = document.createElement('script');
        el.src = src; el.onload = res; el.onerror = () => rej(new Error('通信ライブラリを読み込めませんでした（インターネット接続を確認してください）'));
        document.head.appendChild(el);
      });
    }
    return loaded[src];
  }
  const cfg = () => (typeof NET_CONFIG !== 'undefined' ? NET_CONFIG : {});
  const useSupabase = () => !!(cfg().supabaseUrl && cfg().supabaseKey);

  // h = { onMsg(msg), onStatus(ok, label) }
  async function open(role, code, cid, h) {
    return useSupabase() ? openSupabase(role, code, cid, h) : openPeer(role, code, cid, h);
  }

  // ---------- Supabase Realtime（Broadcast） ----------
  async function openSupabase(role, code, cid, h) {
    await loadScript(SUPABASE);
    const client = window.supabase.createClient(cfg().supabaseUrl, cfg().supabaseKey);
    const ch = client.channel('mg-' + code, { config: { broadcast: { self: false } } });
    const me = role === 'host' ? 'host' : cid;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (!payload) return;
      if (role === 'host' && payload.from !== 'host') h.onMsg(payload);
      if (role === 'guest' && payload.from === 'host' && (!payload.to || payload.to === cid)) h.onMsg(payload);
    });
    ch.subscribe((st) => {
      if (st === 'SUBSCRIBED') { h.onStatus(true, '接続中'); if (role === 'guest') send({ t: 'hello', ...(h.hello || {}) }); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') h.onStatus(false, '再接続しています');
    });
    function send(msg) { ch.send({ type: 'broadcast', event: 'm', payload: { ...msg, from: me } }); }
    return { send, close: () => { client.removeChannel(ch); } };
  }

  // ---------- PeerJS（WebRTC） ----------
  async function openPeer(role, code, cid, h) {
    await loadScript(PEERJS);
    let closed = false;
    if (role === 'host') {
      const conns = new Set();
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => h.onStatus(true, '部屋を公開中'));
      peer.on('disconnected', () => { if (!closed) { h.onStatus(false, '再接続しています'); setTimeout(() => !closed && peer.reconnect(), 1500); } });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id') h.onStatus(false, 'この部屋コードは使用中です。別のコードで作り直してください');
        else if (e.type !== 'peer-unavailable') h.onStatus(false, '通信エラー：' + e.type);
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => conns.add(conn));
        conn.on('data', (d) => { if (d && typeof d === 'object') h.onMsg(d); });
        conn.on('close', () => conns.delete(conn));
        conn.on('error', () => conns.delete(conn));
      });
      const send = (msg) => { const m = { ...msg, from: 'host' }; conns.forEach(c => { if (c.open) c.send(m); }); };
      return { send, close: () => { closed = true; peer.destroy(); } };
    }
    // guest
    const peer = new window.Peer({ debug: 0 });
    let conn = null, retry = null;
    const connect = () => {
      if (closed) return;
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => { h.onStatus(true, '接続中'); conn.send({ t: 'hello', ...(h.hello || {}), from: cid }); });
      conn.on('data', (d) => { if (d && (!d.to || d.to === cid)) h.onMsg(d); });
      conn.on('close', () => { h.onStatus(false, '再接続しています'); clearTimeout(retry); retry = setTimeout(connect, 2000); });
    };
    peer.on('open', connect);
    peer.on('disconnected', () => { if (!closed) setTimeout(() => !closed && peer.reconnect(), 1500); });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { h.onStatus(false, '部屋が見つかりません。コードを確認するか、ホストが部屋を開くまで待ってください'); clearTimeout(retry); retry = setTimeout(connect, 4000); }
      else h.onStatus(false, '通信エラー：' + e.type);
    });
    const send = (msg) => { if (conn && conn.open) conn.send({ ...msg, from: cid }); };
    return { send, close: () => { closed = true; clearTimeout(retry); peer.destroy(); } };
  }

  return { open, useSupabase };
})();
