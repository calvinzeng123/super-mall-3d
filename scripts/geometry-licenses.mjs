import { readFile } from 'node:fs/promises';

export async function geometryLicenses() {
  const [polygon, splayReadme, predicates] = await Promise.all([
    readFile('node_modules/polygon-clipping/LICENSE.md', 'utf8'),
    readFile('node_modules/splaytree/Readme.md', 'utf8'),
    readFile('node_modules/robust-predicates/LICENSE', 'utf8'),
  ]);
  const marker = '## License';
  if (!splayReadme.includes(marker)) throw new Error('Missing splaytree license');
  return [
    'polygon-clipping 0.15.7 — https://github.com/mfogel/polygon-clipping\n' + polygon,
    'splaytree — https://github.com/w8r/splay-tree\n' + splayReadme.split(marker)[1].trim(),
    'robust-predicates — https://github.com/mourner/robust-predicates\n' + predicates,
  ].join('\n\n');
}
