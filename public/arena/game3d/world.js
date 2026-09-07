
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export class AlekWorld {
  constructor(canvas, opts={}) {
    this.canvas = canvas;
    this.onStats = opts.onStats || (()=>{});
    this.onToast = opts.onToast || (()=>{});
    this.keys = {};
    this.enemies = [];
    this.resources = [];
    this.blocks = [];
    this.projectiles = [];
    this.clock = new THREE.Clock();
    this.hp = 100;
    this.maxHp = 100;
    this.wood = 0;
    this.stone = 0;
    this.kills = 0;
    this.running = false;
    this.joy = {x:0,y:0};
    this.cameraYaw = 0;
    this.cameraPitch = -0.2;
    this.attackCooldown = 0;
    this.buildCooldown = 0;
    this.spawnTimer = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec5e8);
    this.scene.fog = new THREE.Fog(0x8ec5e8, 32, 95);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 180);
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.shadowMap.enabled = true;

    const hemi = new THREE.HemisphereLight(0xdff4ff,0x42502e,2.2);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff,2.4);
    sun.position.set(20,35,12); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    this.scene.add(sun);

    this.makeWorld();
    this.player = this.makeHuman({shirt:0x1b7bd1,pants:0x1c2430,skin:0xd3a277,hair:0x2b1c13});
    this.player.position.set(0,0,0);
    this.scene.add(this.player);

    this.makeVillage();
    this.spawnEnemy(12, 8);
    this.spawnEnemy(-10, 14);
    this.spawnEnemy(16,-12);

    this.bindControls();
    this.resize();
    addEventListener('resize',()=>this.resize());
  }

  makeWorld(){
    const groundMat = new THREE.MeshStandardMaterial({color:0x5f8f45,roughness:1});
    const ground = new THREE.Mesh(new THREE.BoxGeometry(120,1,120),groundMat);
    ground.position.y=-0.5; ground.receiveShadow=true; this.scene.add(ground);

    // voxel terrain clusters
    const dirt = new THREE.MeshStandardMaterial({color:0x7d5a38,roughness:1});
    const grass = new THREE.MeshStandardMaterial({color:0x6ea24e,roughness:1});
    for(let x=-48;x<=48;x+=8){
      for(let z=-48;z<=48;z+=8){
        if(Math.random()<0.35 && Math.hypot(x,z)>12){
          const h = 1+Math.floor(Math.random()*3);
          for(let y=0;y<h;y++){
            const b = new THREE.Mesh(new THREE.BoxGeometry(8,1,8), y===h-1?grass:dirt);
            b.position.set(x,y,z);b.receiveShadow=true;b.castShadow=true;this.scene.add(b);
          }
        }
      }
    }

    // trees/resources
    for(let i=0;i<28;i++){
      let x=(Math.random()-0.5)*95,z=(Math.random()-0.5)*95;
      if(Math.hypot(x,z)<10){i--;continue}
      this.makeTree(x,z);
    }
    for(let i=0;i<18;i++){
      let x=(Math.random()-0.5)*90,z=(Math.random()-0.5)*90;
      if(Math.hypot(x,z)<8){i--;continue}
      this.makeRock(x,z);
    }

    // water
    const water = new THREE.Mesh(new THREE.BoxGeometry(30,.35,18),new THREE.MeshStandardMaterial({color:0x2b8fc5,transparent:true,opacity:.78,roughness:.3,metalness:.1}));
    water.position.set(-26,-0.25,-28);this.scene.add(water);
  }

  makeVillage(){
    const houseMat = new THREE.MeshStandardMaterial({color:0x9a7449,roughness:1});
    const roofMat = new THREE.MeshStandardMaterial({color:0x5b2e28,roughness:1});
    [[6,6],[-7,5],[5,-8]].forEach(([x,z])=>{
      const h = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(5,3.5,5),houseMat);base.position.y=1.75;base.castShadow=true;h.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2,2.2,4),roofMat);roof.position.y=4.5;roof.rotation.y=Math.PI/4;roof.castShadow=true;h.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1,2,.2),new THREE.MeshStandardMaterial({color:0x3e2a20}));door.position.set(0,1,2.6);h.add(door);
      h.position.set(x,0,z);this.scene.add(h);
    });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.45,.65,5,8),new THREE.MeshStandardMaterial({color:0x68d7ff,emissive:0x1e8cff,emissiveIntensity:1.5}));
    beacon.position.set(0,2.5,0);this.scene.add(beacon);
  }

  makeTree(x,z){
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35,.45,3.4,8),new THREE.MeshStandardMaterial({color:0x6d4d2f}));trunk.position.y=1.7;trunk.castShadow=true;g.add(trunk);
    const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8,0),new THREE.MeshStandardMaterial({color:0x3f7d37,roughness:1}));leaves.position.y=4;leaves.castShadow=true;g.add(leaves);
    g.position.set(x,0,z);g.userData={type:'tree',hp:3};this.scene.add(g);this.resources.push(g);
  }
  makeRock(x,z){
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1,0),new THREE.MeshStandardMaterial({color:0x72777d,roughness:1}));
    r.scale.set(1.3,.8,1.1);r.position.set(x,.7,z);r.castShadow=true;r.userData={type:'rock',hp:4};this.scene.add(r);this.resources.push(r);
  }

  makeHuman(c){
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({color:c.skin,roughness:.9});
    const shirt = new THREE.MeshStandardMaterial({color:c.shirt,roughness:.8});
    const pants = new THREE.MeshStandardMaterial({color:c.pants,roughness:.9});
    const hair = new THREE.MeshStandardMaterial({color:c.hair,roughness:1});

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.15,1.55,.62),shirt);torso.position.y=2.15;torso.castShadow=true;g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.78,.9,.72),skin);head.position.y=3.42;head.castShadow=true;g.add(head);
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(.82,.24,.76),hair);hairTop.position.y=3.88;hairTop.castShadow=true;g.add(hairTop);

    const armGeo = new THREE.BoxGeometry(.32,1.45,.34), legGeo = new THREE.BoxGeometry(.42,1.55,.46);
    const la = new THREE.Mesh(armGeo,skin),ra=new THREE.Mesh(armGeo,skin);la.position.set(-.78,2.15,0);ra.position.set(.78,2.15,0);la.castShadow=ra.castShadow=true;g.add(la,ra);
    const ll = new THREE.Mesh(legGeo,pants),rl=new THREE.Mesh(legGeo,pants);ll.position.set(-.32,.78,0);rl.position.set(.32,.78,0);ll.castShadow=rl.castShadow=true;g.add(ll,rl);

    // face details
    const eyeMat = new THREE.MeshStandardMaterial({color:0x1c2530});
    for(const x of [-.18,.18]){
      const eye=new THREE.Mesh(new THREE.BoxGeometry(.09,.09,.03),eyeMat);eye.position.set(x,3.47,.375);g.add(eye);
    }
    g.userData={torso,head,la,ra,ll,rl,walk:0};
    return g;
  }

  spawnEnemy(x,z){
    const e = this.makeHuman({shirt:0x6b2331,pants:0x171c24,skin:0xb67f5d,hair:0x15100d});
    e.position.set(x,0,z); e.userData.hp=55; e.userData.maxHp=55; e.userData.speed=1.25+Math.random()*.4;e.userData.enemy=true;
    // weapon
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.08,1.2,.12),new THREE.MeshStandardMaterial({color:0x949ba6,metalness:.7,roughness:.3}));
    blade.position.set(.95,2.0,0);blade.rotation.z=-.25;e.add(blade);
    this.scene.add(e);this.enemies.push(e);
  }

  bindControls(){
    addEventListener('keydown',e=>this.keys[e.key.toLowerCase()]=true);
    addEventListener('keyup',e=>this.keys[e.key.toLowerCase()]=false);

    let dragging=false,lastX=0,lastY=0;
    this.canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY});
    this.canvas.addEventListener('pointermove',e=>{
      if(!dragging)return;
      const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
      this.cameraYaw-=dx*.005;this.cameraPitch=Math.max(-.65,Math.min(.15,this.cameraPitch-dy*.003));
    });
    addEventListener('pointerup',()=>dragging=false);
  }

  setJoystick(x,y){this.joy.x=x;this.joy.y=y}

  resize(){
    const r=this.canvas.getBoundingClientRect();
    this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();
    this.renderer.setSize(r.width,r.height,false);
  }

  attack(){
    if(this.attackCooldown>0)return;
    this.attackCooldown=.55;
    const fwd=new THREE.Vector3(Math.sin(this.cameraYaw),0,Math.cos(this.cameraYaw)*-1).normalize();
    let hit=false;
    for(const e of [...this.enemies]){
      const d=e.position.distanceTo(this.player.position);
      const dir=e.position.clone().sub(this.player.position).normalize();
      if(d<2.6 && dir.dot(fwd)>.15){
        e.userData.hp-=24;hit=true;e.position.add(dir.multiplyScalar(1.1));
        if(e.userData.hp<=0){this.scene.remove(e);this.enemies.splice(this.enemies.indexOf(e),1);this.kills++;this.onToast('Raider defeated +50 Points')}
      }
    }
    // resource gathering
    for(const r of [...this.resources]){
      const d=r.position.distanceTo(this.player.position);
      if(d<2.7){
        r.userData.hp--;hit=true;
        if(r.userData.hp<=0){
          if(r.userData.type==='tree')this.wood+=3;else this.stone+=2;
          this.scene.remove(r);this.resources.splice(this.resources.indexOf(r),1);
          this.onToast(r.userData.type==='tree'?'+3 Wood':'+2 Stone');
        }
      }
    }
    if(!hit)this.onToast('Swing');
  }

  build(){
    if(this.buildCooldown>0)return;
    if(this.wood<2){this.onToast('Need 2 Wood');return}
    this.buildCooldown=.4;this.wood-=2;
    const fwd=new THREE.Vector3(Math.sin(this.cameraYaw),0,-Math.cos(this.cameraYaw));
    const pos=this.player.position.clone().add(fwd.multiplyScalar(3));
    const b=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:0x9a7449,roughness:1}));
    b.position.set(Math.round(pos.x/2)*2,1,Math.round(pos.z/2)*2);b.castShadow=true;b.receiveShadow=true;this.scene.add(b);this.blocks.push(b);
    this.onToast('Block built');
  }

  interact(){
    let closest=null,dist=999;
    for(const e of this.enemies){const d=e.position.distanceTo(this.player.position);if(d<dist){dist=d;closest=e}}
    if(closest&&dist<4){this.onToast(`Raider HP: ${Math.max(0,closest.userData.hp)}/${closest.userData.maxHp}`);return}
    if(this.player.position.length()<6)this.onToast('ALEK Base: upgrade system coming next');
    else this.onToast('Nothing nearby');
  }

  jump(){this.onToast('Jump / vault')}

  update(dt){
    this.attackCooldown=Math.max(0,this.attackCooldown-dt);
    this.buildCooldown=Math.max(0,this.buildCooldown-dt);
    this.spawnTimer+=dt;
    if(this.spawnTimer>12 && this.enemies.length<6){
      this.spawnTimer=0;
      const a=Math.random()*Math.PI*2,r=18+Math.random()*10;this.spawnEnemy(Math.cos(a)*r,Math.sin(a)*r);
    }

    let x=0,z=0;
    if(this.keys['w'])z-=1;if(this.keys['s'])z+=1;if(this.keys['a'])x-=1;if(this.keys['d'])x+=1;
    x+=this.joy.x;z+=this.joy.y;
    const len=Math.hypot(x,z);if(len>1){x/=len;z/=len}
    if(len>.05){
      const sin=Math.sin(this.cameraYaw),cos=Math.cos(this.cameraYaw);
      const dx=x*cos-z*sin,dz=x*sin+z*cos;
      this.player.position.x+=dx*5.2*dt;this.player.position.z+=dz*5.2*dt;
      this.player.rotation.y=Math.atan2(dx,dz);
      const u=this.player.userData;u.walk+=dt*9;u.ll.rotation.x=Math.sin(u.walk)*.5;u.rl.rotation.x=-Math.sin(u.walk)*.5;u.la.rotation.x=-Math.sin(u.walk)*.35;u.ra.rotation.x=Math.sin(u.walk)*.35;
    }

    // enemies chase and attack
    for(const e of this.enemies){
      const to=this.player.position.clone().sub(e.position);const d=to.length();
      if(d<15 && d>1.6){to.normalize();e.position.add(to.multiplyScalar(e.userData.speed*dt));e.rotation.y=Math.atan2(to.x,to.z)}
      if(d<1.8){
        e.userData.hitTimer=(e.userData.hitTimer||0)-dt;
        if(e.userData.hitTimer<=0){e.userData.hitTimer=1.15;this.hp=Math.max(0,this.hp-7);this.onToast('You were hit -7 HP')}
      }
    }

    if(this.hp<=0){this.hp=this.maxHp;this.player.position.set(0,0,0);this.onToast('Respawned at ALEK Base')}

    // camera third person
    const target=this.player.position.clone().add(new THREE.Vector3(0,2.3,0));
    const dist=7.5;
    const cx=target.x+Math.sin(this.cameraYaw)*dist*Math.cos(this.cameraPitch);
    const cz=target.z+Math.cos(this.cameraYaw)*dist*Math.cos(this.cameraPitch);
    const cy=target.y+3.2+Math.sin(-this.cameraPitch)*dist;
    this.camera.position.lerp(new THREE.Vector3(cx,cy,cz),.12);
    this.camera.lookAt(target);

    this.onStats({hp:this.hp,maxHp:this.maxHp,wood:this.wood,stone:this.stone,kills:this.kills});
  }

  start(){
    if(this.running)return;this.running=true;
    const loop=()=>{
      if(!this.running)return;
      const dt=Math.min(this.clock.getDelta(),.04);
      this.update(dt);this.renderer.render(this.scene,this.camera);requestAnimationFrame(loop)
    };
    loop();
  }
  stop(){this.running=false}
}
