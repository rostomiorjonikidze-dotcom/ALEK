
import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const app = express();
app.use(express.json());
const db = new Database(process.env.DB_PATH || './arena.db');

db.exec(`
CREATE TABLE IF NOT EXISTS players(
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  xp_max INTEGER DEFAULT 100,
  energy INTEGER DEFAULT 20,
  max_energy INTEGER DEFAULT 20,
  points INTEGER DEFAULT 0,
  crystals INTEGER DEFAULT 250,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  referrals INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 1,
  daily_claimed_date TEXT,
  inventory TEXT DEFAULT '[]',
  missions TEXT DEFAULT '{"login":true,"play3":false,"upgrade":false,"invite":false,"website":false}',
  referrer_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function validateTelegram(initData){
  const token = process.env.BOT_TOKEN;
  if(!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash'); params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256',secret).update(dataCheckString).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(calc,'hex'),Buffer.from(hash,'hex'))) return null;
  try{return JSON.parse(params.get('user')||'null')}catch{return null}
}
function auth(req,res,next){
  const user=validateTelegram(req.get('X-Telegram-Init-Data'));
  if(!user) return res.status(401).send('Unauthorized Telegram Mini App request');
  req.tgUser=user; next();
}
function getPlayer(id){
  return db.prepare('SELECT * FROM players WHERE telegram_id=?').get(String(id));
}
function normalize(p){
  if(!p)return null;
  return {...p,inventory:JSON.parse(p.inventory||'[]'),missions:JSON.parse(p.missions||'{}'),dailyClaimed:p.daily_claimed_date===new Date().toISOString().slice(0,10)};
}
function ensurePlayer(user, referrer){
  let p=getPlayer(user.id);
  if(!p){
    db.prepare(`INSERT INTO players(telegram_id,username,first_name,referrer_id) VALUES(?,?,?,?)`).run(String(user.id),user.username||'',user.first_name||'',referrer||null);
    p=getPlayer(user.id);
    if(referrer && String(referrer)!==String(user.id) && getPlayer(referrer)){
      db.prepare('UPDATE players SET referrals=referrals+1, points=points+500 WHERE telegram_id=?').run(String(referrer));
      const m=JSON.parse(p.missions||'{}');m.invite=true;
    }
  }else{
    db.prepare('UPDATE players SET username=?, first_name=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?').run(user.username||'',user.first_name||'',String(user.id));
    p=getPlayer(user.id);
  }
  return p;
}
function writePlayer(id,p){
  db.prepare(`UPDATE players SET level=?,xp=?,xp_max=?,energy=?,max_energy=?,points=?,crystals=?,wins=?,losses=?,referrals=?,streak=?,daily_claimed_date=?,inventory=?,missions=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?`)
  .run(p.level,p.xp,p.xp_max,p.energy,p.max_energy,p.points,p.crystals,p.wins,p.losses,p.referrals,p.streak,p.daily_claimed_date||null,JSON.stringify(p.inventory||[]),JSON.stringify(p.missions||{}),String(id));
}
function levelCheck(p){
  while(p.xp>=p.xp_max){p.xp-=p.xp_max;p.level++;p.xp_max=Math.round(p.xp_max*1.25)}
}
function load(req){
  return normalize(ensurePlayer(req.tgUser, req.query.ref || req.body?.referrer));
}

app.get('/health',(req,res)=>res.json({ok:true}));
app.get('/me',auth,(req,res)=>{
  const p=load(req);res.json({user:req.tgUser,player:p});
});
app.post('/daily',auth,(req,res)=>{
  const p=load(req), today=new Date().toISOString().slice(0,10);
  if(p.daily_claimed_date===today)return res.json({player:p,message:'Daily reward already claimed'});
  p.daily_claimed_date=today;p.points+=100;p.energy=Math.min(p.max_energy,p.energy+5);p.streak=(p.streak||0)+1;writePlayer(req.tgUser.id,p);
  res.json({player:normalize(getPlayer(req.tgUser.id)),message:'Daily reward claimed: +100 Points · +5 Energy'});
});
app.post('/battle',auth,(req,res)=>{
  const p=load(req);if(p.energy<2)return res.status(400).send('Not enough energy');
  p.energy-=2;const win=Math.random()<0.62;
  if(win){p.wins++;p.points+=200;p.xp+=50}else{p.losses++;p.points+=60;p.xp+=20}
  levelCheck(p);writePlayer(req.tgUser.id,p);res.json({player:normalize(getPlayer(req.tgUser.id)),message:win?'Victory! +200 Points · +50 XP':'Defeat · +60 Points · +20 XP'});
});
app.post('/upgrade',auth,(req,res)=>{
  const p=load(req);if(p.points<150)return res.status(400).send('Need 150 Points');
  p.points-=150;p.xp+=30;p.missions.upgrade=true;levelCheck(p);writePlayer(req.tgUser.id,p);
  res.json({player:normalize(getPlayer(req.tgUser.id)),message:'Module upgraded · +30 XP'});
});
app.post('/mission',auth,(req,res)=>{
  const rewards={website:200};const mission=req.body?.mission;if(!rewards[mission])return res.status(400).send('Unsupported mission');
  const p=load(req);if(p.missions[mission])return res.json({player:p,message:'Mission already complete'});
  p.missions[mission]=true;p.points+=rewards[mission];writePlayer(req.tgUser.id,p);
  res.json({player:normalize(getPlayer(req.tgUser.id)),message:`Mission complete: +${rewards[mission]} Points`});
});
app.post('/box',auth,(req,res)=>{
  const cfg={starter:80,cyber:180,elite:350,legend:600};const box=req.body?.box;const price=cfg[box];if(!price)return res.status(400).send('Unknown box');
  const p=load(req);if(p.crystals<price)return res.status(400).send('Not enough crystals');
  p.crystals-=price;
  const rewards=['Energy +10','Points +250','Points +500','Cosmetic shard'];
  const reward=rewards[Math.floor(Math.random()*rewards.length)];
  if(reward.startsWith('Energy'))p.energy=Math.min(p.max_energy,p.energy+10);
  else if(reward.startsWith('Points'))p.points+=Number(reward.split('+')[1]);
  else p.inventory=[...(p.inventory||[]),`${box}: ${reward}`];
  writePlayer(req.tgUser.id,p);res.json({player:normalize(getPlayer(req.tgUser.id)),message:`Box opened: ${reward}`});
});
app.get('/leaderboard',auth,(req,res)=>{
  const rows=db.prepare('SELECT telegram_id,username,first_name,points FROM players ORDER BY points DESC LIMIT 50').all();
  res.json({players:rows.map((r,i)=>({rank:i+1,name:r.username?`@${r.username}`:(r.first_name||'Player'),points:r.points}))});
});

const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`ALEK Arena API running on :${port}`));
