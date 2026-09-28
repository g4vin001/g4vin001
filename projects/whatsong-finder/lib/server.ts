import { env } from 'cloudflare:workers';
export function config() { return env as Cloudflare.Env & Record<string,string|D1Database|R2Bucket|undefined>; }
export function variable(name:string) { const v=config()[name]; return typeof v==='string'?v:''; }
export function intVariable(name:string,fallback:number,max:number) { const v=variable(name); if(!v) return fallback; const n=Number(v); return Number.isInteger(n)&&n>=0?Math.min(n,max):fallback; }
export function db() { const d=config().DB; if(!d) throw new Error('STORAGE_UNAVAILABLE'); return d; }
export const now=()=>Math.floor(Date.now()/1000);
export async function digest(value:string|ArrayBuffer) { const bytes=typeof value==='string'?new TextEncoder().encode(value):value; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),c=>c.toString(16).padStart(2,'0')).join(''); }
export async function identity(request:Request) {
 const match=request.headers.get('cookie')?.match(/(?:^|;\s*)ws_visitor=([a-f0-9-]{36})(?:;|$)/);
 const id=match?.[1] || crypto.randomUUID();
 const owner=await digest(id);
 // Cloudflare overwrites CF-Connecting-IP at the edge. Never trust X-Forwarded-For.
 const ip=await digest(Math.floor(now()/86400)+':'+(request.headers.get('cf-connecting-ip')||'preview-shared'));
 const cookie=match?undefined:`ws_visitor=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol==='https:'?'; Secure':''}`;
 return {owner,ip,cookie};
}
export function json(body:unknown,status=200,cookie?:string) {
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(cookie) headers['Set-Cookie']=cookie;
 return new Response(JSON.stringify(body),{status,headers});
}
export function sameOrigin(request:Request) { const origin=request.headers.get('origin'); return !origin || origin===new URL(request.url).origin; }
export async function boundedBody(request:Request,limit:number) {
 if(Number(request.headers.get('content-length'))>limit) throw new Error('BODY_TOO_LARGE');
 if(!request.body) return new ArrayBuffer(0);
 const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
 while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>limit){await reader.cancel();throw new Error('BODY_TOO_LARGE');} chunks.push(value); }
 const data=new Uint8Array(size); let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;} return data.buffer;
}
export async function readJSON(request:Request,limit=12000) { const data=await boundedBody(request,limit); return JSON.parse(new TextDecoder().decode(data)); }
export async function getCache(key:string) { const row=await db().prepare('SELECT body FROM cache WHERE key=? AND expires>?').bind(key,now()).first<{body:string}>(); return row?JSON.parse(row.body):null; }
export async function putCache(key:string,body:unknown,ttl=86400) { await db().prepare('INSERT INTO cache(key,body,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,expires=excluded.expires').bind(key,JSON.stringify(body),now()+ttl).run(); }
export async function reserve(args:{ id:string; kind:string; owner:string; ip:string; digest:string; global:number; user:number; perIP:number; window:number }) {
 const cutoff=now()-args.window;
 const r=await db().prepare(`INSERT INTO operations(id,kind,owner,ip,digest,created) SELECT ?,?,?,?,?,?
 WHERE (SELECT COUNT(*) FROM operations WHERE kind=? AND created>?)<?
 AND (SELECT COUNT(*) FROM operations WHERE owner=? AND kind=? AND created>?)<?
 AND (SELECT COUNT(*) FROM operations WHERE ip=? AND kind=? AND created>?)<?
 AND (?<>'recognize' OR COALESCE((SELECT used FROM recognition_meter WHERE id='global'),0)<?)
 ON CONFLICT(id) DO NOTHING RETURNING id`).bind(args.id,args.kind,args.owner,args.ip,args.digest,now(),args.kind,cutoff,args.global,args.owner,args.kind,cutoff,args.user,args.ip,args.kind,cutoff,args.perIP,args.kind,intVariable('TOTAL_SCAN_LIMIT',300,1000000)).first();
 return !!r;
}
export async function cleanup() {
 if(Math.random()>.025) return;
 await db().batch([
 db().prepare('DELETE FROM operations WHERE id IN (SELECT id FROM operations WHERE created<? LIMIT 300)').bind(now()-172800),
 db().prepare('DELETE FROM cache WHERE key IN (SELECT key FROM cache WHERE expires<? LIMIT 300)').bind(now()),
 db().prepare('DELETE FROM saved WHERE id IN (SELECT id FROM saved WHERE created<? LIMIT 300)').bind(now()-31536000),
 ]);
}
export async function saveSong(owner:string,song:unknown,id:string) {
 await db().batch([
 db().prepare('INSERT INTO saved(id,owner,song,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET song=excluded.song,created=excluded.created').bind(await digest(owner+':'+id),owner,JSON.stringify(song),now()),
 db().prepare('DELETE FROM saved WHERE owner=? AND id NOT IN (SELECT id FROM saved WHERE owner=? ORDER BY created DESC LIMIT 100)').bind(owner,owner),
 ]);
}
