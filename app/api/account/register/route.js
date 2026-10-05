import { NextResponse } from 'next/server';
import { accountCookieName, accountSessionSeconds, createAccount, createAccountSession } from '../../../../lib/account-store';
import { trustedRequestBase } from '../../../../lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!trustedRequestBase(request)) return Response.json({ error: 'request denied.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'request too large.' }, { status: 413 });
  try {
    const account = await createAccount(await request.json());
    const response = NextResponse.json({ ok: true, username: account.username }, { status: 201 });
    response.cookies.set(accountCookieName, createAccountSession(account), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: accountSessionSeconds,
    });
    return response;
  } catch (error) {
    return Response.json({ error: error.message || 'could not create account.' }, { status: 400 });
  }
}
