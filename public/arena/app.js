
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#07111f'); tg.setBackgroundColor('#07111f'); } catch {}
}

const API_BASE = '/api';
const BOT_USERNAME = 'ALEKArenaBot'; // change if your real bot username differs

const demoState = {
  route:'home', level:1, xp:0, xpMax:100, energy:20, maxEnergy:20,
  points:0, crystals:250, wins:0, losses:0, referrals:0,
  streak:1, dailyClaimed:false,
  missions:{login:true,play3:false,upgrade:false,invite:false,website:false},
  inventory:[]
};

let state = {...demoState};
let serverMode = false;
let me = null;

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const energyTop = document.querySelector('#energyTop');

function fmt(n){return new Intl.NumberFormat().format(n)}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),1800)}
function haptic(type='light'){try{tg?.HapticFeedback?.impactOccurred(type)}catch{}}
function nav(route){state.route=route;render();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===route));window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.route)));

async function api(path, opts={}){
  const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
  const r = await fetch(API_BASE+path,{...opts,headers});
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function boot(){
  try{
    const res = await api('/me');
    state = {...state,...res.player,route:'home'};
    me = res.user;
    serverMode = true;
  }catch(e){
    const saved = localStorage.getItem('alekArenaDemo');
    if(saved){try{state={...state,...JSON.parse(saved)}}catch{}}
    serverMode=false;
  }
  render();
}

function saveDemo(){if(!serverMode)localStorage.setItem('alekArenaDemo',JSON.stringify(state));energyTop.textContent=state.energy}
function identity(){return me?.first_name || me?.username || 'ALEK Player'}

function home(){
  const pct=Math.min(100,(state.xp/state.xpMax)*100);
  return `
  <section class="hero">
    <div class="eyebrow">SEASON 01 · ORIGIN</div><h2>Build. Compete. Grow.</h2>
    <p>Develop your ALEK base, complete missions, climb the Arena leaderboard and unlock rewards.</p>
    <button class="primary" id="quickBattle">⚔ Quick Battle</button>
  </section>
  <div class="grid2">
    <div class="card stat"><b>${fmt(state.points)}</b><span>ALEK Points</span></div>
    <div class="card stat"><b>${state.level}</b><span>Player Level</span></div>
  </div>
  <div class="section-title"><h3>${identity()}</h3><span>${serverMode?'SYNCED':'DEMO MODE'}</span></div>
  <div class="card profile-head"><div class="avatar">A</div><div><div class="title">Level ${state.level}</div><div class="sub">${state.xp}/${state.xpMax} XP</div></div></div>
  <div class="card"><div class="progress"><i style="width:${pct}%"></i></div></div>
  <div class="section-title"><h3>Daily Reward</h3><span>${state.streak} day streak</span></div>
  <div class="card row"><div><div class="title">${state.dailyClaimed?'Claimed today':'Daily login bonus'}</div><div class="sub reward">+100 Points · +5 Energy</div></div><button class="secondary" id="dailyBtn" ${state.dailyClaimed?'disabled':''}>${state.dailyClaimed?'DONE':'CLAIM'}</button></div>
  <div class="section-title"><h3>Base Modules</h3><span>3 active</span></div>
  ${moduleCard('🏛️','Command Center','Lv. 1','+5% mission XP')}
  ${moduleCard('⛏️','Mine','Lv. 1','Generates Points')}
  ${moduleCard('🔬','Research Lab','Lv. 1','Unlocks boosts')}
  <div class="notice">${serverMode?'Progress is synced to the server.':'Preview mode: open from Telegram after backend deployment to sync progress.'}</div>`;
}
function moduleCard(icon,name,level,sub){return `<div class="card row"><div class="row-left"><div class="icon">${icon}</div><div><div class="title">${name}</div><div class="sub">${level} · ${sub}</div></div></div><button class="secondary upgrade-btn">Upgrade</button></div>`}

const missionDefs=[
 ['login','✅','Login to the game',100],['play3','⚔️','Play 3 Arena matches',300],
 ['upgrade','🏗️','Upgrade a building',250],['invite','👥','Invite a friend',500],
 ['website','🌐','Visit ALEK website',200]
];
function missionsPage(){return `<div class="section-title"><h3>Missions</h3><span>Daily</span></div>
<div class="pillbar"><button class="pill active">Daily</button><button class="pill">Weekly</button><button class="pill">Special</button></div>
${missionDefs.map(([id,ic,name,reward])=>`<div class="card row"><div class="row-left"><div class="icon">${ic}</div><div><div class="title">${name}</div><div class="sub reward">+${reward} Points</div></div></div>${state.missions[id]?'<span class="tag">DONE</span>':`<button class="secondary mission-btn" data-mission="${id}">Go</button>`}</div>`).join('')}
<div class="card sponsor"><div class="eyebrow">SPONSORED MISSION</div><div class="title" style="margin-top:8px">Advertiser slot</div><div class="sub">Future paid partners can run clearly labeled missions here.</div></div>`}

function arenaPage(){return `<div class="section-title"><h3>Arena</h3><span>Ranked</span></div>
<div class="card center"><div class="muted">YOUR POWER</div><div class="big">${1000+state.level*70}</div><div style="margin:16px 0;font-size:34px">⚡ VS ⚔️</div><div class="muted">Energy cost: 2</div><button class="primary" id="battleBtn" style="width:100%;margin-top:14px">BATTLE</button></div>
<div class="grid2"><div class="card stat"><b>${state.wins}</b><span>Wins</span></div><div class="card stat"><b>${state.losses}</b><span>Losses</span></div></div>
<div class="section-title"><h3>Leaderboard</h3><span>Top players</span></div><div class="card" id="leaderboardCard"><div class="muted">Loading...</div></div>`}

function friendsPage(){
 const link=`https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(me?.id||'alek')}`;
 return `<div class="section-title"><h3>Friends & Referrals</h3><span>Grow together</span></div>
 <div class="card center"><div class="big">${state.referrals}</div><div class="muted">Active referrals</div><button class="primary" id="inviteBtn" style="width:100%;margin-top:14px">Invite Friends</button><div class="sub" style="margin-top:10px;word-break:break-all">${link}</div></div>
 ${refCard('Invite 5 friends',500,state.referrals,5)}${refCard('Invite 25 friends',2500,state.referrals,25)}${refCard('Invite 100 friends',10000,state.referrals,100)}
 <div class="notice">Referral rewards are granted when invited users actually open ALEK Arena.</div>`}
function refCard(title,reward,current,target){return `<div class="card"><div class="row"><div><div class="title">${title}</div><div class="sub reward">+${fmt(reward)} Points</div></div><span>${Math.min(current,target)}/${target}</span></div><div style="height:10px"></div><div class="progress"><i style="width:${Math.min(100,current/target*100)}%"></i></div></div>`}

const boxes=[
{id:'starter',name:'Starter Box',icon:'📦',price:80,rarity:'Common+'},
{id:'cyber',name:'Cyber Box',icon:'🧰',price:180,rarity:'Rare+'},
{id:'elite',name:'Elite Box',icon:'🎁',price:350,rarity:'Epic+'},
{id:'legend',name:'Legend Box',icon:'🛸',price:600,rarity:'Legendary chance'}];
function shopPage(){return `<div class="section-title"><h3>Shop & Boxes</h3><span>${fmt(state.crystals)} crystals</span></div>
<div class="notice" style="margin-bottom:12px">Current boxes use in-game crystals only. Real-money/ALK purchases should be added only after secure payments, published odds and compliance review.</div>
<div class="box-grid">${boxes.map(b=>`<div class="card box-card"><div class="box-art">${b.icon}</div><div class="title">${b.name}</div><div class="sub">${b.rarity}</div><div class="price">💎 ${b.price}</div><button class="primary box-btn" data-box="${b.id}" style="width:100%">OPEN</button></div>`).join('')}</div>
<div class="section-title"><h3>Inventory</h3><span>${state.inventory?.length||0} items</span></div>
<div class="card">${state.inventory?.length?state.inventory.map(x=>`<div class="leader"><span>${x}</span></div>`).join(''):'<div class="muted">No items yet.</div>'}</div>`}

function render(){
 energyTop.textContent=state.energy;
 const pages={home,missions:missionsPage,arena:arenaPage,friends:friendsPage,shop:shopPage};
 app.innerHTML=(pages[state.route]||home)();
 bind();
 if(state.route==='arena')loadLeaderboard();
}

function bind(){
 document.querySelector('#quickBattle')?.addEventListener('click',()=>nav('arena'));
 document.querySelector('#battleBtn')?.addEventListener('click',battle);
 document.querySelector('#dailyBtn')?.addEventListener('click',claimDaily);
 document.querySelectorAll('.upgrade-btn').forEach(b=>b.addEventListener('click',upgrade));
 document.querySelectorAll('.mission-btn').forEach(b=>b.addEventListener('click',mission));
 document.querySelectorAll('.box-btn').forEach(b=>b.addEventListener('click',openBox));
 document.querySelector('#inviteBtn')?.addEventListener('click',invite);
}

async function claimDaily(){
 try{
  if(serverMode){const r=await api('/daily',{method:'POST'});state={...state,...r.player};toast(r.message)}
  else{if(state.dailyClaimed)return;state.dailyClaimed=true;state.points+=100;state.energy=Math.min(state.maxEnergy,state.energy+5);toast('Daily reward claimed')}
  haptic();saveDemo();render();
 }catch(e){toast('Could not claim reward')}
}
async function battle(){
 if(state.energy<2){toast('Not enough energy');return}
 try{
  if(serverMode){const r=await api('/battle',{method:'POST'});state={...state,...r.player};toast(r.message)}
  else{state.energy-=2;const win=Math.random()<.62;if(win){state.wins++;state.points+=200;state.xp+=50;toast('Victory! +200 Points')}else{state.losses++;state.points+=60;state.xp+=20;toast('Defeat · +60 Points')}levelCheck()}
  haptic('medium');saveDemo();render();
 }catch(e){toast('Battle failed')}
}
function levelCheck(){while(state.xp>=state.xpMax){state.xp-=state.xpMax;state.level++;state.xpMax=Math.round(state.xpMax*1.25)}}
async function upgrade(){
 try{
  if(serverMode){const r=await api('/upgrade',{method:'POST'});state={...state,...r.player};toast(r.message)}
  else{if(state.points<150){toast('Need 150 Points');return}state.points-=150;state.xp+=30;state.missions.upgrade=true;levelCheck();toast('Module upgraded')}
  saveDemo();render();
 }catch(e){toast('Upgrade failed')}
}
function mission(e){
 const id=e.currentTarget.dataset.mission;
 if(id==='website'){window.open('https://alek.best','_blank');completeMission(id)}
 else if(id==='play3')nav('arena');else if(id==='invite')nav('friends');else if(id==='upgrade')nav('home');
}
async function completeMission(id){
 try{
  if(serverMode){const r=await api('/mission',{method:'POST',body:JSON.stringify({mission:id})});state={...state,...r.player};toast(r.message)}
  else{const m=missionDefs.find(x=>x[0]===id);if(!m||state.missions[id])return;state.missions[id]=true;state.points+=m[3]}
  saveDemo();render();
 }catch(e){toast('Mission update failed')}
}
async function openBox(e){
 const box=e.currentTarget.dataset.box;
 try{
  if(serverMode){const r=await api('/box',{method:'POST',body:JSON.stringify({box})});state={...state,...r.player};toast(r.message)}
  else{const b=boxes.find(x=>x.id===box);if(state.crystals<b.price){toast('Not enough crystals');return}state.crystals-=b.price;state.points+=100;state.inventory=[...(state.inventory||[]),`${b.name}: Demo reward`];toast(`${b.name} opened`)}
  saveDemo();render();
 }catch(e){toast('Box could not be opened')}
}
function invite(){
 const start=me?.id||'alek';
 const url=`https://t.me/${BOT_USERNAME}?start=${start}`;
 const share=`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Join me in ALEK Arena ⚔️')}`;
 try{tg?.openTelegramLink(share)}catch{navigator.clipboard?.writeText(url);toast('Invite link copied')}
}
async function loadLeaderboard(){
 const el=document.querySelector('#leaderboardCard');if(!el)return;
 try{
  const r=serverMode?await api('/leaderboard'):{players:[{rank:1,name:'ShadowKing',points:25430},{rank:2,name:'CryptoGirl',points:22190},{rank:3,name:'AlekMaster',points:18760},{rank:247,name:'You',points:state.points}]};
  el.innerHTML=r.players.map(p=>`<div class="leader"><span class="rank">#${p.rank}</span><span style="flex:1">${p.name}</span><b>${fmt(p.points)}</b></div>`).join('');
 }catch{el.innerHTML='<div class="muted">Leaderboard unavailable</div>'}
}

saveDemo();boot();
