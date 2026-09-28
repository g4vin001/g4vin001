import { db, now } from './server';
import { SCAN_RETENTION_SECONDS, type ScanInput, type ScanJob, type ScanResult, type ScanState, type ScanSummary } from './scan';
export type ScanRow = { id: string; owner: string; input: string; input_hash: string; created: number; expires: number };
export type SegmentRow = { ordinal: number; start_ms: number; end_ms: number; state: ScanState; media_hash: string | null; claimed: number | null; result: string | null };
export const segmentKey = (id: string, index: number) => 'scan:' + id + ':' + index;
export async function ownedScan(id: string, owner: string) {
  return db().prepare('SELECT * FROM scan_jobs WHERE id=? AND owner=? AND expires>?').bind(id, owner, now()).first<ScanRow>();
}
export async function settleSegment(id: string, index: number, state: ScanState, result: ScanResult) {
  await db().prepare("UPDATE scan_segments SET state=?,result=? WHERE job_id=? AND ordinal=? AND state='processing'").bind(state, JSON.stringify(result), id, index).run();
}
export async function readScan(row: ScanRow): Promise<ScanJob> {
  const records = await db().prepare(`SELECT s.*,o.id AS operation_id,o.response AS operation_response
    FROM scan_segments s LEFT JOIN operations o ON o.id=?||s.ordinal
    WHERE s.job_id=? ORDER BY s.ordinal`).bind(row.owner + ':scan:' + row.id + ':', row.id).all<SegmentRow & { operation_id: string | null; operation_response: string | null }>();
  // Recover persisted answers after lost connections; never reissue an unknown paid attempt.
  for (const segment of records.results) {
    if (segment.state !== 'processing') continue;
    if (segment.operation_response) {
      const answer = JSON.parse(segment.operation_response);
      const result: ScanResult = { song: null, cached: false, provider: 'audd', providerCalls: 1, latencyMs: 0, ...answer };
      segment.state = result.error ? 'error' : result.song ? 'matched' : 'no_match';
      segment.result = JSON.stringify(result);
      await settleSegment(row.id, segment.ordinal, segment.state, result);
    } else if ((segment.claimed || 0) < now() - 120) {
      const result: ScanResult = { song: null, cached: false, provider: 'audd', providerCalls: segment.operation_id ? 1 : 0, latencyMs: 0, error: 'The outcome of this interrupted section is unknown. It was not retried.' };
      segment.state = 'error'; segment.result = JSON.stringify(result);
      await settleSegment(row.id, segment.ordinal, 'error', result);
    }
  }
  return { ...JSON.parse(row.input) as ScanInput, created: row.created, expires: row.expires, segments: records.results.map(s => ({ index: s.ordinal, startMs: s.start_ms, endMs: s.end_ms, state: s.state, ...(s.result ? { result: JSON.parse(s.result) } : {}) })) };
}
export async function listScans(owner: string): Promise<ScanSummary[]> {
  const records = await db().prepare(`SELECT j.input,j.created,j.expires,COUNT(s.ordinal) AS total,
    COALESCE(SUM(CASE WHEN s.state NOT IN ('pending','processing') THEN 1 ELSE 0 END),0) AS completed
    FROM scan_jobs j LEFT JOIN scan_segments s ON s.job_id=j.id
    WHERE j.owner=? AND j.expires>? GROUP BY j.id ORDER BY j.created DESC,j.id DESC LIMIT 20`).bind(owner, now()).all<{ input: string; created: number; expires: number; total: number; completed: number }>();
  return records.results.map(r => ({ ...JSON.parse(r.input), created: r.created, expires: r.expires, total: r.total, completed: r.completed }));
}
export async function cleanScans() {
  await db().prepare('DELETE FROM scan_jobs WHERE id IN (SELECT id FROM scan_jobs WHERE expires<=? LIMIT 30)').bind(now()).run();
}
export const scanExpiry = () => now() + SCAN_RETENTION_SECONDS;
