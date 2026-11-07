// エンジンとCPUのテスト。実行：node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

global.MG = require('../js/data.js');
global.Engine = require('../js/engine.js');
const AI = require('../js/ai.js');
const E = Engine;

function newGame(n = 3, cfg = { periods: 1, rounds: 10 }) {
  return E.newGame(cfg, Array.from({ length: n }, (_, i) => ({ company: 'C' + i, ctrl: 'local', owner: 'cid' + i })));
}
// pid の手番で意思決定（ルールA）の段階にする
function toDecide(s, pid) { s.cur = s.order.indexOf(pid); s.phase = 'turn'; s.step = 'decide'; }
function stock(P, prod, salesmen = 3) { P.prod = prod; P.salesmen = salesmen; }
function openMarket(s, mid, room) { s.markets.find(m => m.id === mid).mats = E.MK[mid].vol - room; }
function ok(s, a) { const e = E.act(s, a); assert.equal(e, null, `${a.type}: ${e}`); }
const priceOf = (s, pid, m) => s.lastAuction.results.find(r => r.m === m).entries.find(e => e.pid === pid);

function playOut(s) {
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 100000) {
    if (s.phase === 'periodEnd') { ok(s, { type: 'nextPeriod', pid: s.order[0] }); continue; }
    const pid = E.waitingFor(s)[0];
    const a = AI.decide(s, pid);
    if (!a || E.act(s, a)) assert.equal(E.act(s, AI.fallback(s, pid)), null);
  }
  return s;
}

test('CPU同士で最後まで遊べて、毎期の貸借対照表が一致する', () => {
  for (let g = 0; g < 60; g++) {
    const n = 2 + (g % 5);
    const s = E.newGame({ periods: 3, rounds: [6, 10, 15][g % 3] }, Array.from({ length: n }, (_, i) => ({ company: 'C' + i, ctrl: 'cpu' })));
    playOut(s);
    assert.equal(s.phase, 'over');
    for (const id of s.order) {
      const P = s.players[id];
      assert.equal(P.history.length, 3);
      for (const h of P.history) assert.equal(h.bs.diff, 0, `B/S 不一致 ${JSON.stringify(h.bs)}`);
      assert.ok(P.mat >= 0 && P.wip >= 0 && P.prod >= 0);
    }
    for (const m of s.markets) assert.ok(m.mats >= 0 && m.mats <= E.MK[m.id].vol);
  }
});

test('販売は「参加と個数」→「価格」の順に進み、参加は公開・価格は非公開', () => {
  const s = newGame(3);
  const [a, b, c] = s.order;
  toDecide(s, a);
  stock(s.players[a], 4); stock(s.players[b], 4); stock(s.players[c], 4);
  openMarket(s, 'tokyo', 4);
  ok(s, { type: 'sell', pid: a, offers: [{ m: 'tokyo', q: 3 }] });
  assert.equal(s.phase, 'auction');
  assert.equal(s.pending.stage, 'join');
  assert.deepEqual(s.pending.waiting, [b, c]);
  // 価格はまだ出せない
  assert.match(E.act(s, { type: 'price', pid: a, prices: [{ m: 'tokyo', p: 30 }] }), /段階ではありません/);
  // 親が出した個数を超えて参加はできない
  assert.match(E.act(s, { type: 'join', pid: b, joins: [{ m: 'tokyo', q: 4 }] }), /最大3個/);
  ok(s, { type: 'join', pid: b, joins: [{ m: 'tokyo', q: 2 }] });
  ok(s, { type: 'join', pid: c, joins: [] });
  assert.equal(s.pending.stage, 'price');
  assert.deepEqual(s.pending.waiting, [a, b]);
  // 参加の内容は全員に見える
  const sum = E.auctionSummary(s)[0];
  assert.deepEqual(sum.kids, [{ pid: b, q: 2 }]);
  assert.equal(sum.total, 5);
  assert.equal(sum.allSell, false);
  ok(s, { type: 'price', pid: b, prices: [{ m: 'tokyo', p: 25 }] });
  // 配信用の状態では価格と端末IDが隠れている
  const pub = E.publicView(s);
  assert.equal(pub.pending.prices[b], 'sealed');
  assert.equal(pub.players[a].owner, undefined);
  assert.equal(s.players[a].owner, 'cid0');
  ok(s, { type: 'price', pid: a, prices: [{ m: 'tokyo', p: 30 }] });
  // 競争価格：親 30-2=28、子 25 → 子が先に2個、親は残り2個
  assert.equal(s.phase, 'turn');
  assert.equal(priceOf(s, b, 'tokyo').sold, 2);
  assert.equal(priceOf(s, a, 'tokyo').sold, 2);
  assert.equal(priceOf(s, a, 'tokyo').price, 30);
});

