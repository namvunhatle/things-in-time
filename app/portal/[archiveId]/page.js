import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import ArchiveEditor from '../../../components/ArchiveEditor';
import { editorCookieName, hasEditorSession, readArchive } from '../../../lib/archive-store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'archive editor' };

export default async function ArchiveEditorPage({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, editorToken)) notFound();

  return <main id="main" className="editor-shell">
    <ArchiveEditor archive={{ id: archive.id, shareSlug: archive.shareSlug || archive.id, title: archive.title, canvas: archive.canvas, items: archive.items }} />
  </main>;
}
