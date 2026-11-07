// 画面描画。HTML文字列を返す関数群。イベントは app.js が data-a 属性で受ける。
'use strict';

const UI = (() => {
  const E = Engine, D = MG, R = MG.RULE;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => (n < 0 ? '▲' + Math.abs(n) : String(n));
  const sgn = (n) => `<span class="${n < 0 ? 'neg' : ''}">${yen(n)}</span>`;
  const pname = (s, pid) => esc(s.players[pid] ? s.players[pid].company : '');
  const colorOf = (P) => (/^#[0-9a-f]{6}$/i.test(P && P.color) ? P.color : '#888888');
  const swatch = (P) => `<span class="swatch" style="background:${colorOf(P)}"></span>`;
  const ctrlTag = (P) => P.ctrl === 'cpu' ? 'CPU' : P.ctrl === 'remote' ? 'オンライン' : '人間';

  // ---------- 小物 ----------
  function stepper(key, val, min, max, label, step = 1) {
    max = Math.max(min, max);
    val = Math.max(min, Math.min(max, val));
    const at = `data-k="${key}" data-min="${min}" data-max="${max}" data-step="${step}"`;
    return `<span class="stepper">
      <button type="button" data-a="step" ${at} data-d="-1" ${val <= min ? 'disabled' : ''} aria-label="${esc(label)}を減らす">−</button>
      <input id="f-${key}" type="number" inputmode="numeric" data-f="${key}" data-min="${min}" data-max="${max}" data-step="${step}" value="${val}" aria-label="${esc(label)}">
      <button type="button" data-a="step" ${at} data-d="1" ${val >= max ? 'disabled' : ''} aria-label="${esc(label)}を増やす">＋</button>
    </span>`;
  }
  const cubes = (n, cls = '', limit = 24) =>
    Array.from({ length: Math.min(n, limit) }, () => `<i class="cube ${cls}"></i>`).join('') + (n > limit ? `<span class="tok-label">+${n - limit}</span>` : '');
  const pawnSvg = (color) => `<svg class="pawn" viewBox="0 0 12 17" aria-hidden="true"><g fill="${color}" stroke="#5b6577" stroke-width="1"><circle cx="6" cy="4" r="3"/><path d="M2 16.3 C2 10 3.5 8 6 8 S10 10 10 16.3Z"/></g></svg>`;
  const pawns = (n, color) => n ? Array.from({ length: Math.min(n, 12) }, () => pawnSvg(color)).join('') + (n > 12 ? `+${n - 12}` : '') : '<span class="tok-label">なし</span>';
  const nutSvg = (big, att) => {
    const hex = (cx, cy, r) => {
      const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
      return `<polygon points="${pts}" fill="#8d96a3" stroke="#4b525c" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${r * .42}" fill="#e4e7ec" stroke="#4b525c"/>`;
    };
    if (big) return `<svg viewBox="0 0 24 24" aria-hidden="true">${hex(8, 13, 7)}${hex(16, 11, 7)}</svg>`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${hex(12, 12, 8)}${att ? '<rect x="4" y="19" width="16" height="4" rx="1" fill="#3a4049"/>' : ''}</svg>`;
  };

  // 独自マーク：のこぎり屋根の工場と、右肩上がりの線
  const MARK_INNER = `<rect x="2" y="2" width="60" height="60" rx="14" fill="#0e5e66"/>
    <path d="M12 46 V30 L22 22 V30 L32 22 V30 L42 22 V46 Z" fill="#f4efe3"/>
    <rect x="16" y="36" width="5" height="10" fill="#0e5e66"/><rect x="27" y="36" width="5" height="10" fill="#0e5e66"/>
    <path d="M38 40 L45 31 L49 35 L55 24" fill="none" stroke="#e8a33d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const markSvg = (cls) => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${MARK_INNER}</svg>`;

  // ---------- タイトル ----------
  function title(ctx) {
    const sv = ctx.save;
    let saveItem = '';
    if (sv && sv.ok) saveItem = `<button class="menu-item" data-a="resume"><b>${sv.over ? '前回の結果を見る' : '続きから'}</b><span>${esc(sv.label)}</span></button>`;
    else if (sv) saveItem = `<div class="menu-item static"><b>前回のデータ</b><span>${esc(sv.label)}</span><button class="btn small danger" data-a="dropSave">削除する</button></div>`;
    return `<div class="title-wrap"><div class="title-card">
      <div class="logo">${markSvg('logo-mark')}<div class="sub"><b>マネジメントゲーム</b><span>製造業版 ジュニア・ルール</span></div></div>
      <div class="menu">
        ${saveItem}
        <button class="menu-item" data-a="goSetup" data-v="cpu"><b>CPUと対戦</b><span>自分1人＋CPU社長。いつでも練習できます。</span></button>
        <button class="menu-item" data-a="goSetup" data-v="hotseat"><b>1台を回して対戦</b><span>ゼミのみんなで1台を順番に操作。入札価格は隠して入力。</span></button>
        <button class="menu-item" data-a="goHost"><b>オンライン：部屋を作る</b><span>部屋コードを共有して、各自のスマホ・PCから参加。</span></button>
        <button class="menu-item" data-a="goJoin"><b>オンライン：部屋に参加</b><span>ホストから聞いた部屋コードを入力。</span></button>
        <button class="menu-item" data-a="guide"><b>遊び方</b><span>はじめての人向け。1回の手番と販売（入札）の流れ。</span></button>
        <button class="menu-item" data-a="rules"><b>ルール表</b><span>ルールA・B、期末費用、能力の計算</span></button>
      </div>
      <p class="title-foot">資本金${D.CAPITAL}で創業し、設備投資・採用・仕入・製造・販売を意思決定。何期か決算を繰り返し、純資産（自己資本）が最も多い社長の勝ちです。</p>
    </div></div>`;
  }

  // 開始前の会社の行。opts.kind = 'cpu' | 'hotseat' | 'host'
  function seatRow(st, i, opts) {
    const color = D.COMPANY_COLORS[i % D.COMPANY_COLORS.length];
    const locked = opts.locked(st, i);
    const types = opts.types(st, i);
    const seg = types.length > 1
      ? `<span class="seg" role="group" aria-label="操作する人">${types.map(([v, l]) => `<button type="button" class="${st.ctrl === v ? 'on' : ''}" aria-pressed="${st.ctrl === v}" data-a="seatType" data-i="${i}" data-v="${v}">${l}</button>`).join('')}</span>`
      : `<span class="seat-tag">${types[0] ? types[0][1] : ''}</span>`;
    const ai = st.ctrl === 'cpu'
      ? `<select class="seat-ai" data-seat-ai="${i}" aria-label="CPUの性格">${[['', 'おまかせ'], ...D.AI_TYPES.map(t => [t, t + '型'])].map(([v, l]) => `<option value="${v}" ${(st.ai || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : '';
    return `<div class="seat">
      <span class="dot" style="background:${color}"></span>
      <input class="co" id="seat-c-${i}" data-seat="${i}" data-k="company" value="${esc(st.company)}" maxlength="14" aria-label="社名" ${locked ? 'disabled' : ''}>
      <input class="ceo" id="seat-n-${i}" data-seat="${i}" data-k="ceo" value="${esc(st.ceo)}" maxlength="10" placeholder="社長名" aria-label="社長名" ${locked ? 'disabled' : ''}>
      <span class="kind">${seg}${ai}</span>
      ${opts.removable(st, i) ? `<button type="button" class="btn small danger del" data-a="seatDel" data-i="${i}" aria-label="${esc(st.company)}を外す">×</button>` : '<span class="del"></span>'}
    </div>`;
  }

  function cfgFields(cfg) {
    return `<div class="row">
      <label class="field">期数（決算の回数）<select id="cfg-periods" data-cfg="periods">${Array.from({ length: D.MAX_PERIODS }, (_, k) => k + 1).map(n => `<option value="${n}" ${cfg.periods === n ? 'selected' : ''}>${n}期</option>`).join('')}</select></label>
      <label class="field">1期あたりの手番数（1人あたり）<select id="cfg-rounds" data-cfg="rounds">${[6, 8, 10, 12, 15, 20].map(n => `<option value="${n}" ${cfg.rounds === n ? 'selected' : ''}>${n}回</option>`).join('')}</select></label>
    </div>
    <p class="note">ゼミでの1期60分に近いのは12〜15回です。最初は10回・3期がおすすめです。</p>`;
  }

  function setup(ctx) {
    const u = ctx.setup;
    const rows = u.seats.map((st, i) => seatRow(st, i, {
      types: () => (u.kind === 'cpu' ? (i === 0 ? [['local', 'あなた']] : [['cpu', 'CPU']]) : [['local', '人間'], ['cpu', 'CPU']]),
      locked: () => false,
      removable: (_, j) => u.seats.length > 2 && !(u.kind === 'cpu' && j === 0),
    })).join('');
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">${u.kind === 'cpu' ? 'CPUと対戦' : '1台を回して対戦'}</div>
      <h2>参加する会社</h2>
      <div class="seat-list">${rows}</div>
      <div class="row">${u.seats.length < R.maxSeats ? '<button class="btn small" data-a="seatAdd">＋ 会社を追加</button>' : ''}<span class="note">4〜6社が標準です（2〜6社で遊べます）。CPUの性格は「堅実・積極・バランス」から選べます。</span></div>
      ${cfgFields(u.cfg)}
      <div class="row"><button class="btn primary" data-a="startLocal">ゲーム開始</button><button class="btn" data-a="home">戻る</button></div>
    </div></div></div>`;
  }

  function hostLobby(ctx) {
    const u = ctx.setup;
    const remote = (st) => st.ctrl === 'remote';
    const rows = u.seats.map((st, i) => seatRow(st, i, {
      types: () => (remote(st) ? [['remote', ctx.online && ctx.online[st.owner] === false ? 'オンライン（切断中）' : 'オンライン']] : i === 0 ? [['local', 'あなた']] : [['cpu', 'CPU'], ['open', '募集中']]),
      locked: remote,
      removable: (_, j) => j > 0 && u.seats.length > 2,
    })).join('');
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">オンライン：ホスト</div>
      <div class="row"><div><div class="note">部屋コード</div><div class="room-code">${esc(ctx.code)}</div></div>
        <div class="note" style="flex:1;min-width:200px">参加者はこのページを開いて「オンライン：部屋に参加」からコードを入力します。<br><span class="conn ${ctx.connOk ? 'ok' : 'ng'}">${esc(ctx.connLabel)}</span></div></div>
      <h2>参加する会社</h2>
      <div class="seat-list">${rows}</div>
      <div class="row">${u.seats.length < R.maxSeats ? '<button class="btn small" data-a="seatAdd">＋ 枠を追加</button>' : ''}
        <span class="note">「募集中」の枠に参加者が入ります。空いたまま開始すると、その枠は外されます。</span></div>
      ${cfgFields(u.cfg)}
      <div class="row"><button class="btn primary" data-a="startHost">ゲーム開始</button><button class="btn" data-a="home">部屋を閉じる</button></div>
    </div></div></div>`;
  }

  function join(ctx) {
    const j = ctx.join;
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">オンライン：参加</div>
      ${j.stage === 'form' ? `
        <div class="row">
          <label class="field" style="flex:1;min-width:140px">部屋コード（4文字）<input id="join-code" data-join="code" value="${esc(j.code)}" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="例：K7Q2"></label>
          <label class="field" style="flex:2;min-width:160px">社名<input id="join-company" data-join="company" value="${esc(j.company)}" maxlength="14"></label>
          <label class="field" style="flex:1;min-width:120px">社長名<input id="join-ceo" data-join="ceo" value="${esc(j.ceo)}" maxlength="10"></label>
        </div>
        ${j.err ? `<p class="err" role="alert">${esc(j.err)}</p>` : ''}
        <div class="row"><button class="btn primary" data-a="doJoin">参加する</button><button class="btn" data-a="home">戻る</button></div>`
      : `<div class="waiting"><span class="spinner"></span><div><b>${j.stage === 'connecting' ? '接続しています…' : 'ホストの開始を待っています'}</b><div class="note">部屋 ${esc(j.code)} ／ ${esc(j.company)}</div></div></div>
        ${j.lobby ? `<div class="seat-list">${j.lobby.map((st, i) => `<div class="seat lobby"><span class="dot" style="background:${D.COMPANY_COLORS[i % D.COMPANY_COLORS.length]}"></span><span>${esc(st.company)}${st.ceo ? `（${esc(st.ceo)}）` : ''}</span><span class="note">${st.ctrl === 'cpu' ? 'CPU' : st.ctrl === 'open' ? '募集中' : st.ctrl === 'local' ? 'ホスト' : '参加者'}</span></div>`).join('')}</div>` : ''}
        ${j.err ? `<p class="err" role="alert">${esc(j.err)}</p>` : ''}
        <div class="row"><button class="btn" data-a="home">やめる</button></div>`}
    </div></div></div>`;
  }

  // ---------- ボード（六角形） ----------
  function board(s) {
    const R0 = 300, r = 78, cx = 320, cy = 320;
    const ap = (k) => k * Math.cos(Math.PI / 6);   // 頂点半径 → 辺までの距離
    const vtx = (k, i) => { const a = Math.PI / 3 * i; return [cx + k * Math.cos(a), cy + k * Math.sin(a)]; };
    const poly = (k) => [0, 1, 2, 3, 4, 5].map(i => vtx(k, i).join(',')).join(' ');
    // 辺 i（頂点 i→i+1）の中心方向: 30°+60°*i。上（270°）から時計回りにマーケットを置く
    const dirs = [270, 330, 30, 90, 150, 210];
    const top = Math.floor(cy - ap(R0 + 18)) - 2, h = Math.ceil(ap(R0 + 18) * 2) + 4;
    const desc = D.MARKETS.map(mk => { const m = s.markets.find(x => x.id === mk.id); return `${mk.name} 材料${m.mats}個・空き${mk.vol - m.mats}`; }).join('、');
    let out = `<svg class="board-svg" viewBox="0 ${top} 640 ${h}" role="img" aria-label="マーケットボード：${esc(desc)}">
      <polygon points="${poly(R0 + 18)}" fill="#dcbf8f" stroke="#b9955f" stroke-width="3"/>
      <polygon points="${poly(R0)}" fill="#3d2a1f"/>`;
    D.MARKETS.forEach((mk, i) => {
      const phi = dirs[i], m = s.markets.find(x => x.id === mk.id);
      const rot = phi - 90;
      const trot = ((rot % 360) + 540) % 360 - 180;
      const flip = Math.abs(trot) > 90;
      const g = `translate(${cx},${cy}) rotate(${rot})`;
      // 仕切り（木の桟）
      const a1 = (phi - 30) * Math.PI / 180;
      out += `<line x1="${cx + r * Math.cos(a1)}" y1="${cy + r * Math.sin(a1)}" x2="${cx + R0 * Math.cos(a1)}" y2="${cy + R0 * Math.sin(a1)}" stroke="#dcbf8f" stroke-width="7"/>`;
      // ラベル帯（材料単価｜都市 ボリューム｜価格上限）
      const dBand = ap(R0) - 34, half = dBand * Math.tan(Math.PI / 6) - 6;
      out += `<g transform="${g}"><g transform="translate(0,${dBand})${flip ? ' rotate(180)' : ''}">
        <rect x="${-half}" y="-17" width="${half * 2}" height="34" rx="3" fill="#ffffff"/>
        <rect x="${-half}" y="-17" width="${half * .52}" height="34" fill="#1e86d6"/>
        <rect x="${half * .48}" y="-17" width="${half * .52}" height="34" fill="#2e9a4a"/>
        <text x="${-half * .74}" y="7" text-anchor="middle" fill="#fff" font-size="20" class="lbl-num">${mk.mat}</text>
        <text x="${half * .74}" y="7" text-anchor="middle" fill="#fff" font-size="20" class="lbl-num">${mk.cap}</text>
        <text x="${-half * .12}" y="6" text-anchor="middle" fill="#1b2233" font-size="15" font-weight="700">${mk.name}</text>
        <text x="${half * .3}" y="8" text-anchor="middle" fill="#d0342c" font-size="21" class="lbl-num">${mk.vol}</text>
        <text x="${-half * .74}" y="-21" text-anchor="middle" fill="#f0dcb6" font-size="11" font-weight="700">材料単価</text>
        <text x="${half * .74}" y="-21" text-anchor="middle" fill="#f0dcb6" font-size="11" font-weight="700">上限価格</text>
      </g></g>`;
      // 材料キューブと空き枠
      const cell = 17, rows = [];
      for (let d = ap(r) + 22; d < dBand - 28; d += cell) rows.push(d);
      const slots = [];
      for (const d of rows) {
        const w = d * Math.tan(Math.PI / 6) * 2 - 22;
        const n = Math.max(0, Math.floor(w / cell));
        for (let k = 0; k < n; k++) slots.push([(k - (n - 1) / 2) * cell, d]);
      }
      // 外側の行から詰める
      slots.sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]));
      const vol = Math.min(mk.vol, slots.length);
      let cubesSvg = '';
      for (let k = 0; k < vol; k++) {
        const [x, y] = slots[k];
        cubesSvg += k < m.mats
          ? `<rect x="${x - 6.5}" y="${y - 6.5}" width="13" height="13" rx="2" fill="#7b3a2a" stroke="#4e2016"/>`
          : `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="none" stroke="#f2c418" stroke-width="1.6" stroke-dasharray="3 2"/>`;
      }
      out += `<g transform="${g}">${cubesSvg}</g>`;
      // 空き表示
      const empty = mk.vol - m.mats;
      const [ex, ey] = [cx + (ap(r) + 12) * Math.cos(phi * Math.PI / 180), cy + (ap(r) + 12) * Math.sin(phi * Math.PI / 180)];
      out += empty ? `<text x="${ex}" y="${ey + 4}" text-anchor="middle" fill="#f2c418" font-size="13" font-weight="700">空き${empty}</text>` : '';
    });
    // 中央：意思決定カードの山
    out += `<polygon points="${poly(r)}" fill="#dcbf8f"/>
      <g transform="translate(${cx},${cy})">
        <rect x="-30" y="-40" width="60" height="80" rx="6" fill="#0b4c53" stroke="#f4efe3" stroke-width="2.5" transform="rotate(-8)"/>
        <rect x="-30" y="-40" width="60" height="80" rx="6" fill="#0e5e66" stroke="#f4efe3" stroke-width="2.5"/>
        <svg x="-17" y="-30" width="34" height="34" viewBox="0 0 64 64">${MARK_INNER}</svg>
        <text y="27" text-anchor="middle" fill="#fff" font-size="12">残り${Math.max(0, s.turnsLeft)}</text>
      </g>`;
    out += '</svg>';
    const lc = s.lastCard;
    const lcCard = lc && lc.kind === 'risk' ? D.RISK_CARDS.find(c => c.id === lc.id) : null;
    out += `<div class="board-legend"><span><i style="background:#7b3a2a"></i>マーケットの材料</span><span><i style="border:1.5px dashed #f2c418"></i>空き＝製品を売れる枠</span><span>ストッカー：材料${D.STOCKER_PRICE}（無制限・空きはできない）</span>${lc ? `<span>直前：${pname(s, lc.pid)} ${lcCard ? 'リスクカード「' + esc(lcCard.title) + '」' : lc.kind === 'skip' ? '休み' : '意思決定'}</span>` : ''}</div>`;
    return out;
  }

  // スマホ用：マーケットの材料と空きの一覧（ボードが下にあるため）
  function marketStrip(s) {
    return `<div class="mstrip" aria-label="マーケットの状況">${D.MARKETS.map(mk => {
      const m = s.markets.find(x => x.id === mk.id), e = mk.vol - m.mats;
      return `<div class="${e ? 'has' : ''}"><b>${mk.name}</b><span>材料${m.mats}/${mk.vol}</span><span class="e">空き${e}</span></div>`;
    }).join('')}</div>`;
  }

  // ---------- 会社盤 ----------
  function company(s, pid) {
    const P = s.players[pid];
    const pc = E.prodCap(P), sc = E.salesCap(P);
    const est = E.estEndCost(s, P);
    const on = E.staffedMachines(P);
    const tabs = s.order.map(id => { const Q = s.players[id]; return `<button class="tab ${id === pid ? 'on' : ''}" role="tab" aria-selected="${id === pid}" data-a="view" data-v="${id}">${swatch(Q)}${esc(Q.company)}</button>`; }).join('');
    const machinesHtml = P.machines.length ? P.machines.map(m => {
      const working = on.includes(m.id);
      const name = m.type === 'large' ? '大型' : m.att ? '小+ア' : '小型';
      return `<span class="machine ${working ? '' : 'idle'}" title="${m.type === 'large' ? '大型機械' : '小型機械'}${working ? '' : '（ワーカー不足で停止中）'}">${nutSvg(m.type === 'large', m.att)}${name} ${E.machineCap(P, m)}${working ? '' : '・停止'}</span>`;
    }).join('') : '<span class="tok-label">機械なし</span>';
    const green = (onv, label) => `<span class="green-slot"><i class="chipdot ${onv ? 'green' : 'off'}"></i>${label}</span>`;
    const idle = P.machines.length - on.length;
    return `<div class="sheet company">
      <div class="tabs" role="tablist" aria-label="会社を選ぶ">${tabs}</div>
      <div class="company-head">${swatch(P)}<h2>${esc(P.company)}</h2><span class="ceo">${P.ceo ? '社長 ' + esc(P.ceo) + '・' : ''}${ctrlTag(P)}${P.ctrl === 'cpu' ? '（' + esc(P.ai) + '型）' : ''}</span></div>
      <div class="kpis">
        <div class="kpi ${P.cash < est ? 'warn' : ''}"><small>現金</small><b>${yen(P.cash)}</b>${P.cash < est ? '<em>期末費用に不足</em>' : ''}</div>
        <div class="kpi"><small>期末費用見込み</small><b>${est}</b></div>
        <div class="kpi"><small>借入金</small><b>${P.loan}</b></div>
        <div class="kpi"><small>生産能力</small><b>${pc}</b></div>
        <div class="kpi"><small>販売能力</small><b>${sc}</b></div>
        <div class="kpi"><small>純資産(前期末)</small><b>${sgn(E.netAssets(P))}</b></div>
      </div>
      <div class="boardsheet">
        <div class="zone rd"><span class="zt">研究開発</span>
          <div class="tokens">${P.chips.blue ? Array.from({ length: P.chips.blue }, () => '<i class="chipdot blue"></i>').join('') : '<span class="tok-label">青チップなし</span>'}</div>
          <div class="cap">価格競争力 −${P.chips.blue * R.blueEdge}</div>
        </div>
        <div class="zone wh"><span class="zt">材料倉庫</span>
          <div class="cols"><div><div class="tokens">${cubes(P.mat)}</div><div class="cap">材料 <span class="count">${P.mat}</span>個</div></div>${green(P.chips.md, 'マーチャン<br>ダイザー')}</div>
        </div>
        <div class="zone fac"><span class="zt">工場</span>
          <div class="cols"><div class="stack">
            <div class="tokens">${machinesHtml}</div>
            <div class="split"><span class="tok-label">ワーカー</span><div class="tokens">${pawns(P.workers, '#eef0f4')}</div></div>
            <div><div class="tokens">${cubes(P.wip, 'wip')}</div><div class="cap">仕掛品 <span class="count">${P.wip}</span>個 ／ 生産能力 ${pc}${idle > 0 ? `（ワーカー不足で${idle}台停止中）` : ''}</div></div>
          </div>${green(P.chips.pac, 'PAC<br>生産性')}</div>
        </div>
        <div class="zone ins"><span class="zt">保険</span><i class="chipdot ${P.chips.yellow ? 'yellow' : 'off'}"></i><span class="cap">${P.chips.yellow ? 'あり' : 'なし'}</span></div>
        <div class="zone shop"><span class="zt">営業所</span>
          <div class="cols"><div class="stack">
            <div><div class="tokens">${cubes(P.prod, 'prod')}</div><div class="cap">製品 <span class="count">${P.prod}</span>個</div></div>
            <div class="split"><span class="tok-label">セールスマン</span><div class="tokens">${pawns(P.salesmen, '#ffffff')}</div></div>
            <div class="split"><span class="tok-label">広告</span><div class="tokens">${P.chips.red ? Array.from({ length: P.chips.red }, () => '<i class="chipdot red"></i>').join('') : '<span class="tok-label">なし</span>'}</div></div>
          </div>${green(P.chips.mr, 'マーケット<br>リサーチ')}</div>
        </div>
      </div>
      <div class="row"><button class="btn small" data-a="books" data-v="ledger">現金出納帳</button><button class="btn small" data-a="books" data-v="fin">決算書</button><button class="btn small" data-a="books" data-v="rank">順位表</button></div>
    </div>`;
  }

  // ---------- 操作パネル ----------
  const panel = (inner, busy) => `<div class="sheet action ${busy ? 'busy' : ''}" ${busy ? 'aria-busy="true"' : ''}>${inner}${busy ? '<div class="busy-note"><span class="spinner"></span>ホストに送信中…</div>' : ''}</div>`;

  function action(ctx) {
    const s = ctx.s;
    if (s.phase === 'periodEnd' || s.phase === 'over') return periodEndPanel(ctx);
    const actor = ctx.actor;
    const cur = s.players[E.curPid(s)];
    const busy = !!ctx.ui.pending;
    if (s.phase === 'auction') return panel(auctionPanel(ctx), busy);
    if (s.phase === 'risk') {
      if (actor === s.pending.pid) return panel(riskForm(ctx), busy);
      return panel(`<div class="waiting"><span class="spinner"></span><span>${pname(s, s.pending.pid)}がリスクカードの対応を選んでいます</span></div>${offlineHelp(ctx, [s.pending.pid])}`);
    }
    if (actor !== cur.id) {
      return panel(`<div class="waiting"><span class="spinner"></span><div><b>${esc(cur.company)}の手番</b><div class="note">${cur.ctrl === 'cpu' ? 'CPUが考えています…' : cur.ctrl === 'remote' ? '参加者の操作を待っています' : ''}</div></div></div>${offlineHelp(ctx, [cur.id])}${recentFeed(s)}${lastAuctionMini(s)}`);
    }
    if (s.step === 'pre') return panel(preForm(ctx), busy);
    return panel(decideForm(ctx), busy);
  }

  // ホスト：待っている参加者の通信が切れていたら、その場でCPUに交代できるようにする
  function offlineHelp(ctx, pids) {
    if (!ctx.isHost || !ctx.online) return '';
    const s = ctx.s;
    const off = pids.filter(id => s.players[id].ctrl === 'remote' && ctx.online[id] === false);
    return off.map(id => `<div class="alert">${pname(s, id)}の通信が切れています。<button class="btn small" data-a="toCpu" data-v="${id}">CPUに交代</button></div>`).join('');
  }

  // 今期の最近の動き（下が最新）
  function recentFeed(s) {
    const items = s.log.filter(l => l.p === s.period).slice(-6);
    if (!items.length) return '';
    return `<div class="feed"><p class="eyebrow">最近の動き（下が最新）</p><ol>${items.map((l, i) => {
      const P = l.pid && s.players[l.pid];
      return `<li class="${i === items.length - 1 ? 'latest' : ''}">${P ? swatch(P) : '<span class="swatch" style="background:#9fb0a5"></span>'}<span><b>${P ? esc(P.company) : '全体'}</b>　${esc(l.t)}</span></li>`;
    }).join('')}</ol></div>`;
  }

  function lastAuctionMini(s) {
    const la = s.lastAuction;
    if (!la) return '';
    const parts = la.results.map(r => {
      const sold = r.entries.filter(e => e.sold).map(e => `${pname(s, e.pid)} ${e.price}×${e.sold}`).join('、') || '売れず';
      return `${E.MK[r.m].name}：${sold}`;
    });
    return `<p class="note">直前の入札（親：${pname(s, la.parent)}）… ${parts.join(' ／ ')} <button class="btn small" data-a="showAuction">詳細</button></p>`;
  }

  // 現金の支払いと、支払い後の現金が期末費用の見込みを下回るときの注意
  function confirmLine(ctx, P, o) {
    const cost = o.cost || 0;
    const left = P.cash - cost;
    const endAfter = o.endAfter != null ? o.endAfter : E.estEndCost(ctx.s, P);
    const ready = o.ready !== false && cost <= P.cash;
    const warn = o.noWarn || !(o.ready !== false) || cost > P.cash ? '' : left < endAfter
      ? `<p class="warn-line">支払い後の現金 ${yen(left)} は、期末費用の見込み ${endAfter} より少なくなります（足りない分は期末に緊急借入）。</p>` : '';
    return `<div class="summary-line"><span>${o.msg || `支払い <span class="cost">${cost}</span> → 残り現金 ${yen(left)}`}</span><button class="btn primary" data-a="${o.act}" ${ready ? '' : 'disabled'}>${o.label}</button></div>${warn}`;
  }

  function preForm(ctx) {
    const s = ctx.s, P = s.players[ctx.actor], u = ctx.ui, f = u.f;
    const sub = u.choice;
    const ec = E.endCostBreakdown(s, P).r;
    const chipBtn = (c) => {
      const price = D.PRICE[c], has = P.chips[c];
      return `<button class="btn small" data-a="chip" data-v="${c}" ${has || P.cash < price ? 'disabled' : ''} title="${has ? 'この期は購入済み' : P.cash < price ? '現金が足りません' : ''}">${D.CHIPS[c].short} ${has ? '✓' : price}</button>`;
    };
    let subForm = '';
    if (sub === 'B:transfer') {
      const dir = f.trDir === 's2w' ? 's2w' : 'w2s';
      const max = dir === 'w2s' ? P.workers : P.salesmen;
      const n = Math.min(f.tr || 0, max);
      const delta = dir === 'w2s' ? n * (ec.s - ec.w) : n * (ec.w - ec.s);
      subForm = `<div class="seg wide" role="group" aria-label="配置転換の向き">
          <button type="button" class="${dir === 'w2s' ? 'on' : ''}" aria-pressed="${dir === 'w2s'}" data-a="trDir" data-v="w2s">ワーカー → セールスマン</button>
          <button type="button" class="${dir === 's2w' ? 'on' : ''}" aria-pressed="${dir === 's2w'}" data-a="trDir" data-v="s2w">セールスマン → ワーカー</button></div>
        <div class="form-rows"><div class="frow"><div class="t">人数<small>研修費 ${D.PRICE.transfer}/人（今 ワーカー${P.workers}人・セールスマン${P.salesmen}人）</small></div>${stepper('tr', n, 0, max, '配置転換する人数')}</div></div>
        ${confirmLine(ctx, P, { cost: n * D.PRICE.transfer, act: 'doTransfer', label: '配置転換する', ready: n > 0, endAfter: E.estEndCost(s, P) + delta })}`;
    } else if (sub === 'B:sellMachine') {
      subForm = `<div class="form-rows">${P.machines.map(m => `<div class="frow"><div class="t">${m.type === 'large' ? '大型機械' : '小型機械'}${m.att ? '＋アタッチメント' : ''}<small>簿価 ${m.bv + (m.att ? m.attBv : 0)}</small></div><div class="row">
        ${m.att ? `<button class="btn small" data-a="sellMachine" data-v="${m.id}" data-part="attach">アタッチのみ +${D.SELLBACK.attach}</button>` : ''}
        <button class="btn small" data-a="sellMachine" data-v="${m.id}" ${P.machines.length <= 1 ? 'disabled' : ''}>売却 +${D.SELLBACK[m.type] + (m.att ? D.SELLBACK.attach : 0)}</button></div></div>`).join('') || '<p class="note">機械がありません</p>'}</div>
        <p class="note">購入時の半額で売却。工場に機械が1台も無い状態にはできません。</p>`;
    } else if (sub === 'B:borrow') {
      const room = E.borrowRoom(P), amt = Math.min(f.borrow || 0, room - (room % R.loanUnit));
      const interest = Math.ceil(amt * P.rate);
      subForm = s.period <= 1 ? '<p class="note">1期目は借入できません。</p>' : `<div class="form-rows">
        <div class="frow"><div class="t">借入額（${R.loanUnit}単位）<small>借入枠 ${room}（純資産×${D.loanTerms(s.period).mult} − 残高）／金利${Math.round(P.rate * 100)}%を同時に支払い、残高には毎期首にも金利がかかる</small></div>${stepper('borrow', amt, 0, room - (room % R.loanUnit), '借入額', R.loanUnit)}</div>
      </div>${confirmLine(ctx, P, { cost: interest, act: 'doBorrow', label: '借入する', ready: amt > 0, noWarn: true, msg: `金利 <span class="cost">${interest}</span> を支払い、現金 +${amt}` })}`;
    } else if (sub === 'B:repay') {
      const max = Math.min(P.loan, Math.max(0, P.cash));
      const amt = Math.min(f.repay || 0, max);
      subForm = `<div class="form-rows"><div class="frow"><div class="t">返済額<small>借入残高 ${P.loan}（返した分は次の期首の金利がかからない）</small></div>${stepper('repay', amt, 0, max, '返済額')}</div></div>${confirmLine(ctx, P, { cost: amt, act: 'doRepay', label: '返済する', ready: amt > 0 })}`;
    }
    const bBtn = (k, label, dis, why) => `<button class="btn small ${sub === k ? 'primary' : ''}" data-a="choose" data-v="${k}" aria-pressed="${sub === k}" ${dis ? `disabled title="${why}"` : ''}>${label}</button>`;
    return `<h3>${esc(P.company)}の手番</h3>
      <p class="lead">必要ならルールB（何回でも）。準備ができたら意思決定カードを引きます。</p>
      <div class="ruleb">
        ${Object.keys(D.CHIPS).map(chipBtn).join('')}
        ${bBtn('B:transfer', '配置転換', !P.workers && !P.salesmen, '人がいません')}
        ${bBtn('B:sellMachine', '機械売却', !P.machines.length, '機械がありません')}
        ${bBtn('B:borrow', '銀行借入', s.period <= 1, '1期目は借入できません')}
        ${bBtn('B:repay', '借入返済', !P.loan, '借入金がありません')}
      </div>
      ${subForm}
      ${u.err ? `<p class="err" role="alert">${esc(u.err)}</p>` : ''}
      <button class="btn primary big" data-a="draw">意思決定カードを引く</button>`;
  }

  const CHOICES = [
    ['buyMat', '材料購入', 'マーケットから仕入れ'],
    ['buyEquip', '設備投資', `小型${D.PRICE.small}・大型${D.PRICE.large}`],
    ['produce', '完成・投入', `完成${D.PRICE.complete}・投入${D.PRICE.insert}／個`],
    ['hire', '採用', `1人${D.PRICE.hire}`],
    ['ad', '広告', `赤チップ${D.PRICE.red}`],
    ['rd', '研究開発', `青チップ${D.PRICE.blue}`],
    ['sell', '商品販売', '入札で販売'],
    ['pass', '何もしない', 'パス'],
  ];

  // 選べない理由（選べるなら空）
  function whyDisabled(s, P) {
    const pc = E.prodCap(P), sc = E.salesCap(P);
    const disc = P.chips.md ? R.mdDiscount : 0;
    const cheapest = Math.min(D.STOCKER_PRICE, ...D.MARKETS.filter(mk => s.markets.find(m => m.id === mk.id).mats > 0).map(mk => mk.mat)) - disc;
    const bareSmall = P.machines.some(m => m.type === 'small' && !m.att);
    return {
      buyMat: P.cash < cheapest ? '現金が足りません' : '',
      buyEquip: P.cash < Math.min(D.PRICE.small, D.PRICE.large, bareSmall ? D.PRICE.attach : Infinity) ? '現金が足りません' : '',
      produce: !P.machines.length ? '機械がありません' : !pc ? 'ワーカーがいません' : (!P.wip && !P.mat) ? '材料・仕掛品がありません' : P.cash < Math.min(D.PRICE.complete, D.PRICE.insert) ? '現金が足りません' : '',
      hire: P.cash < D.PRICE.hire ? '現金が足りません' : '',
      ad: !P.salesmen ? 'セールスマンが必要です' : P.chips.red >= R.adPerSalesman * P.salesmen ? '上限まで出しています' : P.cash < D.PRICE.red ? '現金が足りません' : '',
      rd: P.cash < D.PRICE.blue ? '現金が足りません' : '',
      sell: !P.prod ? '製品がありません' : !sc ? 'セールスマンが必要です' : s.markets.every(m => E.empty(s, m.id) === 0) ? 'マーケットに空きがありません' : '',
      pass: '',
    };
  }

  function decideForm(ctx) {
    const s = ctx.s, P = s.players[ctx.actor], u = ctx.ui, f = u.f;
    const pc = E.prodCap(P);
    const why = whyDisabled(s, P);
    const ec = E.endCostBreakdown(s, P).r, est = E.estEndCost(s, P);
    const c = u.choice;
    const grid = CHOICES.map(([k, l, d]) => `<button class="choice ${c === k ? 'sel' : ''}" data-a="choose" data-v="${k}" aria-pressed="${c === k}" ${why[k] ? `disabled title="${why[k]}"` : ''}><b>${l}</b><span>${why[k] ? why[k] : d}</span></button>`).join('');
    let form = '';
    if (c === 'buyMat') {
      const disc = P.chips.md ? R.mdDiscount : 0;
      let cost = 0, qty = 0;
      const rows = D.MARKETS.map(mk => {
        const m = s.markets.find(x => x.id === mk.id), q = Math.min(f['m_' + mk.id] || 0, m.mats);
        cost += q * (mk.mat - disc); qty += q;
        return `<div class="frow ${m.mats ? '' : 'dis'}"><div class="t">${mk.name}　${mk.mat - disc}/個<small>残り${m.mats}個${disc ? `（MD −${disc}）` : ''}・買うと空きができる（上限価格${mk.cap}）</small></div>${stepper('m_' + mk.id, q, 0, m.mats, `${mk.name}で買う材料の数`)}</div>`;
      }).join('');
      const qs = f.m_stocker || 0; cost += qs * (D.STOCKER_PRICE - disc); qty += qs;
      form = `<div class="form-rows">${rows}<div class="frow"><div class="t">ストッカー　${D.STOCKER_PRICE - disc}/個<small>無制限（マーケットに空きはできません）</small></div>${stepper('m_stocker', qs, 0, 30, 'ストッカーで買う材料の数')}</div></div>
        <p class="note">マーケットから材料を買うと、そのマーケットに空きができ、製品を売れるようになります。</p>
        ${confirmLine(ctx, P, { cost, act: 'doBuyMat', label: `${qty}個 購入`, ready: qty > 0 })}`;
    } else if (c === 'buyEquip') {
      const small = f.small || 0, large = f.large || 0;
      const freeSmall = P.machines.filter(m => m.type === 'small' && !m.att).length + small;
      const attach = Math.min(f.attach || 0, freeSmall);
      const cost = small * D.PRICE.small + attach * D.PRICE.attach + large * D.PRICE.large;
      form = `<div class="form-rows">
        <div class="frow"><div class="t">小型機械 ${D.PRICE.small}<small>生産能力${R.capSmall}・ワーカー1人必要・期末に製造経費${ec.m}</small></div>${stepper('small', small, 0, 5, '小型機械の台数')}</div>
        <div class="frow"><div class="t">アタッチメント ${D.PRICE.attach}<small>小型機械の生産能力+${R.capAttach}（小型1台に1つ）</small></div>${stepper('attach', attach, 0, freeSmall, 'アタッチメントの数')}</div>
        <div class="frow"><div class="t">大型機械 ${D.PRICE.large}<small>生産能力${R.capLarge}・ワーカー1人必要・期末に製造経費${ec.m}</small></div>${stepper('large', large, 0, 3, '大型機械の台数')}</div>
      </div>${confirmLine(ctx, P, { cost, act: 'doBuyEquip', label: '購入する', ready: small + attach + large > 0, endAfter: est + (small + large) * ec.m })}`;
    } else if (c === 'produce') {
      const cMax = Math.min(pc, P.wip), iMax = Math.min(pc, P.mat);
      const cv = Math.min(f.complete == null ? cMax : f.complete, cMax), iv = Math.min(f.insert == null ? iMax : f.insert, iMax);
      form = `<p class="note">生産能力 ${pc}。完成（仕掛品→製品）を先に、続けて投入（材料→仕掛品）を行います。それぞれ生産能力まで。</p>
        <div class="form-rows">
          <div class="frow"><div class="t">完成　${D.PRICE.complete}/個<small>仕掛品 ${P.wip}個</small></div>${stepper('complete', cv, 0, cMax, '完成する個数')}</div>
          <div class="frow"><div class="t">投入　${D.PRICE.insert}/個<small>材料 ${P.mat}個</small></div>${stepper('insert', iv, 0, iMax, '投入する個数')}</div>
        </div>${confirmLine(ctx, P, { cost: cv * D.PRICE.complete + iv * D.PRICE.insert, act: 'doProduce', label: '完成・投入する', ready: cv + iv > 0 })}`;
    } else if (c === 'hire') {
      const w = f.w || 0, sm = f.s || 0;
      form = `<div class="form-rows">
        <div class="frow"><div class="t">ワーカー<small>機械1台に1人必要（今 機械${P.machines.length}台・ワーカー${P.workers}人）・期末に労務費${ec.w}</small></div>${stepper('w', w, 0, 10, '採用するワーカーの人数')}</div>
        <div class="frow"><div class="t">セールスマン<small>1人で${R.salesPerSalesman}個販売可・期末に販売費${ec.s}</small></div>${stepper('s', sm, 0, 10, '採用するセールスマンの人数')}</div>
      </div><p class="note">会社都合で退職させることはできません。1人につき一般管理費${ec.a}も期末にかかります。</p>
      ${confirmLine(ctx, P, { cost: (w + sm) * D.PRICE.hire, act: 'doHire', label: '採用する', ready: w + sm > 0, endAfter: est + w * (ec.w + ec.a) + sm * (ec.s + ec.a) })}`;
    } else if (c === 'ad') {
      const max = Math.max(0, R.adPerSalesman * P.salesmen - P.chips.red);
      const n = Math.max(1, Math.min(f.n || 1, max));
      form = `<div class="form-rows"><div class="frow"><div class="t">広告（赤チップ）${D.PRICE.red}/枚<small>1枚で販売能力+${R.salesPerAd}。セールスマン1人につき${R.adPerSalesman}枚まで（あと${max}枚）</small></div>${stepper('n', n, 1, max, '広告の枚数')}</div></div>${confirmLine(ctx, P, { cost: n * D.PRICE.red, act: 'doAd', label: '広告を出す' })}`;
    } else if (c === 'rd') {
      form = `<p class="note">青チップ1枚につき入札の競争価格が${R.blueEdge}安くなります（1回に1枚）。同価格のときは青チップの多い人が優先。</p>${confirmLine(ctx, P, { cost: D.PRICE.blue, act: 'doRd', label: '研究開発する' })}`;
    } else if (c === 'sell') {
      form = sellForm(ctx, P);
    } else if (c === 'pass') {
      form = `<p class="note">今回は何もしません。</p><div class="summary-line"><span></span><button class="btn primary" data-a="doPass">パスする</button></div>`;
    }
    return `<h3>${esc(P.company)}：意思決定（ルールAから1つ）</h3>
      <div class="choice-grid ${c ? 'compact' : ''}">${grid}</div>
      ${form}
      ${u.err ? `<p class="err" role="alert">${esc(u.err)}</p>` : ''}`;
  }

  // 販売宣言：マーケットと個数だけ。価格は参加者が決まってから
  function sellForm(ctx, P) {
    const s = ctx.s, f = ctx.ui.f;
    const limit = Math.min(E.salesCap(P), P.prod);
    let total = 0;
    D.MARKETS.forEach(mk => { total += Math.min(f['q_' + mk.id] || 0, E.empty(s, mk.id)); });
    const rows = D.MARKETS.map(mk => {
      const e = E.empty(s, mk.id), q = Math.min(f['q_' + mk.id] || 0, e);
      const max = Math.min(e, q + Math.max(0, limit - total));
      return `<div class="frow ${e ? '' : 'dis'}"><div class="t">${mk.name}　上限価格${mk.cap}<small>空き${e}個</small></div>${stepper('q_' + mk.id, q, 0, max, `${mk.name}で売る個数`)}</div>`;
    }).join('');
    return `<p class="note">販売能力 ${E.salesCap(P)}・製品 ${P.prod}個 → 最大 ${limit}個。まずマーケットと個数を宣言します。<b>ほかの会社が参加するかと個数を決めたあと</b>、参加者全員で入札価格を決めます（参加者がいなければ上限価格で売れます）。</p>
      <div class="form-rows">${rows}</div>
      <div class="summary-line"><span>販売宣言 <span class="cost">${total}</span>個</span><button class="btn primary" data-a="doSell" ${total ? '' : 'disabled'}>販売を宣言する</button></div>`;
  }

  // 入札の公開情報：マーケットごとの空き・親と参加者の個数
  function auctionInfo(s) {
    const pd = s.pending;
    return `<div class="ainfo">${E.auctionSummary(s).map(x => {
      const mk = E.MK[x.m];
      const joined = pd.stage !== 'join' || Object.keys(pd.joins).length;
      const kids = x.kids.map(k => `${pname(s, k.pid)} ${k.q}個`).join('、');
      const verdict = pd.stage === 'join' ? '' : x.kids.length === 0 ? '<span class="tag ok">参加者なし</span>'
        : x.allSell ? '<span class="tag ok">全員分の空きあり＝全員売れる</span>' : `<span class="tag ng">空き${x.room}に${x.total}個：競争価格の安い順に${x.room}個まで</span>`;
      return `<div class="arow"><b>${mk.name}</b><span class="note">空き${x.room}・上限${mk.cap}</span><span>親 ${pname(s, pd.parent)} ${x.parentQ}個${joined ? `／参加 ${kids || 'なし'}` : ''}</span>${verdict}</div>`;
    }).join('')}</div>`;
  }

  function auctionPanel(ctx) {
    const s = ctx.s, pd = s.pending, actor = ctx.actor;
    const head = `<h3>${pname(s, pd.parent)}が販売中：${pd.offers.map(o => `${E.MK[o.m].name} ${o.q}個`).join('・')}</h3>`;
    const steps = `<ol class="steps" aria-label="入札の段階">${[['join', '参加と個数'], ['price', '入札価格'], ['rebid', '再入札']].filter(([k]) => k !== 'rebid' || pd.stage === 'rebid').map(([k, l]) => `<li class="${pd.stage === k ? 'on' : ''}">${l}</li>`).join('')}</ol>`;
    const mine = actor && pd.waiting.includes(actor);
    if (mine && pd.stage === 'join') return head + steps + joinForm(ctx, actor);
    if (mine && (pd.stage === 'price' || pd.stage === 'rebid')) {
      if (ctx.needCover && ctx.ui.revealed !== actor) {
        return head + steps + `<div class="cover"><div class="big">${pname(s, actor)}の${pd.stage === 'rebid' ? '再入札' : '入札価格'}</div><p class="lead">入札価格はほかの人に見えないように入力してください。</p><button class="btn primary" data-a="reveal" data-v="${actor}">${pname(s, actor)}が入力する</button></div>`;
      }
      return head + steps + (pd.stage === 'rebid' ? rebidForm(ctx, actor) : priceForm(ctx, actor));
    }
    const names = pd.waiting.map(id => pname(s, id)).join('、');
    const label = pd.stage === 'join' ? '参加するか決めています' : pd.stage === 'price' ? '入札価格を決めています' : '再入札しています';
    const reTxt = pd.stage === 'rebid' ? `<p class="lead">${Object.entries(pd.rebid).map(([m, r]) => `${E.MK[m].name}は全員が競争価格${r.comp}で同じため親の負け。`).join('')}子だけで再入札しています。</p>` : '';
    return head + steps + reTxt + auctionInfo(s) + `<div class="waiting"><span class="spinner"></span><span>${label}：${names || '集計中'}</span></div>${offlineHelp(ctx, pd.waiting)}${recentFeed(s)}`;
  }

  function joinForm(ctx, pid) {
    const s = ctx.s, P = s.players[pid], f = ctx.ui.f, pd = s.pending;
    const limit = Math.min(E.salesCap(P), P.prod);
    let total = 0;
    pd.offers.forEach(o => { total += Math.min(f['jq_' + o.m] || 0, o.q); });
    const rows = pd.offers.map(o => {
      const mk = E.MK[o.m], q = Math.min(f['jq_' + o.m] || 0, o.q);
      const max = Math.min(o.q, q + Math.max(0, limit - total));
      return `<div class="frow"><div class="t">${mk.name}（親が${o.q}個）<small>空き${E.empty(s, o.m)}・上限価格${mk.cap}</small></div>${stepper('jq_' + o.m, q, 0, max, `${mk.name}で参加する個数`)}</div>`;
    }).join('');
    return `<p class="lead">${pname(s, pid)}：入札に参加するか、何個出すかを決めます（販売能力 ${E.salesCap(P)}・製品 ${P.prod}個）。1人あたり親が出した個数まで。<b>参加と個数は全員に公開</b>され、そのあと参加者全員が入札価格を隠して決めます。</p>
      <div class="form-rows">${rows}</div>
      ${ctx.ui.err ? `<p class="err" role="alert">${esc(ctx.ui.err)}</p>` : ''}
      <div class="summary-line"><button class="btn" data-a="joinAuction" data-v="none">参加しない</button><button class="btn primary" data-a="joinAuction" ${total ? '' : 'disabled'}>${total}個で参加する</button></div>`;
  }

  function priceForm(ctx, pid) {
    const s = ctx.s, P = s.players[pid], f = ctx.ui.f, pd = s.pending;
    const isParent = pid === pd.parent;
    const sum = Object.fromEntries(E.auctionSummary(s).map(x => [x.m, x]));
    const markets = isParent ? E.parentPriceMarkets(s) : (pd.joins[pid] || []).map(j => j.m);
    const edge = (isParent ? R.parentEdge : 0) + R.blueEdge * P.chips.blue;
    const rows = markets.map(m => {
      const mk = E.MK[m], x = sum[m];
      const p = f['pp_' + m] == null ? mk.cap : f['pp_' + m];
      const myQ = isParent ? x.parentQ : x.kids.find(k => k.pid === pid).q;
      const hint = x.allSell ? '全員分の空きがあるので、価格に関係なく売れます' : `空き${x.room}に${x.total}個。競争価格の安い順に売れます`;
      return `<div class="frow"><div class="t">${mk.name}（${myQ}個）上限${mk.cap}<small>競争価格 ${p - edge}${P.chips.mr ? `／売上単価 ${Math.min(p + R.mrBonus, mk.cap)}` : ''}・${hint}</small></div>${stepper('pp_' + m, p, 1, mk.cap, `${mk.name}の入札価格`)}</div>`;
    }).join('');
    const auto = isParent ? pd.offers.filter(o => !markets.includes(o.m)).map(o => `${E.MK[o.m].name} ${o.q}個は参加者がいないので上限価格${E.MK[o.m].cap}で売れます。`).join('') : '';
    return `<p class="lead">${pname(s, pid)}：入札価格（プライスカード）を決めます。競争価格＝入札価格${isParent ? ` −${R.parentEdge}（親）` : ''} −${R.blueEdge}×青チップ（${P.chips.blue}枚）。安い順に、マーケットの空きの数まで売れます。</p>
      ${auctionInfo(s)}
      <div class="form-rows">${rows}</div>
      ${auto ? `<p class="note">${auto}</p>` : ''}
      ${ctx.ui.err ? `<p class="err" role="alert">${esc(ctx.ui.err)}</p>` : ''}
      <div class="summary-line"><span></span><button class="btn primary" data-a="setPrices">入札価格を決定</button></div>`;
  }

  function rebidForm(ctx, pid) {
    const s = ctx.s, P = s.players[pid], f = ctx.ui.f, pd = s.pending;
    const mine = Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(pid));
    const rows = mine.map(([m, r]) => {
      const mk = E.MK[m];
      const orig = r.comp + R.blueEdge * P.chips.blue;
      const p = f['rp_' + m] == null ? Math.max(1, Math.min(mk.cap, orig - 1)) : f['rp_' + m];
      return `<div class="frow"><div class="t">${mk.name}　前回は全員が競争価格${r.comp}<small>入札価格 ${p} → 競争価格 ${p - R.blueEdge * P.chips.blue}（親は外れています）</small></div>${stepper('rp_' + m, p, 1, mk.cap, `${mk.name}の再入札価格`)}</div>`;
    }).join('');
    return `<p class="lead">全員の競争価格が同じだったので親の負けです。マーケットの空きに全員分が入らないため、子だけで価格を出し直します（個数は参加したときのまま）。</p>
      <div class="form-rows">${rows}</div>
      ${ctx.ui.err ? `<p class="err" role="alert">${esc(ctx.ui.err)}</p>` : ''}
      <div class="summary-line"><button class="btn" data-a="rebid" data-v="none">辞退する</button><button class="btn primary" data-a="rebid">再入札する</button></div>`;
  }

  function riskForm(ctx) {
    const s = ctx.s, pd = s.pending, P = s.players[pd.pid], f = ctx.ui.f;
    const q = Math.min(f.rq == null ? pd.max : f.rq, pd.max);
    if (pd.kind === 'special') {
      return `<h3>リスクカード：材料の特別購入</h3><p class="lead">材料を単価${pd.price}で${pd.max}個まで購入できます。</p>
        <div class="form-rows"><div class="frow"><div class="t">購入数<small>現金 ${P.cash}</small></div>${stepper('rq', q, 0, pd.max, '購入数')}</div></div>
        ${confirmLine(ctx, P, { cost: q * pd.price, act: 'doRisk', label: '決定' })}`;
    }
    const mk = E.MK[pd.market];
    return `<h3>リスクカード：独占販売</h3><p class="lead">${mk.name}で、上限価格 ${pd.price} で製品を${pd.max}個まで入札なしで販売できます。</p>
      <div class="form-rows"><div class="frow"><div class="t">販売数<small>製品 ${P.prod}個</small></div>${stepper('rq', q, 0, pd.max, '販売数')}</div></div>
      <div class="summary-line"><span>売上 <span class="cost">${q * pd.price}</span></span><button class="btn primary" data-a="doRisk">決定</button></div>`;
  }

  // 純資産の多い順。同じなら同順位
  function ranking(s) {
    const list = s.order.map(id => s.players[id]).sort((a, b) => E.netAssets(b) - E.netAssets(a));
    let rank = 0;
    return list.map((P, i) => { if (i === 0 || E.netAssets(P) !== E.netAssets(list[i - 1])) rank = i + 1; return { P, rank }; });
  }

  function periodEndPanel(ctx) {
    const s = ctx.s, over = s.phase === 'over';
    const ranked = ranking(s);
    const winners = ranked.filter(x => x.rank === 1).map(x => esc(x.P.company)).join('・');
    const rows = ranked.map(({ P, rank }) => {
      const h = P.history[P.history.length - 1] || { PQ: 0, G: 0, net: 0 };
      return `<tr class="${rank === 1 ? 'top' : ''}"><td>${over && rank === 1 ? '<span class="medal">1</span>' : rank}</td><td class="nm">${swatch(P)}${esc(P.company)}</td><td><b>${sgn(E.netAssets(P))}</b></td><td>${sgn(h.net)}</td><td class="hide-sm">${sgn(h.G)}</td><td class="hide-sm">${h.PQ}</td></tr>`;
    }).join('');
    return panel(`<h3>${over ? `ゲーム終了：${winners}の勝ち` : `第${s.period}期 決算`}</h3>
      <div class="scroll-x"><table class="rank"><thead><tr><th>順位</th><th class="nm">会社</th><th>純資産</th><th>当期純利益</th><th class="hide-sm">経常利益</th><th class="hide-sm">売上高</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row">
        <button class="btn" data-a="books" data-v="fin">決算書を見る</button>
        ${over ? '<button class="btn primary" data-a="home">タイトルへ</button>' : ctx.canAdvance ? `<button class="btn primary" data-a="nextPeriod">第${s.period + 1}期へ進む</button>` : '<span class="note">ホストが次の期を開始するのを待っています</span>'}
      </div>`);
  }

  // ---------- 他社・ログ ----------
  function others(s, ctx) {
    return `<p class="section-title">各社の状況</p><div class="others">${s.order.map(id => {
      const P = s.players[id];
      const turn = s.phase === 'turn' && E.curPid(s) === id;
      const off = ctx.isHost && ctx.online && P.ctrl === 'remote' && ctx.online[id] === false;
      return `<button class="other ${turn ? 'turn' : ''}" data-a="view" data-v="${id}" aria-label="${esc(P.company)}の会社盤を見る">
        <span class="nm">${swatch(P)}${esc(P.company)}<span class="tag">${ctrlTag(P)}</span>${off ? '<span class="tag off">切断中</span>' : ''}${turn ? '<span class="tag turn">手番</span>' : ''}</span>
        <span class="stats"><span>現金 <b>${yen(P.cash)}</b></span><span>材料 <b>${P.mat}</b></span><span>製品 <b>${P.prod}</b></span>
        <span>生産 <b>${E.prodCap(P)}</b></span><span>販売 <b>${E.salesCap(P)}</b></span><span>青 <b>${P.chips.blue}</b></span></span>
      </button>`;
    }).join('')}</div>`;
  }

  function logPanel(s) {
    const items = s.log.slice(-80).map(l => `<li class="${l.pid ? '' : 'sys'}"><span class="who">${l.pid ? pname(s, l.pid) : `第${l.p}期`}</span><span>${esc(l.t)}</span></li>`).join('');
    return `<p class="section-title">記録（下が最新）</p><div class="log" tabindex="0" aria-label="記録"><ol>${items}</ol></div>`;
  }

  const SPEEDS = [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', '速い']];
  const speedSelect = (speed, id) => `<select id="${id}" data-speed="1" aria-label="CPUの速さ">${SPEEDS.map(([v, l]) => `<option value="${v}" ${speed === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

  function topbar(ctx) {
    const s = ctx.s, n = s.order.length;
    const total = s.cfg.rounds * n, done = total - Math.max(0, s.turnsLeft);
    const cur = s.players[E.curPid(s)];
    return `<header class="topbar">
      <span class="period-badge">第${s.period}期<small>／${s.cfg.periods}期</small></span>
      <span class="turns"><small><span class="hide-sm">残り手番 </span>残り${Math.max(0, s.turnsLeft)}</small><span class="turnbar"><i style="width:${Math.round(done / total * 100)}%"></i></span></span>
      ${s.phase === 'turn' || s.phase === 'auction' || s.phase === 'risk' ? `<span class="now">${swatch(cur)}<span class="nowname">${esc(cur.company)}<span class="hide-sm">の手番${s.dir < 0 ? '（逆回り）' : ''}</span></span></span>` : ''}
      <span class="spacer"></span>
      ${ctx.connLabel ? `<span class="conn ${ctx.connOk ? 'ok' : 'ng'}" title="${esc(ctx.connLabel)}"><span class="hide-sm">${esc(ctx.connLabel)}</span></span>` : ''}
      ${ctx.mode !== 'guest' ? `<label class="conn hide-sm" for="speed">CPU速度</label><span class="hide-sm">${speedSelect(ctx.speed, 'speed')}</span>` : ''}
      <button class="btn small ghost hide-sm" data-a="rules">ルール</button>
      <button class="btn small ghost" data-a="menu">メニュー</button>
    </header>`;
  }

  function game(ctx) {
    const s = ctx.s;
    return `<div class="game" data-key="game">${topbar(ctx)}
      <main class="layout">
        <section class="area-board board-wrap" aria-label="ボード">${board(s)}</section>
        <section class="area-action" aria-label="操作">${action(ctx)}${marketStrip(s)}</section>
        <section class="area-company" aria-label="会社盤">${company(s, ctx.viewPid)}</section>
        <section class="area-others" aria-label="各社の状況">${others(s, ctx)}</section>
        <section class="area-log" aria-label="記録">${logPanel(s)}</section>
      </main></div>`;
  }

  // ---------- モーダル ----------
  function modal(inner, opts = {}) {
    return `<div class="modal-back" data-a="closeModal" data-key="${esc(opts.key || 'modal')}"><div class="sheet modal ${opts.narrow ? 'narrow' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || '')}" data-stop="1">${inner}</div></div>`;
  }
  const closeBtn = '<button class="btn small" data-a="closeModal" data-autofocus="1">閉じる</button>';

  function books(ctx) {
    const s = ctx.s, m = ctx.modal, pid = m.pid || ctx.viewPid, P = s.players[pid];
    const tabs = `<div class="tabs" role="tablist" aria-label="帳票">${[['ledger', '現金出納帳'], ['fin', '決算書'], ['rank', '順位表']].map(([k, l]) => `<button class="tab ${m.tab === k ? 'on' : ''}" role="tab" aria-selected="${m.tab === k}" data-a="books" data-v="${k}">${l}</button>`).join('')}</div>`;
    const ptabs = m.tab === 'rank' ? '' : `<div class="tabs" role="tablist" aria-label="会社">${s.order.map(id => `<button class="tab ${id === pid ? 'on' : ''}" role="tab" aria-selected="${id === pid}" data-a="booksPid" data-v="${id}">${swatch(s.players[id])}${esc(s.players[id].company)}</button>`).join('')}</div>`;
    let body = '', per = '';
    if (m.tab === 'ledger') {
      per = m.period || s.period;
      const hist = P.history.find(h => h.period === per);
      const rows = per === s.period && !(s.phase === 'periodEnd' || s.phase === 'over') ? P.ledger : (hist ? hist.ledger : P.ledger);
      const periods = [...new Set([...P.history.map(h => h.period), s.period])];
      body = `<div class="tabs" role="tablist" aria-label="期">${periods.map(p => `<button class="tab ${p === per ? 'on' : ''}" role="tab" aria-selected="${p === per}" data-a="booksPeriod" data-v="${p}">第${p}期</button>`).join('')}</div><div class="scroll-x">${ledgerTable(rows)}</div>`;
    } else if (m.tab === 'fin') {
      if (!P.history.length) body = '<p class="note">まだ決算がありません。期末処理のあとに表示されます。</p>';
      else {
        per = m.period && P.history.find(h => h.period === m.period) ? m.period : P.history[P.history.length - 1].period;
        const h = P.history.find(x => x.period === per);
        body = `<div class="tabs" role="tablist" aria-label="期">${P.history.map(x => `<button class="tab ${x.period === per ? 'on' : ''}" role="tab" aria-selected="${x.period === per}" data-a="booksPeriod" data-v="${x.period}">第${x.period}期</button>`).join('')}</div>` + finance(h);
      }
    } else body = `<div class="scroll-x">${rankTable(s)}</div>`;
    const ttl = m.tab === 'rank' ? '順位表' : esc(P.company) + (m.tab === 'ledger' ? ' 現金出納帳' : ' 決算書');
    return modal(`<div class="modal-head"><h2>${ttl}</h2>${closeBtn}</div>${tabs}${ptabs}${body}`, { key: `books-${m.tab}-${m.tab === 'rank' ? '' : pid}-${per}`, label: ttl.replace(/<[^>]+>/g, '') });
  }

  function ledgerTable(rows) {
    const ins = D.COLS_IN, outs = D.COLS_OUT;
    const tot = {};
    const body = rows.map((l, i) => {
      if (l.c) tot[l.c] = (tot[l.c] || 0) + l.a;
      return `<tr><td>${i}</td><td class="d">${esc(l.d)}</td>${ins.map(c => `<td class="inc">${l.c === c ? l.a : ''}</td>`).join('')}${outs.map(c => `<td class="outc">${l.c === c ? l.a : ''}</td>`).join('')}<td>${yen(l.bal)}</td></tr>`;
    }).join('');
    const tin = ins.reduce((a, c) => a + (tot[c] || 0), 0), tout = outs.reduce((a, c) => a + (tot[c] || 0), 0);
    return `<table class="ledger"><thead>
      <tr><th rowspan="2">No</th><th rowspan="2">摘要</th><th class="in" colspan="${ins.length}">入金</th><th class="out" colspan="${outs.length}">出金</th><th class="bal" rowspan="2">現金残高</th></tr>
      <tr>${ins.map(c => `<th class="in">${c}<br>${D.COLS[c]}</th>`).join('')}${outs.map(c => `<th class="out">${c}<br>${D.COLS[c]}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td></td><td class="d">合計（入金 ${tin}／出金 ${tout}）</td>${ins.map(c => `<td>${tot[c] || ''}</td>`).join('')}${outs.map(c => `<td>${tot[c] || ''}</td>`).join('')}<td></td></tr></tfoot></table>`;
  }

  // STRAC 図：左から PQ ｜ VQ と MQ ｜ F と G。高さは金額に比例し、F＋G は MQ の高さにそろう（赤字なら F が MQ をはみ出す）
  function stracChart(h) {
    const { PQ, VQ, MQ, F, G } = h;
    const mq = Math.max(MQ, 0);
    const top = Math.max(PQ, VQ + mq, F, mq, 1);
    const pct = (v) => Math.max(0, v) / top * 100;
    const blk = (cls, label, v, y, hgt) => {
      const hp = pct(hgt);
      return hp <= 0 ? '' : `<div class="blk ${cls}" style="bottom:${pct(y).toFixed(2)}%;height:${hp.toFixed(2)}%"><span class="${hp < 16 ? 'tight' : ''}"><small>${label}</small><b>${yen(v)}</b></span></div>`;
    };
    const col3 = G >= 0
      ? blk('g', '経常利益 G', G, 0, G) + blk('f', '固定費 F', F, G, F)
      : blk('f', '固定費 F', F, 0, F) + blk('g loss', '経常利益 G', G, mq, Math.max(0, F - mq));
    return `<div class="strac" role="img" aria-label="STRAC図：売上高${PQ}、変動費${VQ}、付加価値${MQ}、固定費${F}、経常利益${G}">
        <div class="scol">${blk('pq', '売上高 PQ', PQ, 0, PQ)}</div>
        <div class="scol">${blk('mq', '付加価値 MQ', MQ, 0, mq)}${blk('vq', '変動費 VQ', VQ, mq, VQ)}</div>
        <div class="scol">${col3}</div>
      </div>
      <ul class="strac-key">
        <li><i class="pq"></i>売上高 PQ <b>${PQ}</b></li><li><i class="vq"></i>変動費 VQ <b>${VQ}</b></li><li><i class="mq"></i>付加価値 MQ <b>${sgn(MQ)}</b></li>
        <li><i class="f"></i>固定費 F <b>${F}</b></li><li><i class="g ${G < 0 ? 'loss' : ''}"></i>経常利益 G <b>${sgn(G)}</b></li>
      </ul>`;
  }

  function finance(h) {
    const t = (rows) => `<table class="fin-t">${rows.map(([k, v, cls]) => `<tr class="${cls || ''}"><th>${k}</th><td>${typeof v === 'number' ? sgn(v) : v}</td></tr>`).join('')}</table>`;
    const c = h.cost;
    const costBox = (x, inLabel, procLabel, lossLabel, outLabel) => t([
      ['前期繰越', `${x.openQ}個 ${x.openV}`],
      [inLabel, `${x.inQ}個 ${x.inV}`],
      ...(procLabel ? [[procLabel, x.procV]] : []),
      ['合計', `${x.totQ}個 ${x.totV}`, 'total'],
      ['平均単価', x.avg],
      [lossLabel, `${x.lossQ}個 ${x.lossV}`],
      ['次期繰越', `${x.closeQ}個 ${x.closeV}`],
      [outLabel, `${x.outQ}個 ${x.outV}`, 'total'],
    ]);
    const F = h.Fd;
    const ec = h.endCost;
    return `<div class="fin-grid">
      <div class="fin"><h3><span class="no">20</span>戦略会計 STRAC</h3>${stracChart(h)}
        ${t([['売上単価 P', h.P], ['変動単価 vP', h.vP], ['付加価値単価 mP', h.P - h.vP], ['販売個数 Q', h.Q], ['付加価値率 m率', h.PQ ? Math.round(h.MQ / h.PQ * 100) + '%' : '−'], ['損益分岐点比率 F/MQ', h.MQ > 0 ? Math.round(h.F / h.MQ * 100) + '%' : '−']])}</div>
      <div class="fin"><h3><span class="no">19</span>固定費 F</h3>${t([['減価償却費', F.dep], ['労務費 シ', F.シ], ['製造経費 ス', F.ス], ['販売費 セ', F.セ], ['一般管理費 ソ', F.ソ], ['営業外費用 タ', F.タ], ['研究開発費 チ', F.チ], ['固定費合計', h.F, 'total']])}
        <p class="note">期末費用：ワーカー${ec.r.w}×人数、機械${ec.r.m}×延べ${ec.machines}台、セールスマン${ec.r.s}×人数、一般管理費${ec.r.a}×${ec.heads}人${h.emergency ? `。資金不足のため緊急借入 ${h.emergency}` : ''}</p></div>
      <div class="fin"><h3><span class="no">22</span>損益と法人税</h3>${t([['付加価値 MQ', h.MQ], ['固定費 F', -h.F], ['経常利益 G', h.G, 'total'], ['火災損失', -h.special.fire], ['製造ミス損失', -h.special.mistake], ['盗難・減耗損失', -h.special.theft], ['機械の故障損失', -(h.special.machine || 0)], ['受取保険金', h.special.ins], ['機械売却損益', h.special.saleGain], ['税引前当期純利益', h.pretax, 'total'], ['前期繰越利益剰余金', h.prevRE], [`法人税等（${Math.round(D.TAX_RATE * 100)}%）`, -h.tax], ['当期純利益', h.net, 'total'], ['次期繰越利益剰余金', h.re]])}</div>
      <div class="fin"><h3><span class="no">23</span>貸借対照表 B/S</h3>${t([['現金', h.bs.cash], ['材料', h.bs.mat], ['仕掛品', h.bs.wip], ['製品', h.bs.prod], ['固定資産（機械）', h.bs.fixed], ['資産合計', h.bs.assets, 'total'], ['借入金', h.bs.loan], ['未払法人税等', h.bs.taxDue], ['負債合計', h.bs.liab, 'total'], ['資本金', h.bs.capital], ['繰越利益剰余金', h.bs.re], ['純資産合計', h.bs.equity, 'total'], ['差（0ならOK）', h.bs.diff]])}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　1.材料（倉庫）</h3>${costBox(c.m, '材料仕入', null, '火災', '投入材料費')}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　2.仕掛品（工場）</h3>${costBox(c.w, '投入材料費', '投入費 コ', '製造ミス', '当期製品製造原価')}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　3.製品（営業所）</h3>${costBox(c.p, '完成品', '完成費 サ', '盗難・減耗', '売上原価 VQ')}</div>
    </div>`;
  }

  function rankTable(s) {
    const ranked = ranking(s);
    const maxP = Math.max(0, ...ranked.map(({ P }) => P.history.length));
    const head = Array.from({ length: maxP }, (_, i) => `<th>第${i + 1}期 G</th>`).join('');
    return `<table class="rank"><thead><tr><th>順位</th><th class="nm">会社</th><th>純資産</th><th>借入金</th>${head}</tr></thead><tbody>${ranked.map(({ P, rank }) => `<tr class="${rank === 1 ? 'top' : ''}"><td>${rank}</td><td class="nm">${swatch(P)}${esc(P.company)}</td><td><b>${sgn(E.netAssets(P))}</b></td><td>${P.loan}</td>${Array.from({ length: maxP }, (_, k) => `<td>${P.history[k] ? sgn(P.history[k].G) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="note">勝敗は純資産（資本金${D.CAPITAL}＋繰越利益剰余金）で決まります。</p>`;
  }

  function auctionModal(s, la) {
    const rows = la.results.map(r => {
      const mk = E.MK[r.m];
      const pc = r.rebidComp != null ? r.rebidComp : (r.entries.find(e => e.parent) || {}).comp;
      const note = r.same ? `<p class="note">全員が競争価格${pc}で同じため親の負け${r.rebidComp != null ? '。子だけで再入札' : ''}</p>` : '';
      return `<div class="fin"><h3>${mk.name}（親が${r.q}個・空き${r.room != null ? r.room : r.q}個・上限${mk.cap}）</h3>${note}<table class="fin-t"><tr><th>順位</th><th>会社</th><td>入札</td><td>競争価格</td><td>販売</td></tr>${r.entries.map(e => `<tr><th>${e.withdrew ? '−' : e.rank}</th><th>${pname(s, e.pid)}${e.parent ? '（親）' : ''}</th><td>${e.p1 != null ? `${e.p1}→` : ''}${e.p}×${e.q}</td><td>${e.withdrew ? '辞退' : e.comp + (e.lost ? '（同じで負け）' : '')}</td><td>${e.sold ? `<b>${e.price}×${e.sold}</b>` : '−'}</td></tr>`).join('')}</table></div>`;
    }).join('');
    return modal(`<div class="modal-head"><h2>入札結果（親：${pname(s, la.parent)}）</h2>${closeBtn}</div>
      <p class="note">競争価格＝入札価格 −${R.parentEdge}（親）−${R.blueEdge}×青チップ。安い順に、マーケットの空きの数まで売れます（1人あたりは親が出した個数まで）。全員の競争価格が同じなら親の負けで、子だけで再入札。マーケットリサーチがあると売上単価が+${R.mrBonus}（上限まで）。</p>
      <div class="fin-grid">${rows}</div>`, { key: 'auction-' + (la.n || 0), label: '入札結果' });
  }

  function cardPop(s, lc, rest) {
    const who = pname(s, lc.pid);
    const P = s.players[lc.pid];
    if (lc.kind === 'risk') {
      const c = D.RISK_CARDS.find(x => x.id === lc.id);
      return `<div class="card-pop risk-back" data-a="closeCard" data-key="card-${lc.n}" role="dialog" aria-modal="true" aria-label="リスクカード ${esc(c.title)}"><div class="mgcard risk" tabindex="-1" data-autofocus="1"><div class="card-body">
        <div class="kind">RISK CARD</div><div class="who-big">${swatch(P)}${who}</div><h3>${esc(c.title)}</h3><p class="card-text">${esc(c.text)}</p>
        ${lc.detail ? `<p class="detail">${esc(lc.detail)}</p>` : ''}</div></div>
        <p class="close-hint">クリック・Enter で閉じる${rest ? `（あと${rest}枚）` : ''}</p></div>`;
    }
    return `<div class="card-pop" data-key="card-${lc.n}" aria-hidden="true"><div class="mgcard decision"><div class="card-body center">${markSvg('card-mark')}<b>${lc.kind === 'skip' ? '休み' : '意思決定カード'}</b><div class="who">${who}</div></div></div></div>`;
  }

  function rules() {
    const ec = Object.keys(D.END_COST).map(p => { const r = D.END_COST[p]; return `<tr><td>${p}期${+p === D.MAX_PERIODS ? '以降' : ''}</td><td>${r.w}(${r.wl})</td><td>${r.m}</td><td>${r.s}(${r.sl})</td><td>${r.a}</td></tr>`; }).join('');
    const mats = D.MARKETS.map(m => `${m.name}${m.mat}`).join(' ') + ` ストッカー${D.STOCKER_PRICE}`;
    const caps = D.MARKETS.map(m => `${m.name}${m.cap}`).join(' ');
    const lt = [1, 2, 4].map(p => D.loanTerms(p));
    return modal(`<div class="modal-head"><h2>製造業版 ジュニア・ルール表</h2>${closeBtn}</div>
    <div class="rules">
      <div><h3>1ターンでする事</h3><ol><li>（必要なら）ルールBを何回でも</li><li>意思決定カードを引く。${Math.round(1 / D.RISK_RATIO)}枚に1枚は「リスクカードを引く」で、その場合はリスクカードに従って終わり</li><li>ルールAの項目から1つ選んで実行</li></ol>
      <p>期首処理 → ゲーム → 期末処理・決算 を1期とし、何期か繰り返して純資産が最も多い人の勝ちです。各チップ（赤・青・緑・黄）は1期間のみ有効で、期末に全て返却します。</p></div>
      <div class="scroll-x"><h3>ルールA 意思決定（1回につき1つ）</h3><table>
        <tr><th>項目</th><th>単価</th><th>能力・効果・注意</th><th>科目</th></tr>
        <tr><td>材料購入</td><td>${mats}</td><td>マーケットをまたがって何個でも購入可能。買うとマーケットに空きができる</td><td>ツ 材料</td></tr>
        <tr><td>設備投資</td><td>小型機械${D.PRICE.small}／アタッチメント${D.PRICE.attach}／大型機械${D.PRICE.large}</td><td>生産能力 小型${R.capSmall}・大型${R.capLarge}（各ワーカー1人必要）。アタッチメントは小型機械の能力+${R.capAttach}</td><td>ケ 機械工具</td></tr>
        <tr><td>完成・投入</td><td>投入${D.PRICE.insert}／個・完成${D.PRICE.complete}／個</td><td>生産能力の範囲。完成から先に動かす</td><td>コ 投入費・サ 完成費</td></tr>
        <tr><td>採用</td><td>${D.PRICE.hire}／人</td><td>ワーカーは機械1台に1人必要。セールスマンは1人で${R.salesPerSalesman}個販売可。会社都合で退職させることはできない</td><td>ソ 一般管理費</td></tr>
        <tr><td>広告（赤）</td><td>${D.PRICE.red}</td><td>1枚で${R.salesPerAd}個販売可。セールスマン1人につき${R.adPerSalesman}枚まで有効</td><td>セ 販売費</td></tr>
        <tr><td>研究開発（青）</td><td>${D.PRICE.blue}</td><td>1枚につき${R.blueEdge}の価格競争力。1度に1枚</td><td>チ 研究開発費</td></tr>
        <tr><td>商品販売（入札）</td><td>上限 ${caps}</td><td>①親は販売能力以内で、マーケットと個数（空きの数まで）を宣言。②子は参加するかと個数（親が出した個数まで・自分の販売能力以内）を決める。参加と個数は公開。③参加者全員が入札価格を隠して決める。競争価格（入札価格 −${R.parentEdge}（親）−${R.blueEdge}×青チップ）の安い順に、マーケットの空きの数まで売れる。同価格は青チップの数、親の順。ただし全員の競争価格が同じなら親の負けで、親以外で再入札</td><td>キ 売上</td></tr>
      </table></div>
      <div class="scroll-x"><h3>ルールB（カードを引く前に何回でも）</h3><table>
        <tr><th>項目</th><th>単価</th><th>能力・効果</th><th>科目</th></tr>
        <tr><td>保険（黄）</td><td>${D.PRICE.yellow}</td><td>火災時に${D.INSURANCE.fire}／個、盗難時に${D.INSURANCE.theft}／個の保険金。受け取ったらチップを戻す</td><td>${D.CHIPS.yellow.col}</td></tr>
        <tr><td>PAC生産性（緑）</td><td>${D.PRICE.pac}（1枚のみ）</td><td>機械1台につき生産能力+${R.capPac}</td><td>${D.CHIPS.pac.col}</td></tr>
        <tr><td>マーチャンダイザー（緑）</td><td>${D.PRICE.md}（1枚のみ）</td><td>材料が1個につき${R.mdDiscount}安く買える</td><td>${D.CHIPS.md.col}</td></tr>
        <tr><td>マーケットリサーチ（緑）</td><td>${D.PRICE.mr}（1枚のみ）</td><td>入札で売れたら${R.mrBonus}高く売上できる（上限価格まで）</td><td>${D.CHIPS.mr.col}</td></tr>
        <tr><td>配置転換</td><td>研修費${D.PRICE.transfer}</td><td>ワーカー⇔セールスマン</td><td>ソ</td></tr>
        <tr><td>機械売却</td><td>小型${D.SELLBACK.small}・アタッチ${D.SELLBACK.attach}・大型${D.SELLBACK.large}</td><td>購入時の半額。工場に機械が無い状態にはできない</td><td>イ</td></tr>
        <tr><td>銀行借入</td><td>同時に金利を支払</td><td>1期目=0、2・3期目=純資産の${lt[1].mult}倍・金利${Math.round(lt[1].rate * 100)}%、4期目以降=純資産の${lt[2].mult}倍・金利${Math.round(lt[2].rate * 100)}%。残高があれば毎期首に金利を支払う</td><td>オ・タ</td></tr>
        <tr><td>借入返済</td><td></td><td></td><td>ナ</td></tr>
      </table></div>
      <div class="scroll-x"><h3>期末費用単価表</h3><table><tr><th></th><th>労務費 シ（ワーカー/人）</th><th>製造経費 ス（機械/台）</th><th>販売費 セ（セールスマン/人）</th><th>一般管理費 ソ（人）</th></tr>${ec}</table>
        <p>カッコ内は途中退職し補充しなかった人の単価。機械台数は延べ台数。管理費の人数は期中最大人数（期末ワーカー・セールスマン＋退職者数）。</p></div>
      <div><h3>能力の例</h3><ul><li>生産：小型=${R.capSmall}、小型+アタッチ=${R.capSmall + R.capAttach}、小型+PAC=${R.capSmall + R.capPac}、小型+アタッチ+PAC=${R.capSmall + R.capAttach + R.capPac}、大型=${R.capLarge}、大型+PAC=${R.capLarge + R.capPac}</li><li>販売：セールスマン1人=${R.salesPerSalesman}、広告1枚=${R.salesPerSalesman + R.salesPerAd}、広告2枚=${R.salesPerSalesman + 2 * R.salesPerAd}／2人=${2 * R.salesPerSalesman}、広告1枚=${2 * R.salesPerSalesman + R.salesPerAd}、広告2枚=${2 * R.salesPerSalesman + 2 * R.salesPerAd}</li><li>価格競争力：親は${R.parentEdge}安く言える、青チップ1枚につき${R.blueEdge}安く言える</li></ul></div>
      <div><h3>リスクカード（「工場の機械が壊れる」まではゼミのカード、以降はデジタル版で追加したもの）</h3><ul>${D.RISK_CARDS.map(c => `<li><b>${esc(c.title)}</b>（${c.weight}枚）：${esc(c.text)}</li>`).join('')}</ul></div>
      <div><h3>デジタル版の補足</h3><ul><li>マーケットの材料は毎期首にマーケットボリュームまで補充されます。</li><li>期首・期末の支払いで現金が不足した場合は、自動で緊急借入（${R.loanUnit}単位）になります。</li><li>入札に参加者がいないマーケットは、親が上限価格で売れます。</li><li>全員同額で親が負けたあと子が1人だけなら、その子がそのまま落札します。再入札でも同価格・同順位になった場合は、ジャンケンの代わりにランダムで決まります。</li><li>法人税等は税引前当期純利益の${Math.round(D.TAX_RATE * 100)}%（前期繰越利益剰余金がマイナスなら通算後）で、翌期首に納付します。</li></ul></div>
    </div>`, { key: 'rules', label: 'ルール表' });
  }

  // はじめての人向けの遊び方
  function guide() {
    return modal(`<div class="modal-head"><h2>遊び方</h2>${closeBtn}</div>
    <div class="rules guide">
      <div><h3>目的</h3><p>資本金${D.CAPITAL}で会社を始め、材料を買って製品を作り、入札で売ります。最後の決算で<b>純資産（資本金＋繰越利益剰余金）が一番多い会社</b>の勝ちです。</p></div>
      <div><h3>1回の手番</h3><ol><li>必要ならルールB（チップの購入・借入・配置転換など）</li><li>「意思決定カードを引く」。${Math.round(1 / D.RISK_RATIO)}回に1回くらいリスクカードが出て、その手番は終わり</li><li>ルールAから1つ選ぶ（材料購入・設備投資・完成投入・採用・広告・研究開発・販売・パス）</li></ol></div>
      <div><h3>ものづくりの流れ</h3><ol><li><b>設備投資</b>で機械を買い、<b>採用</b>でワーカー（機械1台に1人）とセールスマンを雇う</li><li><b>材料購入</b>：マーケットから買うと、そのマーケットに「空き」ができる</li><li><b>完成・投入</b>：投入で材料→仕掛品、次の完成で仕掛品→製品（1回の操作で両方できる）</li><li><b>商品販売</b>：空きのあるマーケットに製品を売る</li></ol></div>
      <div><h3>販売（入札）の流れ</h3><ol><li>親（販売する人）がマーケットと個数を宣言</li><li>ほかの会社が<b>参加するか・何個出すか</b>を決める（全員に公開）</li><li>参加者全員が<b>入札価格</b>を隠して決める</li><li>競争価格（入札価格 −${R.parentEdge}（親）−${R.blueEdge}×青チップ）の安い順に、空きの数まで売れる</li></ol><p>参加者がいなければ親は上限価格で売れます。全員分の空きがあるときは、価格に関係なく全員売れます。</p></div>
      <div><h3>期末に気をつけること</h3><p>期末には人件費・機械の経費・管理費がまとめてかかります。会社盤の<b>「期末費用見込み」</b>より現金が少ないと、足りない分は緊急借入になり、次の期に金利がかかります。</p></div>
      <div><h3>コツ</h3><ul><li>上限価格の高いマーケット（${D.MARKETS.slice(0, 3).map(m => m.name).join('・')}）は空きが少ないので取り合いになります</li><li>生産能力・販売能力・現金のバランスを見て、人や機械を増やしすぎない</li><li>決算書の STRAC で、付加価値 MQ が固定費 F を上回っているか確かめる</li></ul></div>
    </div>`, { key: 'guide', label: '遊び方' });
  }

  function menu(ctx) {
    const s = ctx.s;
    const remotes = ctx.isHost && s ? s.order.filter(id => s.players[id].ctrl === 'remote' || (s.players[id].ctrl === 'cpu' && ctx.wasRemote && ctx.wasRemote[id])) : [];
    return modal(`<div class="modal-head"><h2>メニュー</h2>${closeBtn}</div>
      ${ctx.isHost ? `<p>部屋コード <b class="room-code small">${esc(ctx.code)}</b></p>
        ${remotes.map(id => { const P = s.players[id]; const off = ctx.online && ctx.online[id] === false; return `<div class="row"><span>${swatch(P)} ${esc(P.company)}（${P.ctrl === 'cpu' ? 'CPUが代理中' : off ? '切断中' : '接続中'}）</span>${P.ctrl === 'remote' ? `<button class="btn small" data-a="toCpu" data-v="${id}">CPUに交代</button>` : ''}</div>`; }).join('')}
        ${remotes.length ? '<p class="note">通信が切れて戻れない参加者がいるときは、その会社をCPUに任せて続けられます。参加者が同じ部屋コードで入り直すと、自動で参加者に戻ります。</p>' : ''}` : ''}
      ${ctx.mode !== 'guest' ? `<label class="field">CPUの速さ${speedSelect(ctx.speed, 'speed-menu')}</label>` : ''}
      <div class="row"><button class="btn" data-a="books" data-v="rank">順位表</button><button class="btn" data-a="rules">ルール表</button><button class="btn" data-a="guide">遊び方</button><button class="btn danger" data-a="home">タイトルへ戻る</button></div>
      <p class="note">${ctx.mode === 'guest' ? 'タイトルに戻っても、同じ部屋コードで参加し直せば続きから遊べます。' : 'ゲームはこの端末に自動保存されます。タイトルの「続きから」で再開できます。'}</p>`, { narrow: true, key: 'menu', label: 'メニュー' });
  }

  function confirm(c) {
    return modal(`<div class="modal-head"><h2>${esc(c.title)}</h2></div><p>${esc(c.msg)}</p>
      <div class="row"><button class="btn ${c.danger ? 'danger' : 'primary'}" data-a="confirmYes" data-autofocus="1">${esc(c.yes)}</button><button class="btn" data-a="closeModal">やめる</button></div>`, { narrow: true, key: 'confirm', label: c.title });
  }

  return { title, setup, hostLobby, join, game, books, auctionModal, cardPop, rules, guide, menu, confirm, modal, esc };
})();
