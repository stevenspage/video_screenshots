// Integration with the player. Load before script.js; initialization runs after page setup.
let sessionStore;
let activeSession = null;
let pendingSession = null;
let sessionGeneration = 0;
let sessionSelectionRequest = 0;
let subtitleGeneration = 0;
let sessionRestoring = false;
let sessionMediaReady = false;
let sessionCapture = false;
let sessionObjectURL = null;
let sessionWarningShown = false;
let sessionStarted = false;
let sessionMetadataHandler = null;

function sessionMessage(message, canRestore = false) {
    document.getElementById('sessionMessage').textContent = message;
    document.getElementById('restoreSession').hidden = !canRestore;
    document.getElementById('clearSession').hidden = !(activeSession || pendingSession);
}

function sessionStorageError(error) {
    console.warn('播放记录存储失败:', error);
    if (!sessionWarningShown) {
        sessionWarningShown = true;
        sessionMessage('浏览器无法完整保存播放记录；当前播放不受影响。');
    }
}

function readPlaybackState() {
    return PlaybackSession.normalizeState({
        time: player.currentTime(), rate: player.playbackRate(), volume: player.volume(), muted: player.muted(),
        single: singleLineModeState, display: subtitleDisplayMode,
        mask: isSubtitleMaskEnabled, maskPercent: subtitleMaskPercent,
        selected: Array.from(document.querySelectorAll('.subtitle-item-checkbox:checked'), cb => Number(cb.dataset.index))
    });
}

function savePlaybackSession() {
    if (!sessionStore || sessionRestoring || sessionCapture) return;
    if (!activeSession && pendingSession) {
        pendingSession.state = { ...readPlaybackState(), time: pendingSession.state.time };
        try { sessionStore.saveState(pendingSession, pendingSession.state); }
        catch (error) { sessionStorageError(error); }
        return;
    }
    if (!activeSession || !sessionMediaReady) return;
    activeSession.state = readPlaybackState();
    try { sessionStore.saveState(activeSession, activeSession.state); }
    catch (error) { sessionStorageError(error); }
}

function persistSessionRecord() {
    if (!activeSession || !sessionStore) return;
    const generation = sessionGeneration;
    sessionStore.saveRecord(activeSession).catch(error => {
        if (generation === sessionGeneration) sessionStorageError(error);
    });
}

function applyPlaybackSettings(state) {
    const s = PlaybackSession.normalizeState(state);
    player.playbackRate(s.rate);
    player.volume(s.volume);
    player.muted(s.muted);
    singleLineModeState = s.single;
    subtitleDisplayMode = s.display;
    isSubtitleMaskEnabled = s.mask;
    subtitleMaskPercent = s.maskPercent;
    updateSinglePlayModeButton();
    updateSubtitleDisplayModeButton();
    refreshSubtitleDisplayByMode();
    updateSubtitleMaskButton();
    applySubtitleMaskState();
}

function restoreSubtitleSelection(state) {
    const selected = new Set(PlaybackSession.normalizeState(state).selected);
    document.querySelectorAll('.subtitle-item-checkbox').forEach(cb => { cb.checked = selected.has(Number(cb.dataset.index)); });
    updateSelectedCount();
    updateCurrentSubtitle(player.currentTime());
}

function resetSessionSubtitles() {
    subtitles = [];
    displaySubtitles();
    subtitleSearch.classList.remove('visible');
    subtitleToolbar.classList.remove('visible');
    subtitleFileName.textContent = '未选择文件';
}

// Runs synchronously before replacing player.src, including for dropped files and demo media.
function beginVideoSession(file, options) {
    savePlaybackSession();
    cancelScreenshotSeek?.();
    if (!options.demo && !options.restore) ++sessionSelectionRequest;
    const previous = options.restore || pendingSession || activeSession;
    const matches = previous && PlaybackSession.sameFile(previous.video, PlaybackSession.identity(file));
    const restore = matches ? previous : null;
    const settings = restore?.state || (player ? readPlaybackState() : {});
    const state = PlaybackSession.normalizeState({ ...settings, time: restore ? settings.time : 0, selected: restore ? settings.selected : [] });
    const generation = ++sessionGeneration;
    ++subtitleGeneration;
    sessionRestoring = true;
    sessionMediaReady = false;
    sessionCapture = false;
    pendingSession = null;
    activeSession = {
        version: 1, id: restore?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        video: PlaybackSession.identity(file), handle: options.handle || restore?.handle || null,
        demo: options.demo === true, subtitle: restore?.subtitle || null, state
    };
    resetSessionSubtitles();
    if (activeSession.subtitle) {
        const saved = activeSession.subtitle;
        subtitles = parseSRT(saved.content);
        displaySubtitles();
        subtitleFileName.textContent = saved.name;
        restoreSubtitleSelection(state);
    }
    applyPlaybackSettings(state);
    if (sessionMetadataHandler) player.off('loadedmetadata', sessionMetadataHandler);
    sessionMetadataHandler = function () {
        if (generation !== sessionGeneration) return;
        player.pause();
        applyPlaybackSettings(state);
        const duration = player.duration();
        player.currentTime(Number.isFinite(duration) ? Math.min(state.time, Math.max(0, duration)) : 0);
        sessionMediaReady = true;
        sessionRestoring = false;
        restoreSubtitleSelection(activeSession.state);
        savePlaybackSession();
        if (restore && !sessionWarningShown) sessionMessage('已恢复上次会话，点击播放继续。');
    };
    player.one('loadedmetadata', sessionMetadataHandler);
    // Save intended state now, never the previous video's currentTime.
    try { sessionStore?.saveState(activeSession, state); } catch (error) { sessionStorageError(error); }
    persistSessionRecord();
    sessionMessage(sessionWarningShown ? '浏览器无法完整保存播放记录；当前播放不受影响。' :
        restore ? '正在恢复上次会话…' : '播放记录仅保存在当前浏览器。');
    return { generation, hasSubtitle: Boolean(activeSession.subtitle) };
}

