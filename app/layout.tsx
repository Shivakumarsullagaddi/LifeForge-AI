import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'LifeForge AI - Personal Life, Study & Career Coach',
  description: 'A private AI companion for disciplined habits, smart study routines, placement preparation, and life goals.',
  openGraph: {
    title: 'LifeForge AI - Personal Life, Study & Career Coach',
    description: 'A private AI companion for disciplined habits, smart study routines, placement preparation, and life goals.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LifeForge AI - Personal Life, Study & Career Coach',
    description: 'A private AI companion for disciplined habits, smart study routines, placement preparation, and life goals.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
