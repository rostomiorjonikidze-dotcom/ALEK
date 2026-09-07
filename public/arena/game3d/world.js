
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export class AlekWorld {
  constructor(canvas, opts={}) {
    this.canvas=canvas;
    this.onStats=opts.onStats||(()=>{});
    this.onToast=opts.onToast||(()=>{});
    this.onLoot=opts.onLoot||(()=>{});
    this.keys={}; this.enemies=[]; this.resources=[]; this.blocks=[]; this.lootDrops=[];
    this.clock=new THREE.Clock(); this.running=false;
    this.hp=120; this.maxHp=120; this.wood=0; this.stone=0; this.scrap=0; this.food=1; this.kills=0;
    this.joy={x:0,y:0}; this.cameraYaw=Math.PI; this.cameraPitch=-0.22;
    this.cameraDistance=7.2; this.cameraSensitivity=.0045; this.autoLock=true;
    this.attackCooldown=0; this.heavyCooldown=0; this.buildCooldown=0; this.dashCooldown=0;
    this.velocityY=0; this.grounded=true; this.sprint=false; this.playerInvuln=0;
    this.wave=1; this.waveTarget=4; this.worldTime=.20; this.day=1;
    this.weapon='sword'; this.armorLevel=0; this.damageBonus=0; this.speedBonus=0;
    this.animT=0;

    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x87b6d8);
    this.scene.fog=new THREE.Fog(0x87b6d8,45,145);

    this.camera=new THREE.PerspectiveCamera(62,1,.1,260);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.shadowMap.enabled=true;

    this.hemi=new THREE.HemisphereLight(0xe8f7ff,0x38452e,2.0); this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xffffff,2.4); this.sun.position.set(26,42,18); this.sun.castShadow=true; this.sun.shadow.mapSize.set(1024,1024); this.scene.add(this.sun);
    this.moon=new THREE.DirectionalLight(0x89aaff,.15); this.moon.position.set(-25,35,-15); this.scene.add(this.moon);

    this.makeWorld();
    this.player=this.makeHuman({shirt:0x1976d2,pants:0x1a2230,skin:0xd4a37d,hair:0x2c1d14,armor:0x53667a});
    this.player.position.set(0,0,0); this.scene.add(this.player);
    this.equipWeapon('sword');
    this.makeVillage();
    this.spawnWave();
    this.bindControls();
    this.resize();
    addEventListener('resize',()=>this.resize());
  }

  setCameraSettings({sensitivity,distance,autoLock}={}){
    if(Number.isFinite(sensitivity)) this.cameraSensitivity=Math.max(.0015,Math.min(.012,sensitivity));
    if(Number.isFinite(distance)) this.cameraDistance=Math.max(4.5,Math.min(12,distance));
    if(typeof autoLock==='boolean') this.autoLock=autoLock;
  }

  makeWorld(){
    const ground=new THREE.Mesh(new THREE.BoxGeometry(190,1,190),new THREE.MeshStandardMaterial({color:0x5f914a,roughness:1}));
    ground.position.y=-.5;ground.receiveShadow=true;this.scene.add(ground);

    const dirt=new THREE.MeshStandardMaterial({color:0x775235,roughness:1});
    const grass=new THREE.MeshStandardMaterial({color:0x689849,roughness:1});
    for(let x=-80;x<=80;x+=8) for(let z=-80;z<=80;z+=8){
      if(Math.random()<.27 && Math.hypot(x,z)>16){
        const h=1+Math.floor(Math.random()*4);
        for(let y=0;y<h;y++){
          const b=new THREE.Mesh(new THREE.BoxGeometry(8,1,8),y===h-1?grass:dirt);
          b.position.set(x,y,z);b.receiveShadow=true;b.castShadow=true;this.scene.add(b);
        }
      }
    }

    for(let i=0;i<58;i++){let x=(Math.random()-.5)*165,z=(Math.random()-.5)*165;if(Math.hypot(x,z)<13){i--;continue}this.makeTree(x,z)}
    for(let i=0;i<38;i++){let x=(Math.random()-.5)*160,z=(Math.random()-.5)*160;if(Math.hypot(x,z)<11){i--;continue}this.makeRock(x,z)}

    const waterMat=new THREE.MeshStandardMaterial({color:0x2d86b7,transparent:true,opacity:.78,roughness:.22,metalness:.08});
    [[-42,-38,38,22],[46,50,30,18]].forEach(([x,z,w,d])=>{
      const water=new THREE.Mesh(new THREE.BoxGeometry(w,.3,d),waterMat);water.position.set(x,-.25,z);this.scene.add(water)
    });

    // Distant ruins / landmarks
    this.makeRuin(48,-42); this.makeRuin(-58,32); this.makeRuin(62,58);
  }

  makeRuin(x,z){
    const mat=new THREE.MeshStandardMaterial({color:0x6e7076,roughness:1});
    for(let i=0;i<5;i++){
      const h=2+Math.random()*6;
      const p=new THREE.Mesh(new THREE.BoxGeometry(2+Math.random()*2,h,2+Math.random()*2),mat);
      p.position.set(x+(Math.random()-.5)*9,h/2,z+(Math.random()-.5)*9);p.castShadow=true;this.scene.add(p);
    }
  }

  makeVillage(){
    const houseMat=new THREE.MeshStandardMaterial({color:0x9a7449,roughness:1}), roofMat=new THREE.MeshStandardMaterial({color:0x5c3029,roughness:1});
    [[7,7],[-8,6],[6,-9],[-8,-8]].forEach(([x,z])=>{
      const h=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(5,3.5,5),houseMat);
      base.position.y=1.75;base.castShadow=true;h.add(base);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(4.2,2.2,4),roofMat);roof.position.y=4.5;roof.rotation.y=Math.PI/4;roof.castShadow=true;h.add(roof);
      h.position.set(x,0,z);this.scene.add(h);
    });
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.45,.7,5.5,8),new THREE.MeshStandardMaterial({color:0x68d7ff,emissive:0x1e8cff,emissiveIntensity:1.8}));
    beacon.position.set(0,2.75,0);this.scene.add(beacon);
  }

  makeTree(x,z){
    const g=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.36,.48,3.5,8),new THREE.MeshStandardMaterial({color:0x6b4a2d}));
    trunk.position.y=1.75;trunk.castShadow=true;g.add(trunk);
    const leaves=new THREE.Mesh(new THREE.DodecahedronGeometry(1.85,0),new THREE.MeshStandardMaterial({color:0x3e7737,roughness:1}));
    leaves.position.y=4.15;leaves.castShadow=true;g.add(leaves);
    g.position.set(x,0,z);g.userData={type:'tree',hp:3};this.scene.add(g);this.resources.push(g);
  }

  makeRock(x,z){
    const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1.15,0),new THREE.MeshStandardMaterial({color:0x747a80,roughness:1}));
    r.scale.set(1.35,.82,1.12);r.position.set(x,.7,z);r.castShadow=true;r.userData={type:'rock',hp:4};this.scene.add(r);this.resources.push(r);
  }

  makeHuman(c){
    const g=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:c.skin,roughness:.86});
    const shirt=new THREE.MeshStandardMaterial({color:c.shirt,roughness:.76});
    const pants=new THREE.MeshStandardMaterial({color:c.pants,roughness:.88});
    const hair=new THREE.MeshStandardMaterial({color:c.hair,roughness:1});
    const armor=new THREE.MeshStandardMaterial({color:c.armor||0x4a5563,roughness:.62,metalness:.18});

    // More human-like proportions: narrower head, shoulders, pelvis, segmented limbs.
    const torso=new THREE.Mesh(new THREE.BoxGeometry(1.05,1.35,.58),shirt);torso.position.y=2.2;torso.castShadow=true;g.add(torso);
    const chest=new THREE.Mesh(new THREE.BoxGeometry(1.18,.62,.68),armor);chest.position.y=2.45;chest.castShadow=true;g.add(chest);
    const pelvis=new THREE.Mesh(new THREE.BoxGeometry(.82,.45,.55),pants);pelvis.position.y=1.38;g.add(pelvis);

    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.28,8),skin);neck.position.y=3.03;g.add(neck);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.42,14,10),skin);head.scale.set(.9,1.05,.92);head.position.y=3.5;head.castShadow=true;g.add(head);
    const hairTop=new THREE.Mesh(new THREE.SphereGeometry(.43,12,8,0,Math.PI*2,0,Math.PI/2),hair);hairTop.position.y=3.67;hairTop.scale.set(.94,.8,.95);g.add(hairTop);

    const upperArmGeo=new THREE.CylinderGeometry(.15,.17,.72,8), foreArmGeo=new THREE.CylinderGeometry(.13,.15,.68,8);
    const thighGeo=new THREE.CylinderGeometry(.18,.20,.82,8), shinGeo=new THREE.CylinderGeometry(.15,.17,.78,8);

    const laU=new THREE.Mesh(upperArmGeo,shirt),raU=new THREE.Mesh(upperArmGeo,shirt),laL=new THREE.Mesh(foreArmGeo,skin),raL=new THREE.Mesh(foreArmGeo,skin);
    laU.position.set(-.68,2.25,0);raU.position.set(.68,2.25,0);laL.position.set(-.68,1.55,0);raL.position.set(.68,1.55,0);g.add(laU,raU,laL,raL);

    const llU=new THREE.Mesh(thighGeo,pants),rlU=new THREE.Mesh(thighGeo,pants),llL=new THREE.Mesh(shinGeo,pants),rlL=new THREE.Mesh(shinGeo,pants);
    llU.position.set(-.24,1.02,0);rlU.position.set(.24,1.02,0);llL.position.set(-.24,.23,0);rlL.position.set(.24,.23,0);g.add(llU,rlU,llL,rlL);

    const bootMat=new THREE.MeshStandardMaterial({color:0x25282c,roughness:.9});
    const lb=new THREE.Mesh(new THREE.BoxGeometry(.34,.22,.62),bootMat),rb=lb.clone();lb.position.set(-.24,-.12,.11);rb.position.set(.24,-.12,.11);g.add(lb,rb);

    const eyeMat=new THREE.MeshStandardMaterial({color:0x17212a});
    for(const x of [-.15,.15]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),eyeMat);eye.position.set(x,3.53,.385);g.add(eye)}
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.18,.025,.018),eyeMat);mouth.position.set(0,3.33,.39);g.add(mouth);

    g.userData={torso,chest,head,laU,raU,laL,raL,llU,rlU,llL,rlL,walk:0};
    return g;
  }

  equipWeapon(type){
    if(this.weaponMesh){this.player.remove(this.weaponMesh);this.weaponMesh=null}
    this.weapon=type;
    const metal=new THREE.MeshStandardMaterial({color:0xb6bec8,metalness:.78,roughness:.25});
    const dark=new THREE.MeshStandardMaterial({color:0x2d3137,roughness:.72});
    const w=new THREE.Group();
    if(type==='sword'){
      const blade=new THREE.Mesh(new THREE.BoxGeometry(.09,1.6,.12),metal);blade.position.y=.7;w.add(blade);
      const guard=new THREE.Mesh(new THREE.BoxGeometry(.55,.08,.12),metal);guard.position.y=-.08;w.add(guard);
      const grip=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.45,8),dark);grip.position.y=-.34;w.add(grip);
    }else{
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1.7,8),dark);shaft.position.y=.2;w.add(shaft);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.65,.45,.32),metal);head.position.y=1.05;w.add(head);
    }
    w.position.set(.85,1.75,.05);w.rotation.z=-.18;this.player.add(w);this.weaponMesh=w;
  }

  enemyProfile(cls){
    const profiles={
      raider:{shirt:0x612635,armor:0x4a2b32,hp:58,speed:1.55,damage:8,label:'Raider'},
      scout:{shirt:0x6a5325,armor:0x5c543e,hp:42,speed:2.15,damage:6,label:'Scout'},
      brute:{shirt:0x4c2532,armor:0x3a3e46,hp:110,speed:1.08,damage:14,label:'Brute'},
      warden:{shirt:0x222d5b,armor:0x343f68,hp:155,speed:1.18,damage:17,label:'Warden'}
    }; return profiles[cls];
  }

  spawnEnemy(x,z,cls='raider'){
    const p=this.enemyProfile(cls);
    const e=this.makeHuman({shirt:p.shirt,pants:0x151b24,skin:0xb77f5c,hair:0x17110d,armor:p.armor});
    e.position.set(x,0,z);e.userData.hp=p.hp+this.wave*5;e.userData.maxHp=e.userData.hp;e.userData.speed=p.speed+Math.min(.45,this.wave*.02);e.userData.damage=p.damage+Math.floor(this.wave/3);e.userData.enemy=true;e.userData.cls=cls;e.userData.label=p.label;
    const metal=new THREE.MeshStandardMaterial({color:0xaab0b7,metalness:.72,roughness:.3});
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.08,cls==='brute'?1.7:1.25,.12),metal);blade.position.set(.92,1.95,0);blade.rotation.z=-.25;e.add(blade);
    this.scene.add(e);this.enemies.push(e);
  }

  spawnWave(){
    const count=Math.min(3+this.wave,9);this.waveTarget=count;
    const pool=this.wave<3?['raider','scout']:this.wave<6?['raider','scout','brute']:['raider','scout','brute','warden'];
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2+Math.random()*.4,r=24+Math.random()*14;
      const cls=(this.wave%5===0&&i===count-1)?'warden':pool[Math.floor(Math.random()*pool.length)];
      this.spawnEnemy(Math.cos(a)*r,Math.sin(a)*r,cls);
    }
    this.onToast(`Wave ${this.wave} — survive!`);
  }

  dropLoot(pos,cls){
    const mat=new THREE.MeshStandardMaterial({color:cls==='warden'?0xffca58:0x63d1ff,emissive:cls==='warden'?0x6a4100:0x0b5370,emissiveIntensity:1.2});
    const item=new THREE.Mesh(new THREE.OctahedronGeometry(.38,0),mat);item.position.copy(pos);item.position.y=.55;item.userData={loot:true,kind:Math.random()<.55?'scrap':'food',value:cls==='warden'?3:1};this.scene.add(item);this.lootDrops.push(item);
  }

  bindControls(){
    addEventListener('keydown',e=>{
      this.keys[e.key.toLowerCase()]=true;if(e.key==='Shift')this.sprint=true;
      if(e.code==='Space'){e.preventDefault();this.jump()}
      if(e.key.toLowerCase()==='e')this.interact();
      if(e.key.toLowerCase()==='f')this.attack();
      if(e.key.toLowerCase()==='r')this.heavyAttack();
      if(e.key.toLowerCase()==='q')this.dash();
    });
    addEventListener('keyup',e=>{this.keys[e.key.toLowerCase()]=false;if(e.key==='Shift')this.sprint=false});
    let dragging=false,lastX=0,lastY=0;
    this.canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY});
    this.canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;this.cameraYaw-=dx*this.cameraSensitivity;this.cameraPitch=Math.max(-.72,Math.min(.22,this.cameraPitch-dy*this.cameraSensitivity*.72))});
    addEventListener('pointerup',()=>dragging=false);
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.cameraDistance=Math.max(4.5,Math.min(12,this.cameraDistance+e.deltaY*.008))},{passive:false});
  }

  setJoystick(x,y){this.joy={x,y}} setSprint(v){this.sprint=!!v}
  resize(){const r=this.canvas.getBoundingClientRect();this.camera.aspect=Math.max(.2,r.width/Math.max(1,r.height));this.camera.updateProjectionMatrix();this.renderer.setSize(r.width,r.height,false)}

  faceNearest(){
    if(!this.autoLock||!this.enemies.length)return;
    let near=null,d=999;for(const e of this.enemies){const nd=e.position.distanceTo(this.player.position);if(nd<d){d=nd;near=e}}
    if(near&&d<6){const dir=near.position.clone().sub(this.player.position);this.player.rotation.y=Math.atan2(dir.x,dir.z)}
  }

  attack(){
    if(this.attackCooldown>0)return;this.attackCooldown=.34;this.faceNearest();this.performHit(30+this.damageBonus,3.0,1.1);
    if(this.weaponMesh){this.weaponMesh.rotation.x=-1.1;setTimeout(()=>{if(this.weaponMesh)this.weaponMesh.rotation.x=0},120)}
  }

  heavyAttack(){
    if(this.heavyCooldown>0)return;this.heavyCooldown=2.4;this.faceNearest();this.performHit(55+this.damageBonus,3.4,1.8);this.onToast('Heavy strike');
  }

  performHit(damage,range,knock){
    const fwd=new THREE.Vector3(Math.sin(this.player.rotation.y),0,Math.cos(this.player.rotation.y)).normalize();
    for(const e of [...this.enemies]){
      const d=e.position.distanceTo(this.player.position),dir=e.position.clone().sub(this.player.position).normalize();
      if(d<range&&dir.dot(fwd)>.02){
        e.userData.hp-=damage;e.position.add(dir.multiplyScalar(knock));e.userData.stun=.22;
        if(e.userData.hp<=0){
          this.dropLoot(e.position,e.userData.cls);this.scene.remove(e);this.enemies.splice(this.enemies.indexOf(e),1);this.kills++;this.onToast(`${e.userData.label} defeated`);
        }
      }
    }
    for(const r of [...this.resources]){
      if(r.position.distanceTo(this.player.position)<2.8){r.userData.hp--;if(r.userData.hp<=0){if(r.userData.type==='tree')this.wood+=3;else this.stone+=2;this.scene.remove(r);this.resources.splice(this.resources.indexOf(r),1);this.onToast(r.userData.type==='tree'?'+3 Wood':'+2 Stone')}}
    }
  }

  dash(){if(this.dashCooldown>0)return;this.dashCooldown=2;this.playerInvuln=.35;const fwd=new THREE.Vector3(Math.sin(this.player.rotation.y),0,Math.cos(this.player.rotation.y));this.player.position.add(fwd.multiplyScalar(3.6))}
  build(){if(this.buildCooldown>0)return;if(this.wood<2){this.onToast('Need 2 Wood');return}this.buildCooldown=.35;this.wood-=2;const fwd=new THREE.Vector3(Math.sin(this.player.rotation.y),0,Math.cos(this.player.rotation.y)),pos=this.player.position.clone().add(fwd.multiplyScalar(3));const b=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:0x9a7449,roughness:1}));b.position.set(Math.round(pos.x/2)*2,1,Math.round(pos.z/2)*2);b.castShadow=true;b.receiveShadow=true;this.scene.add(b);this.blocks.push(b)}
  jump(){if(!this.grounded)return;this.velocityY=7.4;this.grounded=false}

  interact(){
    for(const l of [...this.lootDrops]){
      if(l.position.distanceTo(this.player.position)<2.5){if(l.userData.kind==='scrap')this.scrap+=l.userData.value;else this.food+=l.userData.value;this.scene.remove(l);this.lootDrops.splice(this.lootDrops.indexOf(l),1);this.onLoot(l.userData);this.onToast(`Picked up ${l.userData.kind}`);return}
    }
    this.onToast(this.player.position.length()<8?'ALEK Base — crafting available':'Nothing to pick up');
  }

  craft(kind){
    if(kind==='axe'){if(this.wood<6||this.stone<4)return false;this.wood-=6;this.stone-=4;this.equipWeapon('axe');this.damageBonus=10;return true}
    if(kind==='armor'){if(this.scrap<5||this.stone<5)return false;this.scrap-=5;this.stone-=5;this.armorLevel++;this.maxHp+=25;this.hp=this.maxHp;return true}
    if(kind==='meal'){if(this.food<1)return false;this.food--;this.hp=Math.min(this.maxHp,this.hp+45);return true}
    return false;
  }

  updateDayNight(dt){
    this.worldTime+=dt*.0045;if(this.worldTime>=1){this.worldTime-=1;this.day++}
    const a=this.worldTime*Math.PI*2, daylight=Math.max(.08,(Math.sin(a-Math.PI/2)+1)/2);
    this.sun.intensity=.2+daylight*2.5;this.hemi.intensity=.35+daylight*1.8;this.moon.intensity=.65*(1-daylight);
    const dayColor=new THREE.Color(0x87b6d8),nightColor=new THREE.Color(0x07101d);this.scene.background=nightColor.clone().lerp(dayColor,daylight);this.scene.fog.color.copy(this.scene.background);
  }

  update(dt){
    this.animT+=dt;this.updateDayNight(dt);
    this.attackCooldown=Math.max(0,this.attackCooldown-dt);this.heavyCooldown=Math.max(0,this.heavyCooldown-dt);this.buildCooldown=Math.max(0,this.buildCooldown-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.playerInvuln=Math.max(0,this.playerInvuln-dt);

    let x=0,z=0;if(this.keys['w'])z-=1;if(this.keys['s'])z+=1;if(this.keys['a'])x-=1;if(this.keys['d'])x+=1;x+=this.joy.x;z+=this.joy.y;
    const len=Math.hypot(x,z);if(len>1){x/=len;z/=len}
    const u=this.player.userData;
    if(len>.05){
      const sin=Math.sin(this.cameraYaw),cos=Math.cos(this.cameraYaw),dx=x*cos-z*sin,dz=x*sin+z*cos;
      const speed=(this.sprint?7.6:5.25)+this.speedBonus;this.player.position.x+=dx*speed*dt;this.player.position.z+=dz*speed*dt;
      const desired=Math.atan2(dx,dz);let delta=((desired-this.player.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;this.player.rotation.y+=delta*Math.min(1,dt*12);
      u.walk+=dt*(this.sprint?14:9);u.llU.rotation.x=Math.sin(u.walk)*.55;u.rlU.rotation.x=-Math.sin(u.walk)*.55;u.laU.rotation.x=-Math.sin(u.walk)*.45;u.raU.rotation.x=Math.sin(u.walk)*.45;
    }else{u.laU.rotation.x*=.82;u.raU.rotation.x*=.82;u.llU.rotation.x*=.82;u.rlU.rotation.x*=.82}

    this.velocityY-=18*dt;this.player.position.y+=this.velocityY*dt;if(this.player.position.y<=0){this.player.position.y=0;this.velocityY=0;this.grounded=true}

    for(const l of this.lootDrops){l.rotation.y+=dt*2;l.position.y=.55+Math.sin(this.animT*3+l.position.x)*.12}

    for(const e of this.enemies){
      if(e.userData.stun>0){e.userData.stun-=dt;continue}
      const to=this.player.position.clone().sub(e.position),d=to.length();
      if(d<22&&d>1.7){to.y=0;to.normalize();e.position.add(to.multiplyScalar(e.userData.speed*dt));e.rotation.y=Math.atan2(to.x,to.z)}
      if(d<1.9){e.userData.hitTimer=(e.userData.hitTimer||0)-dt;if(e.userData.hitTimer<=0){e.userData.hitTimer=1.0;if(this.playerInvuln<=0){const reduction=Math.min(.45,this.armorLevel*.1);this.hp=Math.max(0,this.hp-e.userData.damage*(1-reduction));this.onToast(`Hit -${Math.round(e.userData.damage*(1-reduction))} HP`)}}}
    }

    if(this.enemies.length===0){this.wave++;setTimeout(()=>{if(this.running&&this.enemies.length===0)this.spawnWave()},1000)}
    if(this.player.position.length()<8&&this.hp<this.maxHp)this.hp=Math.min(this.maxHp,this.hp+.2);
    if(this.hp<=0){this.hp=this.maxHp;this.player.position.set(0,0,0);this.onToast('Respawned at ALEK Base')}

    const target=this.player.position.clone().add(new THREE.Vector3(0,2.25,0)),dist=this.cameraDistance;
    const camPos=new THREE.Vector3(target.x+Math.sin(this.cameraYaw)*dist*Math.cos(this.cameraPitch),target.y+2.4+Math.sin(-this.cameraPitch)*dist,target.z+Math.cos(this.cameraYaw)*dist*Math.cos(this.cameraPitch));
    this.camera.position.lerp(camPos,1-Math.pow(.002,dt));this.camera.lookAt(target);

    const phase=this.worldTime<.25?'Night':this.worldTime<.48?'Morning':this.worldTime<.72?'Day':'Evening';
    this.onStats({hp:this.hp,maxHp:this.maxHp,wood:this.wood,stone:this.stone,scrap:this.scrap,food:this.food,kills:this.kills,wave:this.wave,day:this.day,phase,weapon:this.weapon,armor:this.armorLevel});
  }

  start(){if(this.running)return;this.running=true;this.clock.getDelta();const loop=()=>{if(!this.running)return;const dt=Math.min(this.clock.getDelta(),.04);this.update(dt);this.renderer.render(this.scene,this.camera);requestAnimationFrame(loop)};loop()}
  stop(){this.running=false}
}
