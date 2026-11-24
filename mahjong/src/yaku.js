/* In-game yaku reference (modal) */
(function () {
  const MJ = globalThis.MJ;

  // [id, closedHan, openHan ('-' = closed only), example, ja, en]
  const GROUPS = [
    ['1', [
      ['riichi', 1, '-', '', '門前で聴牌し、1000点を出して宣言。', 'Declare with a closed tenpai hand (pay 1000).'],
      ['ippatsu', 1, '-', '', 'リーチ後、1巡以内(鳴きが入らない間)に和了。', 'Win within one go-around after riichi, with no calls.'],
      ['menzenTsumo', 1, '-', '', '門前のままツモ和了。', 'Win by self-draw with a closed hand.'],
      ['tanyao', 1, 1, '234m567p345s678s55p', '2〜8の数牌だけで作る(喰いタンあり)。', 'Only tiles 2-8 (open tanyao allowed).'],
      ['pinfu', 1, '-', '123m456p789s234p77s', '順子4組+役のない雀頭+両面待ち。符は固定。', 'Four sequences, non-yakuhai pair, two-sided wait.'],
      ['iipeikou', 1, '-', '223344m567p789s88s', '同じ順子を2組(門前のみ)。', 'Two identical sequences (closed only).'],
      ['yakuhaiHaku', 1, 1, '555z', '白・發・中、場風、自風の刻子(各1翻)。', 'Triplet of dragons, round wind, or seat wind (1 han each).'],
      ['haitei', 1, 1, '', '最後の牌でツモ和了(海底)/最後の捨て牌でロン(河底)。', 'Win on the last draw (haitei) or the last discard (houtei).'],
      ['rinshan', 1, 1, '', 'カンの後の補充牌でツモ和了。', 'Win on the replacement tile after a kan.'],
      ['chankan', 1, 1, '', '他家の加槓にロン。', 'Ron on another player’s added kan.'],
    ]],
    ['2', [
      ['doubleRiichi', 2, '-', '', '配牌直後の第一打でリーチ。', 'Riichi on your very first discard.'],
      ['chiitoi', 2, '-', '1133m2255p4466s77z', '7種類の対子。25符固定。', 'Seven distinct pairs. Fixed 25 fu.'],
      ['toitoi', 2, 2, '111m333p555s999s77z', '刻子(槓子)4組。', 'Four triplets.'],
      ['sanankou', 2, 2, '', '暗刻が3組。', 'Three concealed triplets.'],
      ['sanshokuDoukou', 2, 2, '', '3色で同じ数字の刻子。', 'Same-number triplets in all three suits.'],
      ['sankantsu', 2, 2, '', '槓子が3組。', 'Three kans.'],
      ['shousangen', 2, 2, '', '三元牌のうち2種が刻子、1種が雀頭。', 'Two dragon triplets and a dragon pair.'],
      ['honroutou', 2, 2, '', '一九字牌だけ(対々和か七対子と複合)。', 'Only terminals and honors.'],
      ['sanshoku', 2, 1, '123m123p123s', '3色で同じ数字の順子。', 'Same sequence in all three suits.'],
      ['ittsu', 2, 1, '123456789m234p55s', '同じ色で123・456・789の順子。', '123, 456, 789 in one suit.'],
      ['chanta', 2, 1, '123m789p123s999s11z', 'すべての面子と雀頭に一九字牌を含む(字牌あり)。', 'Every set and the pair contain a terminal or honor.'],
    ]],
    ['3', [
      ['honitsu', 3, 2, '123456789m111z55z', '1色の数牌+字牌だけ。', 'One suit plus honors only.'],
      ['junchan', 3, 2, '123m789m123p999s11p', 'すべてに一九牌を含む(字牌なし)。', 'Every set and the pair contain a terminal (no honors).'],
      ['ryanpeikou', 3, '-', '112233m445566p77s', '一盃口が2組(門前のみ)。', 'Two sets of iipeikou (closed only).'],
    ]],
    ['6', [
      ['chinitsu', 6, 5, '11223344556677m', '1色の数牌だけ。', 'One suit only.'],
    ]],
    ['Y', [
      ['kokushi', 'Y', '-', '19m19p19s1234567z', '13種の一九字牌を1枚ずつ+そのうち1枚を対子に。', 'One of each of the 13 terminals and honors, plus a pair.'],
      ['suuankou', 'Y', '-', '', '暗刻が4組(門前)。', 'Four concealed triplets.'],
      ['daisangen', 'Y', 'Y', '555666777z123m99p', '白發中すべてを刻子に。', 'Triplets of all three dragons.'],
      ['shousuushii', 'Y', 'Y', '', '風牌3種が刻子、1種が雀頭。', 'Three wind triplets and a wind pair.'],
      ['tsuuiisou', 'Y', 'Y', '', '字牌だけ。', 'Honors only.'],
      ['chinroutou', 'Y', 'Y', '', '一九牌だけ。', 'Terminals only.'],
      ['ryuuiisou', 'Y', 'Y', '', '2・3・4・6・8索と發だけ。', 'Only 2,3,4,6,8 sou and green dragon.'],
      ['chuuren', 'Y', '-', '11123456789995m', '1色で1112345678999+任意の1枚。', 'One suit 1112345678999 plus any tile.'],
      ['suukantsu', 'Y', 'Y', '', '槓子が4組。', 'Four kans.'],
      ['tenhou', 'Y', '-', '', '親の配牌でそのままツモ和了。', 'Dealer wins on the initial hand.'],
      ['chiihou', 'Y', '-', '', '子が最初のツモで和了(鳴きなし)。', 'Non-dealer wins on the first draw with no calls.'],
      ['kokushi13', 'YY', '-', '', '国士無双の十三面待ち(ダブル役満)。', 'Kokushi on a 13-sided wait (double yakuman).'],
      ['suuankouTanki', 'YY', '-', '', '四暗刻の単騎待ち(ダブル役満)。', 'Suuankou on a pair wait (double yakuman).'],
      ['daisuushii', 'YY', 'YY', '', '風牌4種すべてを刻子に(ダブル役満)。', 'Triplets of all four winds (double yakuman).'],
      ['chuuren9', 'YY', '-', '', '純正九蓮宝燈(ダブル役満)。', 'Nine-sided chuuren (double yakuman).'],
    ]],
  ];

  function parse(str) {
    const out = [];
    let digits = [];
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') digits.push(+ch);
      else {
        const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
        for (const d of digits) out.push(base + d - 1);
        digits = [];
      }
    }
    return out;
  }

  function limitRows(L) {
    const S = MJ.score;
    const up = (x) => Math.ceil(x / 100) * 100;
    const rows = [];
    const add = (label, han, fu) => {
      const b = S.basicPoints(han, fu, 0);
      rows.push([label, up(b * 4).toLocaleString(), up(b * 6).toLocaleString(), `${up(b).toLocaleString()} / ${up(b * 2).toLocaleString()}`, `${up(b * 2).toLocaleString()}`]);
    };
    [[1, 30], [1, 40], [2, 30], [2, 40], [3, 30], [3, 40], [4, 30]].forEach(([h, f]) => add(`${h}${L.han} ${f}${L.fu}`, h, f));
    add(`5${L.han} (${L.mangan})`, 5, 30);
    add(`6-7${L.han} (${L.haneman})`, 6, 30);
    add(`8-10${L.han} (${L.baiman})`, 8, 30);
    add(`11-12${L.han} (${L.sanbaiman})`, 11, 30);
    add(`13${L.han}+ (${L.kazoe}/${L.yakuman})`, 13, 30);
    return rows;
  }

  function show(L, lang) {
    const h = MJ.h;
    const old = document.getElementById('yakuModal');
    if (old) old.remove();
    const ja = lang === 'ja';
    const tabs = [['1', '1' + L.han], ['2', '2' + L.han], ['3', '3' + L.han], ['6', '6' + L.han], ['Y', L.yakumanW], ['pts', ja ? '点数表' : 'Scores'], ['misc', ja ? 'ドラほか' : 'Dora etc.']];
    let cur = '1';
    const body = h('div', { class: 'ybody' });
    const tabBar = h('div', { class: 'ytabs' });
    const render = () => {
      tabBar.innerHTML = '';
      tabs.forEach(([k, label]) => tabBar.append(h('button', { class: 'mini' + (k === cur ? ' on' : ''), onclick: () => { cur = k; render(); } }, label)));
      body.innerHTML = '';
      if (cur === 'pts') {
        const tbl = h('table', { class: 'scores ptbl' }, h('tr', {}, h('th', {}, ''), h('th', {}, ja ? '子ロン' : 'Non-dealer ron'), h('th', {}, ja ? '親ロン' : 'Dealer ron'), h('th', {}, ja ? '子ツモ' : 'Non-dealer tsumo'), h('th', {}, ja ? '親ツモ(各)' : 'Dealer tsumo (each)')));
        limitRows(L).forEach((r) => tbl.append(h('tr', {}, r.map((c) => h('td', {}, c)))));
        body.append(tbl, h('p', { class: 'note' }, ja ? '役満は子32000/親48000。ツモは「子 / 親」の支払い。本場1つにつき300点、供託はトップ和了者が取ります。' : 'Yakuman: 32000 non-dealer / 48000 dealer. Tsumo shows "non-dealer / dealer" payments. Each honba adds 300; riichi sticks go to the winner.'));
      } else if (cur === 'misc') {
        const items = ja ? [
          ['ドラ', '表示牌の「次の牌」がドラ。1枚につき1翻(役がないと和了れません)。'],
          ['裏ドラ', 'リーチして和了したときだけ、裏の表示牌の次の牌も1枚1翻。'],
          ['赤ドラ', '赤い5(各色1枚)は1枚1翻。'],
          ['抜きドラ(三麻)', '北を抜くと1枚1翻。三麻では1・9以外の萬子がありません。'],
          ['フリテン', '自分が捨てた牌で和了できる形、または見逃した牌ではロンできません(ツモはOK)。'],
          ['流し満貫', '捨て牌がすべて一九字牌で、1枚も鳴かれなければ満貫扱い。'],
          ['途中流局', '九種九牌・四風連打・四家立直・四開槓・三家和で流局。'],
          ['ウマ・オカ', '4人は30000点返し、ウマ+20/+10/-10/-20。三麻は40000点返し、ウマ+15/0/-15。'],
        ] : [
          ['Dora', 'The tile after the indicator. +1 han each (you still need a yaku to win).'],
          ['Ura dora', 'Only when you win after riichi: the tile after the hidden indicator, +1 han each.'],
          ['Red fives', 'The red 5s (one per suit) are +1 han each.'],
          ['Nukidora (3-player)', 'Each North set aside is +1 han. Sanma has no 2-8 man.'],
          ['Furiten', 'You cannot ron if you could win on your own discards, or on a tile you passed (tsumo is fine).'],
          ['Nagashi mangan', 'All your discards are terminals/honors and none were called: scored as mangan.'],
          ['Abortive draws', 'Nine terminals, four winds, four riichi, four kans, triple ron.'],
          ['Uma / Oka', '4p: 30000 return, uma +20/+10/-10/-20. 3p: 40000 return, uma +15/0/-15.'],
        ];
        items.forEach(([t, d]) => body.append(h('div', { class: 'yitem' }, h('b', {}, t), h('p', {}, d))));
      } else {
        const g = GROUPS.find((x) => x[0] === cur);
        const head = h('div', { class: 'yhead' }, h('span', {}, ''), h('span', {}, ja ? '門前' : 'Closed'), h('span', {}, ja ? '鳴き' : 'Open'));
        body.append(head);
        g[1].forEach(([id, c, o, ex, jd, ed]) => {
          const fmt = (v) => (v === '-' ? '—' : v === 'Y' ? L.yakumanW : v === 'YY' ? 'W' + L.yakumanW : v + L.han);
          const item = h('div', { class: 'yitem' },
            h('div', { class: 'yline' }, h('b', {}, L.yaku[id]), h('span', {}, fmt(c)), h('span', {}, fmt(o))),
            h('p', {}, ja ? jd : ed));
          if (ex) item.append(h('div', { class: 'trow ex' }, parse(ex).map((t) => MJ.tileEl(L, { t, red: false }, { small: true }))));
          body.append(item);
        });
      }
      body.scrollTop = 0;
    };
    const close = () => modal.remove();
    const modal = h('div', { class: 'modal', id: 'yakuModal', onclick: (e) => { if (e.target === modal) close(); } },
      h('div', { class: 'mcard ycard' }, h('div', { class: 'ytop' }, h('h2', {}, ja ? '役一覧' : 'Yaku list'), h('button', { class: 'mini', onclick: close }, '✕')), tabBar, body));
    document.body.append(modal);
    render();
  }

  MJ.showYaku = show;
})();
