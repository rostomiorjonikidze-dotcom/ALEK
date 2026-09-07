
import {AlekWorld} from './game3d/world.js';

const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#07111f');tg.setBackgroundColor('#07111f')}catch{}}
let route='home',world=null,buildCount=0;
const tgUser=tg?.initDataUnsafe?.user||null;
let state=JSON.parse(localStorage.getItem('alekWorldStateV2')||'null')||{level:1,points:0,energy:20,missions:{login:true,wood:false,kills:false,build:false},crystals:250,camSensitivity:4.5,camDistance:7.2,autoLock:true};
const app=document.querySelector('#app'),toastEl=document.querySelector('#toast'),energyEl=document.querySelector('#energy');

function save(){localStorage.setItem('alekWorldStateV2',JSON.stringify(state));energyEl.textContent=state.energy}
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>toastEl.classList.remove('show'),1350)}
function nav(r){if(world){world.stop();world=null}route=r;render();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===r));window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.route)));

function home(){return `<section class="hero"><div class="eyebrow">ALEK WORLD · V3</div><h2>Explore. Fight. Build. Survive.</h2><p>A larger survival world with day/night, loot, crafting, enemy classes, upgraded human characters, weapons, full-screen play and Telegram Mini App support.</p><button class="primary" id="playBtn">🌍 Enter World</button></section>
<div class="grid2"><div class="card stat"><b>${state.level}</b><span>Level</span></div><div class="card stat"><b>${state.points}</b><span>ALEK Points</span></div></div>
<div class="section-title"><h3>Player</h3><span>Telegram-ready</span></div><div class="card"><div class="title">👤 ${tgUser?`${tgUser.first_name}${tgUser.username?' · @'+tgUser.username:''}`:'Guest Player'}</div><div class="sub">The same game runs on alek.best and inside the Telegram Mini App.</div></div><div class="section-title"><h3>What changed</h3><span>V3</span></div>
<div class="card"><div class="title">🎮 Better controls</div><div class="sub">Smooth third-person movement, sprint, jump and dash.</div></div>
<div class="card"><div class="title">📷 Real camera settings</div><div class="sub">Adjust sensitivity and camera distance while playing.</div></div>
<div class="card"><div class="title">⚔ Survival waves</div><div class="sub">Raiders now come in waves and become tougher as you survive.</div></div>
<div class="section-title"><h3>Creator</h3><span>ALEK</span></div><div class="card"><div class="title">Created by Rostom Orjonikidze</div><div class="sub">Founder & Creator of ALEK / ALEK World</div></div>`}

