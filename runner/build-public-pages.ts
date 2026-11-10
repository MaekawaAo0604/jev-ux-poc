import {lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

// This is a publication boundary, not a recursive copy of docs/ or reports/.
export const PUBLIC_PAGE_FILES = ['.nojekyll', 'index.html', 'service.html', 'validation.html', 'styles.css'] as const;
function contains(parent:string, child:string) {
  const path = relative(parent, child);
  return !path || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
async function rejectSymlinks(path:string):Promise<void> {
  const parent = dirname(path);
  if (parent !== path) await rejectSymlinks(parent);
  const stat = await lstat(path).catch((error:NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (stat?.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in publication paths: ${path}`);
}

export async function buildPublicPages(options:{sourceDir:string; outputDir:string}) {
  const sourceDir = resolve(options.sourceDir), outputDir = resolve(options.outputDir);
  if (contains(sourceDir, outputDir) || contains(outputDir, sourceDir)) throw new Error('Source and output paths overlap');
  await rejectSymlinks(sourceDir);
  await rejectSymlinks(outputDir);
  const existing = await readdir(outputDir).catch((error:NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of existing) {
    if (!(PUBLIC_PAGE_FILES as readonly string[]).includes(name)) throw new Error(`Unexpected output file: ${name}`);
    const stat = await lstat(resolve(outputDir, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unexpected output entry: ${name}`);
  }
  // Validate and load every input before writing anything. Extra source files are ignored.
  const contents = await Promise.all(PUBLIC_PAGE_FILES.map(async name => {
    const path = resolve(sourceDir, name), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid public source: ${name}`);
    return readFile(path);
  }));
  await mkdir(outputDir, {recursive:true});
  for (const [index, name] of PUBLIC_PAGE_FILES.entries()) await writeFile(resolve(outputDir, name), contents[index]);
  return [...PUBLIC_PAGE_FILES];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = await buildPublicPages({sourceDir:'public-site', outputDir:'.cache/public-pages'});
  console.log(`Pages publication: ${files.join(', ')} -> .cache/public-pages`);
}
