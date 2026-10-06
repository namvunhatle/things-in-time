'use client';

import { Analytics } from '@vercel/analytics/next';

// Archive ids and share slugs are private: report /a/[slug] and /portal/[id] instead of the real
// values. The #fragment (the link secret) is never part of what gets sent.
function redact(event) {
  const url = new URL(event.url);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname
    .replace(/^\/a\/[^/]+/, '/a/[slug]')
    .replace(/^\/portal\/(?!$)[^/]+/, '/portal/[id]')
    .replace(/^\/api\/(share|archives|archive-media)\/[^/]+/, '/api/$1/[id]');
  return { ...event, url: url.toString() };
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={redact} />;
}
