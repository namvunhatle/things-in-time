import { parse as parseYaml } from 'yaml';

export function parseMarkdownEntry(raw) {
  const match = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('entry is missing YAML front matter');
  return {
    data: parseYaml(match[1]) || {},
    content: String(raw).slice(match[0].length),
  };
}
