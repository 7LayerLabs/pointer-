'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LineDiff = require('../public/linediff.js');
const { createCheckpoints } = require('../lib/checkpoints');

// ---------- line diff ----------
function rand(seed) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }
function mutate(lines, r) {
  const out = [...lines];
  const edits = 1 + Math.floor(r() * 6);
  for (let i = 0; i < edits; i++) {
    const at = Math.floor(r() * (out.length + 1)), op = r();
    if (op < 0.35) out.splice(at, 1);
    else if (op < 0.7) out.splice(at, 0, 'new ' + Math.floor(r() * 1000));
    else if (out.length) out[Math.min(at, out.length - 1)] = 'changed ' + Math.floor(r() * 1000);
  }
  return out;
}

test('hunks: undoing every block gives the old text, keeping every block gives the new', () => {
  const r = rand(7);
  for (let round = 0; round < 300; round++) {
    const a = Array.from({ length: Math.floor(r() * 40) }, (_, i) => 'line ' + (i % 9));
    const b = mutate(a, r);
    const hs = LineDiff.hunks(a, b);
    // undo from the last block back, so earlier line numbers stay valid
    let cur = b;
    for (const h of [...hs].reverse()) cur = LineDiff.undo(a, cur, h);
    assert.deepStrictEqual(cur, a);
    let base = a;
    for (const h of [...hs].reverse()) base = LineDiff.keep(base, b, h);
    assert.deepStrictEqual(base, b);
  }
});

test('hunks: one block undone leaves the others in place', () => {
  const a = LineDiff.split('one\ntwo\nthree\nfour\nfive\n');
  const b = LineDiff.split('one\nTWO\nthree\nfour\nFIVE\nsix\n');
  const hs = LineDiff.hunks(a, b);
  assert.strictEqual(hs.length, 2);
  const after = LineDiff.join(LineDiff.undo(a, b, hs[0]));
  assert.strictEqual(after, 'one\ntwo\nthree\nfour\nFIVE\nsix\n');
  // keeping block 2 moves it into the baseline, so only block 1 is still different
  const base = LineDiff.keep(a, b, hs[1]);
  assert.strictEqual(LineDiff.hunks(base, b).length, 1);
});

test('hunks: identical text has none, CRLF lines compare as written', () => {
  assert.deepStrictEqual(LineDiff.hunks(['a', 'b'], ['a', 'b']), []);
  assert.strictEqual(LineDiff.hunks(LineDiff.split('a\r\nb\r\n'), LineDiff.split('a\r\nb\n')).length, 1);
});

// ---------- checkpoints on a real folder ----------
function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-cp-'));
  const project = path.join(dir, 'project'), data = path.join(dir, 'data');
  fs.mkdirSync(project); fs.mkdirSync(data);
  return { dir, project, data };
}
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const read = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };

