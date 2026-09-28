'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, Download, FolderOpen, LoaderCircle, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { SongCard } from '@/components/song-card';
import { prepareClip } from '@/lib/audio';
import { secondsLabel, type Configuration } from '@/lib/contracts';
import { intervalCoverage, planScan, scanCSV, scanStats, timelineHits, type ScanAllowance, type ScanInput, type ScanJob, type ScanSummary, type ScanWindow } from '@/lib/scan';

type Props = { audio: AudioBuffer | null; sourceURL: string; fileHash: string; filename: string; configuration: Configuration | null; locked: boolean; onChooseFile: () => void; onBusyChange: (running: boolean) => void; onComplete: () => void };
type JobResponse = { job: ScanJob; allowance: ScanAllowance };
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(35_000) });
  const body = await response.json() as T & { error?: string };
  if (!response.ok || body.error) throw new Error(body.error || 'The scan service could not respond.');
  return body;
}
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const label = (ms: number) => secondsLabel(ms / 1000);
const stateLabels = { pending: 'Not checked', processing: 'Processing', matched: 'Match', no_match: 'No match', silent: 'Silence skipped', error: 'Unresolved' };

export function ScanWorkspace({ audio, sourceURL, fileHash, filename, configuration, locked, onChooseFile, onBusyChange, onComplete }: Props) {
  const [mode, setMode] = useState<ScanInput['mode']>('survey');
  const [samples, setSamples] = useState(5);
  const [available, setAvailable] = useState<ScanAllowance | null>(null);
  const [jobs, setJobs] = useState<ScanSummary[]>([]);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [running, setRunning] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const executing = useRef(false), stop = useRef(false), mounted = useRef(true);
  const maxSamples = Math.min(20, configuration?.dailyLimit || 5);
  const effectiveSamples = Math.min(samples, maxSamples);
  const durationMs = audio ? Math.min(1_200_000, Math.round(audio.duration * 1000)) : 0;
  const plan = useMemo(() => durationMs >= 2000 ? planScan(durationMs, mode, effectiveSamples) : [], [durationMs, mode, effectiveSamples]);
  const stats = job ? scanStats(job) : null;
  const hits = useMemo(() => job ? timelineHits(job.segments) : [], [job]);
  const sameFile = !!job && fileHash === job.fileHash && !!audio;
  const remaining = available?.remaining ?? configuration?.remainingScans ?? 0;
  const refresh = useCallback(async () => {
    try {
      const response = await request<{ jobs: ScanSummary[]; allowance: ScanAllowance }>('/api/scans');
      if (!mounted.current) return;
      setJobs(response.jobs); setAvailable(response.allowance); setHistoryError('');
    } catch { if (mounted.current) setHistoryError('Saved scans could not be loaded.'); }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => { if (!locked) void refresh(); }, [locked, refresh]);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const update = (response: JobResponse) => { if (mounted.current) { setJob(response.job); setAvailable(response.allowance); } };
  async function openJob(id: string) {
    if (executing.current || locked) return;
    setLoading(true); setError(''); setNotice(''); setSelected(null);
    try { update(await request<JobResponse>('/api/scans?id=' + encodeURIComponent(id))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the scan.'); }
    finally { setLoading(false); }
  }
  async function run(initial: ScanJob) {
    if (!audio || fileHash !== initial.fileHash) { setError('Choose the same original file to resume. Your saved results are still available.'); return; }
    if (executing.current) return;
    executing.current = true; stop.current = false; setPauseRequested(false); setRunning(true); onBusyChange(true); setError(''); setNotice('');
    let current = initial;
    try {
      const latest = await request<JobResponse>('/api/scans?id=' + current.id); current = latest.job; update(latest);
      for (let index = 0; index < current.segments.length; index++) {
        if (stop.current || !mounted.current) break;
        const segment = current.segments[index];
        if (segment.state === 'processing') { setNotice('Another request is finishing this section. Refresh progress shortly; it will not be sent twice.'); break; }
        if (segment.state !== 'pending') continue;
        const clip = await prepareClip(audio, segment.startMs / 1000, 1, false, (segment.endMs - segment.startMs) / 1000, true);
        if (stop.current || !mounted.current) break;
        const response = await request<JobResponse>(`/api/scans/segment?id=${current.id}&index=${index}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Source-SHA256': fileHash }, body: clip });
        current = response.job; update(response);
        if (current.segments[index].state === 'processing') { setNotice('This section is still processing. Refresh progress before continuing.'); break; }
      }
      if (mounted.current) {
        const done = scanStats(current);
        if (done.completed === done.total) setNotice(done.errors ? 'Scan finished with unresolved sections. They are marked in the timeline.' : 'The planned sections are finished. Review the coverage and matches below.');
        else if (stop.current) setNotice('Paused. Completed sections are saved; resume with this same file.');
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'The connection was interrupted. Your saved progress is kept.');
        try { update(await request<JobResponse>('/api/scans?id=' + current.id)); } catch { /* Keep the last visible progress. */ }
      }
    } finally {
      executing.current = false;
      if (mounted.current) { setRunning(false); setPauseRequested(false); onBusyChange(false); onComplete(); void refresh(); }
    }
  }
  async function start() {
    if (!audio || !fileHash || locked || loading || executing.current) return;
    setLoading(true); onBusyChange(true); setError(''); setNotice(''); setSelected(null);
    try {
      const input: ScanInput = { id: crypto.randomUUID(), fileHash, filename: filename.slice(0, 180), durationMs, mode, samples: effectiveSamples };
      const response = await request<JobResponse>('/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      update(response); await run(response.job);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the scan.'); void refresh(); }
    finally { setLoading(false); onBusyChange(false); }
  }
  async function remove() {
    if (!job || executing.current) return;
    setLoading(true);
    try { await request('/api/scans?id=' + job.id, { method: 'DELETE' }); setJob(null); setNotice('Scan deleted. Songs in Saved finds are kept separately.'); void refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the scan.'); }
    finally { setLoading(false); }
  }
  function jump(window: ScanWindow) {
    setSelected(window.index);
    if (!sameFile || !player.current) return;
    player.current.currentTime = window.startMs / 1000;
    void player.current.play().catch(() => setNotice('Use the audio player to replay this section.'));
  }
  const selectedSegment = job?.segments.find(s => s.index === selected);
  return <section className="section scan-workspace" id="scan" aria-label="Video song timeline">
    <div className="section-head"><div><span className="eyebrow">Music throughout a recording</span><h2>Build a song timeline</h2></div><span className="pill"><AudioLines size={15}/>{remaining} free scans available</span></div>
    <div className="scan-layout">
      <div className="panel scan-planner">
        <div className="row between"><h3>Plan a scan</h3><button className="btn ghost" onClick={onChooseFile} disabled={locked || loading}><FolderOpen size={16}/>{audio ? 'Change file' : 'Choose file'}</button></div>
        {audio ? <><p className="scan-filename">{filename}</p><p className="small muted">{label(durationMs)} · original speed · your full file stays on this device</p>
          <Tabs value={mode} onValueChange={value => setMode(value as ScanInput['mode'])}><TabsList className="scan-mode-tabs" aria-label="Scan coverage"><TabsTrigger value="survey" disabled={locked || loading}>Quick survey</TabsTrigger><TabsTrigger value="continuous" disabled={locked || loading}>Continuous scan</TabsTrigger></TabsList></Tabs>
          <p className="small muted">{mode === 'survey' ? 'Check sections spread across the recording. Songs in the gaps may be missed.' : 'Check consecutive sections across the whole recording. A section can still contain music the provider misses.'}</p>
          {mode === 'survey' && <div className="scan-samples"><label htmlFor="scan-samples" className="field-label">Up to {effectiveSamples} sections</label><Slider id="scan-samples" aria-label="Number of survey sections" min={1} max={Math.max(2, maxSamples)} step={1} value={[effectiveSamples]} onValueChange={v => setSamples(Math.min(v[0], maxSamples))} disabled={locked || loading || maxSamples < 2}/></div>}
          <div className="coverage-rail planned" aria-label={`Planned coverage: ${Math.round(intervalCoverage(plan) / durationMs * 100)} percent`}>{plan.map(w => <span key={w.index} style={{ left: `${100 * w.startMs / durationMs}%`, width: `${100 * (w.endMs - w.startMs) / durationMs}%` }}/>)}</div><div className="row between micro muted"><span>0:00</span><span>{label(durationMs)}</span></div>
          <dl className="scan-estimate"><div><dt>Maximum scans</dt><dd>{plan.length}</dd></div><div><dt>Audio to check</dt><dd>{label(intervalCoverage(plan))} <span>of {label(durationMs)}</span></dd></div></dl>
          {plan.length > remaining && <p className="scan-warning" role="status">This plan needs {plan.length} scans; {remaining} are available. {mode === 'continuous' ? 'Choose a survey or a shorter recording.' : 'Reduce the section count or return when the allowance recovers.'}</p>}
          {!configuration?.recognition && <p className="small muted">Audio matching is awaiting activation. You can inspect the scan plan now.</p>}
          {!fileHash && <p className="small muted">Open this site over HTTPS to start or resume a scan. Clip previews and planning are available here.</p>}
          <button className="btn full" onClick={start} disabled={locked || loading || !fileHash || !configuration?.recognition || !plan.length || plan.length > remaining}><Play size={16}/>{loading && !running ? 'Saving plan…' : `Start · up to ${plan.length} scans`}</button>
          <p className="micro muted">Cached results and silence do not use a scan. No-match and failed provider requests can. The shared allowance is checked before each section.</p>
        </> : <div className="scan-placeholder"><AudioLines size={30}/><p>Choose an audio or video file to see exactly how much will be checked before you start.</p><p className="small muted">Up to 40 MB and 20 minutes, depending on your browser's audio support.</p></div>}
      </div>
      <div className="panel scan-history"><div className="row between"><h3>Recent scans</h3><button className="btn ghost" aria-label="Refresh recent scans" onClick={refresh} disabled={locked || loading}><RefreshCw size={15}/></button></div><p className="small muted">Saved for 7 days in this browser's collection. Keep this page open while scanning.</p>
        {historyError ? <p role="alert" className="scan-warning">{historyError} <button onClick={refresh} className="btn ghost">Retry</button></p> : jobs.length ? <div className="scan-history-list">{jobs.map(s => <button className={`scan-history-item ${job?.id === s.id ? 'selected' : ''}`} key={s.id} onClick={() => openJob(s.id)} disabled={locked || loading}><span>{s.filename}</span><small>{s.mode === 'continuous' ? 'Continuous' : 'Survey'} · {s.completed}/{s.total} sections</small></button>)}</div> : <p className="small muted">Your scan plans and results will appear here. No account needed.</p>}
      </div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {job && stats && <div className="panel scan-results"><div className="section-head"><div><span className="eyebrow">{job.mode === 'continuous' ? 'Continuous scan' : 'Survey results'}</span><h3>{job.filename}</h3></div><div className="row scan-actions">
      {running ? <button className="btn secondary" onClick={() => { stop.current = true; setPauseRequested(true); }} disabled={pauseRequested}><Pause size={16}/>{pauseRequested ? 'Pausing after this section…' : 'Pause'}</button> : stats.completed < stats.total && <button className="btn" onClick={() => run(job)} disabled={locked || loading || !sameFile || !configuration?.recognition}><Play size={16}/>Resume</button>}
      <button className="btn ghost" onClick={() => openJob(job.id)} disabled={locked || loading} aria-label="Refresh scan progress"><RefreshCw size={16}/></button>
      <AlertDialog><AlertDialogTrigger asChild><button className="btn ghost" disabled={locked || loading} aria-label="Delete this scan"><Trash2 size={16}/></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this scan?</AlertDialogTitle><AlertDialogDescription>This deletes the plan and timeline. Your saved songs are kept separately. Export first if you need a copy.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep scan</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete scan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div></div>
      <div className="row between small"><span role="status">{running ? <LoaderCircle size={14} className="spin inline-icon"/> : stats.completed === stats.total ? <Check size={14} className="inline-icon"/> : null}{stats.completed} of {stats.total} sections finished</span><span className="muted">{Math.round(stats.checkedMs / job.durationMs * 100)}% checked by recognition</span></div><Progress value={100 * stats.completed / Math.max(1, stats.total)} aria-label="Scan progress" className="scan-progress"/>
      <div className="coverage-rail results" aria-label="Scan coverage timeline">{job.segments.map(s => <button key={s.index} className={`segment-${s.state} ${selected === s.index ? 'selected' : ''}`} aria-label={`${label(s.startMs)} to ${label(s.endMs)}: ${stateLabels[s.state]}`} title={`${label(s.startMs)}–${label(s.endMs)} · ${stateLabels[s.state]}`} onClick={() => jump(s)} style={{ left: `${100 * s.startMs / job.durationMs}%`, width: `${100 * (s.endMs - s.startMs) / job.durationMs}%` }}/>)}</div><div className="row between micro muted"><span>0:00</span><span>{label(job.durationMs)}</span></div>
      <div className="scan-legend"><span><i className="segment-matched"/>Matched</span><span><i className="segment-no_match"/>No match</span><span><i className="segment-silent"/>Silence</span><span><i className="segment-error"/>Unresolved</span><span><i className="segment-pending"/>Not checked</span></div>
      <p className="small muted">{label(stats.checkedMs)} checked · {label(stats.silentMs)} silence skipped · {stats.providerCalls} provider requests · {stats.cacheHits} cached sections. Gaps and unresolved sections may contain other songs.</p>
      {sameFile ? <audio ref={player} src={sourceURL} controls preload="metadata" aria-label="Replay original recording"/> : <p className="notice">Select <strong>{job.filename}</strong> again to replay or resume. Its contents must match the original file. <button className="btn ghost" onClick={onChooseFile} disabled={locked || loading}>Choose file</button></p>}
      {selectedSegment && <p className="small">Selected {label(selectedSegment.startMs)}–{label(selectedSegment.endMs)}: {stateLabels[selectedSegment.state]}. {selectedSegment.result?.error}</p>}
      <p className="small muted">Each range shows sections containing a match, not the song's exact start or end. Adjacent matches for the same recording are grouped; unchecked gaps are never filled in.</p>
      {hits.length ? <div className="timeline-list">{hits.map((hit, index) => <div className="timeline-entry" key={`${hit.song.id}:${hit.startMs}`}><button className="timeline-time" disabled={!sameFile} onClick={() => jump({ index: job.segments.find(s => s.startMs === hit.startMs)?.index || 0, startMs: hit.startMs, endMs: hit.endMs })}><Play size={14}/><strong>{label(hit.startMs)}–{label(hit.endMs)}</strong><span>{hit.samples} matched {hit.samples === 1 ? 'section' : 'sections'}</span></button><SongCard song={{ ...hit.song, sampleAt: undefined }}/></div>)}</div> : <div className="empty-box"><strong>{stats.completed ? 'No songs identified in the finished sections.' : 'Your timeline will appear as sections finish.'}</strong><p className="small">A no-match result does not mean the recording contains no music.</p></div>}
      <div className="scan-export"><button className="btn secondary" onClick={() => download('whatsong-timeline.csv', scanCSV(job), 'text/csv;charset=utf-8')}><Download size={16}/>Export CSV</button><button className="btn ghost" onClick={() => download('whatsong-timeline.json', JSON.stringify({ ...job, fileHash: undefined, stats, timeline: hits, note: 'Ranges are submitted windows, not exact song boundaries.' }, null, 2), 'application/json')}><Download size={16}/>Export JSON</button><span className="micro muted">Exports include pending, no-match and unresolved sections.</span></div>
    </div>}
  </section>;
}
