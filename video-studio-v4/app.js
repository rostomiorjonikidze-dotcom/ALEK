(function(){'use strict';
const $=id=>document.getElementById(id);const state={config:null,session:null,user:null,credits:0,kind:'photo',photo:null,personFile:null,garmentFile:null,personURL:null,lastURL:null,rendering:false,pollTimer:null,signUp:false};
const $all=q=>Array.from(document.querySelectorAll(q));const wait=ms=>new Promise(r=>setTimeout(r,ms));
const toast=message=>{const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(el.t);el.t=setTimeout(()=>el.classList.remove('show'),4800)};
const error=message=>{const e=$('studioError');e.hidden=!message;e.textContent=message||''};const message=text=>$('studioStatus').textContent=text;
const progress=p=>{$('progressBar').style.width=Math.max(0,Math.min(100,p))+'%'};
const showAuth=()=>{$('authModal').hidden=false;$('authMessage').textContent=state.config?.authConfigured?'':'Connexion des comptes en préparation : Supabase non configuré.';setTimeout(()=>$('emailInput').focus(),20)};
const closeAuth=()=>{$('authModal').hidden=true};
$all('[data-jump]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.jump)?.scrollIntoView({behavior:'smooth'})));
$('menuBtn').onclick=()=>{let nav=document.querySelector('.navLinks');let show=nav.classList.toggle('open');$('menuBtn').setAttribute('aria-expanded',String(show))};$all('.navLinks a').forEach(a=>a.addEventListener('click',()=>document.querySelector('.navLinks').classList.remove('open')));
$('openAuth').onclick=()=>state.user?logout():showAuth();$('closeAuth').onclick=closeAuth;$('authModal').onclick=e=>{if(e.target===$('authModal'))closeAuth()};window.addEventListener('keydown',e=>{if(e.key==='Escape')closeAuth()});
$('authSwitch').onclick=()=>{state.signUp=!state.signUp;$('authTitle').textContent=state.signUp?'Créez votre compte':'Bienvenue sur ALEK';$('authSubmit').textContent=state.signUp?'Créer mon compte':'Se connecter';$('authSwitch').textContent=state.signUp?'J’ai déjà un compte ↗':'Créer mon compte ↗';$('passwordInput').autocomplete=state.signUp?'new-password':'current-password';$('authMessage').textContent=''};
const storeSession=data=>{if(!data?.access_token)return;state.session={access_token:data.access_token,refresh_token:data.refresh_token||'',expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};sessionStorage.setItem('alek_video_auth',JSON.stringify(state.session))};
const supabase=async(path,{method='GET',body,headers={},token}={})=>{
 const c=state.config;if(!c?.authConfigured)throw Error('Comptes non configurés : Supabase à connecter.');
 const resp=await fetch(c.supabaseUrl+path,{method,headers:{apikey:c.supabaseAnonKey,...(body instanceof File?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body instanceof File?body:body===undefined?undefined:JSON.stringify(body)});
 const result=await resp.json().catch(()=>({}));if(!resp.ok)throw Error(result.msg||result.message||result.error_description||result.error||'Erreur de connexion.');return result;
};
const renew=async()=>{if(!state.session)return null;if(Date.now()/1000<state.session.expires_at-80)return state.session.access_token;if(!state.session.refresh_token){logout();return null}try{const next=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:state.session.refresh_token}});storeSession(next);return state.session.access_token}catch{logout();return null}};
const api=async(action,{method='GET',data,auth=true,params='',signal}={})=>{
 const token=auth?await renew():null;if(auth&&!token)throw Error('Connectez-vous pour continuer.');
 const r=await fetch('/api?action='+encodeURIComponent(action)+params,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal});
 const obj=await r.json().catch(()=>({}));if(!r.ok)throw Error(obj.error||'Service temporairement indisponible.');return obj;
};
$('authForm').onsubmit=async e=>{e.preventDefault();$('authMessage').textContent='Connexion en cours…';$('authSubmit').disabled=true;try{
 const email=$('emailInput').value.trim(),password=$('passwordInput').value;
 if(!state.config?.authConfigured)throw Error('Supabase doit encore être connecté à ce site.');
 const path=state.signUp?'/auth/v1/signup':'/auth/v1/token?grant_type=password';
 const d=await supabase(path,{method:'POST',body:{email,password}});
 if(!d.access_token){$('authMessage').textContent='Vérifiez votre boîte e-mail pour confirmer votre compte, puis connectez-vous.';return;}
 storeSession(d);await loadMe();closeAuth();toast('Bienvenue dans votre espace ALEK !');
 }catch(e){$('authMessage').textContent=e.message}finally{$('authSubmit').disabled=false}};
function logout(){state.session=null;state.user=null;state.credits=0;sessionStorage.removeItem('alek_video_auth');$('openAuth').textContent='Se connecter ↗';$('creditMini').hidden=true;$('galleryRows').textContent='Connectez-vous pour retrouver vos créations.';$('libraryInfo').textContent='Identifiez-vous pour voir votre historique.';toast('Vous êtes déconnecté(e).')}
async function loadMe(){
 if(!state.session)return;
 try{const d=await api('me');state.user=d.user;state.credits=d.credits||0;
 $('creditMini').hidden=false;$('creditCount').textContent=String(state.credits);$('openAuth').textContent='Déconnexion ↗';
 renderJobs(d.jobs||[]);updateButton();
 }catch(e){if(e.message.includes('Session')){logout();return}state.user=null;toast('Compte disponible, base vidéo à configurer : '+e.message.slice(0,90))}
}
function jobLine(job){const root=document.createElement('div');root.className='job';const lhs=document.createElement('div');const title=document.createElement('b');title.textContent=job.kind==='try_on_video'?'♧ Essayage vidéo':job.kind==='talking_avatar'?'◉ Avatar vidéo':'◧ Publicité vidéo';const small=document.createElement('small');const when=new Date(job.created_at).toLocaleString('fr-FR');small.textContent=when+' · '+job.cost+' crédits';lhs.append(title,small);const rhs=document.createElement('div');rhs.className='jobActions';const badge=document.createElement('span');badge.className='jobStatus'+(job.status==='failed'?' failed':'');badge.textContent=job.status==='finished'?'✓ TERMINÉE':job.status==='failed'?'↺ REMBOURSÉE':job.status==='running'?'◉ EN COURS':'EN ATTENTE';rhs.append(badge);
 const b=document.createElement('button');b.className='secondary';b.textContent=job.status==='finished'?'⬇ Télécharger':'↻ Vérifier';b.onclick=()=>job.status==='finished'?downloadJob(job.id):checkJob(job.id);rhs.append(b);root.append(lhs,rhs);return root}
function renderJobs(jobs){const root=$('galleryRows');root.replaceChildren();$('libraryInfo').textContent=jobs.length+' création(s) dans votre bibliothèque';if(!jobs.length){root.textContent='Aucune création pour le moment. Créez votre première vidéo !';return}jobs.forEach(j=>root.append(jobLine(j)))}
$('refreshGallery').onclick=()=>state.user?loadMe():showAuth();
function estimatedCost(){return ({'5':2,'10':4,'15':6})[$('durationInput').value]||6}
function updateButton(){let btn=$('makeVideo'),label=$('costLabel');if(state.kind==='photo'){btn.disabled=state.rendering;label.textContent='· Gratuit';return}
 label.textContent='· '+estimatedCost()+' crédits';let ready=!!state.config?.generationEnabled;btn.disabled=state.rendering||!ready;
}
$('durationInput').onchange=updateButton;
async function boot(){try{
 const d=await api('config',{auth:false});state.config=d.config;
 const available=!!state.config.generationEnabled;
 $('liveStatus').classList.toggle('good',available);$('liveStatus').textContent=available?'● MOTEUR IA DISPONIBLE':'● IA EN PRÉPARATION · MONTAGE ACTIF';
 $all('.buy').forEach(b=>{b.disabled=!state.config.billingEnabled;b.textContent=state.config.billingEnabled?'Acheter '+state.config.packs.find(p=>p.id===b.dataset.pack)?.credits+' crédits ↗':'Bientôt disponible'});
 updateButton();
 try{let raw=sessionStorage.getItem('alek_video_auth');if(raw)state.session=JSON.parse(raw);}catch{sessionStorage.removeItem('alek_video_auth')}
 if(state.session)await loadMe();
 }catch(e){$('liveStatus').textContent='● MODE LOCAL';toast('Studio photo disponible, API en attente.');updateButton()}
 if(location.search.includes('checkout=success')){toast('Paiement reçu. Les crédits apparaîtront après confirmation sécurisée.');history.replaceState({},'',location.pathname)}
 if(location.hash==='#creer'||location.pathname==='/studio')$('creer').scrollIntoView();
}
const descriptions={photo:'Créez une publicité animée à partir d’une photo, sans serveur GPU.',ai:'Une image devient une scène animée sur votre GPU privé, une fois le moteur opérationnel.',tryon:'Chargez votre modèle et un vêtement ; l’essayage précède le rendu sur GPU.',avatar:'Présentatrice virtuelle avec une voix française et des mouvements produits par le modèle IA.'};
const previewExplanations={photo:'<strong>Montage local</strong><br>Mouvement de caméra et textes, pas de mouvement naturel du mannequin.',ai:'<strong>Image → Vidéo</strong><br>Modèle IA local LTX-2.3 ; connexion NVIDIA requise.',tryon:'<strong>Essayage virtuel</strong><br>FASHN sur GPU, puis vidéo LTX. Vérifiez la fidélité du vêtement.',avatar:'<strong>Avatar parlant</strong><br>Voix Piper et vidéo audio-conditionnée. La synchronisation labiale peut varier.'};
function setMode(mode){state.kind=mode;$all('.modeTabs button').forEach(b=>{let active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});$('modeDescription').textContent=descriptions[mode];$('previewExplain').innerHTML=previewExplanations[mode];$('garmentDrop').style.display=mode==='tryon'?'flex':'none';$('narrationWrap').style.display=mode==='photo'?'none':'block';$('voiceWrap').style.display=mode==='photo'?'none':'block';$('durationInput').parentElement.style.display=mode==='photo'?'none':'block';updateButton();draw(0)}
$all('.modeTabs button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
const supportedFile=f=>f&&['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size>0&&f.size<=12*1024*1024;
$('personFile').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!supportedFile(f)){error('La photo doit être un JPG, PNG ou WebP de moins de 12 Mo.');return}state.personFile=f;error('');$('personTag').textContent='✓ '+f.name;if(state.personURL)URL.revokeObjectURL(state.personURL);state.personURL=URL.createObjectURL(f);const image=new Image();image.onload=()=>{state.photo=image;$('blankPreview').hidden=true;draw(0);message('Votre photo est prête.');};image.onerror=()=>error('La photo ne peut pas être ouverte.');image.src=state.personURL};
$('garmentFile').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!supportedFile(f)){error('Le vêtement doit être une image JPG, PNG ou WebP de moins de 12 Mo.');return}state.garmentFile=f;$('garmentTag').textContent='✓ '+f.name;error('')};
function draw(t){const c=$('previewCanvas'),ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.fillStyle='#2b2856';ctx.fillRect(0,0,w,h);if(!state.photo)return;
 const img=state.photo,scale=Math.max(w/img.naturalWidth,h/img.naturalHeight),z=1.05+t*.007,iw=img.naturalWidth*scale*z,ih=img.naturalHeight*scale*z;
 ctx.drawImage(img,(w-iw)/2+Math.sin(t*.38)*9,(h-ih)/2,iw,ih);
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#0009');gradient.addColorStop(.32,'transparent');gradient.addColorStop(.62,'transparent');gradient.addColorStop(1,'#000e');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 ctx.font='900 30px system-ui';ctx.fillStyle='#f8f4ff';ctx.fillText(($('brandInput').value||'ALEK VIDEO').slice(0,40),35,60,w-70);ctx.fillStyle='#88e6ff';ctx.fillRect(35,73,85,4);
 const text=state.kind==='photo'?'Découvrez votre prochaine inspiration !':'Votre style, votre histoire.';ctx.font='800 39px system-ui';ctx.fillStyle='#fff';let rows=[''],k=0;for(const word of text.split(' ')){const s=rows[k]?rows[k]+' '+word:word;if(ctx.measureText(s).width>w-68&&rows[k]){k++;rows[k]=word}else rows[k]=s};rows.slice(0,3).forEach((r,i)=>ctx.fillText(r,35,h-165+i*44,w-68));
 ctx.fillStyle='#a8e9ff';ctx.font='750 26px system-ui';ctx.fillText(($('websiteInput').value||'shop.alek.best').slice(0,60),35,h-50,w-68);
}
$('brandInput').oninput=() => draw(0);$('websiteInput').oninput=() => draw(0);
const presets={fashion:['A premium French fashion film: an adult model in a refined outfit takes graceful steps, turns to show the dress and smiles. Warm natural sunlight, rich fabric details, polished fashion cinematography.','Découvrez une élégance qui vous ressemble. Retrouvez les nouveautés sur ALEK SHOP !'],ugc:['Authentic UGC filmed on a smartphone at home. Adult fashion creator speaks directly to the camera, smiles naturally and shows her outfit in an informal fashion recommendation. Natural gestures and realistic skin.','Les filles, je vous présente mon look préféré du moment ! Découvrez la collection sur ALEK SHOP !'],beauty:['Beauty editorial in a warm modern living room. The adult presenter shows the clothing material with delicate hand gestures, elegant styling, realistic close-ups, flattering daylight and a soft camera move.','Un joli détail peut transformer tout votre style. Découvrez nos inspirations sur ALEK SHOP !'],product:['Premium advertising video of the exact reference fashion product in a luxury studio, smooth orbital camera movement, accurate garment material details and polished cinematic reflections.','Découvrez les détails de cette pièce et trouvez votre prochain coup de cœur sur ALEK SHOP !'],travel:['Summer fashion commercial outdoors in a picturesque Provence setting, golden-hour sun, an adult creator walks naturally while wearing the exact reference outfit and gently turns to the camera.','L’été arrive, et les jolies tenues aussi ! Faites-vous plaisir sur ALEK SHOP !'],launch:['Bold editorial product launch for ALEK SHOP. A fashion creator reveals the garment in a bright modern studio with a confident natural pose, fast but stable cinematic camera movement.','La nouvelle inspiration mode est là ! Découvrez ALEK SHOP dès maintenant sur shop.alek.best !']};
$all('[data-template]').forEach(b=>b.onclick=()=>{const p=presets[b.dataset.template];$('promptInput').value=p[0];$('speechInput').value=p[1];setMode('ai');$('creer').scrollIntoView({behavior:'smooth'});toast('Scénario ajouté au studio !')});
function createLink(blob,name){if(state.lastURL)URL.revokeObjectURL(state.lastURL);const url=URL.createObjectURL(blob);state.lastURL=url;const a=$('lastDownload');a.hidden=false;a.href=url;a.download=name;a.click()}
async function photoRender(){if(!state.photo)throw Error('Importez votre photo principale.');if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('Ce navigateur ne permet pas l’export local. Essayez un navigateur récent sur ordinateur.');
 const types=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Encodage vidéo non disponible dans ce navigateur.');
 const c=$('previewCanvas'),stream=c.captureStream(24),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2800000}),parts=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};const complete=new Promise((resolve,reject)=>{rec.onstop=()=>resolve(new Blob(parts,{type:mime}));rec.onerror=()=>reject(Error('Échec du montage local.'))});
 rec.start(500);const dur=12,started=performance.now();try{await new Promise(resolve=>{const frame=now=>{let t=(now-started)/1000;draw(Math.min(dur,t));progress(t/dur*100);message('Montage local : '+Math.min(Math.ceil(t),dur)+' / '+dur+' secondes');if(t<dur)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});rec.stop();let movie=await complete;createLink(movie,'ALEK_VIDEO.'+(mime.includes('mp4')?'mp4':'webm'));message('Montage prêt et téléchargé.');progress(100)}finally{stream.getTracks().forEach(t=>t.stop())}}
