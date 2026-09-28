import { variable } from '@/lib/server';
import { adsensePublisher, adsenseSellerLine } from '@/lib/monetization';
export async function GET() {
  const publisher = adsensePublisher(variable('ADSENSE_CLIENT_ID'));
  return new Response(publisher ? adsenseSellerLine(publisher) : '# No advertising sellers configured.\n', {
    status: publisher ? 200 : 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
