import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Reproduces what ended the kahaku run (reports/2026-09-23T19-44-05.620Z-public):
// <span role="button" aria-expanded aria-haspopup> whose panel opens on click
// and closes only on an outside click. The second click is a no-op, which the
// POM reported as ACTION_ERROR and the runner treated as terminal.
const PAGE = `<!doctype html><html lang="en"><body>
<header>
  <span id="trigger" role="button" aria-expanded="false" aria-haspopup="true" tabindex="0">Menu</span>
  <div id="panel" role="menu" hidden><a href="/a">Guide A</a><a href="/b">Guide B</a></div>
</header>
<p>Visitor information</p>
<script>
  // Open-only: a second click on the trigger deliberately changes nothing.
  document.getElementById('trigger').addEventListener('click',()=>{
    document.getElementById('panel').removeAttribute('hidden');
  });
</script>
</body></html>`;

test('a disclosure that opens but never closes is recorded as a no-op and the exploration continues', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(PAGE);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const cwd = await mkdtemp(resolve(tmpdir(), 'jev-sticky-disclosure-'));
  try {
    const {port} = server.address() as {port: number};
    const {stdout} = await promisify(execFile)(process.execPath, [
      '--import', import.meta.resolve('tsx'),
      '--import', pathToFileURL(resolve('tests/fixtures/sticky-disclosure-provider.mjs')).href,
      resolve('runner/public-site.ts'), `http://127.0.0.1:${port}/`, 'Read the visitor information',
      '--reviewed', '--max-actions', '4', '--interval-ms', '1000',
    ], {cwd, env: {...process.env, AI_GATEWAY_API_KEY: 'LOCAL_TEST_ONLY'}, timeout: 60000});

    const summary = JSON.parse(stdout.trim().split('\n').at(-1)!);
    const result = JSON.parse(await readFile(resolve(summary.report, '../exploration/result.json'), 'utf8'));

    // The first click opens the panel and is an ordinary executed action.
    assert.equal(result.steps[0].result, 'OK');
    // The second click changes nothing: recorded, not fatal.
    assert.equal(result.steps[1].result, 'ACTION_NOOP');
    // ...and the run went on to finish instead of ending on that step.
    assert.equal(result.reason, 'JEV_DONE');
    assert.ok(result.steps.length >= 3, `expected the run to continue past the no-op, got ${result.steps.length} steps`);
  } finally {
    await new Promise<void>((r, e) => server.close(err => err ? e(err) : r()));
  }
});
