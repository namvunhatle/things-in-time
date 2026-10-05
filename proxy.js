import { NextResponse } from 'next/server';
import { COOKIE, hasAccess } from './lib/auth';

export function proxy(request) {
  const path = request.nextUrl.pathname;
  const publicPath = path.startsWith('/_next/static/') || path.startsWith('/_next/webpack-hmr') ||
    path === '/portal' || path.startsWith('/portal/') || path.startsWith('/a/') ||
    path === '/api/archives' || path.startsWith('/api/archives/') ||
    path.startsWith('/api/archive-media/') || path.startsWith('/api/share/') ||
    ['/unlock', '/api/unlock', '/favicon.svg', '/robots.txt'].includes(path);
  let response;
  if (!publicPath && !hasAccess(request.cookies.get(COOKIE)?.value)) {
    response = path.startsWith('/media/')
      ? new NextResponse(null, { status: 401 })
      : NextResponse.redirect(new URL('/unlock', request.url));
  } else response = NextResponse.next();
  if (!path.startsWith('/_next/static/')) response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  return response;
}
