# Recognition benchmark

The runner measures the production AudD adapter against audio with known answers. No real accuracy score is available yet: the owner token and a verified audio corpus are still required. Automated fixture tests prove behavior, not recognition quality.

## Prepare a representative corpus

Start with 50–100 short clips you have permission to submit, including clean commercial recordings, noise, speech over music, quiet passages, sped-up/slowed edits, genre/language variety, covers/remixes, and deliberate no-music negatives. Keep distinct groups in the manifest. Label the actual version of each recording by hand. A song missing from a provider catalog still has a known title: do not relabel it as a negative to improve the score.

Copy `docs/benchmark.example.json` to an ignored folder such as `.sites-runtime/corpus/manifest.json`. Put the WAV files relative to that manifest. The example is a template, not an included dataset. Each input must be 2–12 seconds of mono 22,050 Hz signed 16-bit PCM WAV, at most 600,000 bytes. Use the website's clip preparation or an audio editor. Do not commit recordings, credentials or private reports. `expected: null` means a deliberate negative where no identification should be returned. Optional `expected.aliases` is an array of acceptable `{ "title": "…", "artist": "…" }` pairs; specify these before running, with a recorded reason for any later correction.

## Validate, then explicitly run

From the project root, with dependencies installed:

```sh
node scripts/benchmark-recognition.mjs .sites-runtime/corpus/manifest.json
```

This validates every file and reports the request count and estimated maximum cost. It makes no network requests. For a live run, provide your own `AUDD_API_TOKEN` through your shell's secure environment or secret manager, then:

```sh
node scripts/benchmark-recognition.mjs .sites-runtime/corpus/manifest.json --run --max-requests 100 --request-cost-usd 0.005
```

The explicit maximum must cover the corpus; at most 250 clips are accepted. Confirm your actual provider price and override the per-request estimate accordingly. This is an operator CLI: it calls AudD directly, bypassing the website's visitor/global allowances and cache. Its explicit request ceiling is independent of those allowances. The public `test` token is rejected.

Requests run sequentially with the production adapter's timeout. The runner does not retry; it stops after three consecutive provider errors. Ctrl-C stops after the current request settles. Re-running starts a new paid experiment, not a resume. A timeout or interrupted request can still be billed. Each request is checkpointed before submission and after the response; an unfinished `inflight` record means its result is unknown. Do not assume it was free.

Reports are written with restricted file permissions under `.sites-runtime/benchmarks/`. They contain labels, returned metadata, input/source hashes, per-case outcomes, timings, and grouped metrics, but no audio or token. The console prints the report path. Preserve a report alongside its private corpus before publishing claims.

## Interpret the report

- **Precision:** correct identities / all returned identities. Wrong known-song answers and false positives on negative clips count against it.
- **Known recall:** correct identities / attempted known-song cases, including no-match responses, errors and unresolved calls in the denominator.
- **Negative false-positive rate:** returned identities / attempted negative cases. Read this with the error/completion rate; an outage is not evidence of good negative rejection.
- **End-to-end accuracy:** correct identities plus correct negative rejections / attempted cases. Errors are not successes. Pending cases are not evidence; completion rate makes unfinished runs visible.
- **Latency:** median and p95 of completed request attempts, including errors. This measures adapter/provider time, not full-file decoding or browser latency.
- **Cost:** estimated maximum from attempts × the supplied rate, including errors; cost per correct match uses that conservative estimate. It is not an invoice.

Scoring normalizes case, whitespace and punctuation, then compares the full title and artist. It does not silently remove remix/version labels. Inspect mismatches and adjudicate metadata aliases consistently before drawing product conclusions. Small convenience samples do not establish population accuracy.

First release decision: verify key validity, run the complete corpus, inspect every false positive and unresolved case, and report results by group. Only then choose spending limits or a paid long-scan offer. A future provider comparison should reuse the same corpus and metrics; this release includes only the AudD adapter.
