// Run in the isolated D-drive workspace. No accounts or browser saves are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = path.resolve(__dirname, '../../src/app/bots/_game/workshop-soundtrack.ts');
const moduleResult = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleResult.exports, Error });
const { createWorkshopSoundtrack, MUSIC_TRACKS } = moduleResult.exports;
class AudioStub {
  paused = true; src = ''; volume = 1; plays = 0; loads = 0; fail = null; inGesture = false;
  getAttribute() { return this.src; }
  removeAttribute() { this.src = ''; }
  pause() { this.paused = true; }
  load() { this.loads++; }
  play() {
    this.plays++; this.playWasInGesture = this.inGesture;
    if (this.fail) return Promise.reject(this.fail);
    this.paused = false; return Promise.resolve();
  }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const a = new AudioStub(), statuses = [], p = createWorkshopSoundtrack(a, s => statuses.push(s));
  const settings = { enabled: true, volume: .3, battle: false };
  p.configure(settings); assert.equal(a.plays, 0); assert.equal(a.src, '');
  a.inGesture = true; p.gesture(); a.inGesture = false;
  assert.equal(a.playWasInGesture, true); await flush();
  assert.equal(a.src, MUSIC_TRACKS.menu); assert.equal(statuses.at(-1), 'playing');
  p.configure({ ...settings, volume: .5 }); p.gesture();
  assert.equal(a.plays, 1, 'Clicks and volume changes must not restart the track');
  p.configure({ ...settings, battle: true }); await flush();
  assert.equal(a.src, MUSIC_TRACKS.battle); assert.equal(a.plays, 2);
  p.visibility(true); assert.equal(a.paused, true);
  p.visibility(false); await flush(); assert.equal(a.paused, false);
  p.configure({ ...settings, enabled: false }); assert.equal(a.paused, true);
  const mutedPlays = a.plays; p.gesture(); assert.equal(a.plays, mutedPlays);
  p.configure({ ...settings, volume: 0 }); p.gesture(); assert.equal(a.plays, mutedPlays);
  p.configure(settings); await flush(); assert.equal(a.src, MUSIC_TRACKS.menu);
  p.dispose(); assert.equal(a.src, ''); assert.equal(a.paused, true);
  const closed = a.plays; p.gesture(); assert.equal(a.plays, closed);

  const b = new AudioStub(), errors = [], q = createWorkshopSoundtrack(b, s => errors.push(s));
  b.fail = Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' });
  q.gesture(); await flush(); assert.equal(errors.at(-1), 'blocked');
  b.fail = null; q.gesture(); await flush(); assert.equal(errors.at(-1), 'playing');
  q.visibility(true); b.fail = new Error('404'); q.visibility(false);
  await flush(); assert.equal(errors.at(-1), 'unavailable');
  b.fail = null; q.gesture(); await flush(); assert.equal(errors.at(-1), 'playing'); q.dispose();

  const c = new AudioStub(), late = []; let reject;
  c.play = () => new Promise((_, no) => { reject = no; });
  const r = createWorkshopSoundtrack(c, s => late.push(s)); r.gesture(); r.dispose();
  reject(new Error('Cancelled load')); await flush(); assert.deepEqual(late, []);
  for (const url of Object.values(MUSIC_TRACKS)) {
    const file = path.resolve(__dirname, '../../public', decodeURIComponent(url.slice(1)));
    assert.ok(fs.statSync(file).size > 100000, `Missing deployment asset: ${file}`);
  }
  console.log('PASS: direct gesture playback, both tracks, no restarts, mute/volume, hidden/resume, blocked/missing-file retries, disposal and audio assets.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
