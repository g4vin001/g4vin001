import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const output=resolve('.sites-runtime/tests');mkdirSync(output,{recursive:true});
writeFileSync(output+'/env.mjs','export const env=globalThis.__musicTestEnv;');
const modules={'lib/contracts.ts':'contracts','lib/server.ts':'server','app/api/recognize/route.ts':'recognize','app/api/search/route.ts':'search','app/api/saved/route.ts':'saved','app/api/config/route.ts':'config'};
for(const [path,name] of Object.entries(modules)){
 const source=readFileSync(path,'utf8').replaceAll("'@/lib/server'","'./server.mjs'").replaceAll("'@/lib/contracts'","'./contracts.mjs'").replaceAll("'cloudflare:workers'","'./env.mjs'");
 writeFileSync(output+'/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
class Statement{
 constructor(database,sql,args=[]){this.database=database;this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.database,this.sql,args);}
 async first(){return this.database.prepare(this.sql).get(...this.args)||null;}
 async all(){return {results:this.database.prepare(this.sql).all(...this.args)};}
 async run(){return {success:true,meta:this.database.prepare(this.sql).run(...this.args)};}
}
function d1(database){return {prepare:sql=>new Statement(database,sql),batch:async statements=>{database.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}}};}
let database;let upstreamCalls=0;let responder;
globalThis.__musicTestEnv={};
const env=globalThis.__musicTestEnv;
function reset(){database?.close();database=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+f,'utf8'));for(const key of Object.keys(env))delete env[key];Object.assign(env,{DB:d1(database),AUDD_API_TOKEN:'private-test-fixture',GLOBAL_DAILY_SCAN_LIMIT:'100',VISITOR_DAILY_SCAN_LIMIT:'5',IP_DAILY_SCAN_LIMIT:'20'});upstreamCalls=0;responder=()=>Response.json({status:'success',result:{title:'Fixture Song',artist:'Fixture Artist',album:'Fixture Album',spotify:{id:'fixture',external_urls:{spotify:'https://open.spotify.com/track/fixture'}}}});}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{upstreamCalls++;return responder(...args);};
const contracts=await import(pathToFileURL(output+'/contracts.mjs'));
const recognition=await import(pathToFileURL(output+'/recognize.mjs'));
const saved=await import(pathToFileURL(output+'/saved.mjs'));
const config=await import(pathToFileURL(output+'/config.mjs'));
const search=await import(pathToFileURL(output+'/search.mjs'));
const visitor='11111111-1111-4111-8111-111111111111';
function wav(seconds=3,value=100){const data=new ArrayBuffer(44+Math.ceil(seconds*22050)*2);const v=new DataView(data);const str=(n,s)=>{for(let i=0;i<s.length;i++)v.setUint8(n+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,data.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,22050,true);v.setUint32(28,44100,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,data.byteLength-44,true);v.setInt16(44,value,true);return data;}
function request(body=wav(),options={}){return new Request('https://music.example/api/recognize',{method:'POST',headers:{'content-type':'audio/wav','idempotency-key':options.key||crypto.randomUUID(),cookie:'ws_visitor='+(options.visitor||visitor),'cf-connecting-ip':options.ip||'203.0.113.1',origin:'https://music.example',...options.headers},body});}
await test('cost and privacy boundaries',async t=>{
 await t.test('rejects internal, credentialed, non-HTTPS and social-page links',()=>{for(const u of ['http://example.com/a.mp3','https://127.0.0.1/a.mp3','https://2130706433/a.mp3','https://[::1]/a.mp3','https://a:b@example.com/a.mp3','https://localhost/a.mp3','https://foo.local/a.mp3','https://youtube.com/watch?v=123'])assert.throws(()=>contracts.validateMediaURL(u));assert.equal(contracts.validateMediaURL('https://cdn.example.com/a.mp3#t=2'),'https://cdn.example.com/a.mp3');});
 await t.test('server checks real WAV duration and format',()=>{assert.equal(contracts.parsePCM(wav()),3);assert.throws(()=>contracts.parsePCM(wav(13)));assert.throws(()=>contracts.parsePCM(wav(1)));const data=wav();new DataView(data).setUint16(22,2,true);assert.throws(()=>contracts.parsePCM(data));assert.throws(()=>contracts.parsePCM(new ArrayBuffer(20)));});
 await t.test('CSV export neutralizes spreadsheet formulas',()=>{assert.equal(contracts.csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(contracts.csvCell('a,b'),'"a,b"');});
 await t.test('missing provider and public test token fail closed without a charge',async()=>{reset();env.AUDD_API_TOKEN='';assert.equal((await recognition.POST(request())).status,503);env.AUDD_API_TOKEN='test';assert.equal((await recognition.POST(request())).status,503);assert.equal(upstreamCalls,0);});
 await t.test('invalid audio and cross-origin requests never call provider',async()=>{reset();assert.equal((await recognition.POST(request(new ArrayBuffer(20)))).status,400);assert.equal((await recognition.POST(request(wav(),{headers:{origin:'https://evil.example'}}))).status,403);assert.equal(upstreamCalls,0);});
 await t.test('real handler normalizes a provider match and saves it privately',async()=>{reset();const response=await recognition.POST(request());assert.equal(response.status,200);const body=await response.json();assert.equal(body.song.title,'Fixture Song');assert.equal(body.song.source,'recognition');assert.equal(upstreamCalls,1);const same=await saved.GET(new Request('https://music.example/api/saved',{headers:{cookie:'ws_visitor='+visitor}}));assert.equal((await same.json()).songs.length,1);const other=await saved.GET(new Request('https://music.example/api/saved'));assert.equal((await other.json()).songs.length,0);});
 await t.test('duplicate audio reuses a result without billing and preserves new position',async()=>{reset();await recognition.POST(request());const r=await recognition.POST(request(wav(),{headers:{'x-sample-start':'42'}}));const result=await r.json();assert.equal(result.cached,true);assert.equal(result.song.sampleAt,42);assert.equal(upstreamCalls,1);});
 await t.test('same idempotency key cannot issue a second provider request on failure',async()=>{reset();responder=()=>{throw new Error('upstream timeout');};const key=crypto.randomUUID();assert.equal((await recognition.POST(request(wav(),{key}))).status,503);const again=await recognition.POST(request(wav(),{key}));assert.match((await again.json()).error,/did not finish/);assert.equal(upstreamCalls,1);});
 await t.test('per-visitor cap holds across distinct clips',async()=>{reset();env.VISITOR_DAILY_SCAN_LIMIT='2';for(let i=0;i<2;i++)assert.equal((await recognition.POST(request(wav(3,i+1)))).status,200);assert.equal((await recognition.POST(request(wav(3,77)))).status,429);assert.equal(upstreamCalls,2);});
 await t.test('global cap holds across visitors and IP addresses',async()=>{reset();env.GLOBAL_DAILY_SCAN_LIMIT='1';assert.equal((await recognition.POST(request())).status,200);assert.equal((await recognition.POST(request(wav(3,66),{visitor:crypto.randomUUID(),ip:'203.0.113.2'}))).status,429);assert.equal(upstreamCalls,1);});
 await t.test('IP cap holds after cookie reset',async()=>{reset();env.IP_DAILY_SCAN_LIMIT='1';await recognition.POST(request());assert.equal((await recognition.POST(request(wav(3,66),{visitor:crypto.randomUUID()}))).status,429);assert.equal(upstreamCalls,1);});
 await t.test('parallel duplicate request bills at most once',async()=>{reset();const ready=responder;responder=async()=>{await new Promise(resolve=>setTimeout(resolve,20));return ready();};const key=crypto.randomUUID();const responses=await Promise.all([recognition.POST(request(wav(),{key})),recognition.POST(request(wav(),{key}))]);assert.equal(upstreamCalls,1);assert.equal(responses.filter(r=>r.status===200).length,1);});
 await t.test('global reservation stays bounded with competing concurrent scans',async()=>{reset();env.GLOBAL_DAILY_SCAN_LIMIT='1';const responses=await Promise.all([recognition.POST(request(wav(3,1))),recognition.POST(request(wav(3,2),{visitor:crypto.randomUUID(),ip:'203.0.113.2'}))]);assert.equal(upstreamCalls,1);assert.equal(responses.filter(r=>r.status===200).length,1);});
 await t.test('catalog results are real-provider-shaped, sanitized and cached',async()=>{reset();responder=()=>Response.json({results:[{trackId:1,trackName:'Song',artistName:'Artist',trackViewUrl:'javascript:alert(1)',artworkUrl100:'https://evil.example/pixel'}]});const response=await search.GET(new Request('https://music.example/api/search?q=Song'));const data=await response.json();assert.equal(data.songs[0].source,'catalog');assert.equal(data.songs[0].apple,undefined);assert.equal(data.songs[0].artwork,undefined);await search.GET(new Request('https://music.example/api/search?q=Song'));assert.equal(upstreamCalls,1);});
 await t.test('public config never exposes credentials',async()=>{reset();const response=await config.GET(new Request('https://music.example/api/config'));const body=await response.text();assert.ok(!body.includes(env.AUDD_API_TOKEN));assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);});
 await t.test('saved collection is bounded, owner isolated and can be cleared',async()=>{reset();for(let i=0;i<102;i++){const r=await saved.POST(new Request('https://music.example/api/saved',{method:'POST',headers:{cookie:'ws_visitor='+visitor,'content-type':'application/json'},body:JSON.stringify({id:String(i),title:'Song '+i,artist:'Artist',source:'catalog'})}));assert.equal(r.status,200);}assert.equal(database.prepare('SELECT COUNT(*) AS n FROM saved').get().n,100);const foreign=await saved.DELETE(new Request('https://music.example/api/saved',{method:'DELETE'}));assert.equal(foreign.status,200);assert.equal(database.prepare('SELECT COUNT(*) AS n FROM saved').get().n,100);await saved.DELETE(new Request('https://music.example/api/saved',{method:'DELETE',headers:{cookie:'ws_visitor='+visitor}}));assert.equal(database.prepare('SELECT COUNT(*) AS n FROM saved').get().n,0);});
});
globalThis.fetch=originalFetch;database?.close();
