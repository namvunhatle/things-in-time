import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import ArchiveEditor from '../../../components/ArchiveEditor';
import PersonalArchiveEditor from '../../../components/PersonalArchiveEditor';
import { editorCookieName, hasEditorSession, readArchive } from '../../../lib/archive-store';
import { categories, readEntries } from '../../../lib/entries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'archive editor' };

export default async function ArchiveEditorPage({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  const editorToken = (await cookies()).get(editorCookieName(archiveId))?.value;
  if (!hasEditorSession(archive, editorToken)) redirect(`/portal/${archiveId}/claim`);

  if (archive.presentation === 'timeline') {
    const entries = await readEntries('all', archive.ownerId);
    return <main id="main" className="personal-editor-shell">
      <PersonalArchiveEditor archive={{ id: archive.id, shareSlug: archive.shareSlug || archive.id, title: archive.title, subtitle: archive.subtitle || '' }} entries={entries} categories={categories} />
    </main>;
  }

  return <main id="main" className="editor-shell">
    <ArchiveEditor archive={{ id: archive.id, shareSlug: archive.shareSlug || archive.id, title: archive.title, subtitle: archive.subtitle || '', canvas: archive.canvas, items: archive.items }} />
  </main>;
}
