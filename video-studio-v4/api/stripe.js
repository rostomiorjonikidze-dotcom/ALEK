import {rawBody,send,stripeVerify,PACKAGES,rpc,webError,currentOrigin} from '../lib/core.js';
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
 try{
  if(req.method!=='POST')throw webError(405,'Méthode non autorisée.');
  if(!process.env.STRIPE_WEBHOOK_SECRET)throw webError(503,'Stripe non configuré.');
  const raw=await rawBody(req);if(!stripeVerify(raw,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET))throw webError(400,'Signature Stripe invalide.');
  const data=JSON.parse(raw.toString('utf8'));if(data.type==='checkout.session.completed'||data.type==='checkout.session.async_payment_succeeded'){
   const s=data.data?.object;
   if(s?.payment_status==='paid'&&s?.mode==='payment'){
    const pack=PACKAGES[s.metadata?.pack];
    if(!pack||s.currency!=='eur'||Number(s.amount_total)!==pack.cents||s.client_reference_id!==s.metadata?.user_id||!/^[0-9a-f-]{36}$/i.test(s.client_reference_id||''))throw webError(400,'Valeurs du paiement incohérentes.');
    await rpc('video_apply_payment',{p_session:s.id,p_uid:s.client_reference_id,p_pack:pack.id,p_credits:pack.credits,p_cents:pack.cents});
   }
  }
  return send(res,200,{received:true});
 }catch(e){return send(res,e?.status||500,{error:e.status===400?e.message:'Traitement Stripe temporairement indisponible.'})}
}