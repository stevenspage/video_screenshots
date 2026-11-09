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
let sessionThumbnailSavedAt = 0;
let sessionThumbnailTime = -1;

function sessionMessage(message, canRestore = false) {
    const card = document.querySelector('.session-controls');
    const record = pendingSession;
    card.hidden = !record;
    if (!record) {
        card.querySelector('details').open = false;
        return;
    }
    const thumbnail = document.getElementById('sessionThumbnail');
    const hasThumbnail = typeof record.thumbnail === 'string' && record.thumbnail.startsWith('data:image/jpeg;base64,');
    thumbnail.hidden = !hasThumbnail;
    document.getElementById('sessionThumbnailFallback').hidden = hasThumbnail;
    if (hasThumbnail) thumbnail.src = record.thumbnail;
    else thumbnail.removeAttribute('src');
    document.getElementById('sessionTitle').textContent = record.video.name;
    const seconds = Math.floor(PlaybackSession.normalizeState(record.state).time);
    const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map(n => String(n).padStart(2, '0')).join(':');
    document.getElementById('sessionPosition').textContent = `已看到 ${time} · ${record.subtitle ? '字幕与学习设置已保留' : '学习设置已保留'}`;
    document.getElementById('sessionMessage').textContent = message || '';
    const button = document.getElementById('restoreSession');
    button.hidden = false;
    button.disabled = sessionRestoring;
    button.textContent = record.demo || record.handle ? '恢复播放' : '选择原视频恢复';
    document.getElementById('clearSession').hidden = false;
}

function sessionStorageError(error) {
    console.warn('播放记录存储失败:', error);
    if (!sessionWarningShown) {
        sessionWarningShown = true;
        showStatus('浏览器无法完整保存播放记录；当前播放不受影响。', 'info', 4000, true);
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
    captureSessionThumbnail();
    try { sessionStore.saveState(activeSession, activeSession.state); }
    catch (error) { sessionStorageError(error); }
}

function captureSessionThumbnail(force = false) {
    if (!activeSession || !sessionStore || !sessionMediaReady || sessionRestoring || sessionCapture) return;
    const video = player.el().querySelector('video');
    if (!video || video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) return;
    if (activeSession.thumbnail && Math.abs(video.currentTime - sessionThumbnailTime) < 0.5) return;
    if (!force && activeSession.thumbnail && Date.now() - sessionThumbnailSavedAt < 10000) return;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = Math.max(1, Math.round(240 * video.videoHeight / video.videoWidth));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        activeSession.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        sessionThumbnailSavedAt = Date.now();
        sessionThumbnailTime = video.currentTime;
        persistSessionRecord();
    } catch (error) {
        // An unreadable frame must not interrupt playback or discard an existing preview.
        console.warn('无法生成播放预览:', error);
    }
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
    sessionThumbnailSavedAt = 0;
    sessionThumbnailTime = -1;
    sessionCapture = false;
    pendingSession = restore;
    activeSession = {
        version: 1, id: restore?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        video: PlaybackSession.identity(file), handle: options.handle || restore?.handle || null,
        demo: options.demo === true, subtitle: restore?.subtitle || null, thumbnail: restore?.thumbnail || null, state
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
        pendingSession = null;
        restoreSubtitleSelection(activeSession.state);
        savePlaybackSession();
        sessionMessage('');
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
        sessionMessage('请选择原视频，载入后自动恢复进度。');
        if (requestPermission) await chooseSessionVideo();
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
        if (generation === sessionGeneration) showStatus('播放记录未能完全清除，请在浏览器设置中清除此网站的数据。', 'error', 5000, true);
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
    ['loadeddata', 'pause', 'seeked'].forEach(event => player.on(event, () => captureSessionThumbnail(true)));
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
        sessionMessage('');
    } else {
        await loadDemoFiles();
    }
}
