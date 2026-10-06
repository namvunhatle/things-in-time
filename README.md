# things i couldn't say in time

A private archive for the things you want to keep: text dumps, photos, songs, videos. You share it with a link and a password. Your browser encrypts everything before it is saved, so the server stores only ciphertext. **The operator of this site cannot read your archive.**

Live: https://things-in-time.vercel.app

## Security model in one minute

| You hold | It does | If you lose it |
|---|---|---|
| **Recovery key** (`tit_…`, 256-bit, shown once) | Opens the editor on any device, resets the viewer password | The archive is gone. Nobody can recover it, including us |
| **Share link**, including the part after `#` (128-bit link secret) | With the password, lets someone read the archive | Open the editor and copy the link again |
| **Viewer password** | With the share link, lets someone read the archive | Reset it in the editor with your recovery key |

The server never receives the recovery key, the link secret or the password. Browsers do not send the `#fragment` of a URL to the server, and the password is stretched in the browser.

## How the encryption works

All of it uses WebCrypto in the browser. The code is in [`lib/archive-crypto.js`](lib/archive-crypto.js).

**Data key.** Each archive gets a random AES-256-GCM key. It encrypts:
- the archive document (title, entries, layout);
- every photo, each with a fresh 96-bit IV.

Every ciphertext is bound by its AAD to the archive id and its purpose: `things-in-time:<archiveId>:document:v2`, `…:media:<fileName>:v2`, and so on. A blob cannot be swapped into a different archive or a different slot.

**Owner path.** HKDF-SHA256 derives two values from the recovery key:
- `archive-key-wrap`: an AES key that wraps the data key. The server stores this wrap as `recoveryWrap`.
- `editor-auth`: a secret that proves ownership. The server stores only its SHA-256 hash.

**Viewer path.** The password is first stretched with PBKDF2-SHA256 (600,000 iterations, random 16-byte salt). It is then combined with the link secret through HKDF-SHA256, which gives:
- `viewer-key-wrap`: wraps the data key. Stored as `viewerWrap`.
- `viewer-auth`: the server keeps only its SHA-256 hash.

Because the link secret is mixed in, a database dump on its own is not enough to guess passwords offline.

**Unlocking is two steps:**
1. Anyone with the share URL gets only the **gate**: the KDF salt and the wrapped link secret.
2. The browser derives `viewer-auth` and sends it. Only when it matches does the server return `viewerWrap` and the encrypted document.

Both steps are rate limited per IP and per archive. IPs are stored only as HMAC hashes.

**On the owner's device.** After the recovery key is entered once, the data key is kept in IndexedDB as a **non-extractable** `CryptoKey`. Page scripts can use it to encrypt and decrypt but cannot read its bytes. The recovery key itself is never stored.

**Photos.** Each photo is re-encoded in the browser before it is encrypted: at most 2560 px, JPEG. This strips EXIF metadata such as GPS location and the camera serial.

## What the server can still see

End-to-end encryption hides content, not everything. The server and its providers (Vercel, Neon, Vercel Blob) can see:

- archive ids, share slugs, creation and update times, revision counts;
- the number and size of encrypted photos;
- IP addresses in request logs;
- page views through Vercel Web Analytics. These are cookieless, and archive ids and slugs are replaced with `[id]` / `[slug]` before they are sent ([`components/SiteAnalytics.js`](components/SiteAnalytics.js)).

YouTube thumbnails and players load from YouTube's domains, and only when a viewer opens an archive that contains one.

Archives created before encryption (format `version: 1`) are stored in plaintext until their owner turns on encryption from the editor.

## Limits you should know

- **You must trust the JavaScript the site serves.** This is true of every end-to-end encrypted web app. A compromised server or deployment could ship code that leaks keys. Open source lets you audit the code, but your browser cannot prove the deployed bundle matches this repository. If that matters to you, run your own instance.
- **Anyone who can read can keep a copy.** A person with the link and password can save, screenshot or share what they see.
- **Losing the recovery key is final.** There is no reset by email, because there is no account to reset.
- **No independent audit yet.** Reviews are welcome: see [SECURITY.md](SECURITY.md).

## Other protections

- Strict Content-Security-Policy with a per-request nonce and `strict-dynamic`; `frame-ancestors 'none'`; `object-src 'none'`.
- HttpOnly, `SameSite=Strict`, `Secure` session cookies, signed with HMAC.
- Same-origin checks on state-changing API routes.
- `Cache-Control: private, no-store` on pages and media; `noindex` everywhere; `robots.txt` blocks crawlers.
- The upload quota (100 files, 100 MB per archive) is enforced atomically in the database.

## Run your own

```sh
npm install
npm run setup     # writes .env.local with fresh secrets
npm run dev       # http://127.0.0.1:3000
```

Without `DATABASE_URL`, data is stored on disk in `.archive-data/`, which is git-ignored. For production, set these in Vercel:

| Variable | Purpose |
|---|---|
| `ARCHIVE_SESSION_SECRET` | HMAC key for session cookies and rate-limit hashes |
| `DATABASE_URL` | Neon Postgres |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private), for encrypted photos |
| `ARCHIVE_PASSCODE`, `ARCHIVE_ACCESS` | Legacy site-wide gate. Keep `ARCHIVE_ACCESS=private` |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

Stack: Next.js 16 (App Router), React 19, Neon Postgres, Vercel Blob, WebCrypto.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish your changes under the same license.
