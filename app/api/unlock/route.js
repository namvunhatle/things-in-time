import { NextResponse } from 'next/server';
import { COOKIE, SESSION_SECONDS, matchesPasscode, createSession } from '../../../lib/auth';

export function GET(request) {
  const host = request.headers.get('host');
  if (!host) return new NextResponse(null, { status: 400 });
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0] || new URL(request.url).protocol.slice(0, -1);
  return NextResponse.redirect(new URL('/unlock', `${protocol}://${host}`), 303);
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return new NextResponse(null, { status: 403 });
  const localOpaqueOrigin = origin === 'null' && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
  let sameOrigin = false;
  if (origin !== 'null') {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }
  if (!localOpaqueOrigin && !sameOrigin) return new NextResponse(null, { status: 403 });
  const redirectBase = localOpaqueOrigin
    ? `${new URL(request.url).protocol}//${host}`
    : origin;
  if (Number(request.headers.get('content-length') || 0) > 4096) return new NextResponse(null, { status: 413 });
  const form = await request.formData();
  if (!matchesPasscode(form.get('passcode'))) {
    await new Promise(resolve => setTimeout(resolve, 750));
    return NextResponse.redirect(new URL('/unlock?error=1', redirectBase), 303);
  }
  const response = NextResponse.redirect(new URL('/', redirectBase), 303);
  response.cookies.set(COOKIE, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