test('checkpoints: review, keep, undo and rewind on a folder that is not a git repo', async () => {
  const { dir, project, data } = tmp();
  try {
    write(project, 'app.js', 'one\ntwo\nthree\n');
    write(project, 'notes/readme.md', '# hi\n');
    write(project, 'node_modules/x/index.js', 'ignored\n');
    const cp = createCheckpoints({ dataDir: data });

    const first = await cp.snapshot(project, { kind: 'round', label: 'Before round', prompt: 'make it better' });
    assert.ok(first.created);
    assert.strictEqual((await cp.changes(project)).files.length, 0);
    // same tree again: no duplicate checkpoint
    assert.strictEqual((await cp.snapshot(project, { kind: 'round' })).created, false);

    // an "agent" edits, adds and deletes
    write(project, 'app.js', 'one\nTWO\nthree\nfour\n');
    write(project, 'src/new.js', 'brand new\n');
    fs.rmSync(path.join(project, 'notes/readme.md'));
    write(project, 'node_modules/x/index.js', 'still ignored\n');

    const ch = await cp.changes(project);
    assert.deepStrictEqual(ch.files.map(f => [f.rel, f.status]), [['app.js', 'M'], ['notes/readme.md', 'D'], ['src/new.js', 'A']]);
    const appFile = ch.files.find(f => f.rel === 'app.js');
    assert.strictEqual(appFile.add, 2); assert.strictEqual(appFile.del, 1);

    // keep one hunk of app.js: the baseline takes it, the other hunk is still pending
    const f = await cp.file(project, 'app.js');
    const a = LineDiff.split(f.before.text), b = LineDiff.split(f.after.text);
    const hs = LineDiff.hunks(a, b);
    assert.strictEqual(hs.length, 2);
    await cp.keep(project, { rel: 'app.js', text: LineDiff.join(LineDiff.keep(a, b, hs[0])) });
    const f2 = await cp.file(project, 'app.js');
    const hs2 = LineDiff.hunks(LineDiff.split(f2.before.text), LineDiff.split(f2.after.text));
    assert.strictEqual(hs2.length, 1);

    // undo that last hunk on disk, with a stale hash first (refused), then the real one
    const a2 = LineDiff.split(f2.before.text), b2 = LineDiff.split(f2.after.text);
    await assert.rejects(cp.undo(project, { rel: 'app.js', text: LineDiff.join(LineDiff.undo(a2, b2, hs2[0])), expect: 'stale' }), /changed on disk/);
    await cp.undo(project, { rel: 'app.js', text: LineDiff.join(LineDiff.undo(a2, b2, hs2[0])), expect: f2.hash });
    assert.strictEqual(read(project, 'app.js'), 'one\nTWO\nthree\n');
    assert.ok(!(await cp.changes(project)).files.some(x => x.rel === 'app.js'));

    // undo a whole added file: it is deleted and its empty folder goes with it
    await cp.undo(project, { rel: 'src/new.js', whole: true });
    assert.strictEqual(read(project, 'src/new.js'), null);
    assert.ok(!fs.existsSync(path.join(project, 'src')));
    // keep the deletion
    await cp.keep(project, { rel: 'notes/readme.md', whole: true });
    assert.strictEqual((await cp.changes(project)).files.length, 0);

    // rewind to the first checkpoint: everything comes back, and the rewind left a safety checkpoint
    await cp.rewind(project, first.id);
    assert.strictEqual(read(project, 'app.js'), 'one\ntwo\nthree\n');
    assert.strictEqual(read(project, 'notes/readme.md'), '# hi\n');
    assert.strictEqual(read(project, 'node_modules/x/index.js'), 'still ignored\n');
    const { checkpoints } = await cp.list(project);
    assert.ok(checkpoints.some(c => c.kind === 'safety' && c.label === 'Before rewind'));

    // and the rewind itself can be undone from that safety checkpoint
    const safety = checkpoints.find(c => c.label === 'Before rewind');
    await cp.rewind(project, safety.id);
    assert.strictEqual(read(project, 'app.js'), 'one\nTWO\nthree\n');
    assert.strictEqual(read(project, 'notes/readme.md'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkpoints: a git project keeps its own repo untouched, and the review baseline carries over unreviewed work', async () => {
  const { dir, project, data } = tmp();
  try {
    const { execFileSync } = require('node:child_process');
    const g = (...a) => execFileSync('git', ['-C', project, ...a], { encoding: 'utf8' });
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
    write(project, 'a.txt', 'a\n'); write(project, '.gitignore', 'secret.env\n'); write(project, 'secret.env', 'KEY=1\n');
    g('add', '-A'); g('commit', '-qm', 'init');
    const head = g('rev-parse', 'HEAD');
    const cp = createCheckpoints({ dataDir: data });

    await cp.snapshot(project, { kind: 'round' });
    write(project, 'a.txt', 'a\nb\n');
    write(project, 'secret.env', 'KEY=2\n');
    // a second round before reviewing: the baseline stays at the first round
    const second = await cp.snapshot(project, { kind: 'round' });
    assert.ok(second.created);
    const ch = await cp.changes(project);
    assert.deepStrictEqual(ch.files.map(f => f.rel), ['a.txt']); // .gitignore'd files are left out
    // keep all: nothing pending, and the next round starts a fresh review
    await cp.keepAll(project);
    assert.strictEqual((await cp.changes(project)).files.length, 0);

    assert.strictEqual(g('rev-parse', 'HEAD'), head);
    assert.strictEqual(g('status', '--porcelain'), ' M a.txt\n');
    assert.strictEqual(g('stash', 'list'), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkpoints: paths outside the project are refused', async () => {
  const { dir, project, data } = tmp();
  try {
    const cp = createCheckpoints({ dataDir: data });
    await cp.snapshot(project, { kind: 'round' });
    for (const rel of ['../x.txt', 'C:/Windows/x.txt', '/etc/passwd', '.git/config', 'a/../../x'])
      await assert.rejects(cp.undo(project, { rel, text: 'x' }), /not inside the project/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
