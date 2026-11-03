import type { Metadata, Viewport } from 'next';
import { Bowlby_One, DM_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const display = Bowlby_One({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const body = Instrument_Sans({ weight: ['400', '600', '700'], subsets: ['latin'], variable: '--font-body' });
const mono = DM_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'F.A.K.E.',
  description: 'Foreign Accent Knowledge Examiner. Your vowels have some explaining to do.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FFFAF4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
