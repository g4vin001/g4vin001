// Verification metadata only. A publisher ID does not load an ad script or
// establish approval, consent configuration, fill rate, or revenue.
export function adsensePublisher(value: string): string | null {
  const id = value.trim();
  return /^ca-pub-\d{16}$/.test(id) && id !== 'ca-pub-0000000000000000' ? id : null;
}
export function adsenseSellerLine(publisher: string): string {
  const valid = adsensePublisher(publisher);
  if (!valid) throw new Error('Invalid AdSense publisher ID');
  return `google.com, ${valid.slice(3)}, DIRECT, f08c47fec0942fa0\n`;
}
