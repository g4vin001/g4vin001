import { identity,json,db,getCache,putCache,reserve,cleanup,digest } from '@/lib/server';
import { safeLink, type Song } from '@/lib/contracts';
export async function GET(request:Request) {
 const id=await identity(request);
 try {
  const q=new URL(request.url).searchParams.get('q')?.trim()||'';
  if(q.length<2||q.length>100) return json({error:'Enter between 2 and 100 characters.'},400,id.cookie);
  const key='search:'+await digest(q.toLowerCase()); const cached=await getCache(key); if(cached) return json(cached,200,id.cookie);
  if(!await reserve({id:crypto.randomUUID(),kind:'search',owner:id.owner,ip:id.ip,digest:key,global:18,user:8,perIP:12,window:60})) return json({error:'Search is busy. Please try again in a minute.'},429,id.cookie);
  const u=new URL('https://itunes.apple.com/search'); u.search=new URLSearchParams({term:q,media:'music',entity:'song',limit:'12',country:'US',explicit:'Yes'}).toString();
  const r=await fetch(u,{signal:AbortSignal.timeout(12000)}); if(!r.ok) { console.error('Catalog HTTP status',r.status); throw new Error('CATALOG_HTTP_'+r.status); }
  const body=await r.json() as {results?:Record<string,unknown>[]};
  const songs:Song[]=(body.results||[]).filter(s=>s.trackId&&s.trackName&&s.artistName).map(s=>({id:'itunes:'+s.trackId,title:String(s.trackName).slice(0,250),artist:String(s.artistName).slice(0,250),album:String(s.collectionName||'').slice(0,250),artwork:safeLink(s.artworkUrl100,['mzstatic.com']),apple:safeLink(s.trackViewUrl,['music.apple.com','itunes.apple.com']),source:'catalog'}));
  const result={songs,query:q}; await putCache(key,result,21600); await cleanup(); return json(result,200,id.cookie);
 } catch(e) { console.error('Catalog lookup failed', e instanceof Error ? e.message : 'unknown'); return json({error:'Song search is temporarily unavailable. Please try again shortly.',code:e instanceof Error && /^CATALOG_HTTP_/.test(e.message)?e.message:e instanceof Error?e.name:'UNKNOWN'},503,id.cookie); }
}
