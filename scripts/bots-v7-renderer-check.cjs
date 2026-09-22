/* Game-only isolated-browser check. Does not use a player's profile or submit requests. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.MK_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MK_PREVIEW_URL || 'http://127.0.0.1:3147';
const output = path.resolve(process.env.MK_REVIEW_DIR || '.bots-preview/remaster-v7/verification');
fs.mkdirSync(output, { recursive: true });
async function open(browser, viewport, style, rival, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage(), errors = [], writes = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!['GET','HEAD','OPTIONS'].includes(r.method())) writes.push(r.url()); });
  await page.goto(`${base}/bots?view=fight&combat=7&style=${style}&rival=${rival}&seed=75`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__botsRemaster?.ready, null, { timeout: 90000 });
  return { context, page, errors, writes };
}
(async () => {
  const browser = await chromium.launch({ channel: process.env.MK_BROWSER_CHANNEL || 'msedge', headless: true });
  const report = { date: new Date().toISOString(), browser: browser.version(), source: 'isolated actual browser WebGL renderer', physicalPhoneTested: false, structural: [], performance: [] };
  try {
    if (process.env.MK_CHECK_MODE !== 'performance') {
      for (const [style, rival] of [['tank','tank'],['speed','ranged']]) {
        const { context, page, errors, writes } = await open(browser, { width: 1280, height: 720 }, style, rival);
        const checked = await page.evaluate(() => {
          const api = window.__botsRemaster; api.pause(); api.reset();
          const initial = api.inspect();
          api.seek(1300); const first = api.inspect(), state = api.state();
          let maximumJointError = 0, maximumRotationError = 0;
          for (let side = 0; side < 2; side++) for (const [name, expected] of Object.entries(first.poses[side].worldNodes)) {
            const actual = first.actors[side].world[name];
            if (!actual) throw new Error(`Missing actual GLB joint ${name}`);
            maximumJointError = Math.max(maximumJointError, Math.hypot(...actual.position.map((x,i) => x - expected.position[i])));
            maximumRotationError = Math.max(maximumRotationError, 1 - Math.abs(actual.quaternion.reduce((n,x,i) => n + x * expected.quaternion[i], 0)));
          }
          api.seek(100); api.seek(1300); const replay = api.inspect();
          const resources = [];
          for (let n = 0; n < 4; n++) { api.seek(80); api.seek(1300); const i = api.inspect(); resources.push({ textures:i.textures, geometries:i.geometries }); }
          api.reset(); const reset = api.inspect();
          let isolation = null;
          if (state.builds[0].style === state.builds[1].style) {
            const hit = state.events.find(e => e.kind === 'hit' && e.damage > 0);
            if (!hit) throw new Error('No real hit available for shared-model isolation');
            api.seek(hit.frame); const after = api.inspect(), source = 1 - hit.target;
            const otherAlsoHit = state.events.some(e => e.frame <= hit.frame && e.target === source && e.damage > 0 && ['hit','block','burn'].includes(e.kind));
            isolation = { target:hit.target, targetDents:after.actors[hit.target].dents, otherAlsoHit, untouched:after.actors[source].damageHash === initial.actors[source].damageHash, separateGeometry:!after.actors[0].geometryIds.some(id => after.actors[1].geometryIds.includes(id)) };
          }
          return { maximumJointError, maximumRotationError, damage: first.actors.map(a => ({ hash:a.damageHash, dents:a.dents, vertices:a.changedVertices })), replayDamage:replay.actors.map(a => a.damageHash), initial:initial.actors.map(a => a.damageHash), reset:reset.actors.map(a => a.damageHash), resources, isolation, stateFrame:state.frame };
        });
        assert(checked.maximumJointError < .02, 'Rendered joints diverged from physical pose');
        assert(checked.maximumRotationError < .000001, 'Rendered rotations diverged from physical pose');
        assert.deepEqual(checked.damage.map(a => a.hash), checked.replayDamage, 'Damage changed after seeking');
        assert.deepEqual(checked.initial, checked.reset, 'Reset failed to restore owned geometry');
        assert(checked.damage.some(a => a.vertices > 0), 'Actual contact did not deform any vertices');
        if (checked.isolation) { assert(checked.isolation.separateGeometry, 'Actors share deformable geometry'); if (!checked.isolation.otherAlsoHit) assert(checked.isolation.untouched, 'Damage leaked to the other copy'); assert(checked.isolation.targetDents > 0, 'First real contact missed clay'); }
        assert(checked.resources.every(r => JSON.stringify(r) === JSON.stringify(checked.resources[0])), 'GPU resource counts grew across repeated seeks');
        assert.equal(errors.length, 0); assert.equal(writes.length, 0);
        report.structural.push({ style, rival, ...checked, errors, writes }); await context.close();
      }
    }
    if (process.env.MK_CHECK_MODE !== 'structural') {
      for (const viewport of [{ width:1280,height:720 }, { width:390,height:844 }]) {
        const requestedDpr = viewport.width < 600 ? 3 : 1.5;
        const { context, page, errors, writes } = await open(browser, viewport, 'speed', 'ranged', requestedDpr);
        await page.getByRole('button', { name:'Robot & fight details' }).click();
        await page.getByRole('checkbox', { name:'Use your Special automatically · starts a new fight' }).check();
        await page.getByRole('button', { name:'Back to the ring', exact:true }).click();
        await page.waitForFunction(() => window.__botsRemaster?.ready && window.__botsRemaster.state().autoSpecial.every(Boolean));
        const result = await page.evaluate(async () => {
          const api = window.__botsRemaster; api.seek(450);
          const canvas = document.querySelector('canvas[aria-label="Remastered robot preview"]');
          const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
          const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          const times = [], draws = []; let last = performance.now(), started = last;
          api.play();
          await new Promise(resolve => { function sample(now) { if (now - started > 1000) { times.push(now-last); draws.push(api.stats().drawMs); } last = now; if(now-started < 11000) requestAnimationFrame(sample); else resolve(); } requestAnimationFrame(sample); });
          api.pause(); const stats = api.stats();
          times.sort((a,b) => a-b); draws.sort((a,b) => a-b);
          return { gpu, frameCount:times.length, medianFrameMs:times[Math.floor(times.length*.5)], p95FrameMs:times[Math.floor(times.length*.95)], meanFPS:1000/(times.reduce((a,b)=>a+b,0)/times.length), medianRenderSubmitMs:draws[Math.floor(draws.length*.5)], p95RenderSubmitMs:draws[Math.floor(draws.length*.95)], renderSubmitIncludesGPUWait:false, stats, canvas:{width:canvas.width,height:canvas.height}, devicePixelRatio };
        });
        assert.equal(errors.length, 0); assert.equal(writes.length, 0);
        report.performance.push({ viewport, requestedDpr, emulatedPhone:viewport.width < 600, ...result, errors, writes }); await context.close();
      }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, `renderer-${process.env.MK_CHECK_MODE || 'all'}.json`), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
