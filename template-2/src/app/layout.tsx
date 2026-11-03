import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Accent Detector',
  description: 'Find out whether an accent is real or put on.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
