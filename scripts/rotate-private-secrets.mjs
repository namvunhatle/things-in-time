import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function setEnvValue(source, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

const envPath = '.env.local';
if (!fs.existsSync(envPath)) throw new Error('.env.local is required');
let env = fs.readFileSync(envPath, 'utf8');
const passcode = randomBytes(24).toString('base64url');
const sessionSecret = randomBytes(48).toString('base64url');
env = setEnvValue(env, 'ARCHIVE_PASSCODE', passcode);
env = setEnvValue(env, 'ARCHIVE_SESSION_SECRET', sessionSecret);
fs.writeFileSync(envPath, env, { mode: 0o600 });
fs.chmodSync(envPath, 0o600);

const recoveryLinks = [];
const dataRoot = '.archive-data';
if (fs.existsSync(dataRoot)) {
  for (const id of fs.readdirSync(dataRoot)) {
    const manifestPath = path.join(dataRoot, id, 'archive.json');
    if (!fs.existsSync(manifestPath)) continue;
    const archive = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const editorKey = randomBytes(24).toString('base64url');
    archive.editorKeyHash = createHash('sha256').update(editorKey).digest('base64url');
    const temporary = `${manifestPath}.${randomBytes(5).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(archive, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, manifestPath);
    fs.chmodSync(manifestPath, 0o600);
    recoveryLinks.push(`${archive.title}\nhttp://127.0.0.1:3000/portal/${archive.id}/claim#key=${encodeURIComponent(editorKey)}`);
  }
}

fs.mkdirSync('.confidential', { recursive: true, mode: 0o700 });
const ownerAccess = [
  'owner archive passcode',
  passcode,
  '',
  'editor recovery links',
  recoveryLinks.length ? recoveryLinks.join('\n\n') : '(none)',
  '',
].join('\n');
fs.writeFileSync('.confidential/owner-access.txt', ownerAccess, { mode: 0o600 });
fs.chmodSync('.confidential/owner-access.txt', 0o600);

console.log(`rotated owner secrets and ${recoveryLinks.length} editor key(s); values were written only to local owner-access files.`);