function rememberSessionSubtitle(name, content) {
    if (!activeSession && pendingSession) {
        pendingSession.subtitle = { name, content };
        pendingSession.state.selected = [];
        try { sessionStore?.saveState(pendingSession, pendingSession.state); } catch (error) { sessionStorageError(error); }
        sessionStore?.saveRecord(pendingSession).catch(sessionStorageError);
        return;
    }
    if (!activeSession) return;
    activeSession.subtitle = { name, content };
    activeSession.state.selected = [];
    savePlaybackSession();
    persistSessionRecord();
}

async function chooseSessionVideo() {
    if (!window.showOpenFilePicker || !window.isSecureContext) {
        videoInput.click();
        return;
    }
    // Background demo/restoration may finish while the native picker is open.
    // Only a newer user selection should supersede the file chosen here.
    const request = ++sessionSelectionRequest;
    try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: '视频', accept: { 'video/*': ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.ogg', '.wmv'] } }] });
        const file = await handle.getFile();
        if (request !== sessionSelectionRequest) return;
        loadVideo(file, { handle });
    } catch (error) {
        if (request !== sessionSelectionRequest) return;
        if (error.name !== 'AbortError') {
            sessionMessage('无法使用文件授权，请通过普通文件选择导入视频。');
            videoInput.click();
        }
    }
}

async function restorePlaybackSession(requestPermission = false) {
    const record = pendingSession;
    if (!record) return;
    const generation = sessionGeneration;
    if (record.demo) {
        await loadDemoFiles(record);
        return;
    }
    if (!record.handle || typeof record.handle.queryPermission !== 'function') {
        sessionMessage(`请重新选择原视频「${record.video.name}」，将恢复字幕和播放进度。`);
        return;
    }
    try {
        // requestPermission must run directly in the click gesture, before any await.
        const permission = requestPermission
            ? await record.handle.requestPermission({ mode: 'read' })
            : await record.handle.queryPermission({ mode: 'read' });
        if (generation !== sessionGeneration || pendingSession !== record) return;
        if (permission !== 'granted') {
            sessionMessage(`点击授权恢复「${record.video.name}」，也可重新选择原视频。`, true);
            return;
        }
        const file = await record.handle.getFile();
        if (generation !== sessionGeneration || pendingSession !== record) return;
        if (!PlaybackSession.sameFile(record.video, PlaybackSession.identity(file))) {
            sessionMessage('原视频已发生变化，请重新选择视频。');
            return;
        }
        loadVideo(file, { handle: record.handle, restore: record });
    } catch (error) {
        if (generation === sessionGeneration && pendingSession === record) {
            sessionMessage('无法访问原视频，请重新选择；原有字幕和进度仍保留。', true);
        }
    }
}

async function clearPlaybackSession() {
    savePlaybackSession();
    cancelScreenshotSeek?.();
    ++sessionSelectionRequest;
    ++sessionGeneration;
    ++subtitleGeneration;
    activeSession = pendingSession = null;
    const generation = sessionGeneration;
    sessionRestoring = false;
    if (sessionMetadataHandler) player.off('loadedmetadata', sessionMetadataHandler);
    try {
        await sessionStore.clear();
        if (generation === sessionGeneration) sessionMessage('播放记录已清除；下次选择视频后重新记录。');
    } catch (error) {
        if (generation === sessionGeneration) sessionMessage('播放记录未能完全清除，请在浏览器设置中清除此网站的数据。');
    }
}

async function initializePlaybackSession() {
    if (sessionStarted) return;
    sessionStarted = true;
    document.querySelector('label[for="videoInput"]').addEventListener('click', event => {
        event.preventDefault();
        void chooseSessionVideo();
    });
    document.getElementById('restoreSession').addEventListener('click', () => void restorePlaybackSession(true));
    document.getElementById('clearSession').addEventListener('click', () => void clearPlaybackSession());
    ['pause', 'seeked', 'ratechange', 'volumechange', 'ended'].forEach(event => player.on(event, savePlaybackSession));
    setInterval(savePlaybackSession, 2000);
    window.addEventListener('pagehide', savePlaybackSession);
    document.addEventListener('visibilitychange', () => { if (document.hidden) savePlaybackSession(); });
    ['click', 'change', 'mouseup', 'touchend', 'touchcancel'].forEach(event => {
        document.addEventListener(event, () => queueMicrotask(savePlaybackSession));
    });
    const generation = sessionGeneration;
    let record;
    const subtitleToken = subtitleGeneration;
    try {
        sessionStore = new PlaybackSession.Store(window.localStorage, window.indexedDB);
        record = await sessionStore.read();
    } catch (error) {
        sessionStorageError(error);
        try { record = sessionStore?.readLight(); } catch { /* Playback remains available. */ }
    }
    if (generation !== sessionGeneration || subtitleToken !== subtitleGeneration) return;
    if (record && !record.cleared) {
        pendingSession = record;
        sessionRestoring = true;
        applyPlaybackSettings(record.state);
        if (record.subtitle && typeof record.subtitle.content === 'string') {
            subtitles = parseSRT(record.subtitle.content);
            displaySubtitles();
            subtitleFileName.textContent = record.subtitle.name;
            restoreSubtitleSelection(record.state);
        }
        sessionRestoring = false;
        await restorePlaybackSession();
    } else {
        await loadDemoFiles();
    }
}
