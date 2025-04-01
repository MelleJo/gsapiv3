// src/app/layout.tsx
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/sonner"; // Import Toaster
import './globals.css';
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
        
        {/* Required for FFmpeg WebAssembly to work */}
        <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
        <meta httpEquiv="Cross-Origin-Embedder-Policy" content="require-corp" />
        
        {/* Updated Content Security Policy with more permissive settings for WebAssembly */}
        <meta 
          httpEquiv="Content-Security-Policy" 
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self' blob: https://* http://* data:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; frame-src 'self'"
        />
      </head>
      <body className="antialiased">
        <main>{children}</main>
        <Toaster /> {/* Add Toaster component */}
        <footer className="mt-auto py-6 text-center text-sm text-muted-foreground"> {/* Use theme color */}
          <p>© {new Date().getFullYear()} Super Kees Online</p>
        </footer>
      </body>
    </html>
  );
}
