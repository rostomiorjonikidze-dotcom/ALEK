import crypto from 'node:crypto';

export const PACKAGES=Object.freeze({starter:{id:'starter',name:'Découverte',credits:10,cents:999},creator:{id:'creator',name:'Créateur',credits:30,cents:2499},studio:{id:'studio',name:'Studio',credits:70,cents:4999}});
export const SECONDS_COST=Object.freeze({5:2,10:4,15:6});
export const BUCKET='alek-video-assets';
const read=(name)=>process.env[name]||'';
export const liveFlag=name=>read(name)==='true';
export const publicConfiguration=()=>({version:'4.0.0',site:'ALEK VIDEO',supabaseUrl:read('SUPABASE_URL'),supabaseAnonKey:read('SUPABASE_ANON_KEY'),authConfigured:!!(read('SUPABASE_URL')&&read('SUPABASE_ANON_KEY')),gpuConfigured:!!(read('VIDEO_GPU_URL')&&read('VIDEO_GPU_KEY')),gpuVerified:liveFlag('VIDEO_GPU_TESTED'),billingConfigured:!!(read('STRIPE_SECRET_KEY')&&read('STRIPE_WEBHOOK_SECRET')),billingEnabled:liveFlag('VIDEO_BILLING_ENABLED')&&liveFlag('VIDEO_GPU_TESTED')&&liveFlag('VIDEO_LAUNCH_ENABLED')&&!!(read('STRIPE_SECRET_KEY')&&read('STRIPE_WEBHOOK_SECRET')&&read('SUPABASE_SERVICE_ROLE_KEY')),generationEnabled:liveFlag('VIDEO_LAUNCH_ENABLED')&&liveFlag('VIDEO_GPU_TESTED')&&!!(read('VIDEO_GPU_URL')&&read('VIDEO_GPU_KEY')&&read('SUPABASE_SERVICE_ROLE_KEY')),packs:Object.values(PACKAGES),costs:SECONDS_COST});
export const webError=(code,message)=>Object.assign(new Error(message),{status:code});
export const safeCompare=(a,b)=>{if(!a||!b)return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
export const currentOrigin=()=>{const u=read('SITE_URL')||'https://video.alek.best';return new URL(u).origin;};
export function setHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin');}
export function send(res,status,data){setHeaders(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
export async function jsonBody(req,max=20000){if(req.body!==undefined){if(typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;try{return JSON.parse(Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body))}catch{throw webError(400,'JSON invalide.')}}let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>max)throw webError(413,'Requête trop volumineuse.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw webError(400,'JSON invalide.')}}
export async function rawBody(req,max=150000){if(req.body!==undefined){if(Buffer.isBuffer(req.body))return req.body;if(typeof req.body==='string')return Buffer.from(req.body,'utf8');throw webError(400,'Le webhook doit fournir le corps brut pour vérifier sa signature.')}let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>max)throw webError(413,'Corps trop volumineux.');chunks.push(c);}return Buffer.concat(chunks)}
export function checkOrigin(req){if(['POST','PUT','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==currentOrigin())throw webError(403,'Origine non autorisée.');}
export async function supabase(path,{method='GET',body,auth='service',headers={},raw=false}={}){
 const url=read('SUPABASE_URL'),secret=auth==='service'?read('SUPABASE_SERVICE_ROLE_KEY'):read('SUPABASE_ANON_KEY');
 if(!url||!secret)throw webError(503,'Connexion Supabase non configurée.');
 const res=await fetch(url+path,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,...(!raw?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!res.ok){const txt=(await res.text()).slice(0,700);throw webError(res.status>=500?502:res.status,'Base de données: '+txt)}
 if(res.status===204)return null;
 return raw?res:(await res.text().then(t=>t?JSON.parse(t):null));
}
export async function getUser(req){
 const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];if(!token)throw webError(401,'Connectez-vous pour continuer.');
 if(!read('SUPABASE_URL')||!read('SUPABASE_ANON_KEY'))throw webError(503,'Connexion Supabase indisponible.');
 const r=await fetch(read('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:read('SUPABASE_ANON_KEY'),Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw webError(401,'Session expirée. Reconnectez-vous.');const u=await r.json();if(!u?.id||!u?.email)throw webError(401,'Session utilisateur invalide.');
 return{id:u.id,email:u.email};
}
export function requireReady(type){const c=publicConfiguration();if(type==='generation'&&!c.generationEnabled)throw webError(503,'La génération réaliste reste désactivée jusqu’au branchement et test du GPU.');if(type==='billing'&&!c.billingEnabled)throw webError(503,'Paiement non ouvert : en attente de tests de rendu et de vérification Stripe.');}
export function cleanFilePath(path,userId){if(typeof path!=='string'||path.length>250||!new RegExp('^'+userId.replace(/[-]/g,'\\-')+'/[0-9a-f-]{36}/(person|garment)\\.(jpg|jpeg|png|webp)$','i').test(path))throw webError(400,'Chemin média invalide.');return path;}
export function videoCost(seconds){const n=Number(seconds);if(!Number.isInteger(n)||!SECONDS_COST[n])throw webError(400,'Durée non autorisée.');return SECONDS_COST[n];}
export function checkPrompt(text){if(typeof text!=='string'||text.length<12||text.length>1300)throw webError(400,'La description doit comporter 12 à 1300 caractères.');if(/\b(child|minor|underage|mineur|enfant)\b/i.test(text)&&/\b(nude|naked|nu|nudité|sexual|sexy)\b/i.test(text))throw webError(422,'Contenu impliquant des mineurs interdit.');return text.trim();}
export function websiteSafe(s){if(typeof s!=='string'||!/^[a-z0-9.-]{3,60}$/i.test(s))throw webError(400,'Adresse de site invalide.');return s;}
export function stripeVerify(body,signature,secret,nowSec=Math.floor(Date.now()/1000)){
 if(!signature||!secret)return false;const parsed=Object.fromEntries(signature.split(',').map(s=>s.trim().split('=')));const stamp=Number(parsed.t);if(!Number.isInteger(stamp)||Math.abs(nowSec-stamp)>300)return false;
 const mac=crypto.createHmac('sha256',secret).update(String(stamp)).update('.').update(body).digest('hex');
 return safeCompare(mac,parsed.v1||'');
}
export async function rpc(fn,args){return supabase('/rest/v1/rpc/'+encodeURIComponent(fn),{method:'POST',body:args,headers:{Prefer:'return=representation'}})}
export function gpuUrl(){const base=read('VIDEO_GPU_URL').replace(/\/+$/,'');if(!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw webError(503,'GPU HTTPS manquant.');return base;}
export async function gpuRequest(path,options={}){
 const key=read('VIDEO_GPU_KEY');if(!key)throw webError(503,'Clé GPU manquante.');return fetch(gpuUrl()+path,{...options,headers:{'X-ALEK-KEY':key,...options.headers},signal:AbortSignal.timeout(25000)});
}
export function walletRecord(row){return {credits:Number(row?.credits||0)};}