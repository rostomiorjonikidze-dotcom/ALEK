import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {PACKAGES,SECONDS_COST,BUCKET,publicConfiguration,send,jsonBody,checkOrigin,getUser,supabase,rpc,requireReady,cleanFilePath,videoCost,checkPrompt,websiteSafe,gpuRequest,webError,currentOrigin} from '../lib/core.js';

export const config={api:{bodyParser:false}};
const prop=(u,k)=>new URL(u||'/api',currentOrigin()).searchParams.get(k);
const respondError=(res,e)=>{const status=e?.status>=400&&e?.status<600?e.status:500;send(res,status,{ok:false,error:status>=500&&status!==503?'Erreur du service. Réessayez plus tard.':String(e?.message||'Erreur inattendue.').slice(0,380)});};
async function wallet(uid){await rpc('video_wallet_init',{p_uid:uid});const r=await supabase('/rest/v1/video_wallets?select=credits&user_id=eq.'+encodeURIComponent(uid));return {credits:r?.[0]?.credits||0};}
const recordJob=async id=>{const r=await supabase('/rest/v1/video_jobs?select=id,user_id,status,cost,kind,progress,error,gpu_job_id,created_at,updated_at&id=eq.'+encodeURIComponent(id));return r?.[0]||null;};
async function persistFinal(jobId,status,progress,error){return rpc('video_finalize_job',{p_id:jobId,p_status:status,p_progress:progress||'',p_error:error||null})}
async function pollJob(job){
 if(!job||!['queued','running'].includes(job.status)||!job.gpu_job_id)return job;
 const r=await gpuRequest('/api/real/jobs/'+encodeURIComponent(job.gpu_job_id));
 if(r.status===404){await persistFinal(job.id,'failed','Rendu interrompu','Travail GPU absent (redémarrage ou expiration). Crédits remboursés.');return recordJob(job.id)}
 if(!r.ok)throw webError(503,'Le GPU ne répond pas; travail conservé.');
 const state=await r.json();
 if(state.status==='finished'||state.status==='failed'){
  await persistFinal(job.id,state.status,state.progress||'',state.error||null);
 }else if(typeof state.progress==='string'){
  await supabase('/rest/v1/video_jobs?id=eq.'+encodeURIComponent(job.id),{method:'PATCH',body:{progress:state.progress.slice(0,300),updated_at:new Date().toISOString()},headers:{Prefer:'return=minimal'}});
 }
 return recordJob(job.id);
}
async function cleanupPrivateMedia(paths){
 const names=paths.filter(Boolean);if(!names.length)return;
 const root=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!root||!secret)return;
 try{
  await fetch(root+'/storage/v1/object/'+BUCKET,{method:'DELETE',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({prefixes:names}),signal:AbortSignal.timeout(12000)});
 }catch{ /* Does not change a successfully queued GPU render; retry via retention job. */ }
}
async function requireOwner(req){const user=await getUser(req);const owner=process.env.VIDEO_OWNER_UID||'';if(!owner||user.id!==owner)throw webError(403,'Accès administrateur refusé.');return user;}
async function remoteFile(path){
 const root=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!root||!secret)throw webError(503,'Stockage privé non configuré.');
 const url=root+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
 const r=await fetch(url,{headers:{apikey:secret,Authorization:'Bearer '+secret},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw webError(400,'Photo introuvable dans votre espace de stockage.');
 let mime=r.headers.get('content-type')||'image/jpeg';mime=mime.split(';')[0].toLowerCase();
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw webError(400,'Image invalide.');
 const length=Number(r.headers.get('content-length')||0);if(length>12582912)throw webError(413,'Image trop volumineuse.');
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>12582912||!bytes.length)throw webError(413,'Image manquante ou trop lourde.');
 return {bytes,mime};
}
async function createGeneration(req){
 requireReady('generation');const user=await getUser(req);const data=await jsonBody(req);
 const seconds=Number(data.seconds),cost=videoCost(seconds);
 const personPath=cleanFilePath(data.personPath,user.id),garmentPath=data.garmentPath?cleanFilePath(data.garmentPath,user.id):null;
 const prompt=checkPrompt(data.prompt),narration=String(data.narration||'').trim();if(narration.length>500)throw webError(400,'Texte vocal trop long.');
 const kind=garmentPath?'try_on_video':(data.kind==='talking_avatar'?'talking_avatar':'image_to_video');
 if(!data.consent)throw webError(400,'Consentement sur les droits à l’image obligatoire.');
 const brand=String(data.brand||'ALEK SHOP').slice(0,45),website=websiteSafe(data.website||'shop.alek.best');
 const speechMode=['native','piper'].includes(data.speechMode)?data.speechMode:'piper';
 const sheetMode=['single','two-panel-right'].includes(data.sheetMode)?data.sheetMode:'single';
 const settings={prompt,narration,seconds,brand,website,speech_mode:speechMode,sheet_mode:sheetMode,category:'one-pieces',garment_photo_type:'model'};
 // Check media before reserving credits, without exposing service key to the browser.
 const person=await remoteFile(personPath),garment=garmentPath?await remoteFile(garmentPath):null;
 const jobId=crypto.randomUUID();
 try{await rpc('video_reserve_job',{p_uid:user.id,p_id:jobId,p_cost:cost,p_kind:kind,p_person:personPath,p_garment:garmentPath,p_settings:settings});}
 catch(e){if(String(e.message).includes('Insufficient'))throw webError(402,'Crédits insuffisants.');if(String(e.message).includes('Maximum 2'))throw webError(429,'Vous avez déjà deux rendus actifs.');throw e;}
 try{
  const fd=new FormData();fd.append('image',new Blob([person.bytes],{type:person.mime}),'person.jpg');
  if(garment)fd.append('garment',new Blob([garment.bytes],{type:garment.mime}),'garment.jpg');
  for(const [k,v] of Object.entries({...settings,consent:'true'}))fd.append(k,String(v));
  const r=await gpuRequest('/api/real/jobs',{method:'POST',body:fd});
  const state=await r.json().catch(()=>({}));
  if(!r.ok||!state.id)throw webError(503,typeof state.detail==='string'?state.detail:'GPU indisponible. Crédits remboursés.');
  await rpc('video_attach_gpu',{p_id:jobId,p_gpu_job_id:state.id});
  await cleanupPrivateMedia([personPath,garmentPath]);
  return {id:jobId,status:'running',cost,seconds,gpuStatus:state.status};
 }catch(e){
  try{await persistFinal(jobId,'failed','Annulé au démarrage','Erreur de connexion au moteur GPU, crédits remboursés.');}catch{}
  await cleanupPrivateMedia([personPath,garmentPath]);
  throw e;
 }
}
async function meData(user){const credit=await wallet(user.id);const jobs=await supabase('/rest/v1/video_jobs?select=id,status,cost,kind,progress,error,created_at&user_id=eq.'+encodeURIComponent(user.id)+'&order=created_at.desc&limit=40');return{user:{id:user.id,email:user.email},...credit,jobs:jobs||[]}}
export default async function handler(req,res){
 try{
  checkOrigin(req);const action=prop(req.url,'action')||'config';const method=req.method||'GET';
  if(method==='GET'&&action==='config')return send(res,200,{ok:true,config:publicConfiguration()});
  if(method==='GET'&&action==='health')return send(res,200,{ok:true,version:'4.0.0',service:'alek-video-api',config:publicConfiguration().generationEnabled?'ready':'awaiting-gpu'});
  if(method==='GET'&&action==='gpu'){
   if(!publicConfiguration().gpuConfigured)return send(res,200,{ok:true,ready:false,reason:'GPU à connecter'});
   let state;try{const r=await fetch(process.env.VIDEO_GPU_URL.replace(/\/$/,'')+'/api/real/health',{signal:AbortSignal.timeout(10000)});state=await r.json();}catch{state={ready:false,reason:'GPU hors ligne'}}
   return send(res,200,{ok:true,ready:!!state.ready&&publicConfiguration().generationEnabled,capabilities:state.capabilities||{},reason:state.reason||''});
  }
  if(method==='GET'&&action==='me')return send(res,200,{ok:true,...await meData(await getUser(req))});
  if(method==='GET'&&action==='jobs')return send(res,200,{ok:true,jobs:(await meData(await getUser(req))).jobs});
  if(method==='POST'&&action==='generate')return send(res,202,{ok:true,job:await createGeneration(req)});
  if(method==='GET'&&action==='job'){
   const user=await getUser(req),id=prop(req.url,'id');if(!/^[0-9a-f-]{36}$/i.test(id||''))throw webError(400,'Identifiant invalide.');
   let job=await recordJob(id);if(!job||job.user_id!==user.id)throw webError(404,'Vidéo introuvable.');
   job=await pollJob(job);
   return send(res,200,{ok:true,job:{id:job.id,status:job.status,progress:job.progress,error:job.error,cost:job.cost,created_at:job.created_at,download:job.status==='finished'?'/api?action=download&id='+job.id:null}});
  }
  if(method==='GET'&&action==='download'){
   const user=await getUser(req),id=prop(req.url,'id');if(!/^[0-9a-f-]{36}$/i.test(id||''))throw webError(400,'Identifiant incorrect.');
   const job=await recordJob(id);if(!job||job.user_id!==user.id||job.status!=='finished'||!job.gpu_job_id)throw webError(404,'Vidéo non disponible.');
   const r=await gpuRequest('/api/real/jobs/'+encodeURIComponent(job.gpu_job_id)+'/video');if(!r.ok||!r.body)throw webError(502,'Téléchargement GPU indisponible.');
   res.statusCode=200;res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Disposition','attachment; filename="ALEK_VIDEO_'+job.id.slice(0,8)+'.mp4"');
   return Readable.fromWeb(r.body).pipe(res);
  }
  if(method==='POST'&&action==='checkout'){
   requireReady('billing');const user=await getUser(req),data=await jsonBody(req,3000),pack=PACKAGES[data.pack];if(!pack)throw webError(400,'Offre non reconnue.');
   const params=new URLSearchParams({mode:'payment',success_url:currentOrigin()+'/?checkout=success',cancel_url:currentOrigin()+'/?checkout=cancel',client_reference_id:user.id,'metadata[user_id]':user.id,'metadata[pack]':pack.id,'line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':String(pack.cents),'line_items[0][price_data][product_data][name]':'ALEK VIDEO — '+pack.name+' ('+pack.credits+' crédits)','line_items[0][quantity]':'1','customer_email':user.email});
   const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
   const obj=await r.json();if(!r.ok||!obj.url)throw webError(502,'Stripe indisponible. Aucun crédit débité.');return send(res,200,{ok:true,checkoutUrl:obj.url});
  }
  if(method==='GET'&&action==='owner'){
   await requireOwner(req);const [jobs,payments,wallets]=await Promise.all([
     supabase('/rest/v1/video_jobs?select=id,user_id,status,cost,created_at&order=created_at.desc&limit=200'),
     supabase('/rest/v1/video_payments?select=amount_cents,credits,created_at,pack_id&order=created_at.desc&limit=200'),
     supabase('/rest/v1/video_wallets?select=user_id,credits&limit=200')]);
   return send(res,200,{ok:true,jobs:jobs||[],payments:payments||[],users:(wallets||[]).length,grossCents:(payments||[]).reduce((s,p)=>s+p.amount_cents,0),totalJobs:(jobs||[]).length});
  }
  if(method==='POST'&&action==='owner-grant'){
   const owner=await requireOwner(req),d=await jsonBody(req,3000),credits=Number(d.credits);
   if(!Number.isInteger(credits)||credits<1||credits>10)throw webError(400,'1 à 10 crédits de test.');
   if(d.userId&&d.userId!==owner.id)throw webError(403,'Attribution limitée au compte propriétaire en préparation.');
   const r=await rpc('video_owner_grant',{p_uid:owner.id,p_credits:credits,p_ref:'owner:'+crypto.randomUUID()});return send(res,200,{ok:true,granted:!!r,credits});
  }
  if((method==='POST'||method==='GET')&&action==='reconcile'){
   const secret=process.env.CRON_SECRET||'';const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   if(!secret||token!==secret)throw webError(403,'Non autorisé.');
   const rows=await supabase('/rest/v1/video_jobs?select=id,user_id,status,cost,progress,error,gpu_job_id,created_at,updated_at&status=in.(queued,running)&order=created_at.asc&limit=30');
   let finished=0,failed=0;for(const row of rows||[]){try{
      if(!row.gpu_job_id&&Date.now()-Date.parse(row.created_at)>15*60_000){await persistFinal(row.id,'failed','Rendu non démarré','Crédits remboursés.');failed++;continue}
      const updated=await pollJob(row);if(updated?.status==='finished')finished++;if(updated?.status==='failed')failed++;
   }catch{if(Date.now()-Date.parse(row.created_at)>4*3600_000){await persistFinal(row.id,'failed','Rendu expiré','Crédits remboursés.');failed++}}}
   return send(res,200,{ok:true,checked:(rows||[]).length,finished,failed});
  }
  throw webError(404,'Action inconnue.');
 }catch(e){respondError(res,e)}
}