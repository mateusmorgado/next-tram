/**
 * Builds the app into dist/: bundles src/app/main.ts, copies public/, and fills the service
 * worker's file list so the whole app works offline. Run with `npm run build`.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

/** All files below a folder, as paths relative to it with forward slashes. */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path)));
    else out.push(relative(dist, path).split('\\').join('/'));
  }
  return out;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'public'), dist, { recursive: true });

await build({
  entryPoints: [join(root, 'src/app/main.ts')],
  outdir: dist,
  entryNames: 'app',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  chunkNames: 'chunks/[name]-[hash]',
  logLevel: 'warning',
});

const files = (await listFiles(dist)).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(await readFile(join(dist, f)));
const version = hash.digest('hex').slice(0, 10);

const swPath = join(dist, 'sw.js');
const sw = (await readFile(swPath, 'utf8'))
  .replace('__VERSION__', version)
  .replace('/*__FILES__*/', files.map((f) => JSON.stringify(f)).join(', '));
await writeFile(swPath, sw);
console.log(`Built dist/ (${files.length} files, cache ${version})`);
