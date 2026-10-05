import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { hasViewerSession, readArchive, viewerCookieName } from '../../../../lib/archive-store';

export const dynamic = 'force-dynamic';

export default async function SharedUnlockPage({ params, searchParams }) {
  const { archiveId } = await params;
  const { error } = await searchParams;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const token = (await cookies()).get(viewerCookieName(archiveId))?.value;
  if (hasViewerSession(archiveId, token)) redirect(`/a/${archiveId}`);

  return <main id="main" className="gate">
    <p className="eyebrow">a private archive</p>
    <h1>{archive.title}</h1>
    <form action={`/api/share/${archiveId}/unlock`} method="post">
      <label htmlFor="passcode">password</label>
      <div className="gate-input"><input id="passcode" name="passcode" type="password" required autoComplete="current-password" maxLength={128} aria-describedby={error ? 'gate-error' : undefined} aria-invalid={error ? true : undefined} /><button type="submit">open</button></div>
      {error && <p className="gate-error" id="gate-error" role="alert">that password didn’t match. try again.</p>}
    </form>
  </main>;
}
