
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#07111f');
    tg.setBackgroundColor('#07111f');
  } catch {}
}

const defaultState = {
  route: 'home',
  level: 5,
  xp: 320,
  xpMax: 540,
  energy: 20,
  maxEnergy: 20,
  points: 1250,
  crystals: 600,
  wins: 7,
  losses: 3,
  referrals: 0,
  missions: {
    login: true,
    play3: false,
    upgrade: false,
    invite: false,
    website: false
  },
  inventory: [],
  lastLogin: new Date().toDateString()
};

let state = loadState();
const app = document.querySelector('#app');
const energyTop = document.querySelector('#energyTop');

function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem('alekArenaState'));
    return {...defaultState, ...saved, missions:{...defaultState.missions, ...(saved?.missions||{})}};
  } catch { return structuredClone(defaultState); }
}
function saveState(){
  localStorage.setItem('alekArenaState', JSON.stringify(state));
  energyTop.textContent = state.energy;
}
function toast(msg){
  let el = document.querySelector('.toast');
  if(!el){ el=document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1800);
}
function haptic(type='light'){ try{ tg?.HapticFeedback?.impactOccurred(type); }catch{} }
function fmt(n){ return new Intl.NumberFormat().format(n); }

function nav(route){
  state.route=route; saveState(); render();
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.route===route));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>nav(btn.dataset.route)));

function home(){
  const pct=Math.min(100,(state.xp/state.xpMax)*100);
  return `
  <section class="hero">
    <div class="eyebrow">SEASON 01 · ORIGIN</div>
    <h2>Build. Compete. Grow.</h2>
    <p>Develop your ALEK base, complete missions, climb the Arena leaderboard and unlock rewards.</p>
    <button class="primary" id="quickBattle">⚔ Quick Battle</button>
  </section>
  <div class="grid2">
    <div class="card stat"><b>${fmt(state.points)}</b><span>ALEK Points</span></div>
    <div class="card stat"><b>${state.level}</b><span>Player Level</span></div>
  </div>
  <div class="section-title"><h3>Command Center</h3><span>${state.xp}/${state.xpMax} XP</span></div>
  <div class="card">
    <div class="row"><div><div class="title">Level ${state.level}</div><div class="sub">Next level unlocks new missions</div></div><span class="tag">ONLINE</span></div>
    <div style="height:12px"></div><div class="progress"><i style="width:${pct}%"></i></div>
  </div>
  <div class="section-title"><h3>Base Modules</h3><span>3 active</span></div>
  ${moduleCard('🏛️','Command Center','Lv. 2','+5% mission XP')}
  ${moduleCard('⛏️','Mine','Lv. 1','Generates Points')}
  ${moduleCard('🔬','Research Lab','Lv. 1','Unlocks boosts')}
  <div class="notice">Demo build: progress is saved on this device with local storage. A production backend/database comes next.</div>`;
}
function moduleCard(icon,name,level,sub){
  return `<div class="card row"><div class="row-left"><div class="icon">${icon}</div><div><div class="title">${name}</div><div class="sub">${level} · ${sub}</div></div></div><button class="secondary upgrade-btn" data-name="${name}">Upgrade</button></div>`;
}

const missions = [
  ['login','✅','Login to the game',100],
  ['play3','⚔️','Play 3 Arena matches',300],
  ['upgrade','🏗️','Upgrade a building',250],
  ['invite','👥','Invite a friend',500],
  ['website','🌐','Visit ALEK website',200]
];
function missionsPage(){
  return `<div class="section-title"><h3>Missions</h3><span>Daily</span></div>
  <div class="pillbar"><button class="pill active">Daily</button><button class="pill">Weekly</button><button class="pill">Special</button></div>
  ${missions.map(([id,ic,name,reward])=>`
    <div class="card row">
      <div class="row-left"><div class="icon">${ic}</div><div><div class="title">${name}</div><div class="sub reward">+${reward} Points</div></div></div>
      ${state.missions[id]?'<span class="tag">DONE</span>':`<button class="secondary mission-btn" data-mission="${id}">Go</button>`}
    </div>`).join('')}
  <div class="card sponsor">
    <div class="eyebrow">SPONSORED MISSION</div>
    <div class="title" style="margin-top:8px">Partner campaign slot</div>
    <div class="sub">Advertisers will be able to sponsor clearly labeled missions here.</div>
  </div>`;
}