test('参加者がいなければ、親は上限価格でそのまま売れる', () => {
  const s = newGame(2);
  const [a] = s.order;
  toDecide(s, a);
  stock(s.players[a], 3);
  openMarket(s, 'sapporo', 3);
  ok(s, { type: 'sell', pid: a, offers: [{ m: 'sapporo', q: 3 }] });
  assert.equal(s.phase, 'turn');
  assert.equal(priceOf(s, a, 'sapporo').price, E.MK.sapporo.cap);
  assert.equal(s.players[a].prod, 0);
});

test('親が価格を決めるのは子が参加したマーケットだけ', () => {
  const s = newGame(2);
  const [a, b] = s.order;
  toDecide(s, a);
  stock(s.players[a], 6); stock(s.players[b], 2);
  openMarket(s, 'sapporo', 3); openMarket(s, 'tokyo', 3);
  ok(s, { type: 'sell', pid: a, offers: [{ m: 'sapporo', q: 3 }, { m: 'tokyo', q: 3 }] });
  ok(s, { type: 'join', pid: b, joins: [{ m: 'tokyo', q: 2 }] });
  assert.deepEqual(E.parentPriceMarkets(s), ['tokyo']);
  assert.match(E.act(s, { type: 'price', pid: a, prices: [{ m: 'sapporo', p: 30 }, { m: 'tokyo', p: 30 }] }), /対象ではない/);
  ok(s, { type: 'price', pid: a, prices: [{ m: 'tokyo', p: 30 }] });
  ok(s, { type: 'price', pid: b, prices: [{ m: 'tokyo', p: 32 }] });
  assert.equal(priceOf(s, a, 'sapporo').price, E.MK.sapporo.cap);
});

test('全員同じ競争価格なら親の負け。空きが足りなければ子だけで再入札', () => {
  const s = newGame(3);
  const [a, b, c] = s.order;
  toDecide(s, a);
  stock(s.players[a], 2); stock(s.players[b], 2); stock(s.players[c], 2);
  openMarket(s, 'tokyo', 3);
  ok(s, { type: 'sell', pid: a, offers: [{ m: 'tokyo', q: 2 }] });
  ok(s, { type: 'join', pid: b, joins: [{ m: 'tokyo', q: 2 }] });
  ok(s, { type: 'join', pid: c, joins: [{ m: 'tokyo', q: 2 }] });
  ok(s, { type: 'price', pid: a, prices: [{ m: 'tokyo', p: 30 }] });   // 競争価格 28
  ok(s, { type: 'price', pid: b, prices: [{ m: 'tokyo', p: 28 }] });
  ok(s, { type: 'price', pid: c, prices: [{ m: 'tokyo', p: 28 }] });
  assert.equal(s.pending.stage, 'rebid');
  assert.deepEqual(s.pending.waiting, [b, c]);
  ok(s, { type: 'rebid', pid: b, prices: [{ m: 'tokyo', p: 26 }] });
  ok(s, { type: 'rebid', pid: c, prices: [] });                       // 辞退
  const r = s.lastAuction.results[0];
  assert.equal(r.same, true);
  assert.equal(priceOf(s, b, 'tokyo').sold, 2);
  assert.equal(priceOf(s, c, 'tokyo').withdrew, true);
  assert.equal(priceOf(s, a, 'tokyo').sold, 1);   // 親は子の後ろで残り1個
});

