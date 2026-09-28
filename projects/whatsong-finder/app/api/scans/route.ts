import { db, digest, identity, json, now, readJSON, reserve, sameOrigin } from '@/lib/server';
import { allowance, assertRecognitionReady, RecognitionError } from '@/lib/recognition';
import { planScan, ScanInput } from '@/lib/scan';
import { cleanScans, listScans, ownedScan, readScan, scanExpiry } from '@/lib/scan-store';

export async function GET(request: Request) {
  const who = await identity(request);
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const row = await ownedScan(id, who.owner);
      if (!row) return json({ error: 'This scan is unavailable or has expired.' }, 404, who.cookie);
      return json({ job: await readScan(row), allowance: await allowance(who.owner, who.ip) }, 200, who.cookie);
    }
    return json({ jobs: await listScans(who.owner), allowance: await allowance(who.owner, who.ip) }, 200, who.cookie);
  } catch { return json({ error: 'Saved scans could not be loaded. Please try again.' }, 503, who.cookie); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed.' }, 403);
  const who = await identity(request);
  try {
    const parsed = ScanInput.safeParse(await readJSON(request, 4096));
    if (!parsed.success) return json({ error: 'The scan plan is invalid. Select your file again.' }, 400, who.cookie);
    const input = parsed.data, inputHash = await digest(JSON.stringify(input));
    const existing = await ownedScan(input.id, who.owner);
    if (existing) {
      if (existing.input_hash !== inputHash) return json({ error: 'This scan belongs to a different plan.' }, 409, who.cookie);
      return json({ job: await readScan(existing), allowance: await allowance(who.owner, who.ip) }, 200, who.cookie);
    }
    assertRecognitionReady();
    const windows = planScan(input.durationMs, input.mode, input.samples);
    const available = await allowance(who.owner, who.ip);
    if (windows.length > available.remaining) return json({ error: `This plan needs up to ${windows.length} scans; ${available.remaining} are available now. Choose fewer survey sections or a shorter recording.`, code: 'QUOTA_EXCEEDED', allowance: available }, 429, who.cookie);
    const operationId = who.owner + ':plan:' + input.id;
    const prior = await db().prepare('SELECT digest FROM operations WHERE id=?').bind(operationId).first<{ digest: string }>();
    if (prior && prior.digest !== inputHash) return json({ error: 'This scan ID is already in use.' }, 409, who.cookie);
    if (!prior && !await reserve({ id: operationId, kind: 'scan_job', owner: who.owner, ip: who.ip, digest: inputHash, global: 2000, user: 10, perIP: 50, window: 86400 })) return json({ error: 'The daily limit for new scan projects has been reached.' }, 429, who.cookie);
    // The plan and every window are persisted together. Audio remains on the device.
    await db().batch([
      db().prepare('INSERT INTO scan_jobs(id,owner,input,input_hash,created,expires) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(input.id, who.owner, JSON.stringify(input), inputHash, now(), scanExpiry()),
      db().prepare(`INSERT INTO scan_segments(job_id,ordinal,start_ms,end_ms)
        SELECT ?,json_extract(value,'$.index'),json_extract(value,'$.startMs'),json_extract(value,'$.endMs') FROM json_each(?)
        WHERE EXISTS(SELECT 1 FROM scan_jobs WHERE id=? AND owner=? AND input_hash=?)
        ON CONFLICT(job_id,ordinal) DO NOTHING`).bind(input.id, JSON.stringify(windows), input.id, who.owner, inputHash),
    ]);
    const row = await ownedScan(input.id, who.owner);
    if (!row || row.input_hash !== inputHash) return json({ error: 'This scan ID is already in use.' }, 409, who.cookie);
    await cleanScans();
    return json({ job: await readScan(row), allowance: available }, 201, who.cookie);
  } catch (e) {
    if (e instanceof RecognitionError) return json({ error: e.message, code: e.code }, e.status, who.cookie);
    if (e instanceof SyntaxError || (e instanceof Error && e.message === 'BODY_TOO_LARGE')) return json({ error: 'Invalid scan plan.' }, 400, who.cookie);
    return json({ error: 'The scan could not be saved. Please try again.' }, 503, who.cookie);
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed.' }, 403);
  const who = await identity(request);
  try {
    const id = new URL(request.url).searchParams.get('id') || '';
    await db().prepare('DELETE FROM scan_jobs WHERE id=? AND owner=?').bind(id, who.owner).run();
    return json({ ok: true }, 200, who.cookie);
  } catch { return json({ error: 'The scan could not be deleted.' }, 503, who.cookie); }
}