function worldPage(){return `<div class="game-toolbar">
<button class="secondary compact" id="fullscreenBtn">⛶ Full Screen</button>
<button class="secondary compact" id="settingsBtn">⚙ Camera</button>
<button class="secondary compact" id="craftBtn">🛠 Craft</button>
<button class="secondary compact" id="exitBtn">← Exit</button>
</div>
<div class="camera-panel" id="cameraPanel" hidden>
<label>Sensitivity <input id="sensRange" type="range" min="1.5" max="12" step=".5" value="${state.camSensitivity}"><b id="sensVal">${state.camSensitivity}</b></label>
<label>Camera distance <input id="distRange" type="range" min="4.5" max="12" step=".5" value="${state.camDistance}"><b id="distVal">${state.camDistance}</b></label>
<label class="toggle-row"><input id="lockToggle" type="checkbox" ${state.autoLock?'checked':''}> Auto-face nearby enemy when attacking</label>
</div>
<div class="camera-panel craft-panel" id="craftPanel" hidden>
<div class="title">Crafting</div>
<div class="sub">Craft only when you have enough resources.</div>
<div class="craft-grid">
<button class="secondary craft-action" data-craft="axe">🪓 Battle Axe<br><small>6 wood · 4 stone</small></button>
<button class="secondary craft-action" data-craft="armor">🛡 Armor Upgrade<br><small>5 scrap · 5 stone</small></button>
<button class="secondary craft-action" data-craft="meal">🍖 Field Meal<br><small>1 food · +45 HP</small></button>
</div>
</div>
<div class="world-shell" id="worldShell"><canvas id="gameCanvas"></canvas>
<div class="hud"><div class="hud-top">
<div class="hud-box"><b>HP</b><div class="hpbar"><i id="hpFill" style="width:100%"></i></div></div>
<div class="hud-box">DAY <b id="day">1</b> · <span id="phase">Day</span> · WAVE <b id="wave">1</b></div>
</div>
<div class="hud-resources hud-box">🪵 <span id="wood">0</span> · 🪨 <span id="stone">0</span> · 🔩 <span id="scrap">0</span> · 🍖 <span id="food">1</span> · ⚔ <span id="kills">0</span></div>
<div class="crosshair">+</div>
<div class="mobile-controls">
<div class="joystick" id="joystick"><div class="joystick-knob" id="joyKnob"></div></div>
<div class="action-pad">
<button class="action-btn attack" id="attackBtn">ATTACK</button>
<button class="action-btn heavy" id="heavyBtn">HEAVY</button>
<button class="action-btn dash" id="dashBtn">DASH</button>
<button class="action-btn jump" id="jumpBtn">JUMP</button>
<button class="action-btn sprint" id="sprintBtn">SPRINT</button>
<button class="action-btn build" id="buildBtn">BUILD</button>
<button class="action-btn interact" id="interactBtn">LOOT</button>
</div></div></div></div>
<div class="card world-tip" style="margin-top:12px"><b>Desktop:</b> WASD move · Shift sprint · Space jump · Q dash · F attack · R heavy attack · E loot/use · mouse drag camera · wheel zoom. <b>Mobile:</b> joystick + action buttons; drag the world to rotate camera.</div>`}

function missions(){return `<div class="section-title"><h3>Missions</h3><span>Daily</span></div>${[['login','✅','Enter ALEK World',100],['wood','🪵','Collect 10 Wood',200],['kills','⚔','Defeat 3 Raiders',300],['build','🏗','Build 5 blocks',250]].map(([id,ic,n,r])=>`<div class="card row"><div><div class="title">${ic} ${n}</div><div class="sub reward">+${r} Points</div></div><span>${state.missions[id]?'DONE':'ACTIVE'}</span></div>`).join('')}`}
function friends(){return `<div class="section-title"><h3>Friends</h3><span>Referral</span></div><div class="card"><div class="title">Invite friends to ALEK World</div><div class="sub">Telegram referral sync will be connected to the secure backend.</div><button class="primary" id="inviteBtn" style="margin-top:12px">Invite</button></div>`}
function shop(){return `<div class="section-title"><h3>Shop</h3><span>${state.crystals} Crystals</span></div><div class="card"><div class="title">Premium Skin Pack</div><div class="sub">Fixed-value cosmetic pack.</div><div class="reward">€2.99</div></div><div class="card"><div class="title">Season Pass</div><div class="sub">Premium season rewards and cosmetics.</div><div class="reward">€7.99</div></div>`}

