import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';
import { fromBase64, gitHubRemote, parsePerson, parseRepo, SyncError, syncOnce, syncPath, toBase64 } from '../js/sync.js';

const T0 = new Date(2026, 9, 17, 18, 0, 0).getTime();
const sec = (n) => T0 + n * 1000;
const byName = (state, name) => state.machines.find((m) => m.name === name);

// An in-memory stand-in for the data file on GitHub.
function fakeRemote() {
  const file = { doc: null, sha: null, version: 0, pushes: 0 };
  return {
    file,
    async pull() {
      return file.doc ? { doc: JSON.parse(JSON.stringify(file.doc)), sha: file.sha } : null;
    },
    async push(doc, sha) {
      if ((sha ?? null) !== file.sha) throw new SyncError('conflict', 409);
      file.version += 1;
      file.pushes += 1;
      file.doc = JSON.parse(JSON.stringify(doc));
      file.sha = `sha${file.version}`;
      return file.sha;
    },
  };
}

// A device: its state plus a sync function.
function device(state = S.createState()) {
  const d = {
    state,
    synced: false,
    async sync(remote, now) {
      await syncOnce({
        remote,
        getLocal: () => S.syncDoc(d.state),
        apply: (doc) => {
          d.state = S.applyDoc(d.state, doc);
        },
        firstSync: !d.synced,
        now,
      });
      d.synced = true;
    },
  };
  return d;
}

test('repository names and base64 with Polish letters', () => {
  assert.equal(parseRepo('gchrupala/myo-data'), 'gchrupala/myo-data');
  assert.equal(parseRepo(' https://github.com/gchrupala/myo-data.git/ '), 'gchrupala/myo-data');
  assert.equal(parseRepo('myo-data'), null);
  assert.equal(parseRepo('a/b/c'), null);
  const text = '{"name":"Wyciskanie nad głową, żółć"}';
  assert.equal(fromBase64(toBase64(text)), text);
});

// The same cases as in MaxApki (tests/backup.test.js there): a name must
// give the same folder in every app that shares the repository.
test('names of people become the names of their folders', () => {
  assert.equal(parsePerson('Zosia'), 'zosia');
  assert.equal(parsePerson(' Grzegorz  Chrupała '), 'grzegorz-chrupała');
  assert.equal(parsePerson('Jan-Piet de Vries!'), 'jan-piet-de-vries');
  assert.equal(parsePerson('a/b'), 'a-b');
  assert.equal(parsePerson('مریم'), 'مریم');
  assert.equal(parsePerson('Zoe\u0301'), parsePerson('Zoé'));
  assert.equal(parsePerson('x'.repeat(60)).length, 40);
  assert.equal(parsePerson(' - / '), null);
  assert.equal(parsePerson(undefined), null);
  assert.equal(syncPath('grzegorz'), 'grzegorz/myo.json');
});

test('first device uploads, second device gets its data without duplicate machines', async () => {
  const remote = fakeRemote();
  const phone = device();
  const row = byName(phone.state, 'Wiosłowanie');
  S.setReps(phone.state, row.id, '12');
  S.saveSet(phone.state, row.id, sec(0));
  S.setBodyWeight(phone.state, '2026-10-17', '82', sec(1));
  await phone.sync(remote, sec(2));
  assert.equal(remote.file.pushes, 1);
  assert.equal(remote.file.doc.sets.length, 1);

  // A fresh device: its untouched default machines give way to the phone's.
  const tablet = device();
  await tablet.sync(remote, sec(3));
  assert.deepEqual(tablet.state.machines.map((m) => m.id), phone.state.machines.map((m) => m.id));
  assert.equal(tablet.state.sets.length, 1);
  assert.equal(S.bodyWeightOn(tablet.state, '2026-10-17'), 82);
  // Nothing new, so nothing pushed.
  assert.equal(remote.file.pushes, 1);
});

test('sets from both devices are kept; deletions and newer changes win', async () => {
  const remote = fakeRemote();
  const phone = device();
  await phone.sync(remote, sec(0));
  const tablet = device();
  await tablet.sync(remote, sec(1));
  const rowId = byName(phone.state, 'Wiosłowanie').id;

  const a = S.saveSet(phone.state, rowId, sec(10));
  const b = S.saveSet(tablet.state, rowId, sec(20));
  S.deleteSet(tablet.state, b.id, sec(25));
  const c = S.saveSet(tablet.state, rowId, sec(30));
  // The machine changed on the tablet later than on the phone.
  byName(phone.state, 'Wiosłowanie').restTarget = 60;
  byName(phone.state, 'Wiosłowanie').updatedAt = sec(40);
  byName(tablet.state, 'Wiosłowanie').restTarget = 120;
  byName(tablet.state, 'Wiosłowanie').updatedAt = sec(50);
  // Body weight: set on the phone, then deleted on the tablet.
  S.setBodyWeight(phone.state, '2026-10-17', '81', sec(60));
  S.setBodyWeight(tablet.state, '2026-10-17', '', sec(70));

  await phone.sync(remote, sec(80));
  await tablet.sync(remote, sec(90));
  await phone.sync(remote, sec(100));

  for (const d of [phone, tablet]) {
    assert.deepEqual(d.state.sets.map((s) => s.id), [a.id, c.id]);
    assert.equal(byName(d.state, 'Wiosłowanie').restTarget, 120);
    assert.equal(S.bodyWeightOn(d.state, '2026-10-17'), null);
  }
  assert.deepEqual(S.syncDoc(phone.state), S.syncDoc(tablet.state));
});