function arenaPage(){
  return `<div class="section-title"><h3>Arena</h3><span>Ranked demo</span></div>
  <div class="card center">
    <div class="muted">YOUR POWER</div><div class="big">${1200+state.level*40}</div>
    <div style="margin:16px 0;font-size:34px">⚡ VS ⚔️</div>
    <div class="muted">Energy cost: 2</div>
    <button class="primary" id="battleBtn" style="width:100%;margin-top:14px">BATTLE</button>
  </div>
  <div class="grid2">
    <div class="card stat"><b>${state.wins}</b><span>Wins</span></div>
    <div class="card stat"><b>${state.losses}</b><span>Losses</span></div>
  </div>
  <div class="section-title"><h3>Leaderboard</h3><span>Top players</span></div>
  <div class="card">
    ${[['1','ShadowKing','25,430'],['2','CryptoGirl','22,190'],['3','AlekMaster','18,760'],['247','You',fmt(state.points)]].map(x=>`<div class="leader"><span class="rank">#${x[0]}</span><span style="flex:1">${x[1]}</span><b>${x[2]}</b></div>`).join('')}
  </div>`;
}

function friendsPage(){
  const startParam = tg?.initDataUnsafe?.start_param || 'starter123';
  const botName='ALEKArenaBot';
  const link=`https://t.me/${botName}?start=${encodeURIComponent(startParam)}`;
  return `<div class="section-title"><h3>Friends & Referrals</h3><span>Grow together</span></div>
  <div class="card center">
    <div class="big">${state.referrals}</div><div class="muted">Active referrals</div>
    <button class="primary" id="inviteBtn" style="width:100%;margin-top:14px">Invite Friends</button>
    <div class="sub" style="margin-top:10px;word-break:break-all">${link}</div>
  </div>
  ${refCard('Invite 5 friends',500,state.referrals,5)}
  ${refCard('Invite 25 friends',2500,state.referrals,25)}
  ${refCard('Invite 100 friends',10000,state.referrals,100)}
  <div class="notice">Production referral rewards should only count users who actually open and use the Mini App, not simple clicks.</div>`;
}
function refCard(title,reward,current,target){
  return `<div class="card"><div class="row"><div><div class="title">${title}</div><div class="sub reward">+${fmt(reward)} Points</div></div><span>${Math.min(current,target)}/${target}</span></div><div style="height:10px"></div><div class="progress"><i style="width:${Math.min(100,current/target*100)}%"></i></div></div>`;
}

const boxes=[
  {id:'starter',name:'Starter Box',icon:'📦',price:80,rarity:'Common+',drops:['Energy +5','100–250 Points','Basic skin shard']},
  {id:'cyber',name:'Cyber Box',icon:'🧰',price:180,rarity:'Rare+',drops:['Energy +10','250–600 Points','Rare skin shard']},
  {id:'elite',name:'Elite Box',icon:'🎁',price:350,rarity:'Epic+',drops:['Energy +20','600–1200 Points','Epic cosmetic']},
  {id:'legend',name:'Legend Box',icon:'🛸',price:600,rarity:'Legendary chance',drops:['1200–2500 Points','Legendary cosmetic','Tournament ticket']}
];
function shopPage(){
  return `<div class="section-title"><h3>Shop & Boxes</h3><span>${fmt(state.crystals)} crystals</span></div>
  <div class="notice" style="margin-bottom:12px">Demo boxes use in-game crystals only. Real-money/ALK purchases need a secure backend, payment flow, and published reward rules before launch.</div>
  <div class="box-grid">
    ${boxes.map(b=>`<div class="card box-card">
      <div class="box-art">${b.icon}</div><div class="title">${b.name}</div><div class="sub">${b.rarity}</div>
      <div class="price">💎 ${b.price}</div><button class="primary box-btn" data-box="${b.id}" style="width:100%">OPEN</button>
    </div>`).join('')}
  </div>
  <div class="section-title"><h3>Inventory</h3><span>${state.inventory.length} items</span></div>
  <div class="card">${state.inventory.length?state.inventory.map(x=>`<div class="leader"><span>${x}</span></div>`).join(''):'<div class="muted">No items yet. Open a box to test the flow.</div>'}</div>`;
}

