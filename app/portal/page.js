import PortalCreateForm from '../../components/PortalCreateForm';
import RecentArchives from '../../components/RecentArchives';

export const metadata = { title: 'create an archive' };

export default function PortalPage() {
  return <main id="main" className="portal-shell">
    <a className="portal-back" href="/">← back to the archive</a>
    <section className="portal-intro">
      <p className="eyebrow">archive portal</p>
      <h1>make a quiet place<br />for what you want to keep.</h1>
      <p>start with an empty canvas. drop photos anywhere, move them around, then share a password-protected view.</p>
    </section>
    <RecentArchives />
    <PortalCreateForm />
    <p className="portal-note">this browser remembers editor links · copy the recovery link before switching devices</p>
  </main>;
}