test('a file changed between pull and push is pulled and merged again', async () => {
  const remote = fakeRemote();
  const phone = device();
  await phone.sync(remote, sec(0));
  const tablet = device();
  await tablet.sync(remote, sec(1));
  const rowId = byName(phone.state, 'Wiosłowanie').id;
  const fromTablet = S.saveSet(tablet.state, rowId, sec(5));
  const fromPhone = S.saveSet(phone.state, rowId, sec(6));

  // The tablet pushes right after the phone pulls.
  const racing = { ...remote, pull: remote.pull, push: remote.push };
  let raced = false;
  racing.pull = async () => {
    const pulled = await remote.pull();
    if (!raced) {
      raced = true;
      await tablet.sync(remote, sec(7));
    }
    return pulled;
  };
  await phone.sync(racing, sec(8));
  assert.deepEqual(remote.file.doc.sets.map((s) => s.id).sort(), [fromTablet.id, fromPhone.id].sort());
});

test('a deleted machine stays deleted; its sets stay in the history', async () => {
  const remote = fakeRemote();
  const phone = device();
  const glutes = byName(phone.state, 'Pośladki');
  S.saveSet(phone.state, glutes.id, sec(0));
  await phone.sync(remote, sec(1));
  const tablet = device();
  await tablet.sync(remote, sec(2));
  S.deleteMachine(tablet.state, glutes.id, sec(3));
  await tablet.sync(remote, sec(4));
  await phone.sync(remote, sec(5));
  assert.equal(byName(phone.state, 'Pośladki'), undefined);
  assert.equal(phone.state.sets.length, 1);
});

test('only changed machines get a new updatedAt', () => {
  const state = S.createState();
  let fps = S.machineFingerprints(state);
  fps = S.stampMachines(state, fps, sec(1));
  assert.ok(state.machines.every((m) => m.updatedAt === 0));
  const row = byName(state, 'Wiosłowanie');
  S.stepReps(state, row.id, 1);
  fps = S.stampMachines(state, fps, sec(2));
  assert.deepEqual(state.machines.filter((m) => m.updatedAt).map((m) => m.name), ['Wiosłowanie']);
  assert.equal(row.updatedAt, sec(2));
});

test('the exercise in progress and prefs stay on the device', () => {
  const state = S.createState();
  const row = byName(state, 'Wiosłowanie');
  S.saveSet(state, row.id, sec(0));
  state.prefs.lang = 'es';
  const doc = S.syncDoc(state);
  assert.equal('prefs' in doc || 'active' in doc, false);
  const other = { ...doc, machines: doc.machines.filter((m) => m.id !== row.id) };
  const applied = S.applyDoc(state, other);
  assert.equal(applied.prefs.lang, 'es');
  assert.equal(applied.active, null); // its machine is gone
});

test('gitHubRemote talks to the contents API', async () => {
  const calls = [];
  let stored = null;
  const fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', headers: options.headers, cache: options.cache, body: options.body });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.endsWith('/repos/me/data')) return json(200, { private: true });
    if (url.endsWith('/repos/me/open')) return json(200, { private: false });
    if (url.endsWith('/repos/me/gone')) return json(404, {});
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (stored && body.sha !== stored.sha) return json(409, {});
      stored = { content: body.content, sha: `s${calls.length}` };
      return json(201, { content: { sha: stored.sha } });
    }
    return stored ? json(200, { content: stored.content, sha: stored.sha }) : json(404, {});
  };
  const path = syncPath(parsePerson('Łucja'));
  const remote = gitHubRemote({ repo: 'me/data', token: 'tok', path, fetch });
  await remote.checkRepo();
  await assert.rejects(gitHubRemote({ repo: 'me/open', token: 'tok', path, fetch }).checkRepo(), { kind: 'public' });
  await assert.rejects(gitHubRemote({ repo: 'me/gone', token: 'tok', path, fetch }).checkRepo(), { kind: 'notFound' });

  assert.equal(await remote.pull(), null);
  const doc = { machines: [{ name: 'Wyciskanie nad głowę' }] };
  const sha = await remote.push(doc, null, 'first');
  const pulled = await remote.pull();
  assert.deepEqual(pulled, { doc, sha });
  await assert.rejects(remote.push(doc, 'old', 'second'), { kind: 'conflict' });

  const get = calls.find((c) => c.method === 'GET' && c.url.endsWith('/repos/me/data/contents/%C5%82ucja/myo.json'));
  assert.equal(get.headers.Authorization, 'Bearer tok');
  assert.equal(get.cache, 'no-store');

  const offline = gitHubRemote({ repo: 'me/data', token: 'tok', path, fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.pull(), { kind: 'network' });
});
