import { z } from 'zod';
const safeHttps = z.string().max(1500).refine(v => { try { return new URL(v).protocol === 'https:'; } catch { return false; } });
export const SongSchema = z.object({
  id: z.string().min(1).max(180), title: z.string().min(1).max(250), artist: z.string().min(1).max(250),
  album: z.string().max(250).optional(), artwork: safeHttps.optional(), apple: safeHttps.optional(), spotify: safeHttps.optional(),
  source: z.enum(['recognition','catalog']), sampleAt: z.number().min(0).max(7200).optional(),
});
export type Song = z.infer<typeof SongSchema>;
export type Configuration = { recognition: boolean; dailyLimit: number; remainingScans: number; maxFileMB: number; supportUrl: string | null; sponsor: { label: string; url: string; description: string } | null };
export function safeLink(value: unknown, hosts?: string[]): string | undefined {
  if (typeof value !== 'string' || value.length > 1500) return undefined;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!hosts || hosts.some(h => u.hostname === h || u.hostname.endsWith('.'+h))) ? u.href : undefined; } catch { return undefined; }
}
export function validateMediaURL(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Paste a complete HTTPS link to an audio or video file.'); }
  const h = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !h.includes('.') || h.endsWith('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) throw new Error('Use a public HTTPS media link without a password.');
  if (!/\.(mp3|wav|m4a|aac|ogg|flac|mp4|webm|mov)$/i.test(url.pathname)) throw new Error('This needs a direct audio or video file link. For YouTube, TikTok or Reels, use Listen → Record a browser tab, or upload a clip.');
  if (input.length > 1800) throw new Error('That link is too long. Upload the clip instead.');
  url.hash = ''; return url.href;
}
export function parsePCM(bytes: ArrayBuffer): number {
  const view = new DataView(bytes);
  const str = (n:number,len:number) => Array.from(new Uint8Array(bytes,n,len),c=>String.fromCharCode(c)).join('');
  if(bytes.byteLength < 44 || str(0,4)!=='RIFF' || str(8,4)!=='WAVE') throw new Error('Submit a prepared WAV clip.');
  let rate=0, channels=0, bits=0, format=0, size=0;
  for(let offset=12; offset+8<=bytes.byteLength;) {
    const id=str(offset,4), length=view.getUint32(offset+4,true);
    if(offset+8+length>bytes.byteLength) throw new Error('The audio clip is incomplete.');
    if(id==='fmt ' && length>=16) { format=view.getUint16(offset+8,true); channels=view.getUint16(offset+10,true); rate=view.getUint32(offset+12,true); bits=view.getUint16(offset+22,true); }
    if(id==='data') size+=length;
    offset+=8+length+(length%2);
  }
  const duration=size/(rate*channels*(bits/8));
  if(format!==1 || channels!==1 || bits!==16 || rate!==22050 || !Number.isFinite(duration) || duration<2 || duration>12.05) throw new Error('Use a 2–12 second mono audio clip prepared by this page.');
  return duration;
}
export function secondsLabel(v:number) { return `${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`; }
export function pcmPeak(bytes: ArrayBuffer): number {
  const view = new DataView(bytes); let peak = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const length = view.getUint32(offset + 4, true);
    if (offset + 8 + length > bytes.byteLength) break;
    if (view.getUint32(offset, false) === 0x64617461) {
      for (let i = offset + 8; i + 1 < offset + 8 + length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)) / 32768);
    }
    offset += 8 + length + (length % 2);
  }
  return peak;
}
export function csvCell(v:string|number) { const s=String(v); return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'; }
