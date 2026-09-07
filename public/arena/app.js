
const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#06101d');tg.setBackgroundColor('#06101d')}catch{}}
const user=tg?.initDataUnsafe?.user||null;
const key='alekTapGameV1';
let s=JSON.parse(localStorage.getItem(key)||'null')||{
 points:0,energy:1000,maxEnergy:1000,tapPower:1,recharge:3,level:1,referrals:0,lastDaily:0,
 boosts:{tap:1,energy:1,recharge:1},missions:{tap100:false,tap1000:false,boost:false,daily:false,invite:false}
};

const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1300)};
const save=()=>localStorage.setItem(key,JSON.stringify(s));
if(user) $('#playerName').textContent=user.first_name+(user.username?' · @'+user.username:'');

setTimeout(()=>$('#splash').classList.add('hide'),1600);

function levelFor(p){return Math.max(1,Math.floor(Math.sqrt(p/2500))+1)}
function leagueFor(l){return l<3?'Bronze League':l<6?'Silver League':l<10?'Gold League':l<15?'Diamond League':'ALEK Elite'}
function render(){
 s.level=levelFor(s.points);
 $('#points').textContent=Math.floor(s.points).toLocaleString();
 $('#energy').textContent=Math.floor(s.energy);
 $('#maxEnergy').textContent=s.maxEnergy;
 $('#recharge').textContent=s.recharge;
 $('#level').textContent=s.level;
 const tp=$('#tapPower'); if(tp) tp.textContent=s.tapPower;
 const hr=$('#homeRefs'); if(hr) hr.textContent=s.referrals;
 $('#league').textContent=leagueFor(s.level);
 $('#energyFill').style.width=`${Math.max(0,Math.min(100,s.energy/s.maxEnergy*100))}%`;
 $('#refCount').textContent=s.referrals;
 renderBoosts();renderMissions();renderLeader();
 save();
}
function tap(e){
 if(s.energy<1){toast('Energy depleted');return}
 const val=Math.min(s.tapPower,s.energy);s.points+=val;s.energy-=val;
 s.missions.tap100=s.points>=100;s.missions.tap1000=s.points>=1000;
 const f=document.createElement('span');f.className='float';f.textContent='+'+val;
 const r=$('.coin-wrap').getBoundingClientRect();f.style.left=`${e.clientX-r.left-12}px`;f.style.top=`${e.clientY-r.top-10}px`;$('#floatLayer').appendChild(f);setTimeout(()=>f.remove(),800);
 try{tg?.HapticFeedback?.impactOccurred('light')}catch{}
 render();
}
$('#tapCoin').addEventListener('pointerdown',tap);

const boosts=[
 {id:'tap',icon:'👆',name:'Multi Tap',desc:'More points per tap',price:()=>250*s.boosts.tap,val:()=>s.tapPower},
 {id:'energy',icon:'🔋',name:'Energy Limit',desc:'Increase max energy',price:()=>400*s.boosts.energy,val:()=>s.maxEnergy},
 {id:'recharge',icon:'⚡',name:'Recharge Speed',desc:'Faster energy recharge',price:()=>600*s.boosts.recharge,val:()=>s.recharge}
];
function renderBoosts(){
 const box=$('#boostList');if(!box)return;
 box.innerHTML=boosts.map(b=>`<div class="panel boost-item"><div class="iconbox">${b.icon}</div><div class="grow"><b>${b.name}</b><small>${b.desc} · Lv ${s.boosts[b.id]}</small><div class="price">${b.price().toLocaleString()} Points</div></div><button class="buy" data-buy="${b.id}">Upgrade</button></div>`).join('');
 $$('[data-buy]').forEach(btn=>btn.onclick=()=>buyBoost(btn.dataset.buy));
}
function buyBoost(id){
 const b=boosts.find(x=>x.id===id),price=b.price();if(s.points<price){toast('Not enough points');return}
 s.points-=price;s.boosts[id]++;
 if(id==='tap')s.tapPower++;
 if(id==='energy'){s.maxEnergy+=500;s.energy=Math.min(s.maxEnergy,s.energy+500)}
 if(id==='recharge')s.recharge++;
 s.missions.boost=true;toast('Boost upgraded');render();
}
function renderMissions(){
 const items=[
  ['tap100','👆','Earn 100 Points',250],
  ['tap1000','🔥','Earn 1,000 Points',1000],
  ['boost','⚡','Buy any Boost',500],
  ['daily','🎁','Claim Daily Reward',750],
  ['invite','👥','Invite a Friend',5000]
 ];
 $('#missionList').innerHTML=items.map(([id,ic,n,r])=>`<div class="panel mission-item"><div class="iconbox">${ic}</div><div class="grow"><b>${n}</b><small>Reward: ${r.toLocaleString()} Points</small></div><b>${s.missions[id]?'✓':'•'}</b></div>`).join('');
}
const demoLeaders=[['Nova',875420],['Kael',681250],['Nyx',522910],['Orion',411200],['Lyra',298330]];
function renderLeader(){
 $('#leaderList').innerHTML=demoLeaders.map((x,i)=>`<div class="panel leader-item"><div class="iconbox">${i+1}</div><div class="grow"><b>${x[0]}</b><small>ALEK Player</small></div><b>${x[1].toLocaleString()}</b></div>`).join('');
}
function showView(v){
 $$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
 $$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.go===v));
 window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));

$('#dailyBtn').addEventListener('click',()=>{
 const now=Date.now(),day=86400000;if(now-s.lastDaily<day){toast('Daily reward already claimed');return}
 s.lastDaily=now;s.points+=1500;s.missions.daily=true;$('#dailyText').textContent='Come back tomorrow';toast('+1,500 ALEK Points');render();
});
$('#inviteBtn').addEventListener('click',()=>{
 s.missions.invite=true;
 const url='https://alek.best/arena/';
 const text='Join me in ALEK Tap Arena ⚡';
 try{tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)}catch{}
 toast('Invite opened');render();
});

setInterval(()=>{if(s.energy<s.maxEnergy){s.energy=Math.min(s.maxEnergy,s.energy+s.recharge);render()}},1000);
render();
