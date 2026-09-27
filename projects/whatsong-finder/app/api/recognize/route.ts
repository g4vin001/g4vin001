import { db,digest,identity,intVariable,json,now,variable,sameOrigin,boundedBody,readJSON,getCache,putCache,reserve,cleanup,saveSong } from '@/lib/server';
import { parsePCM,validateMediaURL,safeLink,type Song } from '@/lib/contracts';
export async function POST(request:Request) {
 if(!sameOrigin(request))return json({error:'Request not allowed.'},403);
 const who=await identity(request); let operation='';
 try {
  const token=variable('AUDD_API_TOKEN');
  if(!token || token==='test' || intVariable('GLOBAL_DAILY_SCAN_LIMIT',100,10000)===0) return json({error:'Audio identification is not active yet. You can prepare your clip or use song and artist search.',code:'PROVIDER_NOT_CONFIGURED'},503,who.cookie);
  const requestId=request.headers.get('idempotency-key')||'';
  if(!/^[a-f0-9-]{36}$/.test(requestId))return json({error:'Refresh the page and try again.'},400,who.cookie);
  let media:Blob|undefined;let mediaURL='';let sampleAt=0;let hash='';
  if(request.headers.get('content-type')?.includes('application/json')) {
   const body=await readJSON(request,4096);mediaURL=validateMediaURL(String(body.url||''));hash=await digest(mediaURL);
  } else {
   const bytes=await boundedBody(request,600000);parsePCM(bytes);media=new Blob([bytes],{type:'audio/wav'});hash=await digest(bytes);
   sampleAt=Number(request.headers.get('x-sample-start')||0);if(!Number.isFinite(sampleAt)||sampleAt<0||sampleAt>1200)sampleAt=0;
  }
  // A URL can change its contents: do not cache URL recognition by URL alone.
  const key='audio:'+hash;const cached=media?await getCache(key):null;
  if(cached) { const result={...cached,cached:true,song:cached.song?{...cached.song,sampleAt}:null};if(result.song)await saveSong(who.owner,result.song,result.song.id);return json(result,200,who.cookie); }
  operation=who.owner+':'+requestId;
  const existing=await db().prepare('SELECT digest,response FROM operations WHERE id=?').bind(operation).first<{digest:string;response:string|null}>();
  if(existing){if(existing.digest!==hash)return json({error:'This request was already used for another clip.'},409,who.cookie);return existing.response?json(JSON.parse(existing.response),200,who.cookie):json({error:'This scan is already processing. Please wait before trying again.'},409,who.cookie);}
  const accepted=await reserve({id:operation,kind:'recognize',owner:who.owner,ip:who.ip,digest:hash,global:intVariable('GLOBAL_DAILY_SCAN_LIMIT',100,10000),user:intVariable('VISITOR_DAILY_SCAN_LIMIT',5,25),perIP:intVariable('IP_DAILY_SCAN_LIMIT',20,200),window:86400});
  if(!accepted)return json({error:'The free scan allowance has been reached. Try again tomorrow, or use song and artist search.',code:'QUOTA_EXCEEDED'},429,who.cookie);
  const form=new FormData();form.set('api_token',token);form.set('return','apple_music,spotify');form.set('market','us');if(media)form.set('file',media,'clip.wav');else form.set('url',mediaURL);
  const response=await fetch('https://api.audd.io/',{method:'POST',body:form,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('PROVIDER_UNAVAILABLE');
  const data=await response.json() as {status:string;result?:{title?:string;artist?:string;album?:string;spotify?:{id?:string;external_urls?:{spotify?:string};album?:{images?:{url?:string}[]}};apple_music?:{url?:string;artwork?:{url?:string};isrc?:string}}};
  if(data.status!=='success')throw new Error('PROVIDER_UNAVAILABLE');
  const s=data.result;
  const song:Song|null=s?.title&&s.artist?{id:'audd:'+(s.apple_music?.isrc||s.spotify?.id||await digest(s.artist+':'+s.title)),title:s.title.slice(0,250),artist:s.artist.slice(0,250),album:s.album?.slice(0,250),artwork:safeLink(s.spotify?.album?.images?.[0]?.url||s.apple_music?.artwork?.url?.replace('{w}','300').replace('{h}','300'),['scdn.co','mzstatic.com']),spotify:safeLink(s.spotify?.external_urls?.spotify,['open.spotify.com']),apple:safeLink(s.apple_music?.url,['music.apple.com']),source:'recognition',sampleAt}:null;
  const result={song,cached:false};
  // Persist the provider result before other work. Retrying this key must never bill again.
  await db().prepare('UPDATE operations SET response=? WHERE id=?').bind(JSON.stringify(result),operation).run();
  if(media)await putCache(key,{song},song?86400:600);
  if(song)await saveSong(who.owner,song,song.id);
  await cleanup();return json(result,200,who.cookie);
 } catch(e) {
  const message=e instanceof Error?e.message:'';
  if(message==='BODY_TOO_LARGE')return json({error:'The prepared clip is too large. Choose a shorter section.'},413,who.cookie);
  if(/^(Paste|Use|This needs|That link|Submit|The audio)/.test(message))return json({error:message},400,who.cookie);
  // No blind retry: an upstream timeout may already have consumed a paid request.
  if(operation) { try{await db().prepare('UPDATE operations SET response=COALESCE(response,?) WHERE id=?').bind(JSON.stringify({error:'Recognition did not finish. Please try another clip later.',code:'PROVIDER_UNAVAILABLE'}),operation).run();}catch{} }
  return json({error:'Recognition is temporarily unavailable. Please try again later.',code:'PROVIDER_UNAVAILABLE'},503,who.cookie);
 }
}
