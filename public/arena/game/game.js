
export const HEROES = {
 nova:{id:'nova',name:'Nova',img:'./game/assets/hero-nova.svg',maxHp:120,attack:[15,22],power:[28,38],heal:[16,24],crit:.16},
 kael:{id:'kael',name:'Kael',img:'./game/assets/hero-kael.svg',maxHp:138,attack:[13,20],power:[25,34],heal:[13,20],crit:.12},
 nyx:{id:'nyx',name:'Nyx',img:'./game/assets/hero-nyx.svg',maxHp:105,attack:[17,24],power:[31,42],heal:[12,18],crit:.23}
};
export const STAGES = [
 {stage:1,name:'Sector 01',enemy:'Void Drone',img:'./game/assets/enemy-drone.svg',hp:78,attack:[8,14],reward:{points:120,xp:30}},
 {stage:2,name:'Sector 02',enemy:'Cyber Raider',img:'./game/assets/enemy-raider.svg',hp:96,attack:[10,16],reward:{points:160,xp:38}},
 {stage:3,name:'Sector 03',enemy:'Neon Warden',img:'./game/assets/enemy-warden.svg',hp:122,attack:[12,19],reward:{points:220,xp:46}},
 {stage:4,name:'BOSS',enemy:'Abyss Titan',img:'./game/assets/boss-titan.svg',hp:175,attack:[14,23],reward:{points:420,xp:80,boss:true}}
];
export function rand([a,b]){return Math.floor(a+Math.random()*(b-a+1))}
export function createLocalBattle(heroId='nova',stageNum=1){
 const hero=HEROES[heroId]||HEROES.nova;const stage=STAGES[(stageNum-1)%STAGES.length];
 return {id:'local',hero:{...hero,hp:hero.maxHp,shield:0,powerCd:0,healCd:0},enemy:{...stage,hp:stage.hp,maxHp:stage.hp},stage:stageNum,round:1,status:'active',log:`${hero.name} enters ${stage.name}.`};
}
export function localAction(b,action){
 if(b.status!=='active')return b;
 const h=b.hero,e=b.enemy;
 let log='';
 if(action==='attack'){let dmg=rand(h.attack);if(Math.random()<h.crit){dmg=Math.round(dmg*1.75);log='Critical hit! '}e.hp=Math.max(0,e.hp-dmg);log+=`${h.name} deals ${dmg}.`}
 if(action==='power'){if(h.powerCd>0)return {...b,log:'Power Strike is recharging.'};const dmg=rand(h.power);e.hp=Math.max(0,e.hp-dmg);h.powerCd=2;log=`Power Strike deals ${dmg}!`}
 if(action==='heal'){if(h.healCd>0)return {...b,log:'Heal is recharging.'};const heal=rand(h.heal);h.hp=Math.min(h.maxHp,h.hp+heal);h.healCd=3;log=`Recovered ${heal} HP.`}
 if(action==='shield'){h.shield=12;log='Energy shield activated.'}
 if(e.hp<=0){b.status='won';b.log=`${log} ${e.enemy} defeated!`;return b}
 let edmg=rand(e.attack);const blocked=Math.min(h.shield||0,edmg);edmg-=blocked;h.shield=Math.max(0,(h.shield||0)-blocked);h.hp=Math.max(0,h.hp-edmg);
 h.powerCd=Math.max(0,(h.powerCd||0)-1);h.healCd=Math.max(0,(h.healCd||0)-1);b.round++;
 b.log=`${log} ${e.enemy} hits for ${edmg}${blocked?` (${blocked} blocked)`:''}.`;
 if(h.hp<=0)b.status='lost';
 return b;
}
