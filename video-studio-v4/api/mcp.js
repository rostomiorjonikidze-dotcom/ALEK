// Stateless Model Context Protocol endpoint — PREVIEW ONLY.
// No payment, credit sale, user-media access, or real video rendering via MCP.
// Public plugin submission requires owner verification and platform review.
import {rawBody,send,webError} from '../lib/core.js';
export const config={api:{bodyParser:false}};
const TOOLS=[
 {name:'alek_video_capabilities',title:'ALEK VIDEO — video studio capabilities',description:'Get a factual description of ALEK VIDEO studio modes and whether real GPU rendering is connected. This tool does not initiate creation, payment or credits.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}},
 {name:'alek_video_prepare_ad_brief',title:'Préparer un scénario vidéo publicitaire',description:'Prepare a concise French fashion or product video brief and editable narration for a user-supplied product; no real video is generated. The user can choose to copy the brief to a studio themselves.',inputSchema:{type:'object',properties:{product:{type:'string',description:'Product or dress to describe (do not invent claims)',maxLength:160},style:{type:'string',enum:['fashion','ugc','beauty','product','travel','launch'],default:'fashion'},duration_seconds:{type:'integer',enum:[5,10,15],default:15},brand:{type:'string',default:'ALEK SHOP',maxLength:45},website:{type:'string',default:'shop.alek.best',maxLength:60}},required:['product'],additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}}
];
const STYLES={fashion:'Luxury fashion editorial in a natural French setting; slow graceful gestures, fabric detail, consistent adult model identity.',ugc:'Authentic home creator advert; hand-held smartphone look, natural gestures, realistic spoken delivery.',beauty:'Soft natural lighting, beauty editorial close-ups, warm camera movement, minimal background.',product:'Clean commercial reveal, product details in focus, accurate material and labels.',travel:'Outdoor Provence golden-hour fashion film with gentle fabric movement and natural sunlight.',launch:'Bold brand launch composition with a short opening and a clear closing website call-to-action.'};
const rpcResult=(id,body)=>({jsonrpc:'2.0',id,result:body});
const texts=value=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}],isError:false});
function callTool(name,args={}){
 if(name==='alek_video_capabilities')return texts({studio_url:'https://video.alek.best',photo_animation:'available in compatible browsers',realistic_video:'requires owner-supplied and validated GPU',try_on:'requires GPU and model weights',french_voice:'requires GPU voice stack',payments:'not available through this MCP plugin',real_generation_via_chatgpt:'not enabled: user authorization and video tooling review pending'});
 if(name==='alek_video_prepare_ad_brief'){
  const product=String(args.product||'').trim().slice(0,160);if(product.length<3)return {content:[{type:'text',text:'Please provide a product description.'}],isError:true};
  const style=STYLES[args.style]?args.style:'fashion',seconds=[5,10,15].includes(args.duration_seconds)?args.duration_seconds:15;
  const brand=String(args.brand||'ALEK SHOP').slice(0,45),site=String(args.website||'shop.alek.best').slice(0,60);
  const prompt=`${STYLES[style]} Product reference: ${product}. Maintain truthful appearance and consistent adult identity, natural anatomy and camera physics. Vertical 9:16 French social ad.`;
  const voice=`Découvrez ${product} avec ${brand} ! Inspirez-vous de notre collection. Retrouvez-nous sur ${site}.`;
  return texts({brief_only:true,generated_video:false,format:'9:16',duration_seconds:seconds,style,prompt,narration_fr:voice,disclaimer:'Preview creative text only; verify factual product claims before publication.'});
 }
 return {content:[{type:'text',text:'Unknown tool.'}],isError:true};
}
export default async function handler(req,res){
 try{
  res.setHeader('MCP-Protocol-Version','2025-06-18');
  if(req.method==='GET')return send(res,405,{error:'Streamable HTTP GET not implemented. Use JSON-RPC POST.'});
  if(req.method!=='POST')throw webError(405,'Method not allowed');
  const raw=await rawBody(req,20000);if(!raw.length){res.statusCode=202;return res.end()}
  let payload;try{payload=JSON.parse(raw.toString('utf8'))}catch{throw webError(400,'Invalid JSON-RPC')}
  if(payload.jsonrpc!=='2.0'||typeof payload.method!=='string')throw webError(400,'Invalid MCP request');
  if(!Object.prototype.hasOwnProperty.call(payload,'id')){res.statusCode=202;return res.end()}
  let result;
  switch(payload.method){
   case 'initialize':result={protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'ALEK VIDEO',version:'4.0.0'},instructions:'This preview MCP only prepares advertising briefs and explains studio readiness. It does not create videos or sell digital credits.'};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools:TOOLS};break;
   case 'tools/call':result=callTool(payload.params?.name,payload.params?.arguments||{});break;
   default:return send(res,200,{jsonrpc:'2.0',id:payload.id,error:{code:-32601,message:'Method not found'}});
  }
  return send(res,200,rpcResult(payload.id,result));
 }catch(e){return send(res,e?.status||500,{jsonrpc:'2.0',id:null,error:{code:e?.status===400?-32600:-32603,message:e?.status<500?e.message:'Server error'}})}
}