import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import ArchiveCanvasView from '../../../components/ArchiveCanvasView';
import { hasViewerSession, readArchive, viewerCookieName } from '../../../lib/archive-store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  return { title: archive?.title || 'private archive' };
}

export default async function SharedArchivePage({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const token = (await cookies()).get(viewerCookieName(archiveId))?.value;
  if (!hasViewerSession(archiveId, token)) redirect(`/a/${archiveId}/unlock`);

  return <main id="main" className="notebook shared-archive">
    <header className="shared-opening">
      <h1>{archive.title}</h1>
    </header>
    <nav className="shared-filter" aria-label="archive view"><span>all entries</span></nav>
    <ArchiveCanvasView archive={{ id: archive.id, canvas: archive.canvas, items: archive.items }} />
    <footer><p>this is an archive, not an argument.</p><form action={`/api/share/${archive.id}/lock`} method="post"><button className="text-button" type="submit">close the archive</button></form></footer>
  </main>;
}
