// Read-only classification probe for the ACTION_ERROR that ended the kahaku run
// (reports/2026-09-23T19-44-05.620Z-public, step 12):
//   ACTION_ERROR: disclosure did not change its panel visibility
// PublicSitePage.act polls publicControl after the click and only returns when
// `after.kind==='disclosure' && after.open!==control.open`. This records what
// publicControl actually reports before and after clicking the same control
// twice. No Jev call, no form submission, no navigation follow-up.
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {controlSelector, publicControl} from '../../pages/controls.ts';

process.loadEnvFile = () => {};
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.TYPESAFE_API_KEY;

const URL = 'https://www.kahaku.go.jp/riyou/nyukan-annai/e-ticket.html';
const LABEL = '利用案内';

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'ja-JP', acceptDownloads: false, serviceWorkers: 'block'});
const page = await context.newPage();
page.setDefaultTimeout(10000);

const log = {url: URL, label: LABEL, startedAt: new Date().toISOString(), candidates: [], toggles: []};
try {
  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2000);

  const handles = await page.$$(controlSelector);
  for (const handle of handles) {
    const info = await handle.evaluate((el, label) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text !== label) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaControls: el.getAttribute('aria-controls'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
        inHeader: !!el.closest('header,[role="banner"]'),
        rect: {x: r.x, y: r.y, w: r.width, h: r.height},
      };
    }, LABEL);
    if (!info) continue;
    const control = await handle.evaluate(publicControl);
    log.candidates.push({...info, control});

    // Only a disclosure takes the polling path that produced the error.
    if (control.kind !== 'disclosure') continue;

    for (const pass of [1, 2]) {
      const before = await handle.evaluate(publicControl);
      const beforeURL = page.url();
      await handle.click({timeout: 5000}).catch(e => {log.toggles.push({pass, clickError: String(e).split('\n')[0]});});
      const samples = [];
      let settled = null;
      for (let i = 0; i < 30; i++) {
        const after = await handle.evaluate(publicControl).catch(e => ({kind: 'evaluate-failed', reason: String(e).split('\n')[0]}));
        samples.push({i, kind: after.kind, open: after.open, reason: after.reason});
        // The exact success condition used by PublicSitePage.act.
        if (after.kind === 'disclosure' && before.kind === 'disclosure' && after.open !== before.open) {settled = i; break;}
        await page.waitForTimeout(50);
      }
      log.toggles.push({
        pass,
        before,
        settled,
        urlChanged: page.url() !== beforeURL,
        finalURL: page.url(),
        distinctSamples: [...new Map(samples.map(s => [JSON.stringify([s.kind, s.open, s.reason]), s])).values()],
        sampleCount: samples.length,
      });
      if (settled === null) break;
    }
  }
} catch (error) {
  log.error = String(error).split('\n').slice(0, 3).join(' | ');
} finally {
  const root = `reports/disclosure-toggle-probe-${new Date().toISOString().replaceAll(':', '-')}`;
  await mkdir(root, {recursive: true});
  await writeFile(`${root}/diagnostics.json`, JSON.stringify(log, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(log, null, 2));
  console.log(`saved: ${root}/diagnostics.json`);
  await browser.close();
}
