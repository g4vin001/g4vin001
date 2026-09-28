import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkMetrics, correctMatch } from '../scripts/benchmark-metrics.mjs';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('benchmark scores errors, unknown clips and wrong labels without inflating recall', () => {
  const expected = { title: 'Known Song', artist: 'Artist' };
  const song = { ...expected };
  const rows = [
    { group: 'clean', expected, song, state: 'complete', latencyMs: 100 },
    { group: 'noisy', expected, song: null, state: 'complete', latencyMs: 200 },
    { group: 'noisy', expected, song: { title: 'Wrong Song', artist: 'Artist' }, state: 'complete', latencyMs: 300 },
    { group: 'noisy', expected, state: 'error', latencyMs: 400 },
    { group: 'unknown', expected: null, song, state: 'complete', latencyMs: 500 },
    { group: 'unknown', expected: null, song: null, state: 'complete', latencyMs: 600 },
    { group: 'clean', expected, state: 'pending' },
  ];
  const { overall, groups } = benchmarkMetrics(rows, 0.005);
  assert.equal(overall.precision, 1 / 3);
  assert.equal(overall.knownRecall, 1 / 4);
  assert.equal(overall.endToEndAccuracy, 2 / 6);
  assert.equal(overall.unknownFalsePositiveRate, 1 / 2);
  assert.equal(overall.completionRate, 5 / 7);
  assert.equal(overall.unresolved, 1);
  assert.equal(overall.pending, 1);
  assert.equal(overall.latencyP95Ms, 600);
  assert.equal(overall.estimatedMaximumCostUSD, 0.03);
  assert.equal(overall.estimatedCostPerCorrectMatchUSD, 0.03);
  assert.equal(groups.noisy.knownRecall, 0);
  assert.equal(groups.clean.pending, 1);
});
test('benchmark requires deliberate aliases and does not strip remix labels', () => {
  const expected = { title: 'My Song', artist: 'Artist' };
  assert.equal(correctMatch(expected, { title: 'MY SONG!', artist: 'Artist' }), true);
  assert.equal(correctMatch(expected, { title: 'My Song (Remix)', artist: 'Artist' }), false);
  assert.equal(correctMatch({ ...expected, aliases: [{ title: 'My Song (Remix)', artist: 'Artist' }] }, { title: 'My Song (Remix)', artist: 'Artist' }), true);
  assert.equal(benchmarkMetrics([{ expected, state: 'pending', group: 'clean' }], 0.005).overall.knownRecall, null);
});
test('benchmark CLI defaults to validation and refuses unbounded or public-token live calls', () => {
  const base = resolve('.sites-runtime'); mkdirSync(base, { recursive: true });
  const folder = mkdtempSync(base + '/benchmark-test-');
  try {
    const wav = Buffer.alloc(44 + 22050 * 2 * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    writeFileSync(folder + '/clip.wav', wav);
    const manifest = folder + '/manifest.json';
    writeFileSync(manifest, JSON.stringify({ version: 1, cases: [{ id: 'negative', file: 'clip.wav', group: 'silence', expected: null }] }));
    const run = args => spawnSync(process.execPath, ['scripts/benchmark-recognition.mjs', manifest, ...args], {
      env: { ...process.env, AUDD_API_TOKEN: 'test' }, encoding: 'utf8', timeout: 15000,
    });
    const dry = run([]); assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /No audio submitted/);
    const unbounded = run(['--run']); assert.equal(unbounded.status, 1); assert.match(unbounded.stderr, /--max-requests/);
    const publicToken = run(['--run', '--max-requests', '1']); assert.equal(publicToken.status, 1); assert.match(publicToken.stderr, /public test token/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
