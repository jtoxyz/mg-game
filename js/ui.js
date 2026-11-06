// 画面描画。HTML文字列を返す関数群。イベントは app.js が data-a 属性で受ける。
'use strict';

const UI = (() => {
  const E = Engine, D = MG;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => (n < 0 ? '▲' + Math.abs(n) : String(n));
  const sgn = (n) => `<span class="${n < 0 ? 'neg' : ''}">${yen(n)}</span>`;
  const pname = (s, pid) => esc(s.players[pid] ? s.players[pid].company : '');
  const swatch = (P) => `<span class="swatch" style="background:${P.color}"></span>`;
  const ctrlTag = (P) => P.ctrl === 'cpu' ? 'CPU' : P.ctrl === 'remote' ? 'オンライン' : '人間';

  // ---------- 小物 ----------
  function stepper(key, val, min, max, step = 1) {
    max = Math.max(min, max);
    val = Math.max(min, Math.min(max, val));
    const at = `data-k="${key}" data-min="${min}" data-max="${max}" data-step="${step}"`;
    return `<span class="stepper">
      <button type="button" data-a="step" ${at} data-d="-1" ${val <= min ? 'disabled' : ''} aria-label="減らす">−</button>
      <input id="f-${key}" type="number" inputmode="numeric" data-f="${key}" data-min="${min}" data-max="${max}" data-step="${step}" value="${val}" aria-label="数量">
      <button type="button" data-a="step" ${at} data-d="1" ${val >= max ? 'disabled' : ''} aria-label="増やす">＋</button>
    </span>`;
  }
  const cubes = (n, cls = '', limit = 24) =>
    Array.from({ length: Math.min(n, limit) }, () => `<i class="cube ${cls}"></i>`).join('') + (n > limit ? `<span class="tok-label">+${n - limit}</span>` : '');
  const pawnSvg = (color) => `<svg class="pawn" viewBox="0 0 12 17"><g fill="${color}" stroke="#5b6577" stroke-width="1"><circle cx="6" cy="4" r="3"/><path d="M2 16.3 C2 10 3.5 8 6 8 S10 10 10 16.3Z"/></g></svg>`;
  const pawns = (n, color) => n ? Array.from({ length: Math.min(n, 12) }, () => pawnSvg(color)).join('') + (n > 12 ? `+${n - 12}` : '') : '<span class="tok-label">なし</span>';
  const nutSvg = (big, att) => {
    const hex = (cx, cy, r) => {
      const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
      return `<polygon points="${pts}" fill="#8d96a3" stroke="#4b525c" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${r * .42}" fill="#e4e7ec" stroke="#4b525c"/>`;
    };
    if (big) return `<svg viewBox="0 0 24 24">${hex(8, 13, 7)}${hex(16, 11, 7)}</svg>`;
    return `<svg viewBox="0 0 24 24">${hex(12, 12, 8)}${att ? '<rect x="4" y="19" width="16" height="4" rx="1" fill="#3a4049"/>' : ''}</svg>`;
  };

  // 独自マーク：のこぎり屋根の工場と、右肩上がりの線
  const MARK_INNER = `<rect x="2" y="2" width="60" height="60" rx="14" fill="#0e5e66"/>
    <path d="M12 46 V30 L22 22 V30 L32 22 V30 L42 22 V46 Z" fill="#f4efe3"/>
    <rect x="16" y="36" width="5" height="10" fill="#0e5e66"/><rect x="27" y="36" width="5" height="10" fill="#0e5e66"/>
    <path d="M38 40 L45 31 L49 35 L55 24" fill="none" stroke="#e8a33d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const markSvg = (cls) => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${MARK_INNER}</svg>`;

  // ---------- タイトル ----------
  function title(ctx) {
    return `<div class="title-wrap"><div class="title-card">
      <div class="logo">${markSvg('logo-mark')}<div class="sub"><b>マネジメントゲーム</b><span>製造業版 ジュニア・ルール</span></div></div>
      <div class="menu">
        <button class="menu-item" data-a="goSetup" data-v="cpu"><b>CPUと対戦</b><span>自分1人＋CPU社長。いつでも練習できます。</span></button>
        <button class="menu-item" data-a="goSetup" data-v="hotseat"><b>1台を回して対戦</b><span>ゼミのみんなで1台を順番に操作。入札は隠して入力。</span></button>
        <button class="menu-item" data-a="goHost"><b>オンライン：部屋を作る</b><span>部屋コードを共有して、各自のスマホ・PCから参加。</span></button>
        <button class="menu-item" data-a="goJoin"><b>オンライン：部屋に参加</b><span>ホストから聞いた部屋コードを入力。</span></button>
        ${ctx.hasSave ? `<button class="menu-item" data-a="resume"><b>続きから</b><span>${esc(ctx.saveLabel)}</span></button>` : ''}
        <button class="menu-item" data-a="rules"><b>ルール表</b><span>ルールA・B、期末費用、能力の計算</span></button>
      </div>
      <p class="title-foot">資本金300で創業し、設備投資・採用・仕入・製造・販売を意思決定。何期か決算を繰り返し、純資産（自己資本）が最も多い社長の勝ちです。</p>
    </div></div>`;
  }

  function seatRow(st, i, opts) {
    const color = D.COMPANY_COLORS[i % 6];
    const types = opts.types.map(([v, l]) => `<button type="button" class="${st.ctrl === v ? 'on' : ''}" data-a="seatType" data-i="${i}" data-v="${v}" ${opts.lockType && opts.lockType(st) ? 'disabled' : ''}>${l}</button>`).join('');
    return `<div class="seat">
      <span class="dot" style="background:${color}"></span>
      <input id="seat-c-${i}" data-seat="${i}" data-k="company" value="${esc(st.company)}" maxlength="14" aria-label="社名" ${opts.readonly && opts.readonly(st) ? 'disabled' : ''}>
      <input id="seat-n-${i}" class="ceo" data-seat="${i}" data-k="ceo" value="${esc(st.ceo)}" maxlength="10" placeholder="社長名" aria-label="社長名" ${opts.readonly && opts.readonly(st) ? 'disabled' : ''}>
      <span class="seg">${types}</span>
      ${opts.removable(st, i) ? `<button type="button" class="btn small danger" data-a="seatDel" data-i="${i}" aria-label="削除">×</button>` : '<span></span>'}
    </div>`;
  }

  function cfgFields(cfg) {
    return `<div class="row">
      <label class="field">期数（決算の回数）<select id="cfg-periods" data-cfg="periods">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${cfg.periods === n ? 'selected' : ''}>${n}期</option>`).join('')}</select></label>
      <label class="field">1期あたりの手番数（1人あたり）<select id="cfg-rounds" data-cfg="rounds">${[6, 8, 10, 12, 15, 20].map(n => `<option value="${n}" ${cfg.rounds === n ? 'selected' : ''}>${n}回</option>`).join('')}</select></label>
    </div>
    <p class="note">ゼミでの1期60分に近いのは12〜15回です。最初は10回・3期がおすすめです。</p>`;
  }

  function setup(ctx) {
    const u = ctx.setup;
    const types = u.kind === 'cpu' ? [['cpu', 'CPU']] : [['local', '人間'], ['cpu', 'CPU']];
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">${u.kind === 'cpu' ? 'CPUと対戦' : '1台を回して対戦'}</div>
      <h2>参加する会社</h2>
      <div class="seat-list">${u.seats.map((st, i) => seatRow(st, i, {
        types: i === 0 && u.kind === 'cpu' ? [['local', 'あなた']] : types,
        removable: (_, j) => u.seats.length > 2 && !(u.kind === 'cpu' && j === 0),
      })).join('')}</div>
      <div class="row">${u.seats.length < 6 ? '<button class="btn small" data-a="seatAdd">＋ 会社を追加</button>' : ''}<span class="note">4〜6社が標準です（2〜6社で遊べます）。</span></div>
      ${cfgFields(u.cfg)}
      <div class="row"><button class="btn primary" data-a="startLocal">ゲーム開始</button><button class="btn" data-a="home">戻る</button></div>
    </div></div></div>`;
  }

  function hostLobby(ctx) {
    const u = ctx.setup;
    const remote = (st) => st.ctrl === 'remote';
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">オンライン：ホスト</div>
      <div class="row"><div><div class="note">部屋コード</div><div class="room-code">${esc(ctx.code)}</div></div>
        <div class="note" style="flex:1;min-width:200px">参加者はこのページを開いて「部屋に参加」からコードを入力します。<br>${ctx.connLabel}</div></div>
      <h2>参加する会社</h2>
      <div class="seat-list">${u.seats.map((st, i) => seatRow(st, i, {
        types: remote(st) ? [['remote', 'オンライン']] : i === 0 ? [['local', 'あなた']] : [['cpu', 'CPU'], ['open', '募集中']],
        lockType: remote, readonly: remote,
        removable: (s2, j) => j > 0 && u.seats.length > 2,
      })).join('')}</div>
      <div class="row">${u.seats.length < 6 ? '<button class="btn small" data-a="seatAdd">＋ 枠を追加</button>' : ''}
        <span class="note">「募集中」の枠に参加者が入ります。空いたまま開始すると、その枠は外されます。</span></div>
      ${cfgFields(u.cfg)}
      <div class="row"><button class="btn primary" data-a="startHost">ゲーム開始</button><button class="btn" data-a="home">やめる</button></div>
    </div></div></div>`;
  }

  function join(ctx) {
    const j = ctx.join;
    return `<div class="title-wrap"><div class="title-card"><div class="sheet setup">
      <div class="eyebrow">オンライン：参加</div>
      ${j.stage === 'form' ? `
        <div class="row">
          <label class="field" style="flex:1;min-width:140px">部屋コード<input id="join-code" data-join="code" value="${esc(j.code)}" maxlength="6" autocapitalize="characters" placeholder="例：K7Q2"></label>
          <label class="field" style="flex:2;min-width:160px">社名<input id="join-company" data-join="company" value="${esc(j.company)}" maxlength="14"></label>
          <label class="field" style="flex:1;min-width:120px">社長名<input id="join-ceo" data-join="ceo" value="${esc(j.ceo)}" maxlength="10"></label>
        </div>
        ${j.err ? `<p class="err">${esc(j.err)}</p>` : ''}
        <div class="row"><button class="btn primary" data-a="doJoin">参加する</button><button class="btn" data-a="home">戻る</button></div>`
      : `<div class="waiting"><span class="spinner"></span><div><b>${j.stage === 'connecting' ? '接続しています…' : 'ホストの開始を待っています'}</b><div class="note">部屋 ${esc(j.code)} ／ ${esc(j.company)}</div></div></div>
        ${j.lobby ? `<div class="seat-list">${j.lobby.map((st, i) => `<div class="seat" style="grid-template-columns:14px 1fr auto"><span class="dot" style="background:${D.COMPANY_COLORS[i % 6]}"></span><span>${esc(st.company)}${st.ceo ? `（${esc(st.ceo)}）` : ''}</span><span class="note">${st.ctrl === 'cpu' ? 'CPU' : st.ctrl === 'open' ? '募集中' : st.ctrl === 'local' ? 'ホスト' : '参加者'}</span></div>`).join('')}</div>` : ''}
        ${j.err ? `<p class="err">${esc(j.err)}</p>` : ''}
        <div class="row"><button class="btn" data-a="home">やめる</button></div>`}
    </div></div></div>`;
  }

  // ---------- ボード（六角形） ----------
  function board(s) {
    const R = 300, r = 78, cx = 320, cy = 320;
    const ap = (k) => k * Math.cos(Math.PI / 6);   // 頂点半径 → 辺までの距離
    const vtx = (k, i) => { const a = Math.PI / 3 * i; return [cx + k * Math.cos(a), cy + k * Math.sin(a)]; };
    const poly = (k) => [0, 1, 2, 3, 4, 5].map(i => vtx(k, i).join(',')).join(' ');
    // 辺 i（頂点 i→i+1）の中心方向: 30°+60°*i。上（270°）から時計回りにマーケットを置く
    const dirs = [270, 330, 30, 90, 150, 210];
    let out = `<svg class="board-svg" viewBox="0 0 640 640" role="img" aria-label="マーケットボード">
      <polygon points="${poly(R + 18)}" fill="#dcbf8f" stroke="#b9955f" stroke-width="3"/>
      <polygon points="${poly(R)}" fill="#3d2a1f"/>`;
    D.MARKETS.forEach((mk, i) => {
      const phi = dirs[i], m = s.markets.find(x => x.id === mk.id);
      const rot = phi - 90;
      let trot = ((rot % 360) + 540) % 360 - 180;
      const flip = Math.abs(trot) > 90;
      const g = `translate(${cx},${cy}) rotate(${rot})`;
      // 仕切り（木の桟）
      const a1 = (phi - 30) * Math.PI / 180;
      out += `<line x1="${cx + r * Math.cos(a1)}" y1="${cy + r * Math.sin(a1)}" x2="${cx + R * Math.cos(a1)}" y2="${cy + R * Math.sin(a1)}" stroke="#dcbf8f" stroke-width="7"/>`;
      // ラベル帯（材料単価｜都市 ボリューム｜価格上限）
      const dBand = ap(R) - 34, half = dBand * Math.tan(Math.PI / 6) - 6;
      out += `<g transform="${g}"><g transform="translate(0,${dBand})${flip ? ' rotate(180)' : ''}">
        <rect x="${-half}" y="-17" width="${half * 2}" height="34" rx="3" fill="#ffffff"/>
        <rect x="${-half}" y="-17" width="${half * .52}" height="34" fill="${'#1e86d6'}"/>
        <rect x="${half * .48}" y="-17" width="${half * .52}" height="34" fill="${'#2e9a4a'}"/>
        <text x="${-half * .74}" y="7" text-anchor="middle" fill="#fff" font-size="20" class="lbl-num">${mk.mat}</text>
        <text x="${half * .74}" y="7" text-anchor="middle" fill="#fff" font-size="20" class="lbl-num">${mk.cap}</text>
        <text x="${-half * .12}" y="6" text-anchor="middle" fill="#1b2233" font-size="15" font-weight="700">${mk.name}</text>
        <text x="${half * .3}" y="8" text-anchor="middle" fill="#d0342c" font-size="21" class="lbl-num">${mk.vol}</text>
        <text x="${-half * .74}" y="-20" text-anchor="middle" fill="#dcbf8f" font-size="9">材料単価</text>
        <text x="${half * .74}" y="-20" text-anchor="middle" fill="#dcbf8f" font-size="9">価格(上限)</text>
      </g></g>`;
      // 材料キューブと空き枠
      const cell = 17, rows = [];
      for (let d = ap(r) + 22; d < dBand - 26; d += cell) rows.push(d);
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
      out += empty ? `<text x="${ex}" y="${ey + 4}" text-anchor="middle" fill="#f2c418" font-size="12" font-weight="700">空き${empty}</text>` : '';
    });
    // 中央：意思決定カードの山
    const lc = s.lastCard;
    const left = s.turnsLeft;
    out += `<polygon points="${poly(r)}" fill="#dcbf8f"/>
      <g transform="translate(${cx},${cy})">
        <rect x="-30" y="-40" width="60" height="80" rx="6" fill="#0b4c53" stroke="#f4efe3" stroke-width="2.5" transform="rotate(-8)"/>
        <rect x="-30" y="-40" width="60" height="80" rx="6" fill="#0e5e66" stroke="#f4efe3" stroke-width="2.5"/>
        <svg x="-17" y="-30" width="34" height="34" viewBox="0 0 64 64">${MARK_INNER}</svg>
        <text y="26" text-anchor="middle" fill="#fff" font-size="10">残り${Math.max(0, left)}</text>
      </g>`;
    out += `<text x="${cx}" y="${cy + R + 12}" text-anchor="middle" fill="#3d2a1f" font-size="12">ストッカー：材料 ${D.STOCKER_PRICE}（無制限・販売不可）</text>`;
    out += '</svg>';
    out += `<div class="board-legend"><span><i style="background:#7b3a2a"></i>マーケットの材料</span><span><i style="border:1.5px dashed #f2c418"></i>空き＝製品を売れる枠</span>${lc ? `<span>直前：${pname(s, lc.pid)} ${lc.kind === 'risk' ? 'リスクカード「' + esc(D.RISK_CARDS.find(c => c.id === lc.id).title) + '」' : lc.kind === 'skip' ? '休み' : '意思決定'}</span>` : ''}</div>`;
    return out;
  }

  // ---------- 会社盤 ----------
  function company(s, pid, ctx) {
    const P = s.players[pid];
    const pc = E.prodCap(P), sc = E.salesCap(P);
    const est = E.estEndCost(s, P);
    const tabs = s.order.map(id => { const Q = s.players[id]; return `<button class="tab ${id === pid ? 'on' : ''}" data-a="view" data-v="${id}">${swatch(Q)}${esc(Q.company)}</button>`; }).join('');
    const machinesHtml = P.machines.length ? P.machines.map((m, i) => {
      const working = i < P.workers; // 表示用：上から順に稼働
      return `<span class="machine ${working ? '' : 'idle'}" title="${m.type === 'large' ? '大型機械' : '小型機械'}">${nutSvg(m.type === 'large', m.att)}${m.type === 'large' ? '大型' : m.att ? '小+ア' : '小型'} ${E.machineCap(P, m)}</span>`;
    }).join('') : '<span class="tok-label">機械なし</span>';
    const green = (on, label) => `<span class="green-slot"><i class="chipdot ${on ? 'green' : 'off'}"></i>${label}</span>`;
    return `<div class="sheet company">
      <div class="tabs" role="tablist" aria-label="会社を選ぶ">${tabs}</div>
      <div class="company-head">${swatch(P)}<h2>${esc(P.company)}</h2><span class="ceo">${P.ceo ? '社長 ' + esc(P.ceo) + '・' : ''}${ctrlTag(P)}${P.ctrl === 'cpu' ? '（' + esc(P.ai) + '型）' : ''}</span></div>
      <div class="kpis">
        <div class="kpi ${P.cash < est ? 'warn' : ''}"><small>現金</small><b>${yen(P.cash)}</b></div>
        <div class="kpi"><small>借入金</small><b>${P.loan}</b></div>
        <div class="kpi"><small>期末費用見込み</small><b>${est}</b></div>
        <div class="kpi"><small>生産能力</small><b>${pc}</b></div>
        <div class="kpi"><small>販売能力</small><b>${sc}</b></div>
        <div class="kpi"><small>純資産(前期末)</small><b>${sgn(E.netAssets(P))}</b></div>
      </div>
      <div class="boardsheet">
        <div class="zone rd"><span class="zt">研究開発</span>
          <div class="tokens">${P.chips.blue ? Array.from({ length: P.chips.blue }, () => '<i class="chipdot blue"></i>').join('') : '<span class="tok-label">青チップなし</span>'}</div>
          <div class="cap">価格競争力 −${P.chips.blue * 2}</div>
        </div>
        <div class="zone wh"><span class="zt">材料倉庫</span>
          <div class="cols"><div><div class="tokens">${cubes(P.mat)}</div><div class="cap">材料 <span class="count">${P.mat}</span>個</div></div>${green(P.chips.md, 'マーチャン<br>ダイザー')}</div>
        </div>
        <div class="zone fac"><span class="zt">工場</span>
          <div class="cols"><div style="display:grid;gap:6px">
            <div class="tokens">${machinesHtml}</div>
            <div class="split"><span class="tok-label">ワーカー</span><div class="tokens">${pawns(P.workers, '#eef0f4')}</div></div>
            <div><div class="tokens">${cubes(P.wip, 'wip')}</div><div class="cap">仕掛品 <span class="count">${P.wip}</span>個 ／ 生産能力 ${pc}${P.machines.length > P.workers ? `（ワーカー不足で${P.machines.length - P.workers}台停止中）` : ''}</div></div>
          </div>${green(P.chips.pac, 'PAC<br>生産性')}</div>
        </div>
        <div class="zone ins"><span class="zt" style="border-color:#c9a80f;color:#8a6f00">保険</span><i class="chipdot ${P.chips.yellow ? 'yellow' : 'off'}"></i></div>
        <div class="zone shop"><span class="zt">営業所</span>
          <div class="cols"><div style="display:grid;gap:6px">
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
  const CHOICES = [
    ['buyMat', '材料購入', 'マーケットから仕入れ'],
    ['buyEquip', '設備投資', '小型100・大型200'],
    ['produce', '完成・投入', '完成1・投入2／個'],
    ['hire', '採用', '1人5'],
    ['ad', '広告', '赤チップ10'],
    ['rd', '研究開発', '青チップ20'],
    ['sell', '商品販売', '入札で販売'],
    ['pass', '何もしない', 'パス'],
  ];

  function action(ctx) {
    const s = ctx.s;
    if (s.phase === 'periodEnd' || s.phase === 'over') return periodEndPanel(ctx);
    const actor = ctx.actor;
    const cur = s.players[E.curPid(s)];
    if (s.phase === 'auction') {
      const pd = s.pending, parent = s.players[pd.parent];
      const offerTxt = pd.offers.map(o => `${E.MK[o.m].name} ${o.q}個`).join('・');
      const re = pd.round === 2;
      const reTxt = re ? Object.entries(pd.rebid).map(([m, r]) => `${E.MK[m].name}は全員が競争価格${r.comp}で同じため親の負け。`).join('') : '';
      if (actor && pd.waiting.includes(actor)) {
        if (ctx.needCover && ctx.ui.revealed !== actor) {
          return panel(`<div class="cover"><div class="big">${pname(s, actor)}の${re ? '再入札' : '入札'}</div><p class="lead">${re ? reTxt + '子だけで再入札します。' : `${esc(parent.company)}が「${offerTxt}」で販売を宣言しました。`}入札は他の人に見えないように入力してください。</p><button class="btn primary" data-a="reveal" data-v="${actor}">${pname(s, actor)}が入札する</button></div>`);
        }
        return panel(re ? rebidForm(ctx, actor) : bidForm(ctx, actor));
      }
      const names = pd.waiting.map(id => pname(s, id)).join('、');
      return panel(`<h3>${esc(parent.company)}が販売中：${offerTxt}</h3>${re ? `<p class="lead">${reTxt}子だけで再入札しています。</p>` : ''}<div class="waiting"><span class="spinner"></span><span>${re ? '再入札待ち' : '入札待ち'}：${names || '集計中'}</span></div>${recentFeed(s)}`);
    }
    if (s.phase === 'risk') {
      if (actor === s.pending.pid) return panel(riskForm(ctx));
      return panel(`<div class="waiting"><span class="spinner"></span><span>${pname(s, s.pending.pid)}がリスクカードの対応を選んでいます</span></div>`);
    }
    // turn
    if (actor !== cur.id) {
      return panel(`<div class="waiting"><span class="spinner"></span><div><b>${esc(cur.company)}の手番</b><div class="note">${cur.ctrl === 'cpu' ? 'CPUが考えています…' : cur.ctrl === 'remote' ? '参加者の操作を待っています' : ''}</div></div></div>${recentFeed(s)}${lastAuctionMini(s)}`);
    }
    if (s.step === 'pre') return panel(preForm(ctx));
    return panel(decideForm(ctx));
  }
  const panel = (inner) => `<div class="sheet action">${inner}</div>`;

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

  function preForm(ctx) {
    const s = ctx.s, P = s.players[ctx.actor], u = ctx.ui, f = u.f;
    const sub = u.choice;
    const chipBtn = (c, label, price) => `<button class="btn small" data-a="chip" data-v="${c}" ${P.chips[c] || P.cash < price ? 'disabled' : ''}>${label} ${P.chips[c] ? '✓' : price}</button>`;
    let subForm = '';
    if (sub === 'B:transfer') {
      subForm = `<div class="form-rows">
        <div class="frow"><div class="t">ワーカー → セールスマン<small>研修費 5/人</small></div>${stepper('w2s', f.w2s || 0, 0, P.workers)}</div>
        <div class="frow"><div class="t">セールスマン → ワーカー<small>研修費 5/人</small></div>${stepper('s2w', f.s2w || 0, 0, P.salesmen)}</div>
      </div>${confirmLine(((f.w2s || 0) + (f.s2w || 0)) * 5, P, 'doTransfer', '配置転換する')}`;
    } else if (sub === 'B:sellMachine') {
      subForm = `<div class="form-rows">${P.machines.map(m => `<div class="frow"><div class="t">${m.type === 'large' ? '大型機械' : '小型機械'}${m.att ? '＋アタッチメント' : ''}<small>簿価 ${m.bv + (m.att ? m.attBv : 0)}</small></div><div class="row">
        ${m.att ? `<button class="btn small" data-a="sellMachine" data-v="${m.id}" data-part="attach">アタッチのみ +10</button>` : ''}
        <button class="btn small" data-a="sellMachine" data-v="${m.id}" ${P.machines.length <= 1 ? 'disabled' : ''}>売却 +${D.SELLBACK[m.type] + (m.att ? 10 : 0)}</button></div></div>`).join('') || '<p class="note">機械がありません</p>'}</div>
        <p class="note">購入時の半額で売却。工場に機械が1台も無い状態にはできません。</p>`;
    } else if (sub === 'B:borrow') {
      const room = E.borrowRoom(P);
      subForm = s.period <= 1 ? '<p class="note">1期目は借入できません。</p>' : `<div class="form-rows">
        <div class="frow"><div class="t">借入額（10単位）<small>借入枠 ${room}（純資産×${D.loanTerms(s.period).mult} − 残高）／金利${Math.round(P.rate * 100)}%を同時に支払い</small></div>${stepper('borrow', f.borrow || 0, 0, room, 10)}</div>
      </div>${confirmLine(Math.ceil((f.borrow || 0) * P.rate), P, 'doBorrow', '借入する', `金利 ${Math.ceil((f.borrow || 0) * P.rate)} を支払い、現金 +${f.borrow || 0}`)}`;
    } else if (sub === 'B:repay') {
      subForm = `<div class="form-rows"><div class="frow"><div class="t">返済額<small>借入残高 ${P.loan}</small></div>${stepper('repay', f.repay || 0, 0, Math.min(P.loan, Math.max(0, P.cash)))}</div></div>${confirmLine(f.repay || 0, P, 'doRepay', '返済する')}`;
    }
    return `<h3>${esc(P.company)}の手番</h3>
      <p class="lead">まず必要ならルールB（何回でも）。準備ができたら意思決定カードを引きます。</p>
      <div class="ruleb">
        ${chipBtn('yellow', '保険(黄)', 5)}${chipBtn('pac', 'PAC(緑)', 10)}${chipBtn('md', 'マーチャンダイザー(緑)', 10)}${chipBtn('mr', 'マーケットリサーチ(緑)', 10)}
        <button class="btn small ${sub === 'B:transfer' ? 'primary' : ''}" data-a="choose" data-v="B:transfer">配置転換</button>
        <button class="btn small ${sub === 'B:sellMachine' ? 'primary' : ''}" data-a="choose" data-v="B:sellMachine">機械売却</button>
        <button class="btn small ${sub === 'B:borrow' ? 'primary' : ''}" data-a="choose" data-v="B:borrow" ${s.period <= 1 ? 'disabled title="1期目は借入できません"' : ''}>銀行借入</button>
        <button class="btn small ${sub === 'B:repay' ? 'primary' : ''}" data-a="choose" data-v="B:repay" ${P.loan ? '' : 'disabled'}>借入返済</button>
      </div>
      ${subForm}
      ${u.err ? `<p class="err">${esc(u.err)}</p>` : ''}
      <button class="btn primary" data-a="draw" style="min-height:52px;font-size:17px">意思決定カードを引く</button>`;
  }

  function confirmLine(cost, P, act, label, msg) {
    return `<div class="summary-line"><span>${msg || `支払い <span class="cost">${cost}</span> → 残り現金 ${yen(P.cash - cost)}`}</span><button class="btn primary" data-a="${act}" ${cost > P.cash ? 'disabled' : ''}>${label}</button></div>`;
  }

  function decideForm(ctx) {
    const s = ctx.s, P = s.players[ctx.actor], u = ctx.ui, f = u.f;
    const pc = E.prodCap(P), sc = E.salesCap(P);
    const disabled = {
      produce: !pc || (!P.wip && !P.mat),
      sell: !P.prod || !sc || s.markets.every(m => E.empty(s, m.id) === 0),
      ad: !P.salesmen || P.chips.red >= 2 * P.salesmen,
      rd: P.cash < 20,
    };
    const grid = CHOICES.map(([k, l, d]) => `<button class="choice ${u.choice === k ? 'sel' : ''}" data-a="choose" data-v="${k}" ${disabled[k] ? 'disabled' : ''}><b>${l}</b><span>${d}</span></button>`).join('');
    let form = '';
    const c = u.choice;
    if (c === 'buyMat') {
      const disc = P.chips.md ? 2 : 0;
      let cost = 0, qty = 0;
      const rows = D.MARKETS.map(mk => {
        const m = s.markets.find(x => x.id === mk.id), q = f['m_' + mk.id] || 0;
        cost += q * (mk.mat - disc); qty += q;
        return `<div class="frow ${m.mats ? '' : 'dis'}"><div class="t">${mk.name}　${mk.mat - disc}/個<small>残り${m.mats}個${disc ? '（MD −2）' : ''}</small></div>${stepper('m_' + mk.id, q, 0, m.mats)}</div>`;
      }).join('');
      const qs = f.m_stocker || 0; cost += qs * (D.STOCKER_PRICE - disc); qty += qs;
      form = `<div class="form-rows">${rows}<div class="frow"><div class="t">ストッカー　${D.STOCKER_PRICE - disc}/個<small>無制限（マーケットに空きはできません）</small></div>${stepper('m_stocker', qs, 0, 30)}</div></div>
        <p class="note">マーケットから材料を買うと、そのマーケットに空きができ、製品を売れるようになります。</p>
        ${confirmLine(cost, P, 'doBuyMat', `${qty}個 購入`)}`;
    } else if (c === 'buyEquip') {
      const freeSmall = P.machines.filter(m => m.type === 'small' && !m.att).length + (f.small || 0);
      const cost = (f.small || 0) * 100 + (f.attach || 0) * 20 + (f.large || 0) * 200;
      form = `<div class="form-rows">
        <div class="frow"><div class="t">小型機械 100<small>生産能力1・ワーカー1人必要</small></div>${stepper('small', f.small || 0, 0, 5)}</div>
        <div class="frow"><div class="t">アタッチメント 20<small>小型機械の生産能力+1（小型1台に1つ）</small></div>${stepper('attach', Math.min(f.attach || 0, freeSmall), 0, freeSmall)}</div>
        <div class="frow"><div class="t">大型機械 200<small>生産能力4・ワーカー1人必要</small></div>${stepper('large', f.large || 0, 0, 3)}</div>
      </div>${confirmLine(cost, P, 'doBuyEquip', '購入する')}`;
    } else if (c === 'produce') {
      const cMax = Math.min(pc, P.wip), iMax = Math.min(pc, P.mat);
      const cv = f.complete == null ? cMax : f.complete, iv = f.insert == null ? iMax : f.insert;
      form = `<p class="note">生産能力 ${pc}。完成（仕掛品→製品）を先に、続けて投入（材料→仕掛品）を行います。それぞれ生産能力まで。</p>
        <div class="form-rows">
          <div class="frow"><div class="t">完成　1/個<small>仕掛品 ${P.wip}個</small></div>${stepper('complete', cv, 0, cMax)}</div>
          <div class="frow"><div class="t">投入　2/個<small>材料 ${P.mat}個</small></div>${stepper('insert', iv, 0, iMax)}</div>
        </div>${confirmLine(cv + iv * 2, P, 'doProduce', '完成・投入する')}`;
    } else if (c === 'hire') {
      const cost = ((f.w || 0) + (f.s || 0)) * 5;
      form = `<div class="form-rows">
        <div class="frow"><div class="t">ワーカー<small>機械1台に1人必要（今 機械${P.machines.length}台・ワーカー${P.workers}人）</small></div>${stepper('w', f.w || 0, 0, 10)}</div>
        <div class="frow"><div class="t">セールスマン<small>1人で2個販売可</small></div>${stepper('s', f.s || 0, 0, 10)}</div>
      </div><p class="note">会社都合で退職させることはできません。人数分の給料が期末にかかります。</p>${confirmLine(cost, P, 'doHire', '採用する')}`;
    } else if (c === 'ad') {
      const max = Math.max(0, 2 * P.salesmen - P.chips.red);
      const n = Math.min(f.n || 1, max);
      form = `<div class="form-rows"><div class="frow"><div class="t">広告（赤チップ）10/枚<small>1枚で販売能力+2。セールスマン1人につき2枚まで（あと${max}枚）</small></div>${stepper('n', n, 1, max)}</div></div>${confirmLine(n * 10, P, 'doAd', '広告を出す')}`;
    } else if (c === 'rd') {
      form = `<p class="note">青チップ1枚につき入札の競争価格が2安くなります（1回に1枚）。同価格のときは青チップの多い人が優先。</p>${confirmLine(20, P, 'doRd', '研究開発する')}`;
    } else if (c === 'sell') {
      form = sellForm(ctx, P);
    } else if (c === 'pass') {
      form = `<p class="note">今回は何もしません。</p><div class="summary-line"><span></span><button class="btn primary" data-a="doPass">パスする</button></div>`;
    }
    return `<h3>${esc(P.company)}：意思決定（ルールAから1つ）</h3>
      <div class="choice-grid">${grid}</div>
      ${form}
      ${u.err ? `<p class="err">${esc(u.err)}</p>` : ''}`;
  }

  function sellForm(ctx, P) {
    const s = ctx.s, f = ctx.ui.f;
    const limit = Math.min(E.salesCap(P), P.prod);
    let total = 0;
    D.MARKETS.forEach(mk => { total += f['q_' + mk.id] || 0; });
    const rows = D.MARKETS.map(mk => {
      const e = E.empty(s, mk.id), q = f['q_' + mk.id] || 0;
      const max = Math.min(e, q + (limit - total));
      const p = f['p_' + mk.id] == null ? mk.cap : f['p_' + mk.id];
      const comp = p - 2 - 2 * P.chips.blue;
      return `<div class="frow ${e ? '' : 'dis'}"><div class="t">${mk.name}　上限${mk.cap}<small>空き${e}個${q ? `／競争価格 ${comp}${P.chips.mr ? `／売上単価 ${Math.min(p + 2, mk.cap)}` : ''}` : ''}</small></div>
        <div class="row" style="gap:6px">${stepper('q_' + mk.id, q, 0, max)}<input id="f-p_${mk.id}" class="price-in" type="number" inputmode="numeric" data-f="p_${mk.id}" data-min="1" data-max="${mk.cap}" value="${p}" aria-label="${mk.name}の入札価格" ${e ? '' : 'disabled'}></div></div>`;
    }).join('');
    return `<p class="note">販売能力 ${E.salesCap(P)}・製品 ${P.prod}個 → 最大 ${limit}個。左が個数、右が入札価格（プライスカード）。子も1人あたり同じ個数まで応札でき、競争価格（親は−2、青チップ1枚につき−2）の安い順に、マーケットの空きの数まで売れます。</p>
      <div class="form-rows">${rows}</div>
      <div class="summary-line"><span>販売宣言 <span class="cost">${total}</span>個</span><button class="btn primary" data-a="doSell" ${total ? '' : 'disabled'}>販売を宣言して入札へ</button></div>`;
  }

  function bidForm(ctx, pid) {
    const s = ctx.s, P = s.players[pid], f = ctx.ui.f, pd = s.pending;
    const limit = Math.min(E.salesCap(P), P.prod);
    let total = 0;
    pd.offers.forEach(o => { total += f['bq_' + o.m] || 0; });
    const rows = pd.offers.map(o => {
      const mk = E.MK[o.m], q = f['bq_' + o.m] || 0;
      const max = Math.min(o.q, q + (limit - total));
      const p = f['bp_' + o.m] == null ? mk.cap : f['bp_' + o.m];
      return `<div class="frow"><div class="t">${mk.name}（親が${o.q}個）上限${mk.cap}<small>${q ? `競争価格 ${p - 2 * P.chips.blue}` : '個数を入れると応札'}</small></div>
        <div class="row" style="gap:6px">${stepper('bq_' + o.m, q, 0, max)}<input id="f-bp_${o.m}" class="price-in" type="number" inputmode="numeric" data-f="bp_${o.m}" data-min="1" data-max="${mk.cap}" value="${p}" aria-label="${mk.name}の入札価格"></div></div>`;
    }).join('');
    return `<h3>${pname(s, pid)}：入札（子）</h3>
      <p class="lead">${pname(s, pd.parent)}が販売を宣言しました。1人あたり親が出した個数まで応札できます（販売能力 ${E.salesCap(P)}・製品 ${P.prod}個）。競争価格の安い順に、マーケットの空きの数まで売れます。</p>
      <div class="form-rows">${rows}</div>
      ${ctx.ui.err ? `<p class="err">${esc(ctx.ui.err)}</p>` : ''}
      <div class="summary-line"><button class="btn" data-a="doBid" data-v="none">入札しない</button><button class="btn primary" data-a="doBid" ${total ? '' : 'disabled'}>${total}個で入札する</button></div>`;
  }

  function rebidForm(ctx, pid) {
    const s = ctx.s, P = s.players[pid], f = ctx.ui.f, pd = s.pending;
    const mine = Object.entries(pd.rebid).filter(([, r]) => r.pids.includes(pid));
    const rows = mine.map(([m, r]) => {
      const mk = E.MK[m];
      const orig = r.comp + 2 * P.chips.blue;
      const p = f['rp_' + m] == null ? Math.max(1, orig - 1) : f['rp_' + m];
      return `<div class="frow"><div class="t">${mk.name}　前回は全員が競争価格${r.comp}<small>入札価格 ${p} → 競争価格 ${p - 2 * P.chips.blue}（親は外れています）</small></div>
        <input id="f-rp_${m}" class="price-in" type="number" inputmode="numeric" data-f="rp_${m}" data-min="1" data-max="${mk.cap}" value="${p}" aria-label="${mk.name}の再入札価格"></div>`;
    }).join('');
    return `<h3>${pname(s, pid)}：再入札</h3>
      <p class="lead">全員の競争価格が同じだったので親の負けです。マーケットの空きに全員分が入らないため、子だけで価格を出し直します（個数は最初の応札のまま）。</p>
      <div class="form-rows">${rows}</div>
      ${ctx.ui.err ? `<p class="err">${esc(ctx.ui.err)}</p>` : ''}
      <div class="summary-line"><button class="btn" data-a="doBid" data-v="none">辞退する</button><button class="btn primary" data-a="doBid">再入札する</button></div>`;
  }

  function riskForm(ctx) {
    const s = ctx.s, pd = s.pending, P = s.players[pd.pid], f = ctx.ui.f;
    const q = f.rq == null ? pd.max : f.rq;
    if (pd.kind === 'special') {
      return `<h3>リスクカード：材料の特別購入</h3><p class="lead">材料を単価10で${pd.max}個まで購入できます。</p>
        <div class="form-rows"><div class="frow"><div class="t">購入数<small>現金 ${P.cash}</small></div>${stepper('rq', q, 0, pd.max)}</div></div>
        ${confirmLine(q * 10, P, 'doRisk', '決定')}`;
    }
    const mk = E.MK[pd.market];
    return `<h3>リスクカード：独占販売</h3><p class="lead">${mk.name}で、上限価格 ${pd.price} で製品を${pd.max}個まで入札なしで販売できます。</p>
      <div class="form-rows"><div class="frow"><div class="t">販売数<small>製品 ${P.prod}個</small></div>${stepper('rq', q, 0, pd.max)}</div></div>
      <div class="summary-line"><span>売上 <span class="cost">${q * pd.price}</span></span><button class="btn primary" data-a="doRisk">決定</button></div>`;
  }

  function periodEndPanel(ctx) {
    const s = ctx.s, over = s.phase === 'over';
    const ranked = s.order.map(id => s.players[id]).sort((a, b) => E.netAssets(b) - E.netAssets(a));
    const rows = ranked.map((P, i) => {
      const h = P.history[P.history.length - 1];
      return `<tr class="${i === 0 ? 'top' : ''}"><td>${over && i === 0 ? '<span class="medal">1</span>' : i + 1}</td><td class="nm">${swatch(P)} ${esc(P.company)}</td><td>${h.PQ}</td><td>${sgn(h.G)}</td><td>${sgn(h.net)}</td><td><b>${sgn(E.netAssets(P))}</b></td></tr>`;
    }).join('');
    return panel(`<h3>${over ? `ゲーム終了：${esc(ranked[0].company)}の勝ち` : `第${s.period}期 決算`}</h3>
      <div class="scroll-x"><table class="rank"><thead><tr><th>順位</th><th class="nm">会社</th><th>売上高</th><th>経常利益</th><th>当期純利益</th><th>純資産</th></tr></thead><tbody>${rows}</tbody></table></div>
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
      return `<button class="other ${turn ? 'turn' : ''}" data-a="view" data-v="${id}">
        <span class="nm">${swatch(P)}${esc(P.company)}<span class="tag">${ctrlTag(P)}</span>${turn ? '<span class="tag" style="background:#f2c418;color:#1b2233">手番</span>' : ''}</span>
        <span class="stats"><span>現金 <b>${yen(P.cash)}</b></span><span>材料 <b>${P.mat}</b></span><span>製品 <b>${P.prod}</b></span>
        <span>生産 <b>${E.prodCap(P)}</b></span><span>販売 <b>${E.salesCap(P)}</b></span><span>青 <b>${P.chips.blue}</b></span></span>
      </button>`;
    }).join('')}</div>`;
  }

  function logPanel(s) {
    const items = s.log.slice(-80).map(l => `<li class="${l.pid ? '' : 'sys'}"><span class="who">${l.pid ? pname(s, l.pid) : `第${l.p}期`}</span><span>${esc(l.t)}</span></li>`).join('');
    return `<p class="section-title">記録（下が最新）</p><div class="log"><ol>${items}</ol></div>`;
  }

  function topbar(ctx) {
    const s = ctx.s, n = s.order.length;
    const total = s.cfg.rounds * n, done = total - Math.max(0, s.turnsLeft);
    const cur = s.players[E.curPid(s)];
    return `<header class="topbar">
      <span class="period-badge">第${s.period}期<span style="font-size:14px;color:var(--desk-mute)">／${s.cfg.periods}期</span></span>
      <span class="turns"><small>この期の残り手番 ${Math.max(0, s.turnsLeft)}</small><span class="turnbar"><i style="width:${Math.round(done / total * 100)}%"></i></span></span>
      ${s.phase === 'turn' || s.phase === 'auction' || s.phase === 'risk' ? `<span class="now">${swatch(cur)}${esc(cur.company)}の手番${s.dir < 0 ? '（逆回り）' : ''}</span>` : ''}
      <span class="spacer"></span>
      ${ctx.connLabel ? `<span class="conn ${ctx.connOk ? 'ok' : 'ng'}">${ctx.connLabel}</span>` : ''}
      ${ctx.mode !== 'guest' ? `<label class="conn" for="speed">CPU速度</label><select id="speed" data-speed="1" style="font-size:12px">${[['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', '速い']].map(([v, l]) => `<option value="${v}" ${ctx.speed === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      <button class="btn small ghost" data-a="rules">ルール</button>
      <button class="btn small ghost" data-a="menu">メニュー</button>
    </header>`;
  }

  function game(ctx) {
    const s = ctx.s;
    return `<div class="game">${topbar(ctx)}
      <main class="layout">
        <section class="area-board board-wrap" aria-label="ボード">${board(s)}</section>
        <section class="area-action" aria-label="操作">${action(ctx)}</section>
        <section class="area-company" aria-label="会社盤">${company(s, ctx.viewPid, ctx)}</section>
        <section class="area-others">${others(s, ctx)}</section>
        <section class="area-log">${logPanel(s)}</section>
      </main></div>`;
  }

  // ---------- モーダル ----------
  function modal(inner, narrow) {
    return `<div class="modal-back" data-a="closeModal"><div class="sheet modal ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true" data-stop="1">${inner}</div></div>`;
  }

  function books(ctx) {
    const s = ctx.s, m = ctx.modal, pid = m.pid || ctx.viewPid, P = s.players[pid];
    const tabs = `<div class="tabs">${[['ledger', '現金出納帳'], ['fin', '決算書'], ['rank', '順位表']].map(([k, l]) => `<button class="tab ${m.tab === k ? 'on' : ''}" data-a="books" data-v="${k}">${l}</button>`).join('')}</div>`;
    const ptabs = m.tab === 'rank' ? '' : `<div class="tabs">${s.order.map(id => `<button class="tab ${id === pid ? 'on' : ''}" data-a="booksPid" data-v="${id}">${swatch(s.players[id])}${esc(s.players[id].company)}</button>`).join('')}</div>`;
    let body = '';
    if (m.tab === 'ledger') {
      const per = m.period || s.period;
      const hist = P.history.find(h => h.period === per);
      const rows = per === s.period && !(s.phase === 'periodEnd' || s.phase === 'over') ? P.ledger : (hist ? hist.ledger : P.ledger);
      const periods = [...new Set([...P.history.map(h => h.period), s.period])];
      body = `<div class="tabs">${periods.map(p => `<button class="tab ${p === per ? 'on' : ''}" data-a="booksPeriod" data-v="${p}">第${p}期</button>`).join('')}</div>` + ledgerTable(rows);
    } else if (m.tab === 'fin') {
      if (!P.history.length) body = '<p class="note">まだ決算がありません。期末処理のあとに表示されます。</p>';
      else {
        const per = m.period && P.history.find(h => h.period === m.period) ? m.period : P.history[P.history.length - 1].period;
        const h = P.history.find(x => x.period === per);
        body = `<div class="tabs">${P.history.map(x => `<button class="tab ${x.period === per ? 'on' : ''}" data-a="booksPeriod" data-v="${x.period}">第${x.period}期</button>`).join('')}</div>` + finance(h);
      }
    } else body = rankTable(s);
    return modal(`<div class="modal-head"><h2>${m.tab === 'rank' ? '順位表' : esc(P.company) + (m.tab === 'ledger' ? ' 現金出納帳' : ' 決算書')}</h2><button class="btn small" data-a="closeModal">閉じる</button></div>${tabs}${ptabs}<div class="scroll-x">${body}</div>`);
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

  function finance(h) {
    const t = (rows) => `<table class="fin-t">${rows.map(([k, v, cls]) => `<tr class="${cls || ''}"><th>${k}</th><td>${typeof v === 'number' ? sgn(v) : v}</td></tr>`).join('')}</table>`;
    const c = h.cost;
    const costBox = (name, x, inLabel, procLabel, lossLabel, outLabel) => t([
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
    const maxv = Math.max(h.PQ, h.VQ + h.F, 1);
    const pct = (v) => Math.max(0, Math.round(v / maxv * 100));
    const strac = `<div class="strac" aria-label="STRAC図">
      <div><div class="blk pq" style="height:100%"><small>売上高 PQ</small><b>${h.PQ}</b><small>P ${h.P} × Q ${h.Q}</small></div></div>
      <div style="grid-template-rows:${pct(h.VQ) || 1}fr ${pct(Math.max(h.MQ, 0)) || 1}fr"><div class="blk vq"><small>変動費 VQ</small><b>${h.VQ}</b></div><div class="blk mq"><small>付加価値 MQ</small><b>${sgn(h.MQ)}</b></div></div>
      <div style="grid-template-rows:${pct(h.F) || 1}fr ${pct(Math.abs(h.G)) || 1}fr"><div class="blk f"><small>固定費 F</small><b>${h.F}</b></div><div class="blk g ${h.G < 0 ? 'loss' : ''}"><small>経常利益 G</small><b>${sgn(h.G)}</b></div></div>
    </div>`;
    const ec = h.endCost;
    return `<div class="fin-grid">
      <div class="fin"><h3><span class="no">20</span>戦略会計 STRAC</h3>${strac}
        ${t([['売上単価 P', h.P], ['変動単価 vP', h.vP], ['付加価値単価 mP', h.P - h.vP], ['販売個数 Q', h.Q], ['付加価値率 m率', h.PQ ? Math.round(h.MQ / h.PQ * 100) + '%' : '−'], ['損益分岐点比率 F/MQ', h.MQ > 0 ? Math.round(h.F / h.MQ * 100) + '%' : '−']])}</div>
      <div class="fin"><h3><span class="no">19</span>固定費 F</h3>${t([['減価償却費', F.dep], ['労務費 シ', F.シ], ['製造経費 ス', F.ス], ['販売費 セ', F.セ], ['一般管理費 ソ', F.ソ], ['営業外費用 タ', F.タ], ['研究開発費 チ', F.チ], ['固定費合計', h.F, 'total']])}
        <p class="note">期末費用：ワーカー${ec.r.w}×人数、機械${ec.r.m}×延べ${ec.machines}台、セールスマン${ec.r.s}×人数、一般管理費${ec.r.a}×${ec.heads}人${h.emergency ? `。資金不足のため緊急借入 ${h.emergency}` : ''}</p></div>
      <div class="fin"><h3><span class="no">22</span>損益と法人税</h3>${t([['付加価値 MQ', h.MQ], ['固定費 F', -h.F], ['経常利益 G', h.G, 'total'], ['火災損失', -h.special.fire], ['製造ミス損失', -h.special.mistake], ['盗難・減耗損失', -h.special.theft], ['機械の故障損失', -(h.special.machine || 0)],['受取保険金', h.special.ins], ['機械売却損益', h.special.saleGain], ['税引前当期純利益', h.pretax, 'total'], ['前期繰越利益剰余金', h.prevRE], ['法人税等（50%）', -h.tax], ['当期純利益', h.net, 'total'], ['次期繰越利益剰余金', h.re]])}</div>
      <div class="fin"><h3><span class="no">23</span>貸借対照表 B/S</h3>${t([['現金', h.bs.cash], ['材料', h.bs.mat], ['仕掛品', h.bs.wip], ['製品', h.bs.prod], ['固定資産（機械）', h.bs.fixed], ['資産合計', h.bs.assets, 'total'], ['借入金', h.bs.loan], ['未払法人税等', h.bs.taxDue], ['負債合計', h.bs.liab, 'total'], ['資本金', h.bs.capital], ['繰越利益剰余金', h.bs.re], ['純資産合計', h.bs.equity, 'total'], ['差（0ならOK）', h.bs.diff]])}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　1.材料（倉庫）</h3>${costBox('材料', c.m, '材料仕入', null, '火災', '投入材料費')}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　2.仕掛品（工場）</h3>${costBox('仕掛品', c.w, '投入材料費', '投入費 コ', '製造ミス', '当期製品製造原価')}</div>
      <div class="fin"><h3><span class="no">14</span>原価計算　3.製品（営業所）</h3>${costBox('製品', c.p, '完成品', '完成費 サ', '盗難・減耗', '売上原価 VQ')}</div>
    </div>`;
  }

  function rankTable(s) {
    const ranked = s.order.map(id => s.players[id]).sort((a, b) => E.netAssets(b) - E.netAssets(a));
    const maxP = Math.max(0, ...ranked.map(P => P.history.length));
    const head = Array.from({ length: maxP }, (_, i) => `<th>第${i + 1}期 G</th>`).join('');
    return `<table class="rank"><thead><tr><th>順位</th><th class="nm">会社</th>${head}<th>借入金</th><th>純資産</th></tr></thead><tbody>${ranked.map((P, i) => `<tr class="${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td class="nm">${swatch(P)} ${esc(P.company)}</td>${Array.from({ length: maxP }, (_, k) => `<td>${P.history[k] ? sgn(P.history[k].G) : ''}</td>`).join('')}<td>${P.loan}</td><td><b>${sgn(E.netAssets(P))}</b></td></tr>`).join('')}</tbody></table>
      <p class="note">勝敗は純資産（資本金300＋繰越利益剰余金）で決まります。</p>`;
  }

  function auctionModal(s, la) {
    const rows = la.results.map(r => {
      const mk = E.MK[r.m];
      const pc = r.rebidComp != null ? r.rebidComp : (r.entries.find(e => e.parent) || {}).comp;
      const note = r.same ? `<p class="note">全員が競争価格${pc}で同じため親の負け${r.rebidComp != null ? '。子だけで再入札' : ''}</p>` : '';
      return `<div class="fin"><h3>${mk.name}（親が${r.q}個・空き${r.room != null ? r.room : r.q}個・上限${mk.cap}）</h3>${note}<table class="fin-t"><tr><th>順位</th><th>会社</th><td>入札</td><td>競争価格</td><td>販売</td></tr>${r.entries.map(e => `<tr><th>${e.withdrew ? '−' : e.rank}</th><th>${pname(s, e.pid)}${e.parent ? '（親）' : ''}</th><td>${e.p1 != null ? `${e.p1}→` : ''}${e.p}×${e.q}</td><td>${e.withdrew ? '辞退' : e.comp + (e.lost ? '（同じで負け）' : '')}</td><td>${e.sold ? `<b>${e.price}×${e.sold}</b>` : '−'}</td></tr>`).join('')}</table></div>`;
    }).join('');
    return modal(`<div class="modal-head"><h2>入札結果（親：${pname(s, la.parent)}）</h2><button class="btn small" data-a="closeModal">閉じる</button></div>
      <p class="note">競争価格＝入札価格 −2（親）−2×青チップ。安い順に、マーケットの空きの数まで売れます（1人あたりは親が出した個数まで）。全員の競争価格が同じなら親の負けで、子だけで再入札。マーケットリサーチがあると売上単価が+2（上限まで）。</p>
      <div class="fin-grid">${rows}</div>`);
  }

  function cardPop(s, lc, rest) {
    const who = pname(s, lc.pid);
    if (lc.kind === 'risk') {
      const c = D.RISK_CARDS.find(x => x.id === lc.id);
      return `<div class="card-pop risk-back" data-a="closeCard" role="dialog" aria-label="リスクカード"><div class="mgcard risk"><div style="display:grid;gap:8px">
        <div class="kind">RISK CARD</div><div class="who-big">${swatch(s.players[lc.pid])}${who}</div><h3>${esc(c.title)}</h3><p style="font-size:13px;margin:0">${esc(c.text)}</p>
        ${lc.detail ? `<p class="detail">${esc(lc.detail)}</p>` : ''}</div></div>
        <p class="close-hint">クリックで閉じる${rest ? `（あと${rest}枚）` : ''}</p></div>`;
    }
    return `<div class="card-pop" data-a="closeCard"><div class="mgcard decision"><div style="display:grid;gap:14px;justify-items:center">${markSvg('card-mark')}<b>${lc.kind === 'skip' ? '休み' : '意思決定カード'}</b><div class="who">${who}</div></div></div></div>`;
  }

  function rules() {
    const ec = [1, 2, 3, 4, 5].map(p => { const r = D.END_COST[p]; return `<tr><td>${p}期</td><td>${r.w}(${r.wl})</td><td>${r.m}</td><td>${r.s}(${r.sl})</td><td>${r.a}</td></tr>`; }).join('');
    return modal(`<div class="modal-head"><h2>製造業版 ジュニア・ルール表</h2><button class="btn small" data-a="closeModal">閉じる</button></div>
    <div class="rules">
      <div><h3>1ターンでする事</h3><ol><li>（必要なら）ルールBを何回でも</li><li>意思決定カードを引く。5枚に1枚は「リスクカードを引く」で、その場合はリスクカードに従って終わり</li><li>ルールAの項目から1つ選んで実行</li></ol>
      <p>期首処理 → ゲーム → 期末処理・決算 を1期とし、何期か繰り返して純資産が最も多い人の勝ちです。各チップ（赤・青・緑・黄）は1期間のみ有効で、期末に全て返却します。</p></div>
      <div class="scroll-x"><h3>ルールA 意思決定（1回につき1つ）</h3><table>
        <tr><th>項目</th><th>単価</th><th>能力・効果・注意</th><th>科目</th></tr>
        <tr><td>材料購入</td><td>札幌10 仙台11 東京12 名古屋13 大阪14 福岡15 ストッカー16</td><td>マーケットをまたがって何個でも購入可能。買うとマーケットに空きができる</td><td>ツ 材料</td></tr>
        <tr><td>設備投資</td><td>小型機械100／アタッチメント20／大型機械200</td><td>生産能力 小型1・大型4（各ワーカー1人必要）。アタッチメントは小型機械の能力+1</td><td>ケ 機械工具</td></tr>
        <tr><td>完成・投入</td><td>投入2／個・完成1／個</td><td>生産能力の範囲。完成から先に動かす</td><td>コ 投入費・サ 完成費</td></tr>
        <tr><td>採用</td><td>5／人</td><td>ワーカーは機械1台に1人必要。セールスマンは1人で2個販売可。会社都合で退職させることはできない</td><td>ソ 一般管理費</td></tr>
        <tr><td>広告（赤）</td><td>10</td><td>1枚で2個販売可。セールスマン1人につき2枚まで有効</td><td>セ 販売費</td></tr>
        <tr><td>研究開発（青）</td><td>20</td><td>1枚につき2の価格競争力。1度に1枚</td><td>チ 研究開発費</td></tr>
        <tr><td>商品販売（入札）</td><td>上限 札幌40 仙台36 東京32 名古屋28 大阪24 福岡20</td><td>親は販売能力以内で、各マーケットの空き個数まで販売宣言。子は親が出した個数まで、自分の販売能力以内で応札。競争価格（入札価格 −2（親）−2×青チップ）の安い順に、マーケットの空きの数まで売れる。同価格は青チップの数、親の順。ただし全員の競争価格が同じなら親の負けで、親以外で再入札</td><td>キ 売上</td></tr>
      </table></div>
      <div class="scroll-x"><h3>ルールB（カードを引く前に何回でも）</h3><table>
        <tr><th>項目</th><th>単価</th><th>能力・効果</th><th>科目</th></tr>
        <tr><td>保険（黄）</td><td>5</td><td>火災時に8／個、盗難時に10／個の保険金。受け取ったらチップを戻す</td><td>ソ</td></tr>
        <tr><td>PAC生産性（緑）</td><td>10（1枚のみ）</td><td>機械1台につき生産能力+1</td><td>ス</td></tr>
        <tr><td>マーチャンダイザー（緑）</td><td>10（1枚のみ）</td><td>材料が1個につき2安く買える</td><td>ソ</td></tr>
        <tr><td>マーケットリサーチ（緑）</td><td>10（1枚のみ）</td><td>入札で売れたら2高く売上できる（上限価格まで）</td><td>セ</td></tr>
        <tr><td>配置転換</td><td>研修費5</td><td>ワーカー⇔セールスマン</td><td>ソ</td></tr>
        <tr><td>機械売却</td><td>小型50・アタッチ10・大型100</td><td>購入時の半額。工場に機械が無い状態にはできない</td><td>イ</td></tr>
        <tr><td>銀行借入</td><td>同時に金利を支払</td><td>1期目=0、2・3期目=純資産の2倍・金利10%、4期目以降=純資産の3倍・金利5%。残高があれば毎期首に金利を支払う</td><td>オ・タ</td></tr>
        <tr><td>借入返済</td><td></td><td></td><td>ナ</td></tr>
      </table></div>
      <div class="scroll-x"><h3>期末費用単価表</h3><table><tr><th></th><th>労務費 シ（ワーカー/人）</th><th>製造経費 ス（機械/台）</th><th>販売費 セ（セールスマン/人）</th><th>一般管理費 ソ（人）</th></tr>${ec}</table>
        <p>カッコ内は途中退職し補充しなかった人の単価。機械台数は延べ台数。管理費の人数は期中最大人数（期末ワーカー・セールスマン＋退職者数）。</p></div>
      <div><h3>能力の例</h3><ul><li>生産：小型=1、小型+アタッチ=2、小型+PAC=2、小型+アタッチ+PAC=3、大型=4、大型+PAC=5</li><li>販売：セールスマン1人=2、広告1枚=4、広告2枚=6／2人=4、広告1枚=6、広告2枚=8</li><li>価格競争力：親は2安く言える、青チップ1枚につき2安く言える</li></ul></div>
      <div><h3>リスクカード（「工場の機械が壊れる」まではゼミのカード、以降はデジタル版で追加したもの）</h3><ul>${D.RISK_CARDS.map(c => `<li><b>${esc(c.title)}</b>（${c.weight}枚）：${esc(c.text)}</li>`).join('')}</ul></div>
      <div><h3>デジタル版の補足</h3><ul><li>マーケットの材料は毎期首にマーケットボリュームまで補充されます。</li><li>期首・期末の支払いで現金が不足した場合は、自動で緊急借入（10単位）になります。</li><li>全員同額で親が負けたあと子が1人だけなら、その子がそのまま落札します。再入札でも同価格・同順位になった場合は、ジャンケンの代わりにランダムで決まります。</li><li>法人税等は税引前当期純利益の50%（前期繰越利益剰余金がマイナスなら通算後）で、翌期首に納付します。</li></ul></div>
    </div>`);
  }

  return { title, setup, hostLobby, join, game, books, auctionModal, cardPop, rules, modal, esc };
})();
