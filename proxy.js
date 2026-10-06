import { NextResponse } from 'next/server';
import { COOKIE, hasAccess } from './lib/auth';

export function proxy(request) {
  const path = request.nextUrl.pathname;
  const nonce = btoa(crypto.randomUUID());
  const isDevelopment = process.env.NODE_ENV === 'development';
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://i.ytimg.com",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-src https://www.youtube-nocookie.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
  const publicPath = path.startsWith('/_next/static/') || path.startsWith('/_next/webpack-hmr') ||
    path === '/' || path === '/portal' || path.startsWith('/portal/') || path.startsWith('/a/') ||
    path === '/api/archives' || path.startsWith('/api/archives/') ||
    path.startsWith('/api/archive-media/') || path.startsWith('/api/share/') ||
    ['/unlock', '/api/unlock', '/favicon.svg', '/robots.txt'].includes(path);
  let response;
  if (!publicPath && !hasAccess(request.cookies.get(COOKIE)?.value)) {
    response = path.startsWith('/media/')
      ? new NextResponse(null, { status: 401 })
      : NextResponse.redirect(new URL('/unlock', request.url));
  } else response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!path.startsWith('/_next/static/')) response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}
