import { boundedBody, db, digest, identity, json, now, sameOrigin } from '@/lib/server';
import { parsePCM, pcmPeak } from '@/lib/contracts';
import { allowance, assertRecognitionReady, recognize, RecognitionError } from '@/lib/recognition';
import { ownedScan, readScan, segmentKey, settleSegment, type SegmentRow } from '@/lib/scan-store';
import type { ScanInput, ScanResult } from '@/lib/scan';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed.' }, 403);
  const who = await identity(request);
  let id = '', index = -1, claimed = false;
  try {
    const url = new URL(request.url); id = url.searchParams.get('id') || ''; index = Number(url.searchParams.get('index'));
    if (!url.searchParams.has('index') || !Number.isInteger(index) || index < 0 || index >= 100) return json({ error: 'Invalid scan section.' }, 400, who.cookie);
    const row = await ownedScan(id, who.owner);
    if (!row) return json({ error: 'This scan is unavailable or has expired.' }, 404, who.cookie);
    const input: ScanInput = JSON.parse(row.input);
    if (request.headers.get('x-source-sha256') !== input.fileHash) return json({ error: 'Select the same original file to continue this scan.' }, 409, who.cookie);
    const segment = await db().prepare('SELECT * FROM scan_segments WHERE job_id=? AND ordinal=?').bind(id, index).first<SegmentRow>();
    if (!segment) return json({ error: 'Invalid scan section.' }, 400, who.cookie);
    const bytes = await boundedBody(request, 600000), duration = parsePCM(bytes), mediaHash = await digest(bytes);
    if (Math.abs(duration * 1000 - (segment.end_ms - segment.start_ms)) > 60) return json({ error: 'This audio does not match the planned section length.' }, 400, who.cookie);
    if (segment.media_hash && segment.media_hash !== mediaHash) return json({ error: 'This section was already submitted with different audio.' }, 409, who.cookie);
    if (segment.state !== 'pending') return json({ job: await readScan(row), allowance: await allowance(who.owner, who.ip) }, 200, who.cookie);
    assertRecognitionReady();
    const acquired = await db().prepare(`UPDATE scan_segments SET state='processing',media_hash=?,claimed=?
      WHERE job_id=? AND ordinal=? AND state='pending' RETURNING ordinal`).bind(mediaHash, now(), id, index).first();
    if (!acquired) return json({ error: 'This section is being processed in another tab.', code: 'IN_PROGRESS' }, 409, who.cookie);
    claimed = true;
    if (pcmPeak(bytes) < 0.00005) {
      await settleSegment(id, index, 'silent', { song: null, cached: false, provider: 'audd', providerCalls: 0, latencyMs: 0 });
    } else {
      const result = await recognize({ file: new Blob([bytes], { type: 'audio/wav' }) }, who, segmentKey(id, index), segment.start_ms / 1000);
      await settleSegment(id, index, result.song ? 'matched' : 'no_match', result);
    }
    return json({ job: await readScan(row), allowance: await allowance(who.owner, who.ip) }, 200, who.cookie);
  } catch (e) {
    try {
      if (claimed && e instanceof RecognitionError && (e.code === 'QUOTA_EXCEEDED' || e.code === 'PROVIDER_NOT_CONFIGURED')) {
        await db().prepare("UPDATE scan_segments SET state='pending',media_hash=NULL,claimed=NULL WHERE job_id=? AND ordinal=? AND state='processing'").bind(id, index).run();
      } else if (claimed && e instanceof RecognitionError && e.code === 'PROVIDER_UNAVAILABLE') {
        const failure: ScanResult = { song: null, cached: false, provider: 'audd', providerCalls: 1, latencyMs: 0, error: e.message };
        await settleSegment(id, index, 'error', failure);
      }
    } catch { /* GET recovers the stored operation or marks its outcome uncertain. */ }
    if (e instanceof RecognitionError) return json({ error: e.message, code: e.code }, e.status, who.cookie);
    const message = e instanceof Error ? e.message : '';
    if (message === 'BODY_TOO_LARGE') return json({ error: 'This section is too large.' }, 413, who.cookie);
    if (/^(Submit|The audio|Use a)/.test(message)) return json({ error: message }, 400, who.cookie);
    return json({ error: 'The section could not finish. Refresh saved progress before trying again.', code: 'SCAN_UNAVAILABLE' }, 503, who.cookie);
  }
}
