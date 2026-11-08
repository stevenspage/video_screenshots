const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const { Store, sameFile, normalizeState, KEY } = require('../playback-session.js');

function fixture() {
    const data = new Map();
    const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
    return { store: new Store(storage, new IDBFactory()), storage };
}
const record = (id = 'one') => ({ version: 1, id, video: { name: id + '.mp4', size: 100, lastModified: 123 }, subtitle: { name: 'one.srt', content: 'subtitle' }, state: { time: 42 } });

test('file matching rejects same-name files with different contents metadata', () => {
    const a = record().video;
    assert.equal(sameFile(a, { ...a }), true);
    for (const patch of [{ size: 101 }, { name: 'two.mp4' }, { lastModified: 124 }]) assert.equal(sameFile(a, { ...a, ...patch }), false);
    assert.equal(sameFile(a, null), false);
});
test('invalid state is bounded and selected indices are validated', () => {
    assert.equal(normalizeState(null).time, 0);
    const s = normalizeState({ time: -1, rate: 99, volume: NaN, single: 0.5, display: 9, maskPercent: 80, selected: [2, 2, -1, '3', 0] });
    assert.deepEqual(s, { time: 0, rate: 1, volume: 1, muted: false, single: 0, display: 0, mask: false, maskPercent: 10, selected: [2, 0] });
});
test('latest light state merges with matching persisted subtitle', async () => {
    const { store } = fixture();
    await store.saveRecord(record());
    store.saveState(record(), { time: 65, selected: [1] });
    const saved = await store.read();
    assert.equal(saved.state.time, 65);
    assert.equal(saved.subtitle.content, 'subtitle');
});
test('new video never gets the previous video handle or subtitle', async () => {
    const { store } = fixture();
    await store.saveRecord(record());
    store.saveState(record('two'), { time: 8 });
    const saved = await store.read();
    assert.equal(saved.video.name, 'two.mp4');
    assert.equal(saved.subtitle, undefined);
});
test('queued writes and clear cannot resurrect old records', async () => {
    const { store, storage } = fixture();
    const first = store.saveRecord(record());
    const second = store.saveRecord(record('two'));
    const cleared = store.clear();
    await Promise.all([first, second, cleared]);
    assert.equal(await store.read(), null);
    assert.equal(storage.getItem(KEY), null);
});
test('a new selection during clear survives', async () => {
    const { store } = fixture();
    await store.saveRecord(record());
    const clear = store.clear();
    store.saveState(record('two'), { time: 10 });
    const save = store.saveRecord(record('two'));
    await Promise.all([clear, save]);
    assert.equal((await store.read()).id, 'two');
});
test('corrupt JSON and corrupt subtitles do not break reading', async () => {
    const { store, storage } = fixture();
    storage.setItem(KEY, '{broken');
    assert.equal(await store.read(), null);
    await store.saveRecord({ ...record(), subtitle: { content: 45 }, state: null });
    assert.equal((await store.read()).subtitle, null);
});
test('quota errors propagate; failed clear tombstone suppresses old data', async () => {
    const { store, storage } = fixture();
    await store.saveRecord(record());
    store.transaction = async () => { throw new Error('quota'); };
    await assert.rejects(store.clear(), /quota/);
    assert.equal(await store.read(), null);
    storage.setItem = () => { throw new Error('disabled'); };
    assert.throws(() => store.saveState(record(), {}), /disabled/);
});
