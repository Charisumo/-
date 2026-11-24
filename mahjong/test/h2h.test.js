// head-to-head: levels 2,3,4 + one more, rotating seats
const Game = require('../src/game.js'); const AI = require('../src/ai.js');
function mb(seed){return function(){seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function play(seed, levels){
  const g=new Game({length:'tonpuu',rng:mb(seed)});
  while(!g.over){const pd=g.pending;
    if(pd.kind==='discard')g.act(pd.p,AI.decide(g,pd.p,levels[pd.p]));
    else if(pd.kind==='claim'){for(const q of Object.keys(pd.opts).map(Number)){if(pd.responses[q])continue;g.act(q,AI.decideClaim(g,q,levels[q]));if(g.pending!==pd)break;}}
    else if(pd.kind==='roundEnd')g.act(0,{t:'next'});}
  return g.final.players;
}
const N=+process.argv[2]||12; const lv=[1,2,3,4]; const pts={1:0,2:0,3:0,4:0};
for(let s=0;s<N;s++){const rot=s%4;const levels=lv.map((_,i)=>lv[(i+rot)%4]);const f=play(900+s,levels);f.forEach((x,i)=>pts[levels[i]]+=x.pts);}
for(const l of lv)console.log('level',l,'avg pts',(pts[l]/N).toFixed(1));
