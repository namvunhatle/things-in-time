import fs from 'node:fs';
import path from 'node:path';
import { confidentialEntriesDirectory, confidentialPhotosDirectory } from '../lib/confidential-paths.js';
import { parseMarkdownEntry } from '../lib/markdown-entry.js';

const categories = ['understood', 'miss', 'songs', 'home', 'unsaid'];
let count = 0;
fs.mkdirSync(confidentialEntriesDirectory, { recursive: true, mode: 0o700 });
fs.mkdirSync(confidentialPhotosDirectory, { recursive: true, mode: 0o700 });
for (const file of fs.readdirSync(confidentialEntriesDirectory).filter(f => f.endsWith('.md'))) {
  const { data, content } = parseMarkdownEntry(fs.readFileSync(path.join(confidentialEntriesDirectory, file), 'utf8'));
  if (data.draft) continue;
  const fail = message => { throw new Error(`${file}: ${message}`); };
  if (data.lang !== 'en') fail('published entries must declare lang: en');
  if (/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u.test(content)) fail('published entry content must be English-only');
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) fail('date must be a quoted, valid YYYY-MM-DD');
  if (data.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) fail('time must be a quoted HH:MM');
  if (data.category && !categories.includes(data.category)) fail('unknown category');
  if (data.kind && !['dump', 'line', 'realization', 'memory', 'song'].includes(data.kind)) fail('unknown kind');
  if (data.tags && (!Array.isArray(data.tags) || !data.tags.every(t => typeof t === 'string'))) fail('tags must be a list of strings');
  if (data.song && (typeof data.song.title !== 'string' || typeof data.song.artist !== 'string')) fail('song needs a title and artist');
  if (data.song?.url && !/^https:\/\//.test(data.song.url)) fail('song link must start with https://');
  if (data.song?.lyric && data.song.lyric.trim().split(/\s+/).length > 10) fail('keep lyric excerpts to 10 words or fewer');
  const images = [...content.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(image => image[1]);
  if (data.song?.art) images.push(data.song.art);
  for (const image of images) {
    if (!/^\/media\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpe?g|png|webp|gif|avif)$/i.test(image)) fail('photos must use a private /media/filename path');
    if (!fs.existsSync(path.join(confidentialPhotosDirectory, image.slice('/media/'.length)))) fail(`missing photo ${image}`);
  }
  if (!content.trim() && !data.song) fail('entry is empty');
  count++;
}
console.log(`${count} published entries checked; drafts excluded.`);
