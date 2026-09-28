import { safeLink, type Song } from './contracts';

export type RecognitionInput = { file?: Blob; url?: string };
export interface MusicRecognizer {
  readonly name: 'audd';
  recognize(input: RecognitionInput): Promise<Song | null>;
}

export class AudDRecognizer implements MusicRecognizer {
  readonly name = 'audd' as const;
  constructor(private token: string) {}
  async recognize(input: RecognitionInput): Promise<Song | null> {
    if (!this.token || this.token === 'test') throw new Error('PROVIDER_NOT_CONFIGURED');
    const form = new FormData();
    form.set('api_token', this.token); form.set('return', 'apple_music,spotify'); form.set('market', 'us');
    if (input.file) form.set('file', input.file, 'clip.wav');
    else if (input.url) form.set('url', input.url);
    else throw new Error('MISSING_AUDIO');
    const response = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
    const data = await response.json() as { status: string; result?: {
      title?: string; artist?: string; album?: string;
      spotify?: { id?: string; external_urls?: { spotify?: string }; album?: { images?: { url?: string }[] } };
      apple_music?: { url?: string; artwork?: { url?: string }; isrc?: string };
    } | null };
    if (data.status !== 'success') throw new Error('PROVIDER_UNAVAILABLE');
    const s = data.result;
    if (s === null) return null;
    if (!s) throw new Error('PROVIDER_INVALID_RESULT');
    if (typeof s.title !== 'string' || typeof s.artist !== 'string' || !s.title || !s.artist) throw new Error('PROVIDER_INVALID_RESULT');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.artist + ':' + s.title));
    const fallback = Array.from(new Uint8Array(bytes), c => c.toString(16).padStart(2, '0')).join('');
    return {
      id: 'audd:' + (s.apple_music?.isrc || s.spotify?.id || fallback), title: s.title.slice(0, 250), artist: s.artist.slice(0, 250),
      album: typeof s.album === 'string' ? s.album.slice(0, 250) : undefined,
      artwork: safeLink(s.spotify?.album?.images?.[0]?.url || s.apple_music?.artwork?.url?.replace('{w}', '300').replace('{h}', '300'), ['scdn.co', 'mzstatic.com']),
      spotify: safeLink(s.spotify?.external_urls?.spotify, ['open.spotify.com']), apple: safeLink(s.apple_music?.url, ['music.apple.com']), source: 'recognition',
    };
  }
}