function render(){
  energyTop.textContent=state.energy;
  const pages={home,missions:missionsPage,arena:arenaPage,friends:friendsPage,shop:shopPage};
  app.innerHTML=(pages[state.route]||home)();
  bind();
}
function bind(){
  document.querySelector('#quickBattle')?.addEventListener('click',()=>nav('arena'));
  document.querySelector('#battleBtn')?.addEventListener('click',battle);
  document.querySelectorAll('.upgrade-btn').forEach(b=>b.addEventListener('click',upgrade));
  document.querySelectorAll('.mission-btn').forEach(b=>b.addEventListener('click',mission));
  document.querySelectorAll('.box-btn').forEach(b=>b.addEventListener('click',openBox));
  document.querySelector('#inviteBtn')?.addEventListener('click',invite);
}
function battle(){
  if(state.energy<2){toast('Not enough energy');return}
  state.energy-=2;
  const win=Math.random()<0.62;
  if(win){state.wins++;state.points+=200;state.xp+=50;toast('Victory! +200 Points · +50 XP')}
  else{state.losses++;state.points+=60;state.xp+=20;toast('Defeat · +60 Points · +20 XP')}
  if(state.xp>=state.xpMax){state.level++;state.xp-=state.xpMax;state.xpMax=Math.round(state.xpMax*1.18);toast(`Level up! You are level ${state.level}`)}
  haptic(win?'medium':'light'); saveState(); render();
}
function upgrade(){
  if(state.points<150){toast('Need 150 Points');return}
  state.points-=150; state.xp+=30; state.missions.upgrade=true; haptic(); toast('Module upgraded · +30 XP');saveState();render();
}
function mission(e){
  const id=e.currentTarget.dataset.mission;
  if(id==='website'){window.open('https://alek.best','_blank'); completeMission(id)}
  else if(id==='play3'){nav('arena');toast('Win or play Arena matches to progress')}
  else if(id==='invite'){nav('friends')}
  else if(id==='upgrade'){nav('home')}
}
function completeMission(id){
  const m=missions.find(x=>x[0]===id); if(!m||state.missions[id]) return;
  state.missions[id]=true; state.points+=m[3]; saveState(); render();
}
function openBox(e){
  const b=boxes.find(x=>x.id===e.currentTarget.dataset.box); if(!b)return;
  if(state.crystals<b.price){toast('Not enough crystals');return}
  state.crystals-=b.price;
  const outcomes = b.drops;
  const drop = outcomes[Math.floor(Math.random()*outcomes.length)];
  if(drop.includes('Energy')) state.energy=Math.min(state.maxEnergy,state.energy+10);
  if(drop.includes('Points')){
    const m=drop.match(/(\d+)[–-](\d+)/); const pts=m?Math.floor(+m[1]+Math.random()*(+m[2]-+m[1])):500; state.points+=pts;
  } else state.inventory.unshift(`${b.name}: ${drop}`);
  haptic('medium'); saveState(); render(); toast(`Opened ${b.name}: ${drop}`);
}
function invite(){
  const url='https://t.me/ALEKArenaBot';
  const text='Join me in ALEK Arena ⚔️';
  try{ tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`) }
  catch{ navigator.clipboard?.writeText(url); toast('Invite link copied') }
}

saveState(); render();
