import { db,json,variable } from '@/lib/server';
import { recognitionReady, totalBudgetRemaining } from '@/lib/recognition';
export async function GET(){try{await db().prepare('SELECT COUNT(*) AS count FROM cache WHERE expires>0 LIMIT 1').first();const token=variable('AUDD_API_TOKEN').trim();const ready=recognitionReady()&&await totalBudgetRemaining()>0;return json({status:'ok',storage:'ready',recognition:!token||token==='test'?'awaiting_activation':ready?'configured':'paused',visitorBilling:'none'});}catch{return json({status:'unavailable',storage:'unavailable'},503);}}