async function uploadPhoto(file,tag){const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=state.user.id+'/'+crypto.randomUUID()+'/'+tag+'.'+ext;const token=await renew();const c=state.config;
 const r=await fetch(c.supabaseUrl+'/storage/v1/object/alek-video-assets/'+path,{method:'POST',headers:{apikey:c.supabaseAnonKey,Authorization:'Bearer '+token,'Content-Type':file.type,'x-upsert':'false'},body:file});if(!r.ok){let text=await r.text();throw Error('Stockage privé : '+text.slice(0,180))}return path}
async function checkJob(id){const r=await api('job',{params:'&id='+encodeURIComponent(id)});let job=r.job;toast(job.status==='failed'?'Rendu échoué : crédits remboursés.':job.status==='finished'?'La vidéo est prête !':job.progress||'Génération en cours');if(job.status==='finished'||job.status==='failed'){clearInterval(state.pollTimer);state.pollTimer=null;progress(100);message(job.status==='finished'?'Vidéo prête à télécharger.':'Génération échouée, crédits remboursés.');await loadMe();if(job.status==='finished')await downloadJob(id)}return job}
async function downloadJob(id){const token=await renew();const r=await fetch('/api?action=download&id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Téléchargement indisponible : '+(await r.text()).slice(0,150));const movie=await r.blob();createLink(movie,'ALEK_REAL_VIDEO.mp4')}
async function cleanupUploads(paths){
 if(!paths.length||!state.config?.authConfigured)return;
 try{const token=await renew();await fetch(state.config.supabaseUrl+'/storage/v1/object/alek-video-assets',{method:'DELETE',headers:{apikey:state.config.supabaseAnonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})});}catch{/* Private object TTL will be handled by operator. */}
}
async function aiRender(){
 if(!state.config?.generationEnabled)throw Error('Le GPU privé doit encore être connecté et validé. Aucun crédit ne sera facturé.');
 if(!state.user){showAuth();throw Error('Connectez-vous pour envoyer la génération IA.')}
 if(state.credits<estimatedCost())throw Error('Crédits insuffisants. La recharge est possible après ouverture des paiements.')
 if(!state.personFile)throw Error('Choisissez une photo du modèle.');
 if(state.kind==='tryon'&&!state.garmentFile)throw Error('Ajoutez aussi une photo du vêtement à essayer.');
 message('Envoi privé de vos images…');progress(8);
 const uploaded=[];let job;
 try{
  const personPath=await uploadPhoto(state.personFile,'person');uploaded.push(personPath);
  const garmentPath=state.kind==='tryon'?await uploadPhoto(state.garmentFile,'garment'):null;if(garmentPath)uploaded.push(garmentPath);progress(19);
  job=await api('generate',{method:'POST',data:{personPath,garmentPath,seconds:parseInt($('durationInput').value,10),kind:state.kind==='avatar'?'talking_avatar':'image_to_video',prompt:$('promptInput').value,narration:$('speechInput').value,brand:$('brandInput').value,website:$('websiteInput').value,speechMode:$('voiceInput').value,consent:$('rights').checked}});
 }catch(e){await cleanupUploads(uploaded);throw e}
 message('Votre vidéo est en cours de rendu. Elle apparaîtra dans « Mes vidéos ».');progress(30);
 await loadMe();const id=job.job.id;state.pollTimer=setInterval(async()=>{try{const current=await checkJob(id);if(current.status==='running')progress(50)}catch(e){console.error('Polling delayed:',e.message)}},12000);
 toast('Génération acceptée. '+estimatedCost()+' crédits réservés.');
}
$('makeVideo').onclick=async()=>{if(state.rendering)return;error('');progress(0);if(!state.personFile){error('Choisissez une photo pour commencer.');return}if(!$('rights').checked){error('Veuillez confirmer les droits sur les images.');return}
 state.rendering=true;updateButton();try{if(state.kind==='photo')await photoRender();else await aiRender()}catch(e){error(e.message);message('La création n’a pas été terminée.');}finally{state.rendering=false;updateButton()}};
$all('.buy').forEach(b=>b.onclick=async()=>{if(!state.config?.billingEnabled){toast('Ouverture des paiements après validation du GPU.');return}if(!state.user){showAuth();return}try{const d=await api('checkout',{method:'POST',data:{pack:b.dataset.pack}});const u=new URL(d.checkoutUrl);if(u.protocol!=='https:'||!/\.stripe\.com$/.test(u.hostname))throw Error('Adresse de paiement inattendue');window.location.href=u.href}catch(e){toast('Paiement impossible : '+e.message)}});
setMode('photo');boot();
})();