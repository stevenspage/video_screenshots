/* Local-only persistence. No video bytes are copied into browser storage. */
(function (root) {
    'use strict';
    const KEY = 'vibo-playback-session-v1';
    const DB = 'vibo-playback-session';
    const identity = file => ({ name: file.name, size: file.size, lastModified: file.lastModified });
    const sameFile = (a, b) => Boolean(a && b && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified);
    const finite = (n, min, max, fallback) => Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    function normalizeState(value = {}) {
        if (!value || typeof value !== 'object') value = {};
        return {
            time: finite(value.time, 0, Number.MAX_SAFE_INTEGER, 0),
            rate: [0.3, 0.5, 0.75, 1, 1.25, 1.5].includes(value.rate) ? value.rate : 1,
            volume: finite(value.volume, 0, 1, 1), muted: value.muted === true,
            single: Number.isInteger(value.single) ? finite(value.single, 0, 2, 0) : 0,
            display: Number.isInteger(value.display) ? finite(value.display, 0, 3, 0) : 0,
            mask: value.mask === true, maskPercent: finite(value.maskPercent, 0, 60, 10),
            selected: Array.isArray(value.selected) ? [...new Set(value.selected.filter(n => Number.isSafeInteger(n) && n >= 0))] : []
        };
    }
    function validRecord(record) {
        return Boolean(record && record.version === 1 && typeof record.id === 'string' && record.video &&
            typeof record.video.name === 'string' && Number.isSafeInteger(record.video.size) && record.video.size >= 0 &&
            Number.isFinite(record.video.lastModified));
    }
    class Store {
        constructor(storage, indexedDB) {
            this.storage = storage;
            this.indexedDB = indexedDB;
            this.queue = Promise.resolve();
        }
        async database() {
            if (!this.connection) {
                this.connection = new Promise((resolve, reject) => {
                    const request = this.indexedDB.open(DB, 1);
                    request.onupgradeneeded = () => request.result.createObjectStore('session');
                    request.onsuccess = () => {
                        request.result.onversionchange = () => request.result.close();
                        resolve(request.result);
                    };
                    request.onerror = () => reject(request.error);
                    request.onblocked = () => reject(new Error('播放记录数据库被其他页面占用'));
                });
            }
            return this.connection;
        }
        async transaction(mode, action) {
            const db = await this.database();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('session', mode);
                const request = action(tx.objectStore('session'));
                tx.oncomplete = () => resolve(request.result);
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('播放记录存储失败'));
            });
        }
        enqueue(action) {
            const result = this.queue.then(action);
            this.queue = result.catch(() => {});
            return result;
        }
        readLight() {
            const raw = this.storage.getItem(KEY);
            if (!raw) return null;
            try {
                const value = JSON.parse(raw);
                return validRecord(value) ? { ...value, state: normalizeState(value.state) } : null;
            } catch { return null; }
        }
        async read() {
            const light = this.readLight();
            if (light?.cleared) return null;
            const heavy = await this.transaction('readonly', s => s.get('latest'));
            if (heavy && (!heavy.subtitle || typeof heavy.subtitle.content !== 'string' || typeof heavy.subtitle.name !== 'string')) {
                heavy.subtitle = null;
            }
            // Never attach a stale handle or subtitle to a newer video.
            if (light) return heavy?.id === light.id ? { ...heavy, ...light } : light;
            return validRecord(heavy) ? { ...heavy, state: normalizeState(heavy.state) } : null;
        }
        saveState(record, state) {
            const light = { version: 1, id: record.id, video: record.video, demo: record.demo === true, state: normalizeState(state) };
            this.storage.setItem(KEY, JSON.stringify(light));
        }
        saveRecord(record) {
            // Snapshot before queuing so subsequent selection changes cannot alter an older write.
            const snapshot = { ...record, video: { ...record.video }, state: normalizeState(record.state) };
            return this.enqueue(() => this.transaction('readwrite', s => s.put(snapshot, 'latest')));
        }
        clear() {
            // A tombstone prevents an old IndexedDB record resurfacing if its deletion fails.
            this.storage.setItem(KEY, JSON.stringify({ version: 1, id: 'cleared', video: { name: '', size: 0, lastModified: 0 }, cleared: true }));
            return this.enqueue(async () => {
                await this.transaction('readwrite', s => s.delete('latest'));
                if (this.readLight()?.cleared) this.storage.removeItem(KEY);
            });
        }
    }
    const api = { Store, identity, sameFile, normalizeState, validRecord, KEY };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PlaybackSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
