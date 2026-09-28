import { z } from 'zod';
import { csvCell, type Song } from './contracts';

export const SCAN_WINDOW_MS = 12_000;
export const MAX_SCAN_WINDOWS = 100;
export const SCAN_RETENTION_SECONDS = 7 * 86400;
export const ScanInput = z.object({
  id: z.string().uuid(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  filename: z.string().min(1).max(180),
  durationMs: z.number().int().min(2000).max(1_200_000),
  mode: z.enum(['survey', 'continuous']),
  samples: z.number().int().min(1).max(MAX_SCAN_WINDOWS),
}).strict();
export type ScanInput = z.infer<typeof ScanInput>;
export type ScanWindow = { index: number; startMs: number; endMs: number };
export type ScanState = 'pending' | 'processing' | 'matched' | 'no_match' | 'silent' | 'error';
export type ScanResult = { song: Song | null; cached: boolean; provider: 'audd'; providerCalls: number; latencyMs: number; error?: string };
export type ScanSegment = ScanWindow & { state: ScanState; result?: ScanResult };
export type ScanJob = ScanInput & { created: number; expires: number; segments: ScanSegment[] };
export type ScanSummary = Omit<ScanJob, 'segments'> & { completed: number; total: number };
export type ScanAllowance = { remaining: number; limit: number };
export type TimelineHit = { song: Song; startMs: number; endMs: number; samples: number };

// Continuous windows partition the file. Spread the remainder evenly so the last
// clip is never shorter than the provider's two-second minimum.
export function planScan(durationMs: number, mode: ScanInput['mode'], samples: number): ScanWindow[] {
  if (!Number.isInteger(durationMs) || durationMs < 2000 || durationMs > 1_200_000) throw new Error('Use a recording between 2 seconds and 20 minutes.');
  if (!Number.isInteger(samples) || samples < 1 || samples > MAX_SCAN_WINDOWS) throw new Error('Choose a valid scan allowance.');
  const fullCount = Math.ceil(durationMs / SCAN_WINDOW_MS);
  const count = mode === 'continuous' ? fullCount : Math.min(samples, fullCount);
  if (mode === 'continuous' || count === fullCount) {
    return Array.from({ length: count }, (_, index) => ({ index, startMs: Math.round(index * durationMs / count), endMs: Math.round((index + 1) * durationMs / count) }));
  }
  const length = Math.min(SCAN_WINDOW_MS, durationMs);
  return Array.from({ length: count }, (_, index) => {
    const startMs = count === 1 ? Math.round((durationMs - length) / 2) : Math.round(index * (durationMs - length) / (count - 1));
    return { index, startMs, endMs: startMs + length };
  });
}

export function intervalCoverage(windows: Pick<ScanWindow, 'startMs' | 'endMs'>[]): number {
  let total = 0, end = 0;
  for (const w of [...windows].sort((a, b) => a.startMs - b.startMs)) {
    total += Math.max(0, w.endMs - Math.max(end, w.startMs));
    end = Math.max(end, w.endMs);
  }
  return total;
}

export function scanStats(job: ScanJob) {
  const finished = job.segments.filter(s => s.state !== 'pending' && s.state !== 'processing');
  const checked = job.segments.filter(s => s.state === 'matched' || s.state === 'no_match');
  return {
    completed: finished.length, total: job.segments.length,
    checkedMs: intervalCoverage(checked), plannedMs: intervalCoverage(job.segments),
    silentMs: intervalCoverage(job.segments.filter(s => s.state === 'silent')),
    errors: job.segments.filter(s => s.state === 'error').length,
    providerCalls: job.segments.reduce((n, s) => n + (s.result?.providerCalls || 0), 0),
    cacheHits: job.segments.filter(s => s.result?.cached).length,
  };
}

// A match identifies music somewhere inside the submitted window, not a song's
// exact boundary. Never bridge unchecked, failed or no-match windows.
export function timelineHits(segments: ScanSegment[]): TimelineHit[] {
  const hits: TimelineHit[] = [];
  let previousMatched = false;
  for (const segment of [...segments].sort((a, b) => a.startMs - b.startMs)) {
    const song = segment.state === 'matched' ? segment.result?.song : null;
    if (!song) { previousMatched = false; continue; }
    const last = hits.at(-1);
    if (previousMatched && last && last.song.id === song.id && segment.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, segment.endMs); last.samples++;
    } else hits.push({ song, startMs: segment.startMs, endMs: segment.endMs, samples: 1 });
    previousMatched = true;
  }
  return hits;
}

export function scanCSV(job: ScanJob): string {
  const rows: (string | number)[][] = [['File', 'Window start (s)', 'Window end (s)', 'State', 'Title', 'Artist', 'Provider', 'Provider calls', 'Cached', 'Note']];
  for (const s of job.segments) rows.push([job.filename, s.startMs / 1000, s.endMs / 1000, s.state, s.result?.song?.title || '', s.result?.song?.artist || '', s.result?.provider || '', s.result?.providerCalls || 0, s.result?.cached ? 'yes' : 'no', s.result?.error || 'Window positions are not exact song boundaries.']);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
