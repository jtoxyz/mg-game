// CPU 社長の思考ルーチン。状態を読んで次のアクションを1つ返す。
'use strict';

const AI = (() => {
  const E = (typeof Engine !== 'undefined') ? Engine : require('./engine.js');
  const D = (typeof MG !== 'undefined') ? MG : require('./data.js');
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const MIN_PRICE = 18;

  const reserve = (s, P) => E.estEndCost(s, P) + 10;
  const myTurnsLeft = (s) => Math.ceil(s.turnsLeft / s.order.length);
  const borrowedThisPeriod = (P) => P.ledger.some(l => l.d === '銀行借入');

  function decide(s, pid) {
    const P = s.players[pid];
    if (s.phase === 'auction') return bid(s, P);
    if (s.phase === 'risk') return riskChoice(s, P);
    if (s.phase !== 'turn') return null;
    return s.step === 'pre' ? pre(s, P) : main(s, P);
  }

  // ルールB（カードを引く前）
  function pre(s, P) {
    const res = reserve(s, P), free = P.cash - res, turns = myTurnsLeft(s);
    const want = (P.ai === '積極' ? 300 : P.ai === 'バランス' ? 250 : 150) + (E.prodCap(P) < 4 ? 100 : 0);
    if (s.period >= 2 && !borrowedThisPeriod(P) && E.borrowRoom(P) >= 10 && free < want && turns >= 3) {
      const amt = Math.floor(Math.min(E.borrowRoom(P), want - free + 50) / 10) * 10;
      if (amt >= 10) return { type: 'borrow', amt };
    }
    if (P.machines.length && P.workers && !P.chips.pac && free > 40 && turns >= 3) return { type: 'chip', chip: 'pac' };
    if (P.salesmen && !P.chips.mr && free > 60 && turns >= 3 && P.ai !== '堅実') return { type: 'chip', chip: 'mr' };
    if (!P.chips.md && free > 80 && turns >= 5 && E.prodCap(P) >= 3) return { type: 'chip', chip: 'md' };
    if (!P.chips.yellow && (P.mat >= 4 || P.prod >= 3) && free > 10) return { type: 'chip', chip: 'yellow' };
    return { type: 'draw' };
  }

  function sellPlan(s, P) {
    let qty = Math.min(P.prod, E.salesCap(P));
    if (!qty) return null;
    const ms = D.MARKETS.map(m => ({ m, e: E.empty(s, m.id) }))
      .filter(x => x.e > 0 && x.m.cap >= MIN_PRICE)
      .sort((a, b) => b.m.cap - a.m.cap);
    const offers = [];
    const cut = P.ai === '積極' ? 6 : P.ai === 'バランス' ? 4 : 2;
    for (const x of ms) {
      if (!qty) break;
      const q = Math.min(qty, x.e);
      offers.push({ m: x.m.id, q, p: Math.max(MIN_PRICE, x.m.cap - rnd(0, cut)) });
      qty -= q;
    }
    return offers.length ? offers : null;
  }

  function buyPlan(s, P, budget, want) {
    const disc = P.chips.md ? 2 : 0;
    const buys = {};
    let n = 0;
    const src = D.MARKETS.map(m => ({ id: m.id, price: m.mat - disc, left: s.markets.find(x => x.id === m.id).mats }))
      .sort((a, b) => a.price - b.price);
    src.push({ id: 'stocker', price: D.STOCKER_PRICE - disc, left: 99 });
    for (const x of src) {
      while (n < want && x.left > 0 && budget >= x.price) {
        buys[x.id] = (buys[x.id] || 0) + 1; x.left--; n++; budget -= x.price;
      }
    }
    return n ? buys : null;
  }

  // ルールA（意思決定）
  function main(s, P) {
    const res = reserve(s, P), free = P.cash - res, turns = myTurnsLeft(s);
    const pc = E.prodCap(P), sc = E.salesCap(P);

    if (!P.machines.length) {
      if (P.ai === '積極' && P.cash >= 290) return { type: 'buyEquip', large: 1 };
      if (P.cash >= 160) return { type: 'buyEquip', small: 1, attach: 1 };
      if (P.cash >= 100) return { type: 'buyEquip', small: 1 };
      return { type: 'pass' };
    }

    const needW = Math.max(0, P.machines.length - P.workers);
    const wantS = Math.max(1, Math.ceil(pc / 4));
    const needS = Math.max(0, wantS - P.salesmen);
    if ((needW || needS) && P.cash >= (needW + needS) * 5) return { type: 'hire', w: needW, s: needS };

    const offers = sellPlan(s, P);
    const pipelineEmpty = P.mat === 0 && P.wip === 0;
    // 空き枠は他社と取り合いなので、売れるときに売る
    const best = offers ? Math.max(...offers.map(o => o.p)) : 0;
    if (offers && (best >= 26 || P.prod >= Math.min(sc, 4) || turns <= 2 || pipelineEmpty)) return { type: 'sell', offers };

    // 2期目以降、生産能力が小さければ大型機械で増産（借入はルールBで済ませている）
    const lastG = P.history.length ? P.history[P.history.length - 1].G : 0;
    const capTarget = 4 + (P.ai === '積極' && lastG > 0 ? 4 : 0);
    if (s.period >= 2 && turns >= 5 && pc < capTarget && lastG > -60 && P.cash - res >= 260) {
      return { type: 'buyEquip', large: 1 };
    }

    if (pc && (P.wip || P.mat)) {
      let c = Math.min(pc, P.wip), n = Math.min(pc, P.mat);
      if (c * 1 + n * 2 > P.cash) { n = Math.max(0, Math.floor((P.cash - c) / 2)); c = Math.min(c, P.cash); }
      if (c + n > 0 && (turns > 1 || c > 0)) return { type: 'produce', complete: c, insert: n };
    }

    if (turns >= 3) {
      const want = pc * (turns >= 5 ? 3 : 2) - P.mat - P.wip;
      const budget = pipelineEmpty && !P.prod ? P.cash - 5 : P.cash - Math.floor(res * 0.4);
      if (want > 0 && budget > 10) {
        const buys = buyPlan(s, P, budget, want);
        if (buys) return { type: 'buyMat', buys };
      }
    }

    if (P.salesmen && P.chips.red < 2 * P.salesmen && free > 30 && P.prod + P.wip >= 2) {
      return { type: 'ad', n: Math.min(2 * P.salesmen - P.chips.red, free > 60 ? 2 : 1) };
    }
    if (P.chips.blue < (P.ai === '積極' ? 3 : 2) && free > 60) return { type: 'rd' };

    if (turns >= 4) {
      if (P.ai === '積極' && free > 260) return { type: 'buyEquip', large: 1 };
      if (free > 170) return { type: 'buyEquip', small: 1, attach: 1 };
      const bare = P.machines.find(m => m.type === 'small' && !m.att);
      if (bare && free > 40) return { type: 'buyEquip', attach: 1 };
    }

    if (offers) return { type: 'sell', offers };
    return { type: 'pass' };
  }

  function bid(s, P) {
    const pd = s.pending;
    if (pd.round === 2) {
      const bids = Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(P.id))
        .map(([m, r]) => { const orig = r.comp + 2 * P.chips.blue; return { m, p: Math.max(Math.min(MIN_PRICE, orig), orig - rnd(1, 4)) }; });
      return { type: 'bid', bids };
    }
    let left = Math.min(P.prod, E.salesCap(P));
    if (Math.random() < 0.15) return { type: 'bid', bids: [] };
    const bids = [];
    const offers = pd.offers.slice().sort((a, b) => E.MK[b.m].cap - E.MK[a.m].cap);
    for (const o of offers) {
      const q = Math.min(o.q, left);
      const cap = E.MK[o.m].cap;
      if (!q || cap < MIN_PRICE) continue;
      bids.push({ m: o.m, q, p: Math.max(MIN_PRICE, cap - rnd(2, P.ai === '積極' ? 9 : 6)) });
      left -= q;
    }
    return { type: 'bid', bids };
  }

  function riskChoice(s, P) {
    const pd = s.pending;
    if (pd.kind === 'monopoly') return { type: 'riskChoice', qty: pd.max };
    const afford = Math.floor((P.cash - reserve(s, P)) / pd.price);
    return { type: 'riskChoice', qty: Math.max(0, Math.min(pd.max, afford)) };
  }

  // 返したアクションが不正だった場合の代替
  function fallback(s, pid) {
    if (s.phase === 'auction') return { type: 'bid', pid, bids: [] };
    if (s.phase === 'risk') return { type: 'riskChoice', pid, qty: 0 };
    return s.step === 'pre' ? { type: 'draw', pid } : { type: 'pass', pid };
  }

  return {
    decide: (s, pid) => { const a = decide(s, pid); if (a) a.pid = pid; return a; },
    fallback,
  };
})();

if (typeof module !== 'undefined') module.exports = AI;
