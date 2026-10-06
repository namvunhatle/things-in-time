import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { hasViewerSession, readArchive, viewerCookieName } from '../../../../lib/archive-store';
import ArchiveUnlockForm from '../../../../components/ArchiveUnlockForm';

export const dynamic = 'force-dynamic';

export default async function SharedUnlockPage({ params, searchParams }) {
  const { archiveId } = await params;
  const { error } = await searchParams;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  if (archive.version === 2) redirect(`/a/${archiveId}`);
  const token = (await cookies()).get(viewerCookieName(archiveId))?.value;
  if (hasViewerSession(archiveId, token)) redirect(`/a/${archiveId}`);

  return <main id="main" className="gate">
    <p className="eyebrow">a private archive</p>
    <h1>{archive.title}</h1>
    <ArchiveUnlockForm archiveId={archiveId} initialError={Boolean(error)} />
  </main>;
}
