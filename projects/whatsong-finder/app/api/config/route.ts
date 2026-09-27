import { identity,intVariable,json,variable } from '@/lib/server';
import { safeLink } from '@/lib/contracts';
export async function GET(request:Request) {
 const id=await identity(request); const sponsorUrl=safeLink(variable('SPONSOR_URL')); const label=variable('SPONSOR_LABEL');
 return json({recognition:!!variable('AUDD_API_TOKEN') && variable('AUDD_API_TOKEN')!=='test' && intVariable('GLOBAL_DAILY_SCAN_LIMIT',100,10000)>0,dailyLimit:intVariable('VISITOR_DAILY_SCAN_LIMIT',5,25),maxFileMB:40,supportUrl:safeLink(variable('SUPPORT_URL'))||null,sponsor:sponsorUrl&&label?{label:label.slice(0,80),url:sponsorUrl,description:variable('SPONSOR_DESCRIPTION').slice(0,160)}:null},200,id.cookie);
}
