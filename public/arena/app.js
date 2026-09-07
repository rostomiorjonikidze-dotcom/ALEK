
import {AlekWorld} from './game3d/world.js';

const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#07111f');tg.setBackgroundColor('#07111f')}catch{}}

let route='home',world=null;
let state=JSON.parse(localStorage.getItem('alekWorldState')||'null')||{level:1,points:0,energy:20,missions:{login:true,wood:false,kills:false,build:false},referrals:0,crystals:250};
const app=document.querySelector('#app'),toastEl=document.querySelector('#toast'),energyEl=document.querySelector('#energy');

function save(){localStorage.setItem('alekWorldState',JSON.stringify(state));energyEl.textContent=state.energy}
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),1600)}
function nav(r){if(world){world.stop();world=null}route=r;render();document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===r));window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.route)));

function home(){
return `<section class="hero"><div class="eyebrow">ALEK WORLD · ALPHA</div><h2>Build your world. Defend your base.</h2><p>A mobile-first 3D survival world for Telegram and the web. Explore, gather resources, build and fight human Raiders.</p><button class="primary" id="playBtn">🌍 Enter World</button></section>
<div class="grid2"><div class="card stat"><b>${state.level}</b><span>Level</span></div><div class="card stat"><b>${state.points}</b><span>ALEK Points</span></div></div>
<div class="section-title"><h3>World Goals</h3><span>Alpha</span></div>
<div class="card"><div class="title">🪵 Gather resources</div><div class="sub">Harvest trees and stone to build your base.</div></div>
<div class="card"><div class="title">⚔ Defeat Raiders</div><div class="sub">Enemies look and move like stylized human fighters.</div></div>
<div class="card"><div class="title">🏗 Build freely</div><div class="sub">Use gathered wood to place voxel-style blocks.</div></div>
<div class="section-title"><h3>Creator</h3><span>ALEK</span></div>
<div class="card"><div class="title">Created by Rostom Orjonikidze</div><div class="sub">Founder & Creator of ALEK / ALEK World</div></div>`}

function worldPage(){
return `<div class="world-shell">
<canvas id="gameCanvas"></canvas>
<div class="hud">
  <div class="hud-top">
    <div class="hud-box"><b>HP</b><div class="hpbar"><i id="hpFill" style="width:100%"></i></div></div>
    <div class="hud-box">🪵 <span id="wood">0</span> &nbsp; 🪨 <span id="stone">0</span> &nbsp; ⚔ <span id="kills">0</span></div>
  </div>
  <div class="crosshair">+</div>
  <div class="mobile-controls">
    <div class="joystick" id="joystick"><div class="joystick-knob" id="joyKnob"></div></div>
    <div class="action-pad">
      <button class="action-btn attack" id="attackBtn">ATTACK</button>
      <button class="action-btn jump" id="jumpBtn">JUMP</button>
      <button class="action-btn build" id="buildBtn">BUILD</button>
      <button class="action-btn interact" id="interactBtn">USE</button>
    </div>
  </div>
</div>
</div>
<div class="card world-tip" style="margin-top:12px">Desktop: WASD to move, drag mouse to rotate camera. Mobile: left joystick to move, drag the world to rotate. Attack trees/rocks to gather resources. Build costs 2 wood.</div>`}

function missions(){
const m=[
['login','✅','Enter ALEK World',100],
['wood','🪵','Collect 10 Wood',200],
['kills','⚔','Defeat 3 Raiders',300],
['build','🏗','Build 5 blocks',250],
];
return `<div class="section-title"><h3>Missions</h3><span>Daily</span></div>${m.map(([id,ic,n,r])=>`<div class="card row"><div><div class="title">${ic} ${n}</div><div class="sub reward">+${r} Points</div></div><span>${state.missions[id]?'DONE':'ACTIVE'}</span></div>`).join('')}`}
function friends(){return `<div class="section-title"><h3>Friends</h3><span>Referral</span></div><div class="card"><div class="title">Invite friends to ALEK World</div><div class="sub">Referral rewards will sync with Telegram accounts once the backend is connected.</div><button class="primary" id="inviteBtn" style="margin-top:12px">Invite</button></div>`}
function shop(){return `<div class="section-title"><h3>Shop</h3><span>${state.crystals} Crystals</span></div><div class="card"><div class="title">Premium Skin Pack</div><div class="sub">Fixed-value cosmetic pack.</div><div class="reward">€2.99</div></div><div class="card"><div class="title">Season Pass</div><div class="sub">Premium season rewards and cosmetics.</div><div class="reward">€7.99</div></div>`}

function render(){
save();
app.innerHTML=route==='home'?home():route==='world'?worldPage():route==='missions'?missions():route==='friends'?friends():shop();
bind();
if(route==='world')initWorld();
}
function bind(){
document.querySelector('#playBtn')?.addEventListener('click',()=>nav('world'));
document.querySelector('#inviteBtn')?.addEventListener('click',()=>{const url='https://t.me/ALEKArenaBot';try{tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Join ALEK World 🌍')}`)}catch{toast('Invite link ready')}})
}

function initWorld(){
const canvas=document.querySelector('#gameCanvas');
world=new AlekWorld(canvas,{onToast:toast,onStats:s=>{
 document.querySelector('#hpFill').style.width=`${(s.hp/s.maxHp)*100}%`;
 document.querySelector('#wood').textContent=s.wood;document.querySelector('#stone').textContent=s.stone;document.querySelector('#kills').textContent=s.kills;
 if(s.wood>=10)state.missions.wood=true;if(s.kills>=3)state.missions.kills=true;save();
}});
world.start();

const joy=document.querySelector('#joystick'),knob=document.querySelector('#joyKnob');
let active=false;
const updateJoy=(clientX,clientY)=>{
 const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let dx=(clientX-cx)/(r.width/2),dy=(clientY-cy)/(r.height/2);
 const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}
 knob.style.transform=`translate(${dx*30}px,${dy*30}px)`;world.setJoystick(dx,dy);
};
joy.addEventListener('pointerdown',e=>{active=true;joy.setPointerCapture(e.pointerId);updateJoy(e.clientX,e.clientY)});
joy.addEventListener('pointermove',e=>{if(active)updateJoy(e.clientX,e.clientY)});
joy.addEventListener('pointerup',()=>{active=false;knob.style.transform='';world.setJoystick(0,0)});
document.querySelector('#attackBtn').addEventListener('click',()=>world.attack());
document.querySelector('#buildBtn').addEventListener('click',()=>{world.build();state.missions.build=true;save()});
document.querySelector('#interactBtn').addEventListener('click',()=>world.interact());
document.querySelector('#jumpBtn').addEventListener('click',()=>world.jump());
}

render();
