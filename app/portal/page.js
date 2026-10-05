import PortalCreateForm from '../../components/PortalCreateForm';

export const metadata = { title: 'create an archive' };

export default function PortalPage() {
  return <main id="main" className="portal-shell">
    <a className="portal-back" href="/">← back to the archive</a>
    <section className="portal-intro">
      <p className="eyebrow">archive portal</p>
      <h1>make a quiet place<br />for what you want to keep.</h1>
      <p>start with an empty canvas. drop photos anywhere, move them around, then share a password-protected view.</p>
    </section>
    <PortalCreateForm />
    <p className="portal-note">local demo · files stay on this machine · save the editor link</p>
  </main>;
}
