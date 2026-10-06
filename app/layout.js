import './globals.css';

export const metadata = {
  title: 'things i couldn’t say in time',
  description: 'create and share a private archive.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true, 'max-snippet': 0 } },
  icons: { icon: '/favicon.svg' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf9f6' };

export default function RootLayout({ children }) {
  return <html lang="en"><body><a className="skip-link" href="#main">skip to content</a>{children}</body></html>;
}
