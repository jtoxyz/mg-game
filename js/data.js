// マネジメントゲーム 製造業・ジュニアルール — ルールの数値
// ルール表（写真）から読み取った値。ここを書き換えればルールを調整できる。
'use strict';

const MG = {};

// マーケット：材料単価・販売上限価格・マーケットボリューム（ボード表記）
MG.MARKETS = [
  { id: 'sapporo', name: '札幌',   mat: 10, cap: 40, vol: 3 },
  { id: 'sendai',  name: '仙台',   mat: 11, cap: 36, vol: 4 },
  { id: 'tokyo',   name: '東京',   mat: 12, cap: 32, vol: 6 },
  { id: 'nagoya',  name: '名古屋', mat: 13, cap: 28, vol: 9 },
  { id: 'osaka',   name: '大阪',   mat: 14, cap: 24, vol: 13 },
  { id: 'fukuoka', name: '福岡',   mat: 15, cap: 20, vol: 20 },
];
MG.STOCKER_PRICE = 16;

MG.CAPITAL = 300;

MG.PRICE = {
  small: 100, attach: 20, large: 200,      // 設備投資 ケ
  insert: 2, complete: 1,                  // 投入費 コ / 完成費 サ
  hire: 5,                                 // 採用 ソ
  red: 10, blue: 20,                       // 広告 セ / 研究開発 チ
  yellow: 5, pac: 10, md: 10, mr: 10,      // 保険 ソ / PAC ス / MD ソ / MR セ
  transfer: 5,                             // 配置転換 ソ
};
MG.SELLBACK = { small: 50, attach: 10, large: 100 };   // 機械売却 イ
MG.DEPR = { small: 10, attach: 2, large: 20 };         // 減価償却（ジュニア）
MG.INSURANCE = { fire: 8, theft: 10 };

// 期末費用単価表：労務費(ワーカー) 製造経費(機械) 販売費(セールスマン) 一般管理費(人)
// wl / sl は途中退職し補充しなかった人の単価（カッコ内）
MG.END_COST = {
  1: { w: 15, wl: 10, m: 20, s: 15, sl: 10, a: 10 },
  2: { w: 17, wl: 12, m: 22, s: 17, sl: 12, a: 11 },
  3: { w: 19, wl: 14, m: 24, s: 19, sl: 14, a: 12 },
  4: { w: 21, wl: 16, m: 26, s: 21, sl: 16, a: 13 },
  5: { w: 23, wl: 18, m: 28, s: 23, sl: 18, a: 14 },
};
MG.endCost = (period) => MG.END_COST[Math.min(5, period)];

// 銀行借入：1期=0、2・3期=純資産の2倍・金利10%、4期以降=純資産の3倍・金利5%
MG.loanTerms = (period) =>
  period <= 1 ? { mult: 0, rate: 0.10 } :
  period <= 3 ? { mult: 2, rate: 0.10 } : { mult: 3, rate: 0.05 };

MG.TAX_RATE = 0.5;

// 意思決定カードのうち「リスクカードを引く」の割合
MG.RISK_RATIO = 0.2;

// リスクカード。weight = 山札に入っている枚数。効果は engine.js の applyRisk() に実装。
// 前半7枚はゼミのカード。後半はルール表に出てくる事象などを元にこちらで作ったもの。
MG.RETIRE_FEE = 5;   // 退職費（一般管理費 ソ）
MG.RISK_CARDS = [
  { id: 'quitW',     weight: 2, title: 'ワーカー退職',     text: 'ワーカーを1人退職。退職費5を払う（一般管理費）。' },
  { id: 'quitS',     weight: 2, title: 'セールスマン退職', text: 'セールスマンを1人退職。退職費5を払う（一般管理費）。' },
  { id: 'fire',      weight: 2, title: '倉庫火災発生',     text: '倉庫内の材料が燃えてなくなる。保険があったら材料1個につき8もらえる。' },
  { id: 'sick',      weight: 1, title: '社長が倒れた',     text: '1回休み。' },
  { id: 'reverse',   weight: 2, title: '逆回り',           text: '手番の順序が逆になる。' },
  { id: 'theft',     weight: 2, title: '窃盗',             text: '営業所で窃盗が起きる。製品がすべて盗まれる。保険があったら製品1個につき10もらえる。' },
  { id: 'breakdown', weight: 1, title: '工場の機械が壊れる', text: '工場の機械が全て壊れる（アタッチメントも含む）。' },
  { id: 'mistake',   weight: 2, title: '製造ミス',       text: '工場の仕掛品1個が不良品となり廃棄。' },
  { id: 'special',   weight: 2, title: '材料の特別購入', text: '材料を単価10で5個まで購入できる（マーチャンダイザーは無効）。' },
  { id: 'monopoly',  weight: 2, title: '独占販売',       text: '指定マーケットで、上限価格で製品を5個まで独占販売できる（販売能力以内・マーケットリサーチは無効）。' },
  { id: 'rdHit',     weight: 1, title: '研究開発の成功', text: '研究開発チップ（青）を1枚無償で獲得。' },
  { id: 'rdFail',    weight: 1, title: '研究開発の失敗', text: '研究開発チップ（青）を1枚失う。' },
  { id: 'adHit',     weight: 1, title: '広告が大ヒット', text: '広告チップ（赤）を1枚無償で獲得（セールスマン1人につき2枚まで）。' },
  { id: 'claim',     weight: 1, title: 'クレーム発生',   text: '製品1個を回収・廃棄する（保険の対象外）。' },
];

// 現金出納帳の科目（シートの記号）
MG.COLS = {
  イ: '機械売却', エ: '受取保険金', オ: '借入金', カ: '資本金', キ: '売上',
  ケ: '機械工具', コ: '投入費', サ: '完成費', シ: '労務費', ス: '製造経費',
  セ: '販売費', ソ: '一般管理費', タ: '営業外費用', チ: '研究開発費',
  ツ: '材料', ナ: '借入金返済', ニ: '納税',
};
MG.COLS_IN = ['イ', 'エ', 'オ', 'カ', 'キ'];
MG.COLS_OUT = ['ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'ナ', 'ニ'];

MG.COMPANY_COLORS = ['#c8372d', '#1f5fbf', '#2f8a3c', '#d9a514', '#7a4fb3', '#e06c1b'];

if (typeof module !== 'undefined') module.exports = MG;
