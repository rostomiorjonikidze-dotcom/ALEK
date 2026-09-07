const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#06101d');tg.setBackgroundColor('#06101d')}catch{}}
const user=tg?.initDataUnsafe?.user||null,$=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)],key='alekTapFinalV2';
const defaults={points:0,energy:1000,maxEnergy:1000,tapPower:1,recharge:1,level:1,referrals:0,lastDaily:0,streak:0,boosts:{tap:1,energy:1,recharge:1},missions:{tap100:false,tap1000:false,boost:false,daily:false,invite:false,boss:false,base:false},base:{mine:1,core:1,lab:1,vault:1},bossHp:100000,bossMax:100000,bossDamage:0,seasonClaimed:[],lastVault:0,clan:'',clanPower:0,lastSeen:Date.now(),totalTaps:0};
let s=Object.assign({},defaults,JSON.parse(localStorage.getItem(key)||'null')||{});s.boosts=Object.assign({},defaults.boosts,s.boosts||{});s.missions=Object.assign({},defaults.missions,s.missions||{});s.base=Object.assign({},defaults.base,s.base||{});
let combo=1,lastTapAt=0,comboTimer=null,fever=0,feverCharge=0;
let serverReady=false,serverBusy=false,leaderboardPlayers=null,leaderboardStatus='connecting';
const toast=m=>{const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1400)},save=()=>{s.lastSeen=Date.now();localStorage.setItem(key,JSON.stringify(s))};
if(user&&$('#playerName'))$('#playerName').textContent=user.first_name+(user.username?' · @'+user.username:'');setTimeout(()=>$('#splash')?.classList.add('hide'),900);
const levelFor=p=>Math.max(1,Math.floor(Math.sqrt(p/2500))+1),leagueFor=l=>l<3?'Bronze League':l<6?'Silver League':l<10?'Gold League':l<15?'Diamond League':l<22?'Master League':'ALEK Elite',passivePerMin=()=>s.base.mine*8+s.base.core*5+s.base.lab*3+s.base.vault*4,eventActive=()=>Math.floor(Date.now()/7200000)%2===0;
{const mins=Math.min(120,Math.max(0,(Date.now()-(s.lastSeen||Date.now()))/60000)),r=Math.floor(mins*passivePerMin());if(r){s.points+=r;setTimeout(()=>toast(`Offline reward +${r.toLocaleString()}`),1400)}}
function render(){s.level=levelFor(s.points);for(const [id,v] of Object.entries({points:Math.floor(s.points).toLocaleString(),energy:Math.floor(s.energy),maxEnergy:s.maxEnergy,recharge:s.recharge,level:s.level,tapPower:s.tapPower,homeRefs:s.referrals,refCount:s.referrals,league:leagueFor(s.level)})){const e=$('#'+id);if(e)e.textContent=v}if($('#energyFill'))$('#energyFill').style.width=Math.min(100,s.energy/s.maxEnergy*100)+'%';if($('#passiveRate'))$('#passiveRate').textContent=passivePerMin()+'/min';if($('#bossFill'))$('#bossFill').style.width=s.bossMax?Math.max(0,Math.min(100,s.bossHp/s.bossMax*100))+'%':'0%';if($('#bossHpText'))$('#bossHpText').textContent=s.bossMax?Math.ceil(s.bossHp/s.bossMax*100)+'%':'0%';if($('#clanName'))$('#clanName').textContent=s.clan||'No Squad Yet';if($('#clanPower'))$('#clanPower').textContent=s.clanPower.toLocaleString();renderBoosts();renderMissions();renderLeader();renderBase();renderSeason();save()}
function tap(e){if(s.energy<1)return toast('Energy depleted');const now=Date.now();combo=now-lastTapAt<620?Math.min(15,combo+1):1;lastTapAt=now;s.totalTaps++;feverCharge=Math.min(100,feverCharge+(combo>3?4:2));if(feverCharge>=100&&fever<=0){fever=12;feverCharge=0;toast('⚡ ALEK FEVER · 2X POWER')}const val=Math.min((s.tapPower+(combo>=6?1:0))*(fever>0?2:1),s.energy);s.points+=val;s.energy-=Math.min(s.tapPower,s.energy);s.missions.tap100=s.points>=100;s.missions.tap1000=s.points>=1000;const f=document.createElement('span');f.className='float';f.textContent='+'+val;const wrap=$('.coin-wrap');if(wrap){const r=wrap.getBoundingClientRect();f.style.left=e.clientX-r.left-12+'px';f.style.top=e.clientY-r.top-10+'px'}$('#floatLayer')?.appendChild(f);setTimeout(()=>f.remove(),800);const cb=$('#comboBadge');if(cb){cb.textContent=fever>0?`FEVER ${Math.ceil(fever)}s`:`COMBO x${combo}`;cb.classList.toggle('hot',combo>1||fever>0)}clearTimeout(comboTimer);comboTimer=setTimeout(()=>{combo=1;if(cb&&fever<=0){cb.textContent='COMBO x1';cb.classList.remove('hot')}},850);try{tg?.HapticFeedback?.impactOccurred(combo>=6?'medium':'light')}catch{}render()}$('#tapCoin')?.addEventListener('pointerdown',tap);
const boosts=[['tap','👆','Multi Tap','More points per tap',()=>250*s.boosts.tap],['energy','🔋','Energy Limit','Increase max energy',()=>400*s.boosts.energy],['recharge','⚡','Recharge Speed','Faster energy recharge',()=>600*s.boosts.recharge]];
function renderBoosts(){if(!$('#boostList'))return;$('#boostList').innerHTML=boosts.map(b=>`<div class="panel boost-item"><div class="iconbox">${b[1]}</div><div class="grow"><b>${b[2]}</b><small>${b[3]} · Lv ${s.boosts[b[0]]}</small><div class="price">${b[4]().toLocaleString()} Points</div></div><button class="buy" data-buy="${b[0]}">Upgrade</button></div>`).join('');$$('[data-buy]').forEach(x=>x.onclick=()=>{const b=boosts.find(y=>y[0]===x.dataset.buy),p=b[4]();if(s.points<p)return toast('Not enough points');s.points-=p;s.boosts[x.dataset.buy]++;if(x.dataset.buy==='tap')s.tapPower++;if(x.dataset.buy==='energy'){s.maxEnergy+=500;s.energy+=500}if(x.dataset.buy==='recharge')s.recharge++;s.missions.boost=true;toast('Boost upgraded');render()})}
const mods=[['mine','⛏️','ALEK Mine','Passive Points',l=>800*l],['core','⚛️','Energy Core','Base production',l=>1100*l],['lab','🧪','Research Lab','Research power',l=>1500*l],['vault','🏦','Vault','Offline storage',l=>1800*l]];
function renderBase(){if(!$('#baseList'))return;$('#baseList').innerHTML=mods.map(m=>`<div class="panel boost-item"><div class="iconbox">${m[1]}</div><div class="grow"><b>${m[2]}</b><small>${m[3]} · Lv ${s.base[m[0]]}</small><div class="price">${m[4](s.base[m[0]]).toLocaleString()} Points</div></div><button class="buy" data-base="${m[0]}">Build</button></div>`).join('');$$('[data-base]').forEach(b=>b.onclick=()=>{const m=mods.find(x=>x[0]===b.dataset.base),p=m[4](s.base[b.dataset.base]);if(s.points<p)return toast('Not enough points');s.points-=p;s.base[b.dataset.base]++;s.missions.base=true;toast('Base upgraded');render()})}
function renderMissions(){if(!$('#missionList'))return;const a=[['tap100','👆','Earn 100 Points'],['tap1000','🔥','Earn 1,000 Points'],['boost','⚡','Buy a Boost'],['daily','🎁','Claim Daily Streak'],['base','🏗️','Upgrade ALEK Base'],['boss','👾','Attack World Boss'],['invite','👥','Invite a Friend']];$('#missionList').innerHTML=a.map(x=>`<div class="panel mission-item"><div class="iconbox">${x[1]}</div><div class="grow"><b>${x[2]}</b><small>ALEK mission</small></div><b>${s.missions[x[0]]?'✓':'•'}</b></div>`).join('')}
function renderLeader(){const box=$('#leaderList');if(!box)return;if(Array.isArray(leaderboardPlayers)&&leaderboardPlayers.length){box.innerHTML=leaderboardPlayers.map((p,i)=>`<div class="panel leader-item"><div class="iconbox">${p.rank||i+1}</div><div class="grow"><b>${escapeHtml(p.firstName||p.username||'Player')}</b><small>${p.username?'@'+escapeHtml(p.username):'ALEK Player'}</small></div><b>${Number(p.points||0).toLocaleString()}</b></div>`).join('');return}const msg=leaderboardStatus==='offline'?'Leaderboard temporarily unavailable':leaderboardStatus==='empty'?'No players yet':'Connecting to leaderboard…';box.innerHTML=`<div class="panel leader-item"><div class="iconbox">⚡</div><div class="grow"><b>${msg}</b><small>${leaderboardStatus==='empty'?'Be the first ALEK player':'ALEK server'}</small></div></div>`}
const sr=[500,1000,1800,3000,5000,8000];function renderSeason(){if(!$('#seasonTrack'))return;$('#seasonTrack').innerHTML=sr.map((r,i)=>{const req=(i+1)*3,ok=s.level>=req,c=s.seasonClaimed.includes(i);return`<div class="panel season-item"><div class="season-node">${req}</div><div class="grow"><b>Genesis Level ${req}</b><small>${r.toLocaleString()} Points</small></div><button class="buy" data-season="${i}" ${!ok||c?'disabled':''}>${c?'Claimed':ok?'Claim':'Locked'}</button></div>`}).join('');$$('[data-season]').forEach(b=>b.onclick=()=>{const i=+b.dataset.season;if(s.seasonClaimed.includes(i)||s.level<(i+1)*3)return;s.points+=sr[i];s.seasonClaimed.push(i);toast('Season reward claimed');render()})}
function showView(v){$$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.go===v));scrollTo({top:0,behavior:'smooth'});if(v==='leader')loadRealLeaderboard()}$$('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
$('#dailyBtn')?.addEventListener('click',()=>{const now=Date.now(),day=86400000;if(now-s.lastDaily<day)return toast('Daily already claimed');s.streak=now-s.lastDaily<day*2.2?Math.min(7,s.streak+1):1;s.lastDaily=now;const r=500+s.streak*350;s.points+=r;s.missions.daily=true;if($('#dailyText'))$('#dailyText').textContent=`Day ${s.streak}/7 claimed`;toast(`🔥 Day ${s.streak} · +${r}`);render()});
$('#inviteBtn')?.addEventListener('click',()=>{s.missions.invite=true;try{tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://alek.best/arena/')}&text=${encodeURIComponent('Join me in ALEK Tap Arena ⚡')}`)}catch{}toast('Invite opened');render()});
$('#bossHitBtn')?.addEventListener('click',()=>{if(serverReady)return;if(s.energy<10)return toast('Need 10 Energy');const d=(25+s.tapPower*8)*(fever>0?2:1);s.energy-=10;s.bossHp=Math.max(0,s.bossHp-d);s.bossDamage+=d;s.missions.boss=true;if(s.bossHp<=0){s.points+=10000;s.bossHp=s.bossMax;toast('🏆 Titan defeated · +10,000')}else toast(`Boss -${Math.floor(d)} HP`);render()});
$('#clanBtn')?.addEventListener('click',()=>{if(s.clan)return toast('Squad already created');s.clan='ALEK Pioneers';s.clanPower=Math.floor(s.points/10)+s.level*100;toast('Squad created');render()});
$$('[data-vault]').forEach(b=>b.onclick=()=>{const now=Date.now(),day=86400000;if(now-s.lastVault<day)return toast('Vault already opened');const rs=[750,1250,2000],r=rs[(+b.dataset.vault+Math.floor(now/day))%3];s.lastVault=now;s.points+=r;b.innerHTML=`✨<b>+${r}</b>`;toast('Vault opened');render()});
setInterval(()=>{if(!serverReady){const rate=s.recharge*(eventActive()?2:1);if(s.energy<s.maxEnergy)s.energy=Math.min(s.maxEnergy,s.energy+rate)}if(fever>0)fever=Math.max(0,fever-1);render()},1000);
setInterval(()=>{if(!$('#eventTimer'))return;const r=7200000-Date.now()%7200000,h=String(Math.floor(r/3600000)).padStart(2,'0'),m=String(Math.floor(r%3600000/60000)).padStart(2,'0'),sec=String(Math.floor(r%60000/1000)).padStart(2,'0');$('#eventTimer').textContent=`${h}:${m}:${sec}`},1000);render();

/* ===== ALEK MARKET + TON CONNECT + TELEGRAM STARS ===== */
const ALEK_API_BASE = (window.ALEK_CONFIG?.API_BASE || '').replace(/\/$/,'');
const ALEK_PRODUCTS = {
  energy_pack:{title:'Energy Pack',stars:75},
  boost_pack:{title:'Boost Pack',stars:149},
  founder_skin:{title:'Founder Skin',stars:249},
  gift_pack:{title:'Gift Pack',stars:199},
  genesis_pass:{title:'Genesis Pass',stars:499}
};

function escapeHtml(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

async function alekApi(path,options={}){
  if(!ALEK_API_BASE)throw new Error('API base missing');
  if(!tg?.initData)throw new Error('Telegram initData missing');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(ALEK_API_BASE+path,{
      ...options,
      signal:controller.signal,
      headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg.initData,...(options.headers||{})}
    });
    if(!res.ok){let detail='';try{detail=(await res.json())?.error||''}catch{}throw new Error(`API ${res.status}${detail?': '+detail:''}`)}
    return await res.json();
  }finally{clearTimeout(timeout)}
}

function applyServerUser(u){
  if(!u)return;
  serverReady=true;
  s.points=u.points??s.points;
  s.energy=u.energy??s.energy;
  s.maxEnergy=u.maxEnergy??s.maxEnergy;
  s.tapPower=u.tapPower??s.tapPower;
  s.recharge=u.recharge??s.recharge;
  s.referrals=u.referrals??s.referrals;
  s.totalTaps=u.totalTaps??s.totalTaps;
  render();
}

async function loadRealLeaderboard(){
  const box=$('#leaderList');
  if(!ALEK_API_BASE||!tg?.initData){
    leaderboardPlayers=[];
    leaderboardStatus='offline';
    renderLeader();
    return;
  }
  try{
    const data=await alekApi('/api/leaderboard');
    leaderboardPlayers=Array.isArray(data?.players)?data.players:[];
    leaderboardStatus=leaderboardPlayers.length?'ready':'empty';
  }catch(e){
    console.warn('ALEK leaderboard error',e);
    leaderboardPlayers=[];
    leaderboardStatus='offline';
  }
  renderLeader();
}

async function startServerSession(attempt=1){
  if(!ALEK_API_BASE){leaderboardStatus='offline';renderLeader();return}
  if(!tg?.initData){
    if(attempt<6)return setTimeout(()=>startServerSession(attempt+1),500);
    leaderboardStatus='offline';renderLeader();toast('Open ALEK from the Telegram bot');return;
  }
  try{
    const data=await alekApi('/api/session',{method:'POST',body:'{}'});
    applyServerUser(data?.user);
    if(data?.boss){s.bossHp=data.boss.hp;s.bossMax=data.boss.max_hp}
    await loadRealLeaderboard();
    render();
  }catch(e){
    console.warn('ALEK backend session failed',e);
    serverReady=false;
    leaderboardStatus='offline';
    renderLeader();
    if(attempt<3)setTimeout(()=>startServerSession(attempt+1),1500*attempt);
    else toast('Server connection failed');
  }
}

let pendingServerTaps=0,tapBatchStarted=Date.now(),tapFlushRunning=false;
$('#tapCoin')?.addEventListener('pointerdown',()=>{if(ALEK_API_BASE&&tg?.initData)pendingServerTaps++},{capture:true});

async function flushTaps(){
  if(tapFlushRunning||!ALEK_API_BASE||!tg?.initData||pendingServerTaps<1)return;
  tapFlushRunning=true;
  const taps=pendingServerTaps;pendingServerTaps=0;
  const elapsedMs=Math.max(250,Date.now()-tapBatchStarted);tapBatchStarted=Date.now();
  try{
    const data=await alekApi('/api/taps',{method:'POST',body:JSON.stringify({taps,elapsedMs})});
    applyServerUser(data?.user);
  }catch(e){
    console.warn('ALEK tap sync failed',e);
    pendingServerTaps=Math.min(50,pendingServerTaps+taps);
    serverReady=false;
  }finally{tapFlushRunning=false}
}
setInterval(flushTaps,1500);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushTaps()});

setInterval(async()=>{
  if(!serverReady||serverBusy||pendingServerTaps>0)return;
  serverBusy=true;
  try{
    const data=await alekApi('/api/recharge',{method:'POST',body:'{}'});
    applyServerUser(data?.user);
  }catch(e){console.warn('ALEK recharge sync failed',e)}
  finally{serverBusy=false}
},5000);

const originalBossButton=$('#bossHitBtn');
if(originalBossButton){
  originalBossButton.addEventListener('click',async ev=>{
    if(!ALEK_API_BASE||!tg?.initData)return;
    ev.stopImmediatePropagation();
    try{
      const data=await alekApi('/api/boss/attack',{method:'POST',body:JSON.stringify({hits:1})});
      if(data?.boss){s.bossHp=data.boss.hp;s.bossMax=data.boss.max_hp}
      applyServerUser(data?.user);s.missions.boss=true;toast('Boss attacked');
    }catch(e){toast('Boss attack failed')}
  },true);
}

let tonConnectUI=null;
async function syncTonWallet(wallet){
  const st=$('#walletStatus'),addr=$('#walletAddress');
  if(wallet?.account?.address){
    const a=wallet.account.address;
    if(st)st.textContent='Wallet connected';
    if(addr)addr.textContent=a.slice(0,10)+'…'+a.slice(-8);
    try{tg?.HapticFeedback?.notificationOccurred('success')}catch{}
    if(ALEK_API_BASE&&tg?.initData){
      try{await alekApi('/api/wallet',{method:'POST',body:JSON.stringify({address:a})})}catch(e){console.warn('Wallet sync failed',e)}
    }
  }else{
    if(st)st.textContent='Wallet not connected';
    if(addr)addr.textContent='Connect a TON wallet to prepare your player profile for future on-chain rewards.';
  }
}
async function initTonConnect(){
  const mount=$('#tonConnectButton');
  if(!mount||!window.TON_CONNECT_UI||tonConnectUI)return;
  try{
    tonConnectUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:'https://alek.best/arena/tonconnect-manifest.json',buttonRootId:'tonConnectButton'});
    tonConnectUI.uiOptions={language:'en'};
    await syncTonWallet(tonConnectUI.wallet);
    tonConnectUI.onStatusChange(syncTonWallet);
  }catch(err){
    console.warn('TON Connect init failed',err);
    if($('#walletStatus'))$('#walletStatus').textContent='Wallet connection unavailable';
  }
}

