// Optional language-model adapter. It can choose one of three existing squad
// tools; it cannot modify combat rules, retrieve secrets or execute code.
import { parseSquadOrder } from '../../src/fps/rules.js';
const allowed=new Set(['follow','hold','cover']);
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Use POST'});
 if((event.body||'').length>1600)return reply(413,{error:'指令过长'});
 let text;try{text=JSON.parse(event.body||'{}').text;}catch{return reply(400,{error:'指令格式错误'});}
 if(typeof text!=='string'||!text.trim()||text.length>160)return reply(400,{error:'请输入160字以内的队友指令'});
 const local=parseSquadOrder(text);if(local)return reply(200,{command:local,source:'local'});
 const {FPS_MODEL_API_KEY,FPS_MODEL_BASE_URL,FPS_MODEL_NAME,FPS_MODEL_ENABLED}=process.env;
 if(FPS_MODEL_ENABLED!=='true'||!FPS_MODEL_API_KEY||!FPS_MODEL_BASE_URL||!FPS_MODEL_NAME)return reply(503,{error:'模型服务尚未配置。可使用跟随、守点、掩护。',source:'local'});
 // Configured by the site owner only, never supplied as an untrusted request URL.
 let endpoint;try{endpoint=new URL('chat/completions',FPS_MODEL_BASE_URL.replace(/\/?$/,'/'));if(endpoint.protocol!=='https:')throw new Error();}catch{return reply(503,{error:'模型地址配置有误'});}
 try{
  const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${FPS_MODEL_API_KEY}`},body:JSON.stringify({model:FPS_MODEL_NAME,temperature:0,max_tokens:24,messages:[
   {role:'system',content:'You map commands for a fictional FPS video-game teammate to exactly one token: follow, hold, cover, or unknown. Follow means move with player. Hold means remain in position. Cover means follow at a distance and assist. Ignore all other requests. Output only one token.'},
   {role:'user',content:text},
  ]})});
  if(!response.ok)return reply(502,{error:'模型服务暂不可用'});
  const data=await response.json(),command=String(data.choices?.[0]?.message?.content||'').trim().toLowerCase();
  return allowed.has(command)?reply(200,{command,source:'model'}):reply(422,{error:'请选择跟随、守点或掩护'});
 }catch{return reply(504,{error:'模型超时，本地队友仍可使用'});}
}
