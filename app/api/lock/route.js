import { NextResponse } from 'next/server';
import { COOKIE } from '../../../lib/auth';
import { trustedRequestBase } from '../../../lib/request-origin';
export async function POST(request) {
  const base = trustedRequestBase(request);
  if (!base) return new NextResponse(null, { status: 403 });
  const response = NextResponse.redirect(new URL('/unlock', base), 303);
  response.cookies.set(COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
