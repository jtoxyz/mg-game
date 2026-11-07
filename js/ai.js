// CPU 社長の思考ルーチン。状態を読んで次のアクションを1つ返す。
// 入札では他社の入札価格（非公開）は見ず、公開されている情報（参加者と個数・マーケットの空き）だけで決める。
'use strict';

const AI = (() => {
  const E = (typeof Engine !== 'undefined') ? Engine : require('./engine.js');
  const D = (typeof MG !== 'undefined') ? MG : require('./data.js');
  const R = D.RULE;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const MIN_PRICE = 18;

  const reserve = (s, P) => E.estEndCost(s, P) + 10;
  const myTurnsLeft = (s) => Math.ceil(s.turnsLeft / s.order.length);
  const borrowedThisPeriod = (P) => P.ledger.some(l => l.d === '銀行借入');
  const lastG = (P) => (P.history.length ? P.history[P.history.length - 1].G : 0);

  function decide(s, pid) {
    const P = s.players[pid];
    if (s.phase === 'auction') {
      const stage = s.pending.stage;
      return stage === 'join' ? join(s, P) : stage === 'price' ? price(s, P) : rebid(s, P);
    }
    if (s.phase === 'risk') return riskChoice(s, P);
    if (s.phase !== 'turn') return null;
    return s.step === 'pre' ? pre(s, P) : main(s, P);
  }

  // 目標の生産能力：1期に売れそうな数（マーケットの総ボリュームを社数で割った取り分）を、1期の生産回数でこなせる程度
  function capTarget(s, P) {
    const share = D.MARKETS.reduce((a, m) => a + m.vol, 0) / s.order.length;
    const runs = Math.max(2, Math.floor(s.cfg.rounds / 3));
    return Math.max(R.capLarge, Math.ceil(share / runs) + (P.ai === '積極' ? 1 : 0));
  }
  // 大型機械を買いたいか（2期目以降・手番が残っている・生産能力が目標より小さい・前期が大赤字でない）
  function wantsLarge(s, P) {
    return s.period >= 2 && myTurnsLeft(s) >= 6 && E.prodCap(P) + R.capLarge <= capTarget(s, P) + 1 && lastG(P) > -60;
  }

  // ルールB（カードを引く前）
  function pre(s, P) {
    const res = reserve(s, P), free = P.cash - res, turns = myTurnsLeft(s);
    // 借入は「大型機械を買うのに足りない分」だけ。金利は借りた時と毎期首にかかるので、ほかの理由では借りない
    const need = D.PRICE.large + res + 40 - P.cash;
    if (P.ai !== '堅実' && wantsLarge(s, P) && need > 0 && !borrowedThisPeriod(P)) {
      const amt = Math.ceil(need / R.loanUnit) * R.loanUnit;
      if (amt <= E.borrowRoom(P)) return { type: 'borrow', amt };
    }
    // 期末が近く、使い道のない現金があれば返済して次期の金利を減らす
    if (P.loan > 0 && turns <= 2) {
      const amt = Math.min(P.loan, Math.floor((free - 20) / R.loanUnit) * R.loanUnit);
      if (amt >= R.loanUnit) return { type: 'repay', amt };
    }
    if (P.machines.length && P.workers && !P.chips.pac && free > 40 && turns >= 3) return { type: 'chip', chip: 'pac' };
    if (P.salesmen && !P.chips.mr && free > 60 && turns >= 3 && P.ai !== '堅実') return { type: 'chip', chip: 'mr' };
    if (!P.chips.md && free > 80 && turns >= 5 && E.prodCap(P) >= 3) return { type: 'chip', chip: 'md' };
    if (!P.chips.yellow && (P.mat >= 4 || P.prod >= 3) && free > 10) return { type: 'chip', chip: 'yellow' };
    return { type: 'draw' };
  }

  // 販売宣言：上限価格の高いマーケットから、空きの数まで
  function sellPlan(s, P) {
    let qty = Math.min(P.prod, E.salesCap(P));
    if (!qty) return null;
    const ms = D.MARKETS.map(m => ({ m, e: E.empty(s, m.id) }))
      .filter(x => x.e > 0 && x.m.cap >= MIN_PRICE)
      .sort((a, b) => b.m.cap - a.m.cap);
    const offers = [];
    for (const x of ms) {
      if (!qty) break;
      const q = Math.min(qty, x.e);
      offers.push({ m: x.m.id, q });
      qty -= q;
    }
    return offers.length ? offers : null;
  }

  function buyPlan(s, P, budget, want) {
    const disc = P.chips.md ? R.mdDiscount : 0;
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
      if (P.ai === '積極' && P.cash >= D.PRICE.large + 90) return { type: 'buyEquip', large: 1 };
      if (P.cash >= D.PRICE.small + D.PRICE.attach + 40) return { type: 'buyEquip', small: 1, attach: 1 };
      if (P.cash >= D.PRICE.small) return { type: 'buyEquip', small: 1 };
      return { type: 'pass' };
    }

    const needW = Math.max(0, P.machines.length - P.workers);
    const wantS = Math.max(1, Math.ceil(pc / 4));
    const needS = Math.max(0, wantS - P.salesmen);
    if ((needW || needS) && P.cash >= (needW + needS) * D.PRICE.hire) return { type: 'hire', w: needW, s: needS };

    const offers = sellPlan(s, P);
    const pipelineEmpty = P.mat === 0 && P.wip === 0;
    // 空き枠は他社と取り合いなので、売れるときに売る
    const best = offers ? Math.max(...offers.map(o => E.MK[o.m].cap)) : 0;
    if (offers && (best >= 26 || P.prod >= Math.min(sc, 4) || turns <= 2 || pipelineEmpty)) return { type: 'sell', offers };

    // 生産能力が小さければ大型機械で増産（足りない分はルールBで借りている）
    if (wantsLarge(s, P) && P.cash - res >= D.PRICE.large) return { type: 'buyEquip', large: 1 };

    if (pc && (P.wip || P.mat)) {
      let c = Math.min(pc, P.wip), n = Math.min(pc, P.mat);
      const cost = () => c * D.PRICE.complete + n * D.PRICE.insert;
      if (cost() > P.cash) { n = Math.max(0, Math.floor((P.cash - c * D.PRICE.complete) / D.PRICE.insert)); c = Math.min(c, Math.floor(P.cash / D.PRICE.complete)); }
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

    if (P.salesmen && P.chips.red < R.adPerSalesman * P.salesmen && free > 30 && P.prod + P.wip >= 2) {
      return { type: 'ad', n: Math.min(R.adPerSalesman * P.salesmen - P.chips.red, free > 60 ? 2 : 1) };
    }
    if (P.chips.blue < (P.ai === '積極' ? 3 : 2) && free > 60) return { type: 'rd' };

    // 設備は売れる見込み（マーケットの取り分）を超えて増やさない
    if (turns >= 4 && pc < capTarget(s, P)) {
      if (P.ai === '積極' && free > D.PRICE.large + 60) return { type: 'buyEquip', large: 1 };
      if (free > D.PRICE.small + D.PRICE.attach + 50) return { type: 'buyEquip', small: 1, attach: 1 };
      const bare = P.machines.find(m => m.type === 'small' && !m.att);
      if (bare && free > 40) return { type: 'buyEquip', attach: 1 };
    }

    if (offers) return { type: 'sell', offers };
    return { type: 'pass' };
  }

  // 入札に参加するか：製品があれば、上限価格の高いマーケットから参加する
  function join(s, P) {
    const pd = s.pending;
    let left = Math.min(P.prod, E.salesCap(P));
    if (Math.random() < 0.1) return { type: 'join', joins: [] };
    const joins = [];
    const offers = pd.offers.slice().sort((a, b) => E.MK[b.m].cap - E.MK[a.m].cap);
    for (const o of offers) {
      const q = Math.min(o.q, left);
      if (!q || E.MK[o.m].cap < MIN_PRICE) continue;
      joins.push({ m: o.m, q });
      left -= q;
    }
    return { type: 'join', joins };
  }

  // 入札価格：全員分の空きがあるマーケットは上限価格。競争になるところは下げる
  function price(s, P) {
    const pd = s.pending;
    const sum = Object.fromEntries(E.auctionSummary(s).map(x => [x.m, x]));
    const markets = P.id === pd.parent ? E.parentPriceMarkets(s) : (pd.joins[P.id] || []).map(j => j.m);
    const cut = P.ai === '積極' ? 9 : P.ai === 'バランス' ? 7 : 5;
    const prices = markets.map(m => {
      const cap = E.MK[m].cap;
      if (sum[m] && sum[m].allSell) return { m, p: cap };
      const rivals = sum[m] ? sum[m].kids.length : 1;
      const p = cap - rnd(P.id === pd.parent ? 0 : 2, cut) - Math.min(4, rivals - 1);
      return { m, p: Math.max(Math.min(MIN_PRICE, cap), p) };
    });
    return { type: 'price', prices };
  }

  function rebid(s, P) {
    const pd = s.pending;
    const prices = Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(P.id))
      .map(([m, r]) => { const orig = r.comp + R.blueEdge * P.chips.blue; return { m, p: Math.max(Math.min(MIN_PRICE, orig), orig - rnd(1, 4)) }; });
    return { type: 'rebid', prices };
  }

  function riskChoice(s, P) {
    const pd = s.pending;
    if (pd.kind === 'monopoly') return { type: 'riskChoice', qty: pd.max };
    const afford = Math.floor((P.cash - reserve(s, P)) / pd.price);
    return { type: 'riskChoice', qty: Math.max(0, Math.min(pd.max, afford)) };
  }

  // 返したアクションが不正だった場合の代替（必ず通るもの）
  function fallback(s, pid) {
    if (s.phase === 'auction') {
      const st = s.pending.stage;
      if (st === 'join') return { type: 'join', pid, joins: [] };
      if (st === 'rebid') return { type: 'rebid', pid, prices: [] };
      const pd = s.pending;
      const ms = pid === pd.parent ? E.parentPriceMarkets(s) : (pd.joins[pid] || []).map(j => j.m);
      return { type: 'price', pid, prices: ms.map(m => ({ m, p: E.MK[m].cap })) };
    }
    if (s.phase === 'risk') return { type: 'riskChoice', pid, qty: 0 };
    return s.step === 'pre' ? { type: 'draw', pid } : { type: 'pass', pid };
  }

  return {
    decide: (s, pid) => { const a = decide(s, pid); if (a) a.pid = pid; return a; },
    fallback,
  };
})();

if (typeof module !== 'undefined') module.exports = AI;
