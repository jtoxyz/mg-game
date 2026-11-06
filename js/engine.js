// ゲームエンジン：状態 + アクション。UI・通信からは act(state, action) だけを呼ぶ。
// 状態は純粋な JSON（オンライン対戦でそのまま送受信できる）。
'use strict';

const Engine = (() => {
  const D = (typeof MG !== 'undefined') ? MG : require('./data.js');
  const MK = Object.fromEntries(D.MARKETS.map(m => [m.id, m]));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const isInt = (n) => Number.isInteger(n);

  // ---------- 生成 ----------
  function newGame(cfg, seats) {
    const s = {
      v: 1, rev: 0,
      cfg: { periods: cfg.periods || 3, rounds: cfg.rounds || 10 },
      period: 0, phase: 'turn', step: 'pre',
      order: seats.map((_, i) => 'p' + i),
      cur: 0, dir: 1, turnsLeft: 0,
      markets: D.MARKETS.map(m => ({ id: m.id, mats: m.vol })),
      players: {}, pending: null, lastCard: null, lastAuction: null,
      log: [],
    };
    seats.forEach((st, i) => { s.players['p' + i] = newPlayer('p' + i, st, i); });
    startPeriod(s);
    return s;
  }

  function newPlayer(id, st, i) {
    return {
      id, company: st.company, ceo: st.ceo || '', ctrl: st.ctrl, owner: st.owner || null,
      color: D.COMPANY_COLORS[i % D.COMPANY_COLORS.length],
      ai: st.ai || ['堅実', '積極', 'バランス'][i % 3],
      cash: 0, loan: 0, taxDue: 0, re: 0,
      mat: 0, wip: 0, prod: 0, matV: 0, wipV: 0, prodV: 0,
      machines: [], mid: 0, workers: 0, salesmen: 0,
      chips: { red: 0, blue: 0, yellow: 0, pac: 0, md: 0, mr: 0 },
      skip: false, ledger: [], acc: null, open: null,
      borrowLimit: 0, rate: 0, history: [],
    };
  }

  // ---------- 補助 ----------
  function log(s, pid, t) {
    s.log.push({ p: s.period, pid, t });
    if (s.log.length > 160) s.log.splice(0, s.log.length - 160);
  }

  function book(P, col, amt, d) {
    if (!amt) return;
    const inflow = D.COLS_IN.includes(col);
    P.cash += inflow ? amt : -amt;
    P.ledger.push({ d, c: col, a: amt, bal: P.cash });
    P.acc.cols[col] = (P.acc.cols[col] || 0) + amt;
  }

  // 期首・期末の支払いで現金が足りないときの緊急借入（デジタル版の補助ルール）
  function emergency(s, P) {
    if (P.cash >= 0) return;
    const amt = Math.ceil(-P.cash / 10) * 10;
    book(P, 'オ', amt, '緊急借入（資金不足）');
    P.loan += amt;
    log(s, P.id, `資金不足のため緊急借入 ${amt}`);
  }

  function machineCap(P, m) {
    return (m.type === 'large' ? 4 : 1 + (m.att ? 1 : 0)) + (P.chips.pac ? 1 : 0);
  }
  function prodCap(P) {
    const caps = P.machines.map(m => machineCap(P, m)).sort((a, b) => b - a);
    return sum(caps.slice(0, P.workers));
  }
  function salesCap(P) {
    return 2 * P.salesmen + 2 * Math.min(P.chips.red, 2 * P.salesmen);
  }
  function empty(s, mid) {
    const m = s.markets.find(x => x.id === mid);
    return MK[mid].vol - m.mats;
  }
  function netAssets(P) { return D.CAPITAL + P.re; }
  function borrowRoom(P) { return Math.max(0, P.borrowLimit - P.loan); }
  function trackHeads(P) {
    const A = P.acc;
    A.maxW = Math.max(A.maxW, P.workers);
    A.maxS = Math.max(A.maxS, P.salesmen);
  }

  function endCostBreakdown(s, P) {
    const r = D.endCost(s.period), A = P.acc;
    const unrepW = Math.min(A.retW, Math.max(0, A.maxW - P.workers));
    const unrepS = Math.min(A.retS, Math.max(0, A.maxS - P.salesmen));
    const heads = P.workers + P.salesmen + A.retW + A.retS;
    return {
      r, unrepW, unrepS, heads, machines: A.mTouched,
      シ: P.workers * r.w + unrepW * r.wl,
      ス: A.mTouched * r.m,
      セ: P.salesmen * r.s + unrepS * r.sl,
      ソ: heads * r.a,
    };
  }
  function estEndCost(s, P) {
    const b = endCostBreakdown(s, P);
    return b.シ + b.ス + b.セ + b.ソ;
  }

  const curPid = (s) => s.order[s.cur];

  // 今、入力を待っているプレイヤー
  function waitingFor(s) {
    if (s.phase === 'turn') return [curPid(s)];
    if (s.phase === 'auction') return s.pending.waiting.slice();
    if (s.phase === 'risk') return [s.pending.pid];
    return [];
  }

  // ---------- 期首処理 ----------
  function startPeriod(s) {
    s.period++;
    s.phase = 'turn'; s.step = 'pre'; s.pending = null; s.lastAuction = null; s.lastCard = null;
    const t = D.loanTerms(s.period);
    s.markets.forEach(m => { m.mats = MK[m.id].vol; });
    for (const pid of s.order) {
      const P = s.players[pid];
      P.ledger = [{ d: '期首現金残高', c: '', a: 0, bal: P.cash }];
      P.acc = {
        cols: {}, buyQ: 0, buyV: 0, insQ: 0, compQ: 0,
        fireQ: 0, mistakeQ: 0, theftQ: 0, saleQ: 0, saleV: 0, ins: 0,
        mSaleProceeds: 0, mSaleBV: 0, machineLoss: 0, mTouched: P.machines.length,
        maxW: P.workers, maxS: P.salesmen, retW: 0, retS: 0,
      };
      P.open = { matQ: P.mat, matV: P.matV, wipQ: P.wip, wipV: P.wipV, prodQ: P.prod, prodV: P.prodV };
      if (s.period === 1) book(P, 'カ', D.CAPITAL, '資本金');
      P.borrowLimit = Math.max(0, Math.floor(t.mult * netAssets(P)));
      P.rate = t.rate;
      if (P.loan > 0) book(P, 'タ', Math.ceil(P.loan * P.rate), `借入金利（残高${P.loan}×${Math.round(P.rate * 100)}%）`);
      if (P.taxDue > 0) { book(P, 'ニ', P.taxDue, '法人税等の納付'); P.taxDue = 0; }
      emergency(s, P);
    }
    s.turnsLeft = s.cfg.rounds * s.order.length;
    s.cur = (s.period - 1) % s.order.length;
    s.dir = 1;
    log(s, null, `第${s.period}期 開始。借入${t.mult ? `可能額は純資産の${t.mult}倍・金利${Math.round(t.rate * 100)}%` : 'はできません'}。`);
  }

  // ---------- 手番の進行 ----------
  function endTurn(s) {
    s.turnsLeft--;
    s.step = 'pre';
    if (s.turnsLeft <= 0) { endPeriod(s); return; }
    const n = s.order.length;
    s.cur = (s.cur + s.dir + n) % n;
  }

  function drawRiskCard() {
    const total = sum(D.RISK_CARDS.map(c => c.weight));
    let r = Math.random() * total;
    for (const c of D.RISK_CARDS) { r -= c.weight; if (r < 0) return c; }
    return D.RISK_CARDS[0];
  }

  function applyRisk(s, P, card) {
    const name = P.company;
    switch (card.id) {
      case 'fire': {
        const q = P.mat, insured = q > 0 && P.chips.yellow > 0;
        P.mat = 0; P.acc.fireQ += q;
        if (insured) {
          book(P, 'エ', q * D.INSURANCE.fire, `火災保険金 ${q}個×${D.INSURANCE.fire}`);
          P.acc.ins += q * D.INSURANCE.fire; P.chips.yellow = 0;
        }
        log(s, P.id, `倉庫火災：材料${q}個を焼失${insured ? '（保険金あり）' : ''}`);
        break;
      }
      case 'mistake': {
        const q = Math.min(1, P.wip); P.wip -= q; P.acc.mistakeQ += q;
        log(s, P.id, `製造ミス：仕掛品${q}個を廃棄`);
        break;
      }
      case 'theft': case 'claim': {
        const q = card.id === 'theft' ? P.prod : Math.min(1, P.prod); P.prod -= q; P.acc.theftQ += q;
        if (card.id === 'theft' && q && P.chips.yellow) {
          book(P, 'エ', q * D.INSURANCE.theft, `盗難保険金 ${q}個×${D.INSURANCE.theft}`);
          P.acc.ins += q * D.INSURANCE.theft; P.chips.yellow = 0;
        }
        log(s, P.id, `${card.title}：製品${q}個を失う`);
        break;
      }
      case 'quitW': case 'quitS': {
        const k = card.id === 'quitW' ? 'workers' : 'salesmen';
        const had = P[k] > 0;
        if (had) {
          P[k]--; if (k === 'workers') P.acc.retW++; else P.acc.retS++;
          book(P, 'ソ', D.RETIRE_FEE, `退職費（${card.title}）`);
          emergency(s, P);
        }
        log(s, P.id, `${card.title}${had ? `：退職費${D.RETIRE_FEE}を支払い` : '（対象者なし）'}`);
        break;
      }
      case 'special': {
        const max = Math.min(5, Math.floor(P.cash / 10));
        if (max > 0) {
          s.phase = 'risk';
          s.pending = { kind: 'special', pid: P.id, max, price: 10 };
          return true;
        }
        log(s, P.id, '材料の特別購入：資金不足のため見送り');
        break;
      }
      case 'monopoly': {
        const m = D.MARKETS[Math.floor(Math.random() * D.MARKETS.length)];
        const max = Math.min(5, salesCap(P), P.prod);
        if (max > 0) {
          s.phase = 'risk';
          s.pending = { kind: 'monopoly', pid: P.id, max, market: m.id, price: m.cap };
          return true;
        }
        log(s, P.id, `独占販売（${m.name}・${m.cap}）：販売できる製品がないため見送り`);
        break;
      }
      case 'reverse':
        s.dir *= -1;
        log(s, P.id, '逆回り：手番の順序が逆に');
        break;
      case 'sick':
        P.skip = true;
        log(s, P.id, '社長が倒れた：次の手番は休み');
        break;
      case 'breakdown': {
        // 機械はすべて廃棄。帳簿価額を特別損失にする（現金の動きはなし）
        const n = P.machines.length;
        if (n) {
          const bv = sum(P.machines.map(m => m.bv + (m.att ? m.attBv : 0)));
          P.acc.machineLoss += bv;
          P.machines = [];
          log(s, P.id, `工場の機械が壊れる：機械${n}台がすべて使えなくなった（損失${bv}）`);
        } else log(s, P.id, '工場の機械が壊れる：機械がないため影響なし');
        break;
      }
      case 'rdHit':
        P.chips.blue++;
        log(s, P.id, '研究開発の成功：青チップ+1');
        break;
      case 'rdFail':
        if (P.chips.blue) P.chips.blue--;
        log(s, P.id, '研究開発の失敗：青チップ-1');
        break;
      case 'adHit':
        if (P.chips.red < 2 * P.salesmen) { P.chips.red++; log(s, P.id, '広告が大ヒット：赤チップ+1'); }
        else log(s, P.id, '広告が大ヒット：これ以上は有効にならないため影響なし');
        break;
    }
    return false;
  }

  // ---------- アクション ----------
  const RULE_B = new Set(['chip', 'transfer', 'sellMachine', 'borrow', 'repay']);
  const RULE_A = new Set(['buyMat', 'buyEquip', 'produce', 'hire', 'ad', 'rd', 'sell', 'pass']);

  function act(s, a) {
    const P = s.players[a && a.pid];
    if (!P) return 'プレイヤーが見つかりません';
    const err = dispatch(s, P, a);
    if (!err) s.rev++;
    return err || null;
  }

  function dispatch(s, P, a) {
    const t = a.type;
    if (t === 'nextPeriod') {
      if (s.phase !== 'periodEnd') return '期末処理中ではありません';
      startPeriod(s); return null;
    }
    if (t === 'bid') return doBid(s, P, a);
    if (t === 'riskChoice') return doRiskChoice(s, P, a);
    if (s.phase !== 'turn' || curPid(s) !== P.id) return 'あなたの手番ではありません';
    if (t === 'draw') {
      if (s.step !== 'pre') return 'カードはもう引いています';
      return doDraw(s, P);
    }
    if (RULE_B.has(t)) {
      if (s.step !== 'pre') return 'ルールBは意思決定カードを引く前だけ行えます';
      return ruleB[t](s, P, a);
    }
    if (RULE_A.has(t)) {
      if (s.step !== 'decide') return '先に意思決定カードを引いてください';
      const e = ruleA[t](s, P, a);
      if (e) return e;
      if (s.phase === 'turn') endTurn(s);
      return null;
    }
    return '不明なアクションです';
  }

  function doDraw(s, P) {
    if (P.skip) {
      P.skip = false;
      s.lastCard = { pid: P.id, kind: 'skip' };
      log(s, P.id, '社長の病気のため休み');
      endTurn(s);
      return null;
    }
    if (Math.random() < D.RISK_RATIO) {
      const card = drawRiskCard();
      s.lastCard = { pid: P.id, kind: 'risk', id: card.id };
      const waits = applyRisk(s, P, card);
      if (!waits) endTurn(s);
    } else {
      s.lastCard = { pid: P.id, kind: 'decision' };
      s.step = 'decide';
    }
    return null;
  }

  const ruleB = {
    chip(s, P, a) {
      const c = a.chip, cost = D.PRICE[c];
      const col = { yellow: 'ソ', pac: 'ス', md: 'ソ', mr: 'セ' }[c];
      if (!col) return '不明なチップです';
      if (P.chips[c]) return 'このチップは1期に1枚までです';
      if (P.cash < cost) return '現金が足りません';
      const label = { yellow: '保険（黄）', pac: 'PAC生産性（緑）', md: 'マーチャンダイザー（緑）', mr: 'マーケットリサーチ（緑）' }[c];
      book(P, col, cost, label);
      P.chips[c] = 1;
      log(s, P.id, `${label}を購入`);
      return null;
    },
    transfer(s, P, a) {
      const n = a.n | 0;
      if (n < 1) return '人数を指定してください';
      const from = a.dir === 'w2s' ? 'workers' : 'salesmen';
      const to = a.dir === 'w2s' ? 'salesmen' : 'workers';
      if (P[from] < n) return '人数が足りません';
      if (P.cash < n * D.PRICE.transfer) return '現金が足りません';
      book(P, 'ソ', n * D.PRICE.transfer, `配置転換 ${n}人`);
      P[from] -= n; P[to] += n; trackHeads(P);
      log(s, P.id, `配置転換：${a.dir === 'w2s' ? 'ワーカー→セールスマン' : 'セールスマン→ワーカー'} ${n}人`);
      return null;
    },
    sellMachine(s, P, a) {
      const m = P.machines.find(x => x.id === a.mid);
      if (!m) return '機械が見つかりません';
      if (a.part === 'attach') {
        if (!m.att) return 'アタッチメントが付いていません';
        book(P, 'イ', D.SELLBACK.attach, 'アタッチメント売却');
        P.acc.mSaleProceeds += D.SELLBACK.attach; P.acc.mSaleBV += m.attBv;
        m.att = false; m.attBv = 0;
        log(s, P.id, 'アタッチメントを売却（10）');
        return null;
      }
      if (P.machines.length <= 1) return '工場に機械が無い状態にはできません';
      let proceeds = D.SELLBACK[m.type], bv = m.bv;
      if (m.att) { proceeds += D.SELLBACK.attach; bv += m.attBv; }
      book(P, 'イ', proceeds, `${m.type === 'large' ? '大型' : '小型'}機械売却${m.att ? '（アタッチメント付き）' : ''}`);
      P.acc.mSaleProceeds += proceeds; P.acc.mSaleBV += bv;
      P.machines = P.machines.filter(x => x !== m);
      log(s, P.id, `${m.type === 'large' ? '大型' : '小型'}機械を売却（${proceeds}）`);
      return null;
    },
    borrow(s, P, a) {
      const amt = a.amt | 0;
      if (s.period <= 1) return '1期目は借入できません';
      if (amt <= 0 || amt % 10) return '借入額は10単位で指定してください';
      if (amt > borrowRoom(P)) return `借入枠（${borrowRoom(P)}）を超えています`;
      const interest = Math.ceil(amt * P.rate);
      book(P, 'オ', amt, '銀行借入');
      book(P, 'タ', interest, `借入金利 ${amt}×${Math.round(P.rate * 100)}%`);
      P.loan += amt;
      log(s, P.id, `銀行から${amt}を借入（金利${interest}）`);
      return null;
    },
    repay(s, P, a) {
      const amt = a.amt | 0;
      if (amt <= 0) return '返済額を指定してください';
      if (amt > P.loan) return '借入残高を超えています';
      if (amt > P.cash) return '現金が足りません';
      book(P, 'ナ', amt, '借入金返済');
      P.loan -= amt;
      log(s, P.id, `借入金${amt}を返済`);
      return null;
    },
  };

  const ruleA = {
    buyMat(s, P, a) {
      const buys = a.buys || {};
      const disc = P.chips.md ? 2 : 0;
      let total = 0, cost = 0;
      const lines = [];
      for (const [mid, qRaw] of Object.entries(buys)) {
        const q = qRaw | 0;
        if (q < 0) return '数量が不正です';
        if (!q) continue;
        let price;
        if (mid === 'stocker') price = D.STOCKER_PRICE;
        else {
          if (!MK[mid]) return '不明なマーケットです';
          const m = s.markets.find(x => x.id === mid);
          if (q > m.mats) return `${MK[mid].name}の材料は残り${m.mats}個です`;
          price = MK[mid].mat;
        }
        price -= disc;
        total += q; cost += q * price;
        lines.push({ mid, q, price });
      }
      if (!total) return '購入数を指定してください';
      if (cost > P.cash) return `現金が足りません（必要 ${cost}）`;
      for (const l of lines) {
        const name = l.mid === 'stocker' ? 'ストッカー' : MK[l.mid].name;
        book(P, 'ツ', l.q * l.price, `材料 ${name} ${l.price}×${l.q}`);
        if (l.mid !== 'stocker') s.markets.find(x => x.id === l.mid).mats -= l.q;
      }
      P.mat += total; P.acc.buyQ += total; P.acc.buyV += cost;
      log(s, P.id, `材料購入：${lines.map(l => `${l.mid === 'stocker' ? 'ストッカー' : MK[l.mid].name}${l.q}個`).join('・')}（${cost}）`);
      return null;
    },
    buyEquip(s, P, a) {
      const small = a.small | 0, attach = a.attach | 0, large = a.large | 0;
      if (small < 0 || attach < 0 || large < 0 || small + attach + large === 0) return '購入する設備を指定してください';
      const freeSmall = P.machines.filter(m => m.type === 'small' && !m.att).length + small;
      if (attach > freeSmall) return 'アタッチメントは小型機械1台に1つまでです';
      const cost = small * D.PRICE.small + attach * D.PRICE.attach + large * D.PRICE.large;
      if (cost > P.cash) return `現金が足りません（必要 ${cost}）`;
      const parts = [];
      for (let i = 0; i < small; i++) P.machines.push({ id: 'm' + (++P.mid), type: 'small', att: false, bv: D.PRICE.small, attBv: 0 });
      for (let i = 0; i < large; i++) P.machines.push({ id: 'm' + (++P.mid), type: 'large', att: false, bv: D.PRICE.large, attBv: 0 });
      let left = attach;
      for (const m of P.machines) {
        if (!left) break;
        if (m.type === 'small' && !m.att) { m.att = true; m.attBv = D.PRICE.attach; left--; }
      }
      if (small) parts.push(`小型機械${small}台`);
      if (attach) parts.push(`アタッチメント${attach}個`);
      if (large) parts.push(`大型機械${large}台`);
      book(P, 'ケ', cost, parts.join('・'));
      P.acc.mTouched += small + large;
      log(s, P.id, `設備投資：${parts.join('・')}（${cost}）`);
      return null;
    },
    produce(s, P, a) {
      const cap = prodCap(P);
      const c = a.complete | 0, n = a.insert | 0;
      if (c < 0 || n < 0 || c + n === 0) return '完成・投入の個数を指定してください';
      if (!cap) return '生産能力がありません（機械とワーカーが必要）';
      if (c > Math.min(cap, P.wip)) return `完成は最大${Math.min(cap, P.wip)}個です`;
      if (n > Math.min(cap, P.mat)) return `投入は最大${Math.min(cap, P.mat)}個です`;
      const cost = c * D.PRICE.complete + n * D.PRICE.insert;
      if (cost > P.cash) return `現金が足りません（必要 ${cost}）`;
      if (c) { book(P, 'サ', c * D.PRICE.complete, `完成 ${c}個`); P.wip -= c; P.prod += c; P.acc.compQ += c; }
      if (n) { book(P, 'コ', n * D.PRICE.insert, `投入 ${n}個`); P.mat -= n; P.wip += n; P.acc.insQ += n; }
      log(s, P.id, `完成${c}個・投入${n}個`);
      return null;
    },
    hire(s, P, a) {
      const w = a.w | 0, sm = a.s | 0;
      if (w < 0 || sm < 0 || w + sm === 0) return '採用人数を指定してください';
      const cost = (w + sm) * D.PRICE.hire;
      if (cost > P.cash) return '現金が足りません';
      book(P, 'ソ', cost, `採用 ワーカー${w}人・セールスマン${sm}人`);
      P.workers += w; P.salesmen += sm; trackHeads(P);
      log(s, P.id, `採用：ワーカー${w}人・セールスマン${sm}人`);
      return null;
    },
    ad(s, P, a) {
      const n = a.n | 0;
      if (n < 1) return '枚数を指定してください';
      if (P.chips.red + n > 2 * P.salesmen) return `広告はセールスマン1人につき2枚までしか有効になりません（あと${Math.max(0, 2 * P.salesmen - P.chips.red)}枚）`;
      if (n * D.PRICE.red > P.cash) return '現金が足りません';
      book(P, 'セ', n * D.PRICE.red, `広告 赤チップ${n}枚`);
      P.chips.red += n;
      log(s, P.id, `広告：赤チップ${n}枚`);
      return null;
    },
    rd(s, P) {
      if (P.cash < D.PRICE.blue) return '現金が足りません';
      book(P, 'チ', D.PRICE.blue, '研究開発 青チップ1枚');
      P.chips.blue++;
      log(s, P.id, '研究開発：青チップ1枚');
      return null;
    },
    pass(s, P) {
      log(s, P.id, '意思決定なし（パス）');
      return null;
    },
    sell(s, P, a) {
      const offers = (a.offers || []).map(o => ({ m: o.m, q: o.q | 0, p: o.p | 0 })).filter(o => o.q > 0);
      if (!offers.length) return '販売するマーケットと個数を指定してください';
      const seen = new Set();
      for (const o of offers) {
        if (!MK[o.m]) return '不明なマーケットです';
        if (seen.has(o.m)) return '同じマーケットが重複しています';
        seen.add(o.m);
        if (o.q > empty(s, o.m)) return `${MK[o.m].name}の空きは${empty(s, o.m)}個です`;
        if (o.p < 1 || o.p > MK[o.m].cap) return `${MK[o.m].name}の入札価格は1〜${MK[o.m].cap}です`;
      }
      const tq = sum(offers.map(o => o.q));
      if (tq > salesCap(P)) return `販売能力（${salesCap(P)}個）を超えています`;
      if (tq > P.prod) return `製品は${P.prod}個しかありません`;
      const waiting = s.order.filter(id => id !== P.id && s.players[id].prod > 0 && salesCap(s.players[id]) > 0);
      s.phase = 'auction';
      s.pending = { kind: 'auction', parent: P.id, offers, bids: {}, waiting };
      log(s, P.id, `商品販売：${offers.map(o => `${MK[o.m].name}${o.q}個`).join('・')}で入札開始`);
      if (!waiting.length) resolveAuction(s);
      return null;
    },
  };

  function doBid(s, P, a) {
    if (s.phase !== 'auction') return '入札中ではありません';
    const pd = s.pending;
    if (!pd.waiting.includes(P.id)) return '入札の対象ではありません';
    if (pd.round === 2) {
      // 再入札：数量は最初の応札のまま、価格だけ出し直す（出さなかったマーケットは辞退）
      const re = [];
      for (const b of (a.bids || [])) {
        const r = pd.rebid[b.m];
        if (!r || !r.pids.includes(P.id)) return '再入札の対象ではないマーケットです';
        const p = b.p | 0;
        if (p < 1 || p > MK[b.m].cap) return `${MK[b.m].name}の入札価格は1〜${MK[b.m].cap}です`;
        re.push({ m: b.m, p });
      }
      pd.rebids[P.id] = re;
      pd.waiting = pd.waiting.filter(x => x !== P.id);
      if (!pd.waiting.length) resolveAuction(s);
      return null;
    }
    const bids = (a.bids || []).map(b => ({ m: b.m, q: b.q | 0, p: b.p | 0 })).filter(b => b.q > 0);
    for (const b of bids) {
      const o = pd.offers.find(x => x.m === b.m);
      if (!o) return '親が出していないマーケットです';
      if (b.q > o.q) return `${MK[b.m].name}は最大${o.q}個までです`;
      if (b.p < 1 || b.p > MK[b.m].cap) return `${MK[b.m].name}の入札価格は1〜${MK[b.m].cap}です`;
    }
    const tq = sum(bids.map(b => b.q));
    if (tq > salesCap(P)) return `販売能力（${salesCap(P)}個）を超えています`;
    if (tq > P.prod) return `製品は${P.prod}個しかありません`;
    pd.bids[P.id] = bids;
    pd.waiting = pd.waiting.filter(x => x !== P.id);
    if (!pd.waiting.length) resolveAuction(s);
    return null;
  }

  // 入札の比較は競争価格（入札価格 −2（親）−2×青チップ）で行う
  function childBids(pd, m) {
    return Object.entries(pd.bids).map(([pid, bids]) => ({ pid, b: bids.find(x => x.m === m) })).filter(x => x.b);
  }
  const compOf = (s, pid, p, parent) => p - (parent ? 2 : 0) - 2 * s.players[pid].chips.blue;
  // 子が1人以上応札し、親も含めて全員の競争価格が同じなら親の負け
  function allSame(s, pd, o) {
    const kids = childBids(pd, o.m), c = compOf(s, pd.parent, o.p, true);
    return kids.length > 0 && kids.every(k => compOf(s, k.pid, k.b.p, false) === c);
  }

  function resolveAuction(s) {
    const pd = s.pending;
    const parent = s.players[pd.parent];
    // 全員同じ競争価格のマーケットは親の負け。子が2人以上いて空きに全員分が入らなければ、子だけで再入札
    if (pd.round !== 2) {
      const rebid = {};
      for (const o of pd.offers) {
        const kids = childBids(pd, o.m);
        if (kids.length >= 2 && allSame(s, pd, o) && sum(kids.map(k => k.b.q)) > empty(s, o.m)) {
          rebid[o.m] = { comp: compOf(s, pd.parent, o.p, true), pids: kids.map(k => k.pid) };
        }
      }
      if (Object.keys(rebid).length) {
        pd.round = 2; pd.rebid = rebid; pd.rebids = {};
        pd.waiting = [...new Set(Object.values(rebid).flatMap(r => r.pids))];
        for (const [m, r] of Object.entries(rebid)) log(s, null, `${MK[m].name}は全員が競争価格${r.comp}で同じため親（${parent.company}）の負け。子だけで再入札します。`);
        return;
      }
    }
    const results = [];
    for (const o of pd.offers) {
      const mk = MK[o.m];
      const market = s.markets.find(x => x.id === o.m);
      const room = mk.vol - market.mats;          // このセリで売れる総数＝マーケットの空き
      const same = allSame(s, pd, o);
      const rb = pd.rebid && pd.rebid[o.m];
      const entries = [{ pid: pd.parent, q: o.q, p: o.p, parent: true, lost: same }];
      for (const { pid, b } of childBids(pd, o.m)) {
        if (rb) {
          const nb = (pd.rebids[pid] || []).find(x => x.m === o.m);
          if (nb) entries.push({ pid, q: b.q, p: nb.p, p1: b.p, parent: false, rebid: true });
          else entries.push({ pid, q: b.q, p: b.p, parent: false, rebid: true, withdrew: true });
        } else entries.push({ pid, q: b.q, p: b.p, parent: false });
      }
      for (const e of entries) {
        e.blue = s.players[e.pid].chips.blue;
        e.comp = compOf(s, e.pid, e.p, e.parent);
        e.grp = e.withdrew ? 2 : e.lost ? 1 : 0;   // 同額で負けた親は子の後ろ、辞退は売れない
        e.tie = Math.random();
      }
      // 競争価格の安い順。同じなら青チップの多い順、親、ランダム（ジャンケンの代わり）
      entries.sort((x, y) => x.grp - y.grp || x.comp - y.comp || y.blue - x.blue || (y.parent - x.parent) || x.tie - y.tie);
      let left = room;
      entries.forEach((e, i) => {
        const Pl = s.players[e.pid];
        e.rank = i + 1;
        e.sold = e.withdrew ? 0 : Math.max(0, Math.min(e.q, left, Pl.prod));
        e.price = Math.min(e.p + (Pl.chips.mr ? 2 : 0), mk.cap);
        if (e.sold) {
          Pl.prod -= e.sold;
          book(Pl, 'キ', e.sold * e.price, `売上 ${mk.name} ${e.price}×${e.sold}`);
          Pl.acc.saleQ += e.sold; Pl.acc.saleV += e.sold * e.price;
          market.mats += e.sold;
          left -= e.sold;
          log(s, e.pid, `${mk.name}で${e.sold}個を販売（${e.price}×${e.sold}=${e.sold * e.price}）`);
        }
        delete e.tie; delete e.grp;
      });
      results.push({ m: o.m, q: o.q, room, entries, same, rebidComp: rb ? rb.comp : null });
    }
    s.lastAuction = { parent: parent.id, results, at: s.rev };
    s.pending = null;
    s.phase = 'turn';
    endTurn(s);
  }

  function doRiskChoice(s, P, a) {
    if (s.phase !== 'risk' || s.pending.pid !== P.id) return '選択の対象ではありません';
    const pd = s.pending, q = a.qty | 0;
    if (q < 0 || q > pd.max) return `0〜${pd.max}個で指定してください`;
    if (pd.kind === 'special') {
      if (q * pd.price > P.cash) return '現金が足りません';
      if (q) {
        book(P, 'ツ', q * pd.price, `材料 特別購入 ${pd.price}×${q}`);
        P.mat += q; P.acc.buyQ += q; P.acc.buyV += q * pd.price;
      }
      log(s, P.id, `材料の特別購入：${q}個`);
    } else {
      const mk = MK[pd.market];
      if (q > Math.min(P.prod, salesCap(P))) return '販売できる個数を超えています';
      if (q) {
        P.prod -= q;
        book(P, 'キ', q * pd.price, `独占販売 ${mk.name} ${pd.price}×${q}`);
        P.acc.saleQ += q; P.acc.saleV += q * pd.price;
      }
      log(s, P.id, `独占販売：${mk.name}で${q}個（${pd.price}×${q}）`);
    }
    s.pending = null; s.phase = 'turn';
    endTurn(s);
    return null;
  }

  // ---------- 期末処理・決算 ----------
  function endPeriod(s) {
    for (const pid of s.order) closePeriod(s, s.players[pid]);
    s.phase = s.period >= s.cfg.periods ? 'over' : 'periodEnd';
    s.pending = null;
    log(s, null, `第${s.period}期 終了。決算を確認してください。`);
  }

  function closePeriod(s, P) {
    const A = P.acc;
    const ec = endCostBreakdown(s, P);
    book(P, 'シ', ec.シ, `期末 労務費（ワーカー${P.workers}人${ec.unrepW ? `＋退職${ec.unrepW}人` : ''}）`);
    book(P, 'ス', ec.ス, `期末 製造経費（機械延べ${ec.machines}台）`);
    book(P, 'セ', ec.セ, `期末 販売費（セールスマン${P.salesmen}人${ec.unrepS ? `＋退職${ec.unrepS}人` : ''}）`);
    book(P, 'ソ', ec.ソ, `期末 一般管理費（${ec.heads}人）`);
    const cashBeforeEmergency = P.cash;
    emergency(s, P);

    // 減価償却
    let dep = 0;
    for (const m of P.machines) {
      const d = Math.min(m.bv, D.DEPR[m.type]); m.bv -= d; dep += d;
      if (m.att) { const da = Math.min(m.attBv, D.DEPR.attach); m.attBv -= da; dep += da; }
    }

    // 原価計算（平均単価は四捨五入、繰越以外は差額で算出）
    const O = P.open;
    const avg = (v, q) => q ? Math.round(v / q) : 0;
    const m1 = { openQ: O.matQ, openV: O.matV, inQ: A.buyQ, inV: A.buyV };
    m1.totQ = m1.openQ + m1.inQ; m1.totV = m1.openV + m1.inV; m1.avg = avg(m1.totV, m1.totQ);
    m1.lossQ = A.fireQ; m1.lossV = Math.min(m1.avg * A.fireQ, m1.totV);
    m1.closeQ = P.mat; m1.closeV = Math.min(m1.avg * P.mat, m1.totV - m1.lossV);
    m1.outQ = A.insQ; m1.outV = m1.totV - m1.closeV - m1.lossV;

    const w = { openQ: O.wipQ, openV: O.wipV, inQ: A.insQ, inV: m1.outV, procV: A.cols['コ'] || 0 };
    w.totQ = w.openQ + w.inQ; w.totV = w.openV + w.inV + w.procV; w.avg = avg(w.totV, w.totQ);
    w.lossQ = A.mistakeQ; w.lossV = Math.min(w.avg * A.mistakeQ, w.totV);
    w.closeQ = P.wip; w.closeV = Math.min(w.avg * P.wip, w.totV - w.lossV);
    w.outQ = A.compQ; w.outV = w.totV - w.closeV - w.lossV;

    const p = { openQ: O.prodQ, openV: O.prodV, inQ: A.compQ, inV: w.outV, procV: A.cols['サ'] || 0 };
    p.totQ = p.openQ + p.inQ; p.totV = p.openV + p.inV + p.procV; p.avg = avg(p.totV, p.totQ);
    p.lossQ = A.theftQ; p.lossV = Math.min(p.avg * A.theftQ, p.totV);
    p.closeQ = P.prod; p.closeV = Math.min(p.avg * P.prod, p.totV - p.lossV);
    p.outQ = A.saleQ; p.outV = p.totV - p.closeV - p.lossV;

    // 変動損益計算（MQ会計）
    const PQ = A.saleV, Q = A.saleQ, VQ = p.outV, MQ = PQ - VQ;
    const C = A.cols;
    const Fd = { dep, シ: C['シ'] || 0, ス: C['ス'] || 0, セ: C['セ'] || 0, ソ: C['ソ'] || 0, タ: C['タ'] || 0, チ: C['チ'] || 0 };
    const F = sum(Object.values(Fd));
    const G = MQ - F;
    const saleGain = A.mSaleProceeds - A.mSaleBV;
    const machineLoss = A.machineLoss || 0;
    const special = -m1.lossV - w.lossV - p.lossV - machineLoss + A.ins + saleGain;
    const pretax = G + special;
    const prevRE = P.re;
    const base = prevRE >= 0 ? pretax : prevRE + pretax;
    const tax = base > 0 ? Math.floor(base * D.TAX_RATE) : 0;
    const net = pretax - tax;
    P.re += net;
    P.taxDue = tax;
    P.matV = m1.closeV; P.wipV = w.closeV; P.prodV = p.closeV;

    const fixed = sum(P.machines.map(m => m.bv + (m.att ? m.attBv : 0)));
    const assets = P.cash + P.matV + P.wipV + P.prodV + fixed;
    const liab = P.loan + P.taxDue;
    const equity = D.CAPITAL + P.re;
    P.history.push({
      period: s.period,
      PQ, Q, VQ, MQ, F, Fd, G,
      P: Q ? Math.round(PQ / Q) : 0, vP: Q ? Math.round(VQ / Q) : 0,
      special: { fire: m1.lossV, mistake: w.lossV, theft: p.lossV, machine: machineLoss, ins: A.ins, saleGain }, specialTotal: special,
      pretax, prevRE, tax, net, re: P.re,
      cost: { m: m1, w, p },
      endCost: ec, emergency: cashBeforeEmergency < 0 ? Math.ceil(-cashBeforeEmergency / 10) * 10 : 0,
      bs: { cash: P.cash, mat: P.matV, wip: P.wipV, prod: P.prodV, fixed, assets, loan: P.loan, taxDue: P.taxDue, liab, capital: D.CAPITAL, re: P.re, equity, diff: assets - liab - equity },
      cols: { ...C },
      inv: { mat: P.mat, wip: P.wip, prod: P.prod },
      ledger: P.ledger.slice(),
    });

    // 各チップは期末に全て返却
    P.chips = { red: 0, blue: 0, yellow: 0, pac: 0, md: 0, mr: 0 };
    P.skip = false;
  }

  // オンライン配信用：入札内容を隠す
  function publicView(s) {
    const c = JSON.parse(JSON.stringify(s));
    if (c.pending && c.pending.kind === 'auction') {
      c.pending.bids = Object.fromEntries(Object.keys(c.pending.bids).map(k => [k, 'sealed']));
      if (c.pending.rebids) c.pending.rebids = Object.fromEntries(Object.keys(c.pending.rebids).map(k => [k, 'sealed']));
    }
    return c;
  }

  return {
    newGame, act, waitingFor, curPid, prodCap, salesCap, machineCap, empty, netAssets, borrowRoom,
    estEndCost, endCostBreakdown, publicView, MK,
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
