import type { Metadata } from 'next';
import FooterWrapper from '@/components/layout/FooterWrapper';
import MobileInstallBanner from '@/components/MobileInstallBanner';
import { WalletProvider } from '@/context/WalletContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'College Units Fantasy',
  description: 'Draft whole CFB position units. Real depth charts. True college football strategy.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=0.9, minimum-scale=0.5, maximum-scale=5, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CUF" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Anton&family=Oswald:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          html { height: -webkit-fill-available; }
          html, body { overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
          body {
            min-height: 100vh;
            min-height: -webkit-fill-available;
            overscroll-behavior-y: none;
            padding-bottom: env(safe-area-inset-bottom);
          }
        `}</style>
      </head>
      <body style={{ margin: 0, background: '#070a12', color: '#e4edf7', fontFamily: "'Space Grotesk', Inter, sans-serif", display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <WalletProvider>
          <div style={{ flex: 1 }}>{children}</div>
          <FooterWrapper />
          <MobileInstallBanner />
        </WalletProvider>
      </body>
    </html>
  );
}
