import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

const files = ['.nojekyll', 'index.html', 'service.html', 'validation.html', 'styles.css'];
async function builder() {
  await assert.doesNotReject(access(resolve('runner/build-public-pages.ts')), 'the explicit public-only builder must exist');
  return (await import('../runner/build-public-pages.js')).buildPublicPages;
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'jev-pages-test-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const sourceDir = join(root, 'source'), outputDir = join(root, 'out');
  await mkdir(sourceDir);
  for (const name of files) await writeFile(join(sourceDir, name), name === '.nojekyll' ? '' : `approved:${name}`);
  return {root, sourceDir, outputDir};
}

test('Pages build copies only explicit approved files, never adjacent logs, images or credentials', async t => {
  const build = await builder(), f = await fixture(t);
  for (const name of ['.env', 'raw.json', 'customer.png']) await writeFile(join(f.sourceDir, name), 'PRIVATE_SENTINEL');
  await mkdir(join(f.sourceDir, 'reports'));
  await writeFile(join(f.sourceDir, 'reports', 'index.html'), 'PRIVATE_SENTINEL');
  await build(f);
  assert.deepEqual((await readdir(f.outputDir)).sort(), files.sort());
  for (const name of files) assert.equal(await readFile(join(f.outputDir, name), 'utf8'), name === '.nojekyll' ? '' : `approved:${name}`);
  await build(f); // Rebuilding must not widen the publication set.
});

test('Pages build refuses stale unexpected output instead of publishing or deleting it', async t => {
  const build = await builder(), f = await fixture(t);
  await mkdir(f.outputDir); await writeFile(join(f.outputDir, 'private.json'), 'keep me');
  await assert.rejects(build(f), /unexpected output/i);
  assert.equal(await readFile(join(f.outputDir, 'private.json'), 'utf8'), 'keep me');
});

test('Pages build refuses output overlapping its sources', async t => {
  const build = await builder(), f = await fixture(t);
  await assert.rejects(build({...f, outputDir:f.sourceDir}), /overlap/i);
  assert.equal(await readFile(join(f.sourceDir, 'index.html'), 'utf8'), 'approved:index.html');
});

test('actual public pages have only resolvable relative links and no private artifacts', async t => {
  const build = await builder(), f = await fixture(t);
  await build({...f, sourceDir:resolve('public-site')});
  assert.deepEqual((await readdir(f.outputDir)).sort(), files.sort());
  for (const name of files) {
    const content = await readFile(join(f.outputDir, name), 'utf8');
    assert.doesNotMatch(content, /localhost|127\.0\.0\.1|reports\/|AI_GATEWAY_API_KEY|TYPESAFE_API_KEY|vck_|<script|<img|<iframe/i);
    if (name.endsWith('.html')) {
      assert.match(content, /<html lang="ja">/);
      assert.match(content, /name="viewport"/);
      for (const match of content.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const path = match[1].split('#')[0];
        if (!path) continue;
        assert.ok(files.includes(path), `Non-allowlisted link in ${name}: ${path}`);
        await access(join(f.outputDir, path));
      }
    }
  }
  const summary = await readFile(join(f.outputDir, 'validation.html'), 'utf8');
  assert.match(summary, /未確認/);
  assert.match(summary, /診断中断/);
  assert.match(summary, /サイトの欠陥/);
});
