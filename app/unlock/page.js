import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, hasAccess, configured } from '../../lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'private archive' };
export default async function Unlock({ searchParams }) {
  if (hasAccess((await cookies()).get(COOKIE)?.value)) redirect('/');
  const { error } = await searchParams;
  return <main id="main" className="gate">
    <p className="eyebrow">a private archive</p>
    <h1>things i couldn’t<br />say in time</h1>
    {configured() ? <form action="/api/unlock" method="post">
      <label htmlFor="passcode">passcode</label>
      <div className="gate-input"><input id="passcode" name="passcode" type="password" required autoComplete="current-password" maxLength={200} aria-describedby={error ? 'gate-error' : undefined} aria-invalid={error ? true : undefined} /><button type="submit">open</button></div>
      {error && <p className="gate-error" id="gate-error" role="alert">that passcode didn’t match. try again.</p>}
    </form> : <p className="gate-error">the notebook is closed for now.</p>}
  </main>;
}
