
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { createDb } from './db.js';
import { validateTelegramInitData, telegramApi } from './telegram.js';

const PORT = Number(process.env.PORT || 8080);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://alek.best';
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || '';
const DB_PATH = path.resolve(process.env.DB_PATH || './data/alek.sqlite');
const MAX_AGE = Number(process.env.INITDATA_MAX_AGE_SECONDS || 86400);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

if (!BOT_TOKEN) console.warn('BOT_TOKEN is not set. Telegram auth/payments will not work.');

const app = express();
const db = createDb(DB_PATH);
app.use(cors({ origin: FRONTEND_ORIGIN, methods:['GET','POST'], allowedHeaders:['Content-Type','X-Telegram-Init-Data','X-Admin-Secret'] }));
app.use(express.json({ limit:'64kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders:true, legacyHeaders:false }));

const PRODUCTS = {
  energy_pack: { title:'Energy Pack', description:'+2,500 Energy', stars:75 },
  boost_pack: { title:'Boost Pack', description:'Premium ALEK boost bundle', stars:149 },
  founder_skin: { title:'Founder Skin', description:'Exclusive ALEK profile cosmetic', stars:249 },
  gift_pack: { title:'Gift Pack', description:'In-game gift pack', stars:199 },
  genesis_pass: { title:'Genesis Pass', description:'Season 01 premium pass', stars:499 }
};

function auth(req,res,next){
  try{
    const initData = req.header('X-Telegram-Init-Data') || '';
    const parsed = validateTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    req.tg = parsed;
    next();
  }catch(e){
    res.status(401).json({ error:'telegram_auth_failed' });
  }
}

function upsertUser(u){
  const now = Date.now();
  db.prepare(`
    INSERT INTO users(telegram_id,first_name,username,photo_url,last_seen,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name=excluded.first_name,
      username=excluded.username,
      photo_url=excluded.photo_url,
      last_seen=excluded.last_seen,
      updated_at=excluded.updated_at
  `).run(String(u.id), u.first_name||'', u.username||'', u.photo_url||'', now, now, now);
  return db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(u.id));
}

function publicUser(row){
  return {
    telegramId: row.telegram_id,
    firstName: row.first_name,
    username: row.username,
    photoUrl: row.photo_url,
    points: row.points,
    energy: row.energy,
    maxEnergy: row.max_energy,
    tapPower: row.tap_power,
    recharge: row.recharge,
    totalTaps: row.total_taps,
    referrals: row.referrals,
    streak: row.streak,
    squadId: row.squad_id
  };
}

app.get('/health',(req,res)=>res.json({ok:true,service:'alek-arena-api'}));

app.post('/api/session', auth, (req,res)=>{
  const row = upsertUser(req.tg.user);
  const boss = db.prepare('SELECT hp,max_hp,season FROM boss WHERE id=1').get();
  res.json({ user: publicUser(row), boss });
});

app.post('/api/taps', auth, (req,res)=>{
  const row = upsertUser(req.tg.user);
  const taps = Math.max(0, Math.min(120, Number(req.body?.taps || 0)));
  const elapsedMs = Math.max(250, Math.min(60_000, Number(req.body?.elapsedMs || 1000)));
  const maxTapRate = 14;
  const maxAllowedByTime = Math.ceil((elapsedMs/1000) * maxTapRate) + 3;
  const accepted = Math.min(taps, maxAllowedByTime);
  if (accepted <= 0) return res.json({accepted:0,user:publicUser(row)});

  const fresh = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(row.telegram_id);
  const maxEnergySpend = Math.floor(fresh.energy / Math.max(1,fresh.tap_power));
  const energyBound = Math.min(accepted, maxEnergySpend);
  const earned = energyBound * fresh.tap_power;

  const tx = db.transaction(()=>{
    db.prepare(`UPDATE users SET points=points+?, energy=MAX(0,energy-?), total_taps=total_taps+?, updated_at=? WHERE telegram_id=?`)
      .run(earned, energyBound*fresh.tap_power, energyBound, Date.now(), fresh.telegram_id);
    db.prepare(`INSERT INTO tap_batches(telegram_id,taps,earned,created_at) VALUES(?,?,?,?)`)
      .run(fresh.telegram_id, energyBound, earned, Date.now());
  });
  tx();
  const updated = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(fresh.telegram_id);
  res.json({accepted:energyBound,earned,user:publicUser(updated)});
});

app.post('/api/recharge', auth, (req,res)=>{
  const row = upsertUser(req.tg.user);
  const now = Date.now();
  const last = row.updated_at || now;
  const seconds = Math.max(0, Math.min(3600, Math.floor((now-last)/1000)));
  const add = seconds * row.recharge;
  db.prepare(`UPDATE users SET energy=MIN(max_energy,energy+?), updated_at=? WHERE telegram_id=?`).run(add,now,row.telegram_id);
  const updated = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(row.telegram_id);
  res.json({user:publicUser(updated)});
});

app.get('/api/leaderboard', auth, (req,res)=>{
  upsertUser(req.tg.user);
  const rows = db.prepare(`SELECT telegram_id,first_name,username,points FROM users ORDER BY points DESC, updated_at ASC LIMIT 50`).all();
  res.json({players:rows.map((r,i)=>({rank:i+1,telegramId:r.telegram_id,firstName:r.first_name,username:r.username,points:r.points}))});
});

app.post('/api/referral/claim', auth, (req,res)=>{
  const me = upsertUser(req.tg.user);
  const inviterId = String(req.body?.inviterId || '');
  if (!inviterId || inviterId === me.telegram_id) return res.status(400).json({error:'invalid_inviter'});
  if (me.inviter_id) return res.status(409).json({error:'already_referred'});
  const inviter = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(inviterId);
  if (!inviter) return res.status(404).json({error:'inviter_not_found'});
  const tx=db.transaction(()=>{
    db.prepare('UPDATE users SET inviter_id=?, updated_at=? WHERE telegram_id=?').run(inviterId,Date.now(),me.telegram_id);
    db.prepare('UPDATE users SET referrals=referrals+1, points=points+2500, updated_at=? WHERE telegram_id=?').run(Date.now(),inviterId);
    db.prepare('UPDATE users SET points=points+500, updated_at=? WHERE telegram_id=?').run(Date.now(),me.telegram_id);
  });
  tx();
  res.json({ok:true});
});

app.post('/api/boss/attack', auth, (req,res)=>{
  const me = upsertUser(req.tg.user);
  const hits = Math.max(1, Math.min(20, Number(req.body?.hits || 1)));
  const energyCost = hits * 10;
  const fresh = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(me.telegram_id);
  if (fresh.energy < energyCost) return res.status(400).json({error:'not_enough_energy'});
  const damage = hits * (25 + fresh.tap_power * 8);
  const tx=db.transaction(()=>{
    const boss=db.prepare('SELECT * FROM boss WHERE id=1').get();
    let newHp=Math.max(0,boss.hp-damage);
    let reward=0;
    if(newHp===0){ reward=10000; newHp=boss.max_hp; }
    db.prepare('UPDATE boss SET hp=?,updated_at=? WHERE id=1').run(newHp,Date.now());
    db.prepare('UPDATE users SET energy=energy-?,points=points+?,updated_at=? WHERE telegram_id=?').run(energyCost,reward,Date.now(),fresh.telegram_id);
    db.prepare(`INSERT INTO boss_damage(telegram_id,damage,updated_at) VALUES(?,?,?)
      ON CONFLICT(telegram_id) DO UPDATE SET damage=damage+excluded.damage,updated_at=excluded.updated_at`)
      .run(fresh.telegram_id,damage,Date.now());
  });
  tx();
  res.json({boss:db.prepare('SELECT hp,max_hp,season FROM boss WHERE id=1').get(),user:publicUser(db.prepare('SELECT * FROM users WHERE telegram_id=?').get(fresh.telegram_id))});
});

app.post('/api/squad/create', auth, (req,res)=>{
  const me=upsertUser(req.tg.user);
  if(me.squad_id) return res.status(409).json({error:'already_in_squad'});
  const name=String(req.body?.name||'').trim().replace(/\s+/g,' ').slice(0,28);
  if(name.length<3) return res.status(400).json({error:'name_too_short'});
  try{
    const info=db.prepare('INSERT INTO squads(name,owner_id,power,created_at) VALUES(?,?,?,?)').run(name,me.telegram_id,0,Date.now());
    db.prepare('UPDATE users SET squad_id=?,updated_at=? WHERE telegram_id=?').run(info.lastInsertRowid,Date.now(),me.telegram_id);
    res.json({id:Number(info.lastInsertRowid),name});
  }catch{ res.status(409).json({error:'squad_name_taken'}); }
});

app.post('/api/wallet', auth, (req,res)=>{
  const me=upsertUser(req.tg.user);
  const address=String(req.body?.address||'').trim();
  if(address.length<40 || address.length>80) return res.status(400).json({error:'invalid_address'});
  db.prepare(`INSERT INTO wallets(telegram_id,ton_address,updated_at) VALUES(?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET ton_address=excluded.ton_address,updated_at=excluded.updated_at`)
    .run(me.telegram_id,address,Date.now());
  res.json({ok:true});
});

app.post('/api/stars/create-invoice', auth, async (req,res)=>{
  const me=upsertUser(req.tg.user);
  const productId=String(req.body?.productId||'');
  const product=PRODUCTS[productId];
  if(!product) return res.status(404).json({error:'unknown_product'});
  const payload=`alek:${productId}:${me.telegram_id}:${crypto.randomUUID()}`;
  db.prepare('INSERT INTO purchases(telegram_id,product_id,payload,stars,status,created_at) VALUES(?,?,?,?,?,?)')
    .run(me.telegram_id,productId,payload,product.stars,'pending',Date.now());
  try{
    const invoiceLink=await telegramApi(BOT_TOKEN,'createInvoiceLink',{
      title:product.title,
      description:product.description,
      payload,
      provider_token:'',
      currency:'XTR',
      prices:[{label:product.title,amount:product.stars}]
    });
    res.json({invoiceLink});
  }catch(e){
    console.error(e);
    res.status(502).json({error:'telegram_invoice_failed'});
  }
});

app.post('/telegram/webhook', async (req,res)=>{
  const update=req.body||{};
  try{
    if(update.pre_checkout_query){
      const q=update.pre_checkout_query;
      const p=db.prepare('SELECT * FROM purchases WHERE payload=? AND status=?').get(q.invoice_payload,'pending');
      await telegramApi(BOT_TOKEN,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok:!!p,...(!p?{error_message:'Order not found'}:{})});
    }

    const msg=update.message;
    const pay=msg?.successful_payment;
    if(pay?.currency==='XTR'){
      const p=db.prepare('SELECT * FROM purchases WHERE payload=?').get(pay.invoice_payload);
      if(p && p.status!=='paid'){
        const tx=db.transaction(()=>{
          db.prepare(`UPDATE purchases SET status='paid',telegram_payment_charge_id=?,paid_at=? WHERE id=?`)
            .run(pay.telegram_payment_charge_id,Date.now(),p.id);

          if(p.product_id==='energy_pack'){
            db.prepare('UPDATE users SET energy=energy+2500,max_energy=MAX(max_energy,energy+2500),updated_at=? WHERE telegram_id=?').run(Date.now(),p.telegram_id);
          }else if(p.product_id==='boost_pack'){
            db.prepare('UPDATE users SET tap_power=tap_power+1,recharge=recharge+1,updated_at=? WHERE telegram_id=?').run(Date.now(),p.telegram_id);
          }else if(p.product_id==='genesis_pass'){
            db.prepare('UPDATE users SET points=points+5000,updated_at=? WHERE telegram_id=?').run(Date.now(),p.telegram_id);
          }else{
            db.prepare('UPDATE users SET points=points+1000,updated_at=? WHERE telegram_id=?').run(Date.now(),p.telegram_id);
          }
        });
        tx();
      }
    }
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({ok:false});
  }
});

app.post('/admin/set-webhook', async (req,res)=>{
  if(!ADMIN_SECRET || req.header('X-Admin-Secret')!==ADMIN_SECRET) return res.status(401).json({error:'unauthorized'});
  if(!PUBLIC_BACKEND_URL) return res.status(400).json({error:'PUBLIC_BACKEND_URL_missing'});
  try{
    const result=await telegramApi(BOT_TOKEN,'setWebhook',{url:`${PUBLIC_BACKEND_URL.replace(/\/$/,'')}/telegram/webhook`,allowed_updates:['message','pre_checkout_query']});
    res.json({ok:true,result});
  }catch(e){res.status(500).json({error:String(e.message||e)})}
});

app.listen(PORT,()=>console.log(`ALEK API listening on :${PORT}`));
