import { identity,json,variable } from '@/lib/server';
import { safeLink } from '@/lib/contracts';
import { allowance,recognitionReady } from '@/lib/recognition';
export async function GET(request:Request) {
 const id=await identity(request); const sponsorUrl=safeLink(variable('SPONSOR_URL')); const label=variable('SPONSOR_LABEL');
 try { const available=await allowance(id.owner,id.ip);
 return json({recognition:recognitionReady(),dailyLimit:available.limit,remainingScans:available.remaining,maxFileMB:40,supportUrl:safeLink(variable('SUPPORT_URL'))||null,sponsor:sponsorUrl&&label?{label:label.slice(0,80),url:sponsorUrl,description:variable('SPONSOR_DESCRIPTION').slice(0,160)}:null},200,id.cookie);
 } catch { return json({error:'The service could not load its scan allowance.'},503,id.cookie); }
}
