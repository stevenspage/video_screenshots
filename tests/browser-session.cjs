const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const videoPath = path.join(root, 'playback_demo/House-of-Cards-Series-Trailer_with_subtitles.mp4');
const subPath = path.join(root, 'playback_demo/House-of-Cards-Series-Trailer.srt');
const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const size = fs.statSync(file).size;
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.srt': 'text/plain' }[path.extname(file)] || 'application/octet-stream';
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(range ? 206 : 200, { 'Content-Type': mime, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
});

async function run(channel, url) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibo-session-' + channel + '-'));
    let context;
    const errors = [];
    async function open() {
        context = await chromium.launchPersistentContext(profile, { channel, headless: true });
        const page = context.pages()[0];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => typeof player !== 'undefined' && sessionStarted);
        return page;
    }
    async function ready(page) {
        await page.waitForFunction(() => sessionMediaReady && !sessionRestoring && subtitles.length > 0);
    }
    try {
        let page = await open();
        await ready(page);
        // Actual player events and UI settings persist across a full browser process restart.
        await page.evaluate(() => {
            player.currentTime(15); player.playbackRate(0.75); player.volume(0.4); player.muted(true);
        });
        await page.locator('#subtitleDisplayModeBtn').click();
        await page.locator('#singlePlayModeBtn').click();
        await page.locator('#subtitleMaskToggleBtn').click();
        await page.locator('.subtitle-item-checkbox').nth(1).check();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.time >= 14);
        await context.close();
        page = await open();
        await ready(page);
        assert.deepEqual(await page.evaluate(() => ({ time: Math.round(player.currentTime()), rate: player.playbackRate(), volume: player.volume(), muted: player.muted(), paused: player.paused(), single: singleLineModeState, display: subtitleDisplayMode, mask: isSubtitleMaskEnabled, selected: readPlaybackState().selected })),
            { time: 15, rate: 0.75, volume: 0.4, muted: true, paused: true, single: 1, display: 1, mask: true, selected: [1] });
        console.log(channel + ': full browser restart restored demo, settings and subtitles');

        await page.locator('#videoInput').setInputFiles(videoPath);
        await page.locator('#subtitleInput').setInputFiles(subPath);
        await ready(page);
        await page.evaluate(() => player.currentTime(22));
        await page.waitForFunction(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.time >= 21);
        await context.close();
        page = await open();
        await page.waitForFunction(() => pendingSession && subtitles.length > 0);
        assert.match(await page.locator('#sessionMessage').innerText(), /重新选择原视频/);
        await page.locator('#subtitleDisplayModeBtn').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.display), 2);
        assert.equal(Math.round(await page.evaluate(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.time)), 22);
        await page.locator('#videoInput').setInputFiles(videoPath);
        await ready(page);
        assert.equal(Math.round(await page.evaluate(() => player.currentTime())), 22);
        assert.equal(await page.evaluate(() => subtitleDisplayMode), 2);
        console.log(channel + ': ordinary file fallback restored progress on reselect');

        // Persist a real serializable FileSystemFileHandle in the isolated test profile.
        // OPFS supplies a handle without automating the OS picker; production never copies video bytes.
        await page.evaluate(async () => {
            const dir = await navigator.storage.getDirectory();
            const handle = await dir.getFileHandle('handle-test.mp4', { create: true });
            const writable = await handle.createWritable();
            await writable.write(await (await fetch('playback_demo/House-of-Cards-Series-Trailer_with_subtitles.mp4')).blob());
            await writable.close();
            loadVideo(await handle.getFile(), { handle });
        });
        await page.locator('#subtitleInput').setInputFiles(subPath);
        await ready(page);
        await page.evaluate(() => player.currentTime(31));
        await page.waitForFunction(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.time >= 30);
        await page.evaluate(() => sessionStore.queue);
        await context.close();
        page = await open();
        await ready(page);
        assert.equal(Math.round(await page.evaluate(() => player.currentTime())), 31);
        assert.equal(await page.evaluate(() => player.paused()), true);
        console.log(channel + ': persisted real file handle restored after browser restart');

        // Permission outcomes are injected at the handle boundary, exercising the real restore UI.
        await page.evaluate(async () => {
            pendingSession = { ...activeSession, handle: { queryPermission: async () => 'prompt', requestPermission: async () => 'denied' } };
            await restorePlaybackSession();
        });
        assert.equal(await page.locator('#restoreSession').isVisible(), true);
        await page.locator('#restoreSession').click();
        assert.equal(await page.locator('#restoreSession').isVisible(), true);
        await page.evaluate(async () => {
            pendingSession.handle = { queryPermission: async () => 'granted', getFile: async () => { throw new DOMException('missing', 'NotFoundError'); } };
            await restorePlaybackSession();
        });
        assert.match(await page.locator('#sessionMessage').innerText(), /无法访问/);
        await page.evaluate(async () => {
            pendingSession.handle = { queryPermission: async () => 'granted', getFile: async () => ({ ...pendingSession.video, size: 0 }) };
            await restorePlaybackSession();
        });
        assert.match(await page.locator('#sessionMessage').innerText(), /发生变化/);
        await page.locator('#clearSession').click();
        await page.waitForFunction(() => document.getElementById('sessionMessage').textContent.includes('已清除'));
        await page.evaluate(() => savePlaybackSession());
        assert.equal(await page.evaluate(() => localStorage.getItem(PlaybackSession.KEY)), null);
        assert.equal(await page.evaluate(() => sessionStore.read()), null);
        console.log(channel + ': permission denial, missing file and clear passed');
        await page.locator('#subtitleDisplayModeBtn').click();
        await page.locator('#subtitleDisplayModeBtn').click();

        // A delayed automatic subtitle must not overwrite a manual subtitle.
        let releaseAuto;
        let autoStarted;
        const autoStartedPromise = new Promise(resolve => { autoStarted = resolve; });
        const autoGate = new Promise(resolve => { releaseAuto = resolve; });
        await page.route('**/subs/**', async route => {
            autoStarted();
            await autoGate;
            await route.fulfill({ status: 200, body: '1\n00:00:01,000 --> 00:00:03,000\nAUTO OLD\n' });
        });
        await page.evaluate(async () => {
            const blob = await (await fetch('playback_demo/House-of-Cards-Series-Trailer_with_subtitles.mp4')).blob();
            window.testVideoBlob = blob;
            loadVideo(new File([blob], 'House.Of.Cards.S01E01.mp4', { lastModified: 1 }));
        });
        await autoStartedPromise;
        await page.locator('#subtitleInput').setInputFiles({ name: 'manual.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:02,000 --> 00:00:04,000\nMANUAL WINS\n') });
        await ready(page);
        releaseAuto();
        await page.waitForResponse(response => response.url().includes('/subs/'));
        assert.match(await page.locator('#subtitleList').innerText(), /MANUAL WINS/);
        await page.unroute('**/subs/**');

        // Replace a video before metadata arrives; only the final selection may save state.
        await page.evaluate(() => {
            loadVideo(new File([testVideoBlob], 'first.mp4', { lastModified: 1 }));
            loadSubtitle(new File(['1\n00:00:01,000 --> 00:00:03,000\nOLD FILE\n'], 'old.srt'));
            loadVideo(new File([testVideoBlob], 'second.mp4', { lastModified: 2 }));
            loadSubtitle(new File(['1\n00:00:02,000 --> 00:00:04,000\nLATEST FILE\n'], 'latest.srt'));
        });
        await ready(page);
        await page.evaluate(() => sessionStore.queue);
        assert.equal(await page.evaluate(() => activeSession.video.name), 'second.mp4');
        assert.match(await page.locator('#subtitleList').innerText(), /LATEST FILE/);
        assert.equal(await page.evaluate(async () => (await sessionStore.read()).video.name), 'second.mp4');

        await page.evaluate(() => player.currentTime(20));
        await page.waitForFunction(() => Math.round(player.currentTime()) === 20 && !player.seeking());
        await page.locator('.subtitle-item-checkbox').first().check();
        await page.locator('#generateScreenshots').click();
        await page.waitForFunction(() => !sessionCapture && document.getElementById('screenshotEditor').classList.contains('show'));
        assert.equal(Math.round(await page.evaluate(() => player.currentTime())), 20);
        assert.equal(Math.round(await page.evaluate(() => JSON.parse(localStorage.getItem(PlaybackSession.KEY)).state.time)), 20);
        await page.locator('#closeEditor').click();
        console.log(channel + ': automatic/manual subtitle race, rapid video switch and screenshot progress passed');

        // Capture the actual UI and verify the recovery controls remain usable on mobile.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#clearSession').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(os.tmpdir(), 'vibo-session-' + channel + '.png'), fullPage: true });
        await page.locator('#clearSession').click();
        await page.waitForFunction(() => document.getElementById('sessionMessage').textContent.includes('已清除'));
        await page.evaluate(() => localStorage.setItem(PlaybackSession.KEY, '{corrupt'));
        await page.reload();
        await ready(page);
        assert.equal(await page.evaluate(() => activeSession.demo), true);
        await page.evaluate(() => { player.currentTime(player.duration()); player.trigger('ended'); });
        await page.waitForFunction(() => !player.seeking());
        await page.reload();
        await ready(page);
        assert.ok(await page.evaluate(() => Math.abs(player.currentTime() - player.duration()) < 0.1 && player.paused()));
        // Storage failure is visible but must not prevent loading or playing a video.
        await page.evaluate(async () => {
            sessionStore.saveState = () => { throw new DOMException('quota', 'QuotaExceededError'); };
            sessionStore.saveRecord = async () => { throw new DOMException('quota', 'QuotaExceededError'); };
            const blob = await (await fetch('playback_demo/House-of-Cards-Series-Trailer_with_subtitles.mp4')).blob();
            loadVideo(new File([blob], 'storage-disabled.mp4', { lastModified: 1 }));
        });
        await page.waitForFunction(() => sessionMediaReady);
        assert.match(await page.locator('#sessionMessage').innerText(), /无法完整保存/);
        await page.evaluate(async () => { await player.play(); player.pause(); });
        assert.deepEqual(errors, []);
        console.log(channel + ': mobile clear, corrupted records and storage failure passed; no page errors');
    } finally {
        await context?.close();
        // Only our freshly created, isolated temporary profile is removed.
        assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(profile).startsWith('vibo-session-' + channel + '-'));
        fs.rmSync(profile, { recursive: true, force: true });
    }
}
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/index.html`;
        for (const channel of ['chrome', 'msedge']) await run(channel, url);
    } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
