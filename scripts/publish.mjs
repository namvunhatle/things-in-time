import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function run(command, args, input) {
  const result = spawnSync(command, args, {
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
    env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const vercel = (args, input) => run('npx', ['--yes', 'vercel', ...args], input);

// Stop before uploading anything if installation or the production build fails.
run('npm', [fs.existsSync('package-lock.json') ? 'ci' : 'install']);
run('node', ['scripts/setup-private.mjs']);
run('npm', ['run', 'build']);
vercel(['whoami']);

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => /^ARCHIVE_[A-Z_]+=/.test(line))
  .map(line => {
    const index = line.indexOf('=');
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [line.slice(0, index), value];
  }));
if (!env.ARCHIVE_PASSCODE || !env.ARCHIVE_SESSION_SECRET || env.ARCHIVE_SESSION_SECRET.length < 32) throw new Error('Set a passcode and a session secret of at least 32 characters in .env.local.');
if (env.ARCHIVE_ACCESS !== 'private') throw new Error('This publishing helper requires ARCHIVE_ACCESS=private.');

// A neutral, random project name avoids names or relationship details in the URL.
if (!fs.existsSync('.vercel/project.json')) {
  const config = '.archive-project.json';
  if (!fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({ name: `notebook-${randomBytes(5).toString('hex')}` }, null, 2));
  vercel(['link', '--yes', '--project', JSON.parse(fs.readFileSync(config, 'utf8')).name]);
}
for (const name of ['ARCHIVE_ACCESS', 'ARCHIVE_PASSCODE', 'ARCHIVE_SESSION_SECRET']) {
  // Secrets travel over stdin, never command arguments or logs.
  vercel(['env', 'add', name, 'production', '--force', '--yes', ...(name === 'ARCHIVE_ACCESS' ? ['--no-sensitive'] : ['--sensitive'])], env[name]);
}
vercel(['deploy', '--prod', '--yes']);
console.log('Passcode remains in .env.local. Keep that file private.');
