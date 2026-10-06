import { redirect } from 'next/navigation';
import { personalArchive } from '../../lib/personal-archive';

export default function Unlock() {
  redirect(personalArchive.shareSlug ? `/a/${personalArchive.shareSlug}/unlock` : '/');
}
