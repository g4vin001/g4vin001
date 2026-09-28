import type { Metadata } from 'next';
import { variable } from '@/lib/server';
import { adsensePublisher } from '@/lib/monetization';
import './globals.css';
const baseMetadata: Metadata = {
  metadataBase: new URL('https://whatsong-finder.paz-peter.chatgpt.site'),
  title: { default: 'WhatSongIsThis? — Find a song from sound, video or a clue', template: '%s | WhatSongIsThis?' },
  description: 'Identify music from a microphone recording, audio or video clip, or a direct media link. Trim and adjust a clip, save your finds, and listen on your favorite service.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: { title: 'WhatSongIsThis?', description: 'Heard something good? Find it here.', type: 'website' },
};
export function generateMetadata(): Metadata {
  const publisher = adsensePublisher(variable('ADSENSE_CLIENT_ID'));
  return { ...baseMetadata, ...(publisher ? { other: { 'google-adsense-account': publisher } } : {}) };
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
