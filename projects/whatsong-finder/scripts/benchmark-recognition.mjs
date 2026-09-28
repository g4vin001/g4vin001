import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { benchmarkMetrics } from './benchmark-metrics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = z.object({ title: z.string().trim().min(1).max(250), artist: z.string().trim().min(1).max(250) }).strict();
const schema = z.object({ version: z.literal(1), cases: z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), file: z.string().min(1).max(1000),
  group: z.string().min(1).max(80), expected: label.extend({ aliases: z.array(label).max(10).optional() }).nullable(),
}).strict()).min(1).max(250) }).strict();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadAdapter() {
  // Compile the production adapter and WAV validator, so the benchmark exercises
  // the same normalization and timeout behavior as the website.
  const destination = resolve(root, '.sites-runtime/benchmark-modules');
  await mkdir(destination, { recursive: true });
  const sourceHashes = {};
  for (const name of ['contracts', 'providers']) {
    const source = await readFile(resolve(root, 'lib', name + '.ts'), 'utf8');
    sourceHashes[name] = hash(source);
    const output = ts.transpileModule(source.replaceAll("'./contracts'", "'./contracts.mjs'"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    await writeFile(resolve(destination, name + '.mjs'), output);
  }
  return { ...(await import(pathToFileURL(resolve(destination, 'providers.mjs')))),
    ...(await import(pathToFileURL(resolve(destination, 'contracts.mjs')))), sourceHashes };
}

function options(args) {
  const result = { run: false, manifest: '', maxRequests: 0, requestCostUSD: 0.005 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--run') result.run = true;
    else if (arg === '--max-requests' || arg === '--request-cost-usd') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid ' + arg);
      result[arg === '--max-requests' ? 'maxRequests' : 'requestCostUSD'] = value;
    } else if (arg.startsWith('-') || result.manifest) throw new Error('Unexpected argument: ' + arg);
    else result.manifest = arg;
  }
  if (!result.manifest) throw new Error('Usage: node scripts/benchmark-recognition.mjs manifest.json [--run --max-requests N] [--request-cost-usd 0.005]');
  if (!Number.isInteger(result.maxRequests) || result.maxRequests > 250) throw new Error('Maximum requests must be an integer from 1 to 250 for a live run.');
  return result;
}

async function main() {
  const config = options(process.argv.slice(2));
  const manifestPath = resolve(config.manifest);
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = schema.parse(JSON.parse(manifestText));
  if (new Set(manifest.cases.map(c => c.id)).size !== manifest.cases.length) throw new Error('Case IDs must be unique.');
  const adapter = await loadAdapter();
  const cases = [];
  // Validate the entire corpus before making even one paid call.
  for (const item of manifest.cases) {
    const bytes = await readFile(resolve(dirname(manifestPath), item.file));
    if (bytes.length > 600_000) throw new Error(item.id + ': WAV exceeds 600,000 bytes.');
    const durationSeconds = adapter.parsePCM(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    cases.push({ ...item, bytes, durationSeconds, sha256: hash(bytes) });
  }
  const plan = { cases: cases.length, maximumRequests: cases.length, requestCostUSD: config.requestCostUSD,
    estimatedMaximumCostUSD: Number((cases.length * config.requestCostUSD).toFixed(6)), liveRun: config.run };
  console.log(JSON.stringify(plan, null, 2));
  if (!config.run) { console.log('Validation only. No audio submitted and no provider requests made.'); return; }
  if (config.maxRequests < cases.length) throw new Error('The explicit --max-requests limit must cover the entire corpus. No calls made.');
  const token = (process.env.AUDD_API_TOKEN || '').trim();
  if (!token || token === 'test') throw new Error('A private AUDD_API_TOKEN is required. The public test token is not accepted.');
  const provider = new adapter.AudDRecognizer(token);
  const folder = resolve(root, '.sites-runtime/benchmarks');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const reportPath = resolve(folder, 'run-' + Date.now() + '-' + randomUUID() + '.json');
  const report = { version: 1, provider: provider.name, startedAt: new Date().toISOString(),
    manifest: basename(manifestPath), manifestSHA256: hash(manifestText), sourceHashes: adapter.sourceHashes,
    requestCostUSD: config.requestCostUSD, maxRequests: config.maxRequests, status: 'running',
    notes: 'Cost is an estimate including errors. No retries or app-cache reuse. Unfinished cases are not accuracy evidence.',
    cases: cases.map(({ bytes, file, ...item }) => ({ ...item, state: 'pending' })) };
  const save = async () => {
    report.metrics = benchmarkMetrics(report.cases, config.requestCostUSD);
    await writeFile(reportPath + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    await rename(reportPath + '.tmp', reportPath);
  };
  let stop = false, consecutiveErrors = 0;
  const halt = () => { stop = true; };
  process.on('SIGINT', halt); process.on('SIGTERM', halt);
  await save();
  console.log('Report: ' + reportPath);
  try {
    for (let i = 0; i < cases.length && !stop; i++) {
      const row = report.cases[i];
      row.state = 'inflight'; row.startedAt = new Date().toISOString(); await save();
      const started = performance.now();
      try {
        row.song = await provider.recognize({ file: new Blob([cases[i].bytes], { type: 'audio/wav' }) });
        row.state = 'complete'; consecutiveErrors = 0;
      } catch {
        // Provider/network errors can include account details. Keep them out of reports.
        row.state = 'error'; row.error = 'Provider request did not complete; it may still be billable.'; consecutiveErrors++;
      }
      row.latencyMs = Math.round(performance.now() - started); await save();
      console.log(`${i + 1}/${cases.length}: ${row.id} — ${row.state}`);
      if (consecutiveErrors >= 3) { stop = true; report.stopReason = 'Three consecutive provider errors; remaining cases were not sent.'; }
    }
    report.status = report.cases.every(r => r.state === 'complete' || r.state === 'error') ? 'finished' : 'interrupted';
    report.finishedAt = new Date().toISOString(); await save();
    console.log(JSON.stringify(report.metrics, null, 2));
  } finally { process.off('SIGINT', halt); process.off('SIGTERM', halt); }
}

main().catch(error => {
  console.error(error instanceof z.ZodError ? 'Invalid benchmark manifest: ' + error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ') : error.message);
  process.exitCode = 1;
});
