import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

if (fs.existsSync('.env.local')) {
  console.log('.env.local already exists; existing passcode kept.');
} else {
  fs.writeFileSync('.env.local', [
    'ARCHIVE_ACCESS=private',
    `ARCHIVE_PASSCODE=${randomBytes(18).toString('base64url')}`,
    `ARCHIVE_SESSION_SECRET=${randomBytes(48).toString('base64url')}`,
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  console.log('Created .env.local. Your passcode is stored there; it is not printed or committed.');
}
