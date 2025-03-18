// src/app/layout.tsx
import { Inter } from 'next/font/google';
import './globals.css';
import './tailwind.css';
import type { Metadata } from 'next';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter', 
});

export const metadata: Metadata = {
  title: 'Super Kees Online - AI Transcriptie & Samenvatting',
  description: 'Transformeer uw vergaderingen in bruikbare samenvattingen met AI-technologie',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={inter.className}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="antialiased">
        <main>{children}</main>
        <footer className="mt-auto py-6 text-center text-sm text-neutral-500">
          <p>© {new Date().getFullYear()} Super Kees Online - Powered by AI</p>
        </footer>
      </body>
    </html>
  );
}
