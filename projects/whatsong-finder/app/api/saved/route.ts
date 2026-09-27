import { SongSchema } from '@/lib/contracts';
import { db,identity,json,readJSON,sameOrigin,saveSong,now } from '@/lib/server';
export async function GET(request:Request) {
 const id=await identity(request);
 try { const rows=await db().prepare('SELECT song FROM saved WHERE owner=? AND created>? ORDER BY created DESC LIMIT 100').bind(id.owner,now()-31536000).all<{song:string}>();return json({songs:rows.results.map(r=>JSON.parse(r.song))},200,id.cookie); }
 catch{return json({error:'Your saved finds could not be loaded. Try again.'},503,id.cookie);}
}
export async function POST(request:Request) {
 if(!sameOrigin(request))return json({error:'Request not allowed.'},403);
 const id=await identity(request);
 try { const result=SongSchema.safeParse(await readJSON(request)); if(!result.success)return json({error:'Invalid song.'},400,id.cookie); await saveSong(id.owner,result.data,result.data.id);return json({saved:true},200,id.cookie); }
 catch{return json({error:'This song could not be saved. Try again.'},503,id.cookie);}
}
export async function DELETE(request:Request) {
 if(!sameOrigin(request))return json({error:'Request not allowed.'},403);
 const id=await identity(request);
 try { await db().prepare('DELETE FROM saved WHERE owner=?').bind(id.owner).run();return json({deleted:true},200,id.cookie); }
 catch{return json({error:'Could not clear your saved finds. Try again.'},503,id.cookie);}
}
