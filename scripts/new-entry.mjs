import fs from 'node:fs';
import path from 'node:path';
import { confidentialEntriesDirectory } from '../lib/confidential-paths.js';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: npm run entry -- a-small-memory'); process.exit(1);
}
const now = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
const date = `${parts.year}-${parts.month}-${parts.day}`;
fs.mkdirSync(confidentialEntriesDirectory, { recursive: true, mode: 0o700 });
const file = path.join(confidentialEntriesDirectory, `${date}-${slug}.md`);
fs.writeFileSync(file, `---\ndate: "${date}"\ntime: "${parts.hour}:${parts.minute}"\nkind: dump\ncategory: unsaid\ndraft: true\nlang: en\n---\n\n`, { flag: 'wx', mode: 0o600 });
console.log(`created ${file}\nwrite your entry, then remove draft: true when ready.`);
