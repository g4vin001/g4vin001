import { boundedBody, cleanup, identity, json, readJSON, sameOrigin } from '@/lib/server';
import { parsePCM, validateMediaURL } from '@/lib/contracts';
import { assertRecognitionReady, recognize, RecognitionError } from '@/lib/recognition';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed.' }, 403);
  const who = await identity(request);
  try {
    assertRecognitionReady();
    const key = request.headers.get('idempotency-key') || '';
    if (!/^[a-f0-9-]{36}$/.test(key)) return json({ error: 'Refresh the page and try again.' }, 400, who.cookie);
    let file: Blob | undefined, url: string | undefined, sampleAt = 0;
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await readJSON(request, 4096); url = validateMediaURL(String(body.url || ''));
    } else {
      const bytes = await boundedBody(request, 600000); parsePCM(bytes); file = new Blob([bytes], { type: 'audio/wav' });
      sampleAt = Number(request.headers.get('x-sample-start') || 0);
      if (!Number.isFinite(sampleAt) || sampleAt < 0 || sampleAt > 1200) sampleAt = 0;
    }
    const result = await recognize({ file, url }, who, key, sampleAt);
    try { await cleanup(); } catch { /* Housekeeping must not hide a paid result. */ }
    return json(result, 200, who.cookie);
  } catch (e) {
    if (e instanceof RecognitionError) return json({ error: e.message, code: e.code }, e.status, who.cookie);
    const message = e instanceof Error ? e.message : '';
    if (message === 'BODY_TOO_LARGE') return json({ error: 'The prepared clip is too large.' }, 413, who.cookie);
    if (/^(Paste|Use|This needs|That link|Submit|The audio)/.test(message) || e instanceof SyntaxError) return json({ error: message || 'Invalid request.' }, 400, who.cookie);
    return json({ error: 'Recognition is temporarily unavailable.', code: 'PROVIDER_UNAVAILABLE' }, 503, who.cookie);
  }
}
