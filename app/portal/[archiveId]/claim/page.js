import { notFound } from 'next/navigation';
import EditorClaim from '../../../../components/EditorClaim';
import { readArchive } from '../../../../lib/archive-store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'secure editor access' };

export default async function EditorClaimPage({ params }) {
  const { archiveId } = await params;
  const archive = await readArchive(archiveId);
  if (!archive) notFound();
  return <EditorClaim archiveId={archiveId} archiveTitle={archive.title} />;
}
