import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'College Units Fantasy',
  description: 'Draft whole CFB position units. Real depth charts. True college football strategy.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: '#05080f', color: '#e8edf5', fontFamily: 'Inter, sans-serif' }}>{children}</body>
    </html>
  );
}