function render(){save();app.innerHTML=route==='home'?home():route==='world'?worldPage():route==='missions'?missions():route==='friends'?friends():shop();bind();if(route==='world')initWorld()}
function bind(){
document.querySelector('#playBtn')?.addEventListener('click',()=>nav('world'));
document.querySelector('#exitBtn')?.addEventListener('click',()=>nav('home'));
document.querySelector('#inviteBtn')?.addEventListener('click',()=>{const url='https://alek.best/arena/';try{tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Join ALEK World 🌍')}`)}catch{toast('Invite link ready')}})
}

async function toggleFullscreen(){
 const shell=document.querySelector('#worldShell');
 if(!document.fullscreenElement){
   try{await shell.requestFullscreen?.();}catch{}
   shell.classList.add('pseudo-fullscreen');
   document.body.classList.add('playing-fullscreen');
   document.querySelector('#fullscreenBtn').textContent='✕ Exit Full Screen';
 }else{
   try{await document.exitFullscreen?.();}catch{}
   shell.classList.remove('pseudo-fullscreen');document.body.classList.remove('playing-fullscreen');
   document.querySelector('#fullscreenBtn').textContent='⛶ Full Screen';
 }
 setTimeout(()=>world?.resize(),80);
}

function initWorld(){
 const canvas=document.querySelector('#gameCanvas');
 world=new AlekWorld(canvas,{onToast:toast,onStats:s=>{
   document.querySelector('#hpFill').style.width=`${(s.hp/s.maxHp)*100}%`;
   document.querySelector('#wood').textContent=s.wood;document.querySelector('#stone').textContent=s.stone;document.querySelector('#scrap').textContent=s.scrap;document.querySelector('#food').textContent=s.food;document.querySelector('#kills').textContent=s.kills;document.querySelector('#wave').textContent=s.wave;document.querySelector('#day').textContent=s.day;document.querySelector('#phase').textContent=s.phase;
   if(s.wood>=10)state.missions.wood=true;if(s.kills>=3)state.missions.kills=true;save();
 }});
 world.setCameraSettings({sensitivity:state.camSensitivity/1000,distance:state.camDistance,autoLock:state.autoLock});world.start();

 const joy=document.querySelector('#joystick'),knob=document.querySelector('#joyKnob');let active=false;
 const updateJoy=(x,y)=>{const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(x-cx)/(r.width/2),dy=(y-cy)/(r.height/2),len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}knob.style.transform=`translate(${dx*31}px,${dy*31}px)`;world.setJoystick(dx,dy)};
 joy.addEventListener('pointerdown',e=>{active=true;joy.setPointerCapture(e.pointerId);updateJoy(e.clientX,e.clientY)});
 joy.addEventListener('pointermove',e=>{if(active)updateJoy(e.clientX,e.clientY)});
 joy.addEventListener('pointerup',()=>{active=false;knob.style.transform='';world.setJoystick(0,0)});

 document.querySelector('#attackBtn').addEventListener('pointerdown',()=>world.attack());
 document.querySelector('#heavyBtn').addEventListener('pointerdown',()=>world.heavyAttack());
 document.querySelector('#jumpBtn').addEventListener('pointerdown',()=>world.jump());
 document.querySelector('#dashBtn').addEventListener('pointerdown',()=>world.dash());
 const sprint=document.querySelector('#sprintBtn');sprint.addEventListener('pointerdown',()=>{world.setSprint(true);sprint.classList.add('held')});['pointerup','pointercancel','pointerleave'].forEach(ev=>sprint.addEventListener(ev,()=>{world.setSprint(false);sprint.classList.remove('held')}));
 document.querySelector('#buildBtn').addEventListener('pointerdown',()=>{world.build();buildCount++;if(buildCount>=5)state.missions.build=true;save()});
 document.querySelector('#interactBtn').addEventListener('pointerdown',()=>world.interact());

 document.querySelector('#fullscreenBtn').addEventListener('click',toggleFullscreen);
 document.querySelector('#settingsBtn').addEventListener('click',()=>{const p=document.querySelector('#cameraPanel');p.hidden=!p.hidden});
 document.querySelector('#craftBtn').addEventListener('click',()=>{const p=document.querySelector('#craftPanel');p.hidden=!p.hidden});
 document.querySelectorAll('.craft-action').forEach(b=>b.addEventListener('click',()=>toast(world.craft(b.dataset.craft)?'Crafted successfully':'Not enough resources')));
 const sens=document.querySelector('#sensRange'),dist=document.querySelector('#distRange'),lock=document.querySelector('#lockToggle');
 sens.addEventListener('input',()=>{state.camSensitivity=Number(sens.value);document.querySelector('#sensVal').textContent=sens.value;world.setCameraSettings({sensitivity:state.camSensitivity/1000});save()});
 dist.addEventListener('input',()=>{state.camDistance=Number(dist.value);document.querySelector('#distVal').textContent=dist.value;world.setCameraSettings({distance:state.camDistance});save()});
 lock.addEventListener('change',()=>{state.autoLock=lock.checked;world.setCameraSettings({autoLock:state.autoLock});save()});
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){document.querySelector('#worldShell')?.classList.remove('pseudo-fullscreen');document.body.classList.remove('playing-fullscreen');const b=document.querySelector('#fullscreenBtn');if(b)b.textContent='⛶ Full Screen';setTimeout(()=>world?.resize(),50)}})
}
render();
