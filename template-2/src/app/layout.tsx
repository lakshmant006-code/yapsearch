import type { Metadata, Viewport } from 'next';
import { Bungee, Fredoka } from 'next/font/google';
import './globals.css';

const round = Fredoka({ weight: ['500', '600', '700'], subsets: ['latin'], variable: '--font-round' });
const stamp = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-stamp' });

export const metadata: Metadata = {
  title: 'F.A.K.E.',
  description: 'A sarcastic llama tells you whether your accent is real. Just for fun.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FFFDF8' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${round.variable} ${stamp.variable}`}>
      <body>{children}</body>
    </html>
  );
}