test('不正な入力は例外にならずエラーメッセージを返す', () => {
  const s = newGame(2);
  const [a] = s.order;
  toDecide(s, a);
  stock(s.players[a], 2);
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(typeof E.act(s, { type: 'buyMat', pid: a, buys: JSON.parse(`{"${bad}": 1}`) }), 'string');
    assert.equal(typeof E.act(s, { type: 'sell', pid: a, offers: [{ m: bad, q: 1 }] }), 'string');
  }
  assert.equal(typeof E.act(s, { type: 'sell', pid: a, offers: [null, 5] }), 'string');
  assert.equal(E.act(s, { type: 'buyMat', pid: '__proto__' }), 'プレイヤーが見つかりません');
  assert.equal(E.act(s, null), '不明なアクションです');
  s.step = 'pre';
  assert.equal(E.act(s, { type: 'chip', pid: a, chip: 'toString' }), '不明なチップです');
  assert.match(E.act(s, { type: 'transfer', pid: a, dir: 'x', n: 1 }), /向き/);
});

test('カードを引くたびに番号が増え、リスクカードには結果が付く', () => {
  const s = newGame(2);
  const real = Math.random;
  try {
    Math.random = () => 0.99;   // 意思決定カード
    ok(s, { type: 'draw', pid: E.curPid(s) });
    assert.equal(s.lastCard.kind, 'decision');
    const n1 = s.lastCard.n;
    ok(s, { type: 'pass', pid: E.curPid(s) });
    assert.equal(s.lastCard.n, n1);   // 行動しても同じカードのまま
    Math.random = () => 0;      // リスクカード（先頭：ワーカー退職）
    ok(s, { type: 'draw', pid: E.curPid(s) });
    assert.equal(s.lastCard.n, n1 + 1);
    assert.equal(s.lastCard.kind, 'risk');
    assert.match(s.lastCard.detail, /ワーカー退職/);
  } finally { Math.random = real; }
});

test('研究開発の失敗は青チップがなければ「影響なし」と記録する', () => {
  const s = newGame(2);
  const real = Math.random;
  const idx = MG.RISK_CARDS.findIndex(c => c.id === 'rdFail');
  const total = MG.RISK_CARDS.reduce((a, c) => a + c.weight, 0);
  const before = MG.RISK_CARDS.slice(0, idx).reduce((a, c) => a + c.weight, 0);
  let calls = 0;
  try {
    Math.random = () => (calls++ === 0 ? 0 : (before + 0.5) / total);
    ok(s, { type: 'draw', pid: E.curPid(s) });
    assert.equal(s.lastCard.id, 'rdFail');
    assert.match(s.lastCard.detail, /影響なし/);
  } finally { Math.random = real; }
});

test('ワーカーは能力の大きい機械に配置される', () => {
  const s = newGame(2);
  const P = s.players[s.order[0]];
  P.machines = [{ id: 'm1', type: 'small', att: false, bv: 100, attBv: 0 }, { id: 'm2', type: 'large', att: false, bv: 200, attBv: 0 }];
  P.workers = 1;
  assert.deepEqual(E.staffedMachines(P), ['m2']);
  assert.equal(E.prodCap(P), MG.RULE.capLarge);
});

test('古い版（v1）のセーブを移行できる。入札の途中は移行しない', () => {
  const s = newGame(2);
  const v1 = JSON.parse(JSON.stringify(s));
  v1.v = 1; delete v1.cardSeq; delete v1.auctionSeq;
  v1.lastCard = { pid: v1.order[0], kind: 'decision' };
  const m = E.migrate(v1);
  assert.equal(m.v, E.VERSION);
  assert.equal(m.lastCard.n, 0);
  const v1a = JSON.parse(JSON.stringify(s));
  v1a.v = 1; v1a.phase = 'auction';
  assert.equal(E.migrate(v1a), null);
  assert.equal(E.migrate({ v: 99, players: {}, order: [] }), null);
  assert.equal(E.migrate(null), null);
});