async function buyWithStars(productId,button){
  const product=ALEK_PRODUCTS[productId];
  if(!product)return toast('Product unavailable');
  if(!tg?.initData)return toast('Open ALEK inside Telegram to purchase');
  if(!ALEK_API_BASE)return toast('Payment server unavailable');
  button?.classList.add('loading');
  try{
    const data=await alekApi('/api/stars/create-invoice',{method:'POST',body:JSON.stringify({productId})});
    if(!data?.invoiceLink)throw new Error('Missing invoice link');
    tg.openInvoice(data.invoiceLink,status=>{
      button?.classList.remove('loading');
      if(status==='paid'){toast('⭐ Purchase successful');try{tg.HapticFeedback?.notificationOccurred('success')}catch{}setTimeout(()=>startServerSession(),1000)}
      else if(status==='cancelled')toast('Purchase cancelled');
      else if(status==='failed')toast('Payment failed');
    });
  }catch(err){
    console.warn('Stars payment failed',err);
    button?.classList.remove('loading');
    toast('Payment service unavailable');
  }
}
$$('.star-buy').forEach(btn=>btn.addEventListener('click',()=>buyWithStars(btn.dataset.product,btn)));
$('#sponsorInfoBtn')?.addEventListener('click',()=>toast('Sponsor campaign system activates with backend analytics'));

document.addEventListener('DOMContentLoaded',()=>{initTonConnect();startServerSession()});
if(document.readyState!=='loading'){initTonConnect();startServerSession()}
