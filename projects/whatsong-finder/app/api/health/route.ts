import { db,json,variable } from '@/lib/server';
export async function GET(){try{await db().prepare('SELECT COUNT(*) AS count FROM cache WHERE expires>0 LIMIT 1').first();return json({status:'ok',storage:'ready',recognition:!!variable('AUDD_API_TOKEN')&&variable('AUDD_API_TOKEN')!=='test'?'configured':'awaiting_activation'});}catch{return json({status:'unavailable',storage:'unavailable'},503);}}
