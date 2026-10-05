import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { confidentialEntriesDirectory } from './confidential-paths';

export const categories = {
  all: 'all',
  understood: 'things i understood too late',
  miss: 'things i miss',
  songs: 'songs',
  home: 'our home',
  unsaid: 'things i never said',
};
export function readEntries(category = 'all') {
  const directory = confidentialEntriesDirectory;
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.md')).map(name => {
    const { data, content } = matter(fs.readFileSync(path.join(directory, name), 'utf8'));
    return { ...data, id: name.replace(/\.md$/, ''), content };
  }).filter(entry => !entry.draft && (category === 'all' || entry.category === category))
    .sort((a, b) => `${b.date}T${b.time || '23:59'}`.localeCompare(`${a.date}T${a.time || '23:59'}`) || b.id.localeCompare(a.id));
}
export function dateLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z')).toLowerCase();
}
export function timeLabel(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}
