import { db, digest, getCache, intVariable, now, putCache, reserve, saveSong, variable } from './server';
import { AudDRecognizer, type RecognitionInput } from './providers';
import type { ScanAllowance, ScanResult } from './scan';

export class RecognitionError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export function recognitionReady() {
  const token = variable('AUDD_API_TOKEN').trim();
  return !!token && token !== 'test' && intVariable('GLOBAL_DAILY_SCAN_LIMIT', 100, 10000) > 0 && intVariable('TOTAL_SCAN_LIMIT', 300, 1000000) > 0;
}
export async function totalBudgetRemaining() {
  const row = await db().prepare("SELECT used FROM recognition_meter WHERE id='global'").first<{ used: number }>();
  return Math.max(0, intVariable('TOTAL_SCAN_LIMIT', 300, 1000000) - (row?.used || 0));
}
export function assertRecognitionReady() {
  if (!recognitionReady()) throw new RecognitionError('PROVIDER_NOT_CONFIGURED', 503, 'Audio identification is awaiting activation. You can prepare a clip or plan a scan.');
}
export async function allowance(owner: string, ip: string): Promise<ScanAllowance> {
  const counts = await db().prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN owner=? THEN 1 ELSE 0 END),0) AS visitor,
    COALESCE(SUM(CASE WHEN ip=? THEN 1 ELSE 0 END),0) AS network
    FROM operations WHERE kind='recognize' AND created>?`).bind(owner, ip, now() - 86400).first<{ total: number; visitor: number; network: number }>();
  const limit = intVariable('VISITOR_DAILY_SCAN_LIMIT', 5, 200);
  return { limit, remaining: Math.max(0, Math.min(limit - (counts?.visitor || 0), intVariable('IP_DAILY_SCAN_LIMIT', 20, 500) - (counts?.network || 0), intVariable('GLOBAL_DAILY_SCAN_LIMIT', 100, 10000) - (counts?.total || 0), await totalBudgetRemaining())) };
}

export async function recognize(input: RecognitionInput, who: { owner: string; ip: string }, requestId: string, sampleAt = 0): Promise<ScanResult> {
  assertRecognitionReady();
  const hash = await digest(input.file ? await input.file.arrayBuffer() : input.url || '');
  const operation = who.owner + ':' + requestId;
  const existing = await db().prepare('SELECT digest,response FROM operations WHERE id=?').bind(operation).first<{ digest: string; response: string | null }>();
  if (existing) {
    if (existing.digest !== hash) throw new RecognitionError('REQUEST_CONFLICT', 409, 'This request was already used for another clip.');
    if (!existing.response) throw new RecognitionError('IN_PROGRESS', 409, 'This section is still processing. Check its saved progress shortly.');
    const result = JSON.parse(existing.response);
    if (result.error) throw new RecognitionError('PROVIDER_UNAVAILABLE', 503, result.error);
    return { provider: 'audd', providerCalls: 1, latencyMs: 0, ...result };
  }
  const cacheKey = 'audio:' + hash;
  const cached = input.file ? await getCache(cacheKey) : null;
  if (cached) {
    const song = cached.song ? { ...cached.song, sampleAt } : null;
    if (song) await saveSong(who.owner, song, song.id);
    return { song, cached: true, provider: 'audd', providerCalls: 0, latencyMs: 0 };
  }
  const accepted = await reserve({ id: operation, kind: 'recognize', owner: who.owner, ip: who.ip, digest: hash,
    global: intVariable('GLOBAL_DAILY_SCAN_LIMIT', 100, 10000), user: intVariable('VISITOR_DAILY_SCAN_LIMIT', 5, 200), perIP: intVariable('IP_DAILY_SCAN_LIMIT', 20, 500), window: 86400 });
  if (!accepted) throw new RecognitionError('QUOTA_EXCEEDED', 429, 'The free allowance or shared site budget is used up. Saved progress is kept. Personal allowances recover over 24 hours; the site budget may need replenishing.');
  const began = Date.now();
  let result: ScanResult;
  try {
    const song = await new AudDRecognizer(variable('AUDD_API_TOKEN').trim()).recognize(input);
    result = { song: song ? { ...song, sampleAt } : null, cached: false, provider: 'audd', providerCalls: 1, latencyMs: Date.now() - began };
    // Record the answer before caching or saving. Replaying a lost response must not bill twice.
    await db().prepare('UPDATE operations SET response=? WHERE id=?').bind(JSON.stringify(result), operation).run();
  } catch {
    const failure = { error: 'Recognition did not finish. This request will not be sent again automatically.', code: 'PROVIDER_UNAVAILABLE', providerCalls: 1 };
    try { await db().prepare('UPDATE operations SET response=COALESCE(response,?) WHERE id=?').bind(JSON.stringify(failure), operation).run(); } catch { /* Reservation still prevents another paid call. */ }
    throw new RecognitionError('PROVIDER_UNAVAILABLE', 503, failure.error);
  }
  try {
    if (input.file) await putCache(cacheKey, { song: result.song }, result.song ? 86400 : 600);
    if (result.song) await saveSong(who.owner, result.song, result.song.id);
  } catch { console.error('Recognition secondary storage unavailable'); }
  return result;
}
