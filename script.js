
const videoInput = document.getElementById('videoInput');
const subtitleInput = document.getElementById('subtitleInput');
const subtitleList = document.getElementById('subtitleList');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const videoFileName = document.getElementById('videoFileName');
const subtitleFileName = document.getElementById('subtitleFileName');
const subtitleStatus = document.getElementById('subtitleStatus');
const subtitleCount = document.getElementById('subtitleCount');
const subtitleSearchInput = document.getElementById('subtitleSearchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const searchResults = document.getElementById('searchResults');
const subtitleSearch = document.querySelector('.subtitle-search');
const selectAllCheckbox = document.getElementById('selectAllSubtitles');
const generateScreenshotsBtn = document.getElementById('generateScreenshots');
const repeatPlayBtn = document.getElementById('repeatPlay');
const repeatPlayText = document.getElementById('repeatPlayText');
const repeatPlayIcon = document.getElementById('repeatPlayIcon');
const singlePlayModeBtn = document.getElementById('singlePlayModeBtn');
const subtitleMaskToggleBtn = document.getElementById('subtitleMaskToggleBtn');
const subtitleMaskOverlay = document.getElementById('subtitleMaskOverlay');
const subtitleMaskHandle = document.getElementById('subtitleMaskHandle');
const subtitleDisplayModeBtn = document.getElementById('subtitleDisplayModeBtn');
const selectedCountSpan = document.getElementById('selectedCount');
const subtitleToolbar = document.querySelector('.subtitle-toolbar');
const appContainer = document.querySelector('.container');
const videoSection = document.querySelector('.video-section');
const videoWrapper = document.querySelector('.video-wrapper');
const subtitleSection = document.querySelector('.subtitle-section');
const layoutResizer = document.getElementById('layoutResizer');

let subtitles = [];
let currentSubtitleIndex = -1;
let videoFile = null;
let player = null;
let lastCheckedIndex = -1; 
let isRepeating = false;
let repeatInterval = null;
let repeatTimeUpdateHandler = null;
const SINGLE_LINE_MODE_OFF = 0;
const SINGLE_LINE_MODE_PLAY = 1;
const SINGLE_LINE_MODE_PREVIEW = 2;
const SUBTITLE_DISPLAY_MODE_BILINGUAL = 0;
const SUBTITLE_DISPLAY_MODE_ENGLISH = 1;
const SUBTITLE_DISPLAY_MODE_CHINESE = 2;
const SUBTITLE_DISPLAY_MODE_HIDDEN = 3;
let singleLineModeState = SINGLE_LINE_MODE_OFF;
let subtitleDisplayMode = SUBTITLE_DISPLAY_MODE_BILINGUAL;
let isSingleLinePlaying = false;
let singleLineTimeUpdateHandler = null;
let statusHideTimer = null;
const DEFAULT_SUBTITLE_MASK_PERCENT = 10;
const MIN_SUBTITLE_MASK_PERCENT = 0;
const MAX_SUBTITLE_MASK_PERCENT = 60;
const SUBTITLE_MASK_HANDLE_AUTO_HIDE_MS = 3000;
let isSubtitleMaskEnabled = false;
let isSubtitleMaskDragging = false;
let subtitleMaskPercent = DEFAULT_SUBTITLE_MASK_PERCENT;
let subtitleMaskBaseParent = null;
let subtitleMaskHandleHideTimer = null;
let subtitleMaskSyncSequence = 0;

const DEFAULT_SUBTITLE_WIDTH = 400;
const MIN_SUBTITLE_WIDTH = 280;
const MIN_VIDEO_WIDTH = 420;
const MIN_SUBTITLE_FONT_SCALE = 1;
const MAX_SUBTITLE_FONT_SCALE = 1.35;
const LAYOUT_STORAGE_KEY = 'vib-player-subtitle-width';
const HOUSE_OF_CARDS_KEYWORD = 'houseofcards';
const HOUSE_OF_CARDS_SUBTITLE_ROOT = 'subs';
const HOUSE_OF_CARDS_YEAR_BY_SEASON = {
    1: '2013',
    2: '2014',
    3: '2015',
    4: '2016',
    5: '2017',
    6: '2018'
};

let isLayoutResizing = false;
let layoutDragStartX = 0;
let layoutStartSubtitleWidth = DEFAULT_SUBTITLE_WIDTH;
let preferredSubtitleWidth = DEFAULT_SUBTITLE_WIDTH;

function initVideoPlayer() {
    player = videojs('videoPlayer', {
        controls: true,
        fluid: true,
        preload: 'auto',
        language: 'zh-CN',
        playbackRates: [0.3, 0.5, 0.75, 1, 1.25, 1.5],
        controlBar: {
            children: [
                'playToggle',
                'volumePanel',
                'currentTimeDisplay',
                'timeDivider',
                'durationDisplay',
                'progressControl',
                'playbackRateMenuButton',
                'fullscreenToggle'
            ]
        },
        userActions: {
            hotkeys(event) {
                const target = event.target;
                const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
                const isFormField = tag === 'input' || tag === 'textarea' || tag === 'select';
                if (isFormField || (target && target.isContentEditable)) {
                    return;
                }
                if (event.key === ' ' || event.code === 'Space') {
                    event.preventDefault();
                    if (this.paused()) {
                        this.play();
                    } else {
                        this.pause();
                    }
                }
            }
        }
    });

    player.on('timeupdate', function() {
        const currentTime = player.currentTime();
        updateCurrentSubtitle(currentTime);
    });

    player.on('play', function() {
        const overlay = document.getElementById('manualScreenshotOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
        syncSubtitleMaskHandleVisibility();
    });

    player.on('pause', function() {
        const overlay = document.getElementById('manualScreenshotOverlay');
        if (overlay && player && player.readyState() >= 2) {
            overlay.classList.add('show');
        }
        syncSubtitleMaskHandleVisibility();
    });

    player.on('fullscreenchange', function() {
        scheduleSubtitleMaskSync();
    });

    player.on('useractive', function() {
        syncSubtitleMaskHandleVisibility();
    });

    player.on('userinactive', function() {
        syncSubtitleMaskHandleVisibility();
    });

    updateSinglePlayModeButton();
    scheduleSubtitleMaskSync();

    return player;
}

videoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        const isVideo = fileType.startsWith('video/') || 
                       fileName.endsWith('.mp4') || 
                       fileName.endsWith('.mkv') || 
                       fileName.endsWith('.avi') || 
                       fileName.endsWith('.mov') || 
                       fileName.endsWith('.webm') || 
                       fileName.endsWith('.flv');
        
        if (!isVideo) {
            alert('请选择视频文件');
            e.target.value = '';
            return;
        }
        
        videoFile = file;
        loadVideo(file);
        videoFileName.textContent = file.name;
    }
});

subtitleInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        loadSubtitle(file);
        subtitleFileName.textContent = file.name;
    }
});

function loadVideo(file, options = {}) {
    const { skipAutoSubtitle = false } = options;

    if (!player) {
        initVideoPlayer();
    }
    
    if (isRepeating) {
        stopRepeatPlay();
    }
    if (isSingleLinePlaying) {
        stopSingleLinePlay(false);
    }
    
    manualScreenshots = [];
    updateManualScreenshotControls();
    
    const url = URL.createObjectURL(file);
    const isMKV = file.name.toLowerCase().endsWith('.mkv');
    
    player.poster('');
    player.src({
        type: getMimeType(file),
        src: url
    });
    
    videoPlaceholder.classList.add('hidden');
    
    const mkvWarningBanner = document.getElementById('mkvWarningBanner');
    if (isMKV) {
        mkvWarningBanner.classList.add('show');
    } else {
        mkvWarningBanner.classList.remove('show');
    }
    
    player.one('error', function() {
        const error = player.error();
        console.error('视频加载错误:', error);
        
        let errorMessage = '视频加载失败：';
        
        if (error && error.code === 4) {
            errorMessage += '该视频格式不被支持。\n\n';
            
            if (isMKV) {
                errorMessage += '即使以 MP4 模式加载，此 MKV 文件的视频编码也不被浏览器支持。\n\n';
                errorMessage += '建议使用 FFmpeg 转换：\n';
                errorMessage += 'ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4';
            } else {
                errorMessage += '请尝试使用 MP4 格式的视频文件，或使用视频转换工具转换格式。';
            }
        } else {
            errorMessage += '未知错误，请检查视频文件是否损坏。';
        }
        
        showStatus(errorMessage, 'error');
        alert(errorMessage);
    });
    
    player.one('loadeddata', function() {
        console.log('视频加载完成:', file.name);
        showStatus(`视频加载成功：${file.name}`, 'success');
        
        if (player.paused()) {
            const overlay = document.getElementById('manualScreenshotOverlay');
            if (overlay && player.readyState() >= 2) {
                overlay.classList.add('show');
            }
        }
    });
    
    if (!skipAutoSubtitle) {
        void tryAutoLoadHouseOfCardsSubtitle(file);
    }

    player.ready(function() {
        
    });
}

function getMimeType(file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.mp4')) return 'video/mp4';
    if (fileName.endsWith('.webm')) return 'video/webm';
    if (fileName.endsWith('.ogg')) return 'video/ogg';
    if (fileName.endsWith('.mkv')) return 'video/mp4';
    if (fileName.endsWith('.avi')) return 'video/x-msvideo';
    if (fileName.endsWith('.mov')) return 'video/quicktime';
    return file.type || 'video/mp4';
}

function normalizeAlphaNumeric(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseSeasonEpisodeFromVideoName(videoName) {
    const normalizedName = normalizeAlphaNumeric(videoName);
    const match = normalizedName.match(/s(\d{1,2})e(\d{1,2})/);
    if (!match) return null;

    return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10)
    };
}

function buildHouseOfCardsSubtitleCandidates(season, episode) {
    const seasonTag = `S${String(season).padStart(2, '0')}`;
    const episodeTag = `E${String(episode).padStart(2, '0')}`;
    const seasonEpisodeTag = `${seasonTag}${episodeTag}`;
    const seasonDir = `${HOUSE_OF_CARDS_SUBTITLE_ROOT}/${seasonTag}`;
    const mappedYear = HOUSE_OF_CARDS_YEAR_BY_SEASON[season];

    const candidates = [];

    if (mappedYear) {
        candidates.push(`${seasonDir}/纸牌屋.House.Of.Cards.${mappedYear}.${seasonEpisodeTag}.srt`);
        candidates.push(`${seasonDir}/House.Of.Cards.${mappedYear}.${seasonEpisodeTag}.srt`);
        candidates.push(`${seasonDir}/house.of.cards.${mappedYear}.${seasonEpisodeTag}.srt`);
    }

    candidates.push(`${seasonDir}/纸牌屋.House.Of.Cards.${seasonEpisodeTag}.srt`);
    candidates.push(`${seasonDir}/House.Of.Cards.${seasonEpisodeTag}.srt`);
    candidates.push(`${seasonDir}/house.of.cards.${seasonEpisodeTag}.srt`);

    return [...new Set(candidates)];
}

async function fetchSubtitleFileFromPath(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;

    const subtitleBlob = await response.blob();
    const fileName = path.split('/').pop() || 'auto-subtitle.srt';
    return new File([subtitleBlob], fileName, { type: 'application/x-subrip' });
}

async function tryAutoLoadHouseOfCardsSubtitle(file) {
    if (!file || !file.name) return false;

    const normalizedName = normalizeAlphaNumeric(file.name);
    if (!normalizedName.includes(HOUSE_OF_CARDS_KEYWORD)) return false;

    const seasonEpisode = parseSeasonEpisodeFromVideoName(file.name);
    if (!seasonEpisode) return false;

    const { season, episode } = seasonEpisode;
    const candidates = buildHouseOfCardsSubtitleCandidates(season, episode);

    for (const candidatePath of candidates) {
        try {
            const subtitleFile = await fetchSubtitleFileFromPath(candidatePath);
            if (!subtitleFile) continue;

            loadSubtitle(subtitleFile);
            subtitleFileName.textContent = subtitleFile.name;
            showStatus(`已自动加载字幕：${subtitleFile.name}`, 'success', 2000, true);
            return true;
        } catch (error) {
        }
    }

    const seasonTag = String(season).padStart(2, '0');
    const episodeTag = String(episode).padStart(2, '0');
    showStatus(`未找到匹配字幕：S${seasonTag}E${episodeTag}，请手动选择`, 'info', 2500, true);
    return false;
}

function loadSubtitle(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let content = detectAndDecodeSubtitle(uint8Array);
        
        subtitles = parseSRT(content);
        
        if (subtitles.length > 0) {
            displaySubtitles();
        } else {
            showStatus('字幕文件格式错误或为空', 'error');
        }
    };
    
    reader.onerror = function() {
        showStatus('字幕文件读取失败', 'error');
    };
    
    reader.readAsArrayBuffer(file);
}

function detectAndDecodeSubtitle(uint8Array) {
    
    if (uint8Array.length >= 3) {
        
        if (uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(uint8Array.slice(3));
        }
        
        if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
            const decoder = new TextDecoder('utf-16le');
            return decoder.decode(uint8Array.slice(2));
        }
        
        if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
            const decoder = new TextDecoder('utf-16be');
            return decoder.decode(uint8Array.slice(2));
        }
    }
    
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const text = decoder.decode(uint8Array);
        
        if (!text.includes('\uFFFD')) {
            console.log('检测到 UTF-8 编码');
            return text;
        }
    } catch (e) {
        
    }
    
    const encodingsToTry = ['gbk', 'gb2312', 'gb18030'];
    for (const encoding of encodingsToTry) {
        try {
            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(uint8Array);
            
            if (text.length > 0 && /[\u4e00-\u9fa5]/.test(text)) {
                console.log(`检测到 ${encoding.toUpperCase()} 编码`);
                return text;
            }
        } catch (e) {
            
            continue;
        }
    }
    
    const otherEncodings = ['big5', 'shift-jis', 'euc-kr'];
    for (const encoding of otherEncodings) {
        try {
            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(uint8Array);
            if (text.length > 0) {
                console.log(`使用 ${encoding.toUpperCase()} 编码`);
                return text;
            }
        } catch (e) {
            continue;
        }
    }
    
    console.warn('无法准确检测编码，使用 UTF-8（可能显示乱码）');
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(uint8Array);
}

function parseSRT(content) {
    const subtitles = [];
    
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const blocks = content.trim().split('\n\n');
    
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        
        if (lines.length >= 3) {
            const index = parseInt(lines[0]);
            const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
            
            if (timeMatch) {
                const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
                const endTime = parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
                const text = lines.slice(2).join('\n');
                const languageParts = splitSubtitleByLanguage(text);
                
                subtitles.push({
                    index: index,
                    startTime: startTime,
                    endTime: endTime,
                    text: text,
                    chineseText: languageParts.chineseText,
                    englishText: languageParts.englishText
                });
            }
        }
    });
    
    return subtitles;
}

function cleanSubtitleLine(line) {
    return line
        .replace(/\{\\[^}]*\}/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function splitSubtitleByLanguage(text) {
    const rawLines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const lines = rawLines.map(cleanSubtitleLine).filter(Boolean);
    const chineseLines = [];
    const englishLines = [];

    lines.forEach(line => {
        const hasChinese = /[\u3400-\u9fff]/.test(line);
        const hasEnglish = /[A-Za-z]/.test(line);

        if (hasChinese) {
            chineseLines.push(line);
        }
        if (hasEnglish) {
            englishLines.push(line);
        }

        if (!hasChinese && !hasEnglish) {
            chineseLines.push(line);
            englishLines.push(line);
        }
    });

    return {
        chineseText: chineseLines.join('\n'),
        englishText: englishLines.join('\n')
    };
}

function getSubtitleDisplayText(subtitle) {
    if (!subtitle) return '';

    if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_HIDDEN) {
        return '';
    }

    if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_ENGLISH) {
        return subtitle.englishText || '';
    }

    if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_CHINESE) {
        return subtitle.chineseText || '';
    }

    return subtitle.text || '';
}

function parseTime(hours, minutes, seconds, milliseconds) {
    return parseInt(hours) * 3600 + 
           parseInt(minutes) * 60 + 
           parseInt(seconds) + 
           parseInt(milliseconds) / 1000;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function displaySubtitles() {
    subtitleList.innerHTML = '';
    subtitleCount.textContent = `${subtitles.length} 条字幕`;
    if (isSingleLinePlaying) {
        stopSingleLinePlay(false);
    }
    currentSubtitleIndex = -1;

    subtitles.forEach((subtitle, index) => {
        const item = document.createElement('div');
        item.className = 'subtitle-item';
        item.dataset.index = index;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'subtitle-item-checkbox';
        checkbox.dataset.index = index;
        checkbox.addEventListener('change', updateSelectedCount);
        checkbox.addEventListener('click', function(e) {
            e.stopPropagation(); 
            handleCheckboxClick(e, index);
        });
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'subtitle-item-content';
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'subtitle-time';
        timeDiv.textContent = `${formatTime(subtitle.startTime)} --> ${formatTime(subtitle.endTime)}`;
        
        const textDiv = document.createElement('div');
        textDiv.className = 'subtitle-text';
        textDiv.textContent = getSubtitleDisplayText(subtitle);
        
        contentDiv.appendChild(timeDiv);
        contentDiv.appendChild(textDiv);
        
        item.appendChild(checkbox);
        item.appendChild(contentDiv);
        
        contentDiv.addEventListener('click', function() {
            currentSubtitleIndex = index;
            updateSubtitleHighlight();

            if (!player) return;

            if (singleLineModeState === SINGLE_LINE_MODE_PLAY) {
                playSingleLineByIndex(index);
            } else if (singleLineModeState === SINGLE_LINE_MODE_PREVIEW) {
                stopSingleLinePlay(true);
                player.currentTime(subtitle.startTime);
            } else {
                player.currentTime(subtitle.startTime);
                player.play();
            }
        });
        
        subtitleList.appendChild(item);
    });
    
    if (subtitles.length > 0) {
        subtitleSearch.classList.add('visible');
        subtitleToolbar.classList.add('visible');
    }
    
    subtitleSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResults.textContent = '';
    searchResults.className = 'search-results';
    
    selectAllCheckbox.checked = false;
    updateSelectedCount();
    updateSinglePlayModeButton();
    updateSubtitleDisplayModeButton();
}

function updateCurrentSubtitle(currentTime) {
    
    let newIndex = -1;
    for (let i = 0; i < subtitles.length; i++) {
        const isLastSubtitle = i === subtitles.length - 1;
        const inRange = currentTime >= subtitles[i].startTime &&
            (currentTime < subtitles[i].endTime || (isLastSubtitle && currentTime <= subtitles[i].endTime));

        if (inRange) {
            newIndex = i;
            break;
        }
    }
    
    if (newIndex !== -1 && newIndex !== currentSubtitleIndex) {
        currentSubtitleIndex = newIndex;
        updateSubtitleHighlight();
    }
}

function updateSubtitleHighlight() {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    
    items.forEach((item, index) => {
        if (index === currentSubtitleIndex) {
            item.classList.add('active');
            
            const listRect = subtitleList.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            
            if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
                const listHeight = subtitleList.clientHeight;
                const currentScrollTop = subtitleList.scrollTop;
                const itemHeight = itemRect.height;
                
                const itemTopRelativeToViewport = itemRect.top;
                const listTopRelativeToViewport = listRect.top;
                const itemTopRelativeToList = itemTopRelativeToViewport - listTopRelativeToViewport + currentScrollTop;
                const itemCenterRelativeToList = itemTopRelativeToList + (itemHeight / 2);
                // 让当前字幕停在可视区中间偏上，减少“跳到最顶/最中”的突兀感
                const targetScrollTop = itemCenterRelativeToList - (listHeight * 0.35);
                
                subtitleList.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                });
            }
        } else {
            item.classList.remove('active');
        }
    });
}

function showStatus(message, type, durationMs = null, asToast = false) {
    if (statusHideTimer) {
        clearTimeout(statusHideTimer);
        statusHideTimer = null;
    }

    subtitleStatus.textContent = message;
    subtitleStatus.className = `subtitle-status ${type}${asToast ? ' toast' : ''}`;
    subtitleStatus.style.display = '';

    const timeout = durationMs !== null ? durationMs : (type === 'success' ? 3000 : 0);
    if (timeout > 0) {
        statusHideTimer = setTimeout(() => {
            subtitleStatus.style.display = 'none';
            statusHideTimer = null;
        }, timeout);
    }
}

function getSubtitleMaskPointerY(event) {
    if (event.touches && event.touches[0]) {
        return event.touches[0].clientY;
    }
    if (event.changedTouches && event.changedTouches[0]) {
        return event.changedTouches[0].clientY;
    }
    if (typeof event.clientY === 'number') {
        return event.clientY;
    }
    return null;
}

function getSubtitleMaskContainer() {
    if (subtitleMaskOverlay && subtitleMaskOverlay.parentElement) {
        return subtitleMaskOverlay.parentElement;
    }
    return videoWrapper;
}

function syncSubtitleMaskContainer() {
    if (!subtitleMaskOverlay) return;

    if (!subtitleMaskBaseParent) {
        subtitleMaskBaseParent = subtitleMaskOverlay.parentElement || videoWrapper;
    }

    let targetContainer = subtitleMaskBaseParent;
    if (player && typeof player.isFullscreen === 'function' && player.isFullscreen()) {
        const playerElement = typeof player.el === 'function' ? player.el() : null;
        if (playerElement) {
            targetContainer = playerElement;
        }
    }

    if (targetContainer && subtitleMaskOverlay.parentElement !== targetContainer) {
        targetContainer.appendChild(subtitleMaskOverlay);
    }

    applySubtitleMaskState();
}

function scheduleSubtitleMaskSync() {
    const sequence = ++subtitleMaskSyncSequence;
    const runIfCurrent = function() {
        if (sequence !== subtitleMaskSyncSequence) return;
        syncSubtitleMaskContainer();
    };

    runIfCurrent();
    window.requestAnimationFrame(runIfCurrent);
    window.setTimeout(runIfCurrent, 120);
    window.setTimeout(runIfCurrent, 320);
}

function clearSubtitleMaskHandleTempState() {
    if (subtitleMaskHandleHideTimer) {
        window.clearTimeout(subtitleMaskHandleHideTimer);
        subtitleMaskHandleHideTimer = null;
    }
    if (subtitleMaskOverlay) {
        subtitleMaskOverlay.classList.remove('show-handle-temp');
    }
}

function showSubtitleMaskHandleTemporarily(durationMs = SUBTITLE_MASK_HANDLE_AUTO_HIDE_MS) {
    if (!subtitleMaskOverlay || !isSubtitleMaskEnabled) return;

    if (isMobileSubtitleMaskHandleMode()) {
        clearSubtitleMaskHandleTempState();
        syncSubtitleMaskHandleVisibility();
        return;
    }

    if (subtitleMaskHandleHideTimer) {
        window.clearTimeout(subtitleMaskHandleHideTimer);
    }

    subtitleMaskOverlay.classList.add('show-handle-temp');
    subtitleMaskHandleHideTimer = window.setTimeout(function() {
        subtitleMaskHandleHideTimer = null;
        if (subtitleMaskOverlay) {
            subtitleMaskOverlay.classList.remove('show-handle-temp');
        }
    }, durationMs);
}

function isMobileSubtitleMaskHandleMode() {
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

function getSubtitleMaskControlBar() {
    const container = getSubtitleMaskContainer();

    let controlBar = container ? container.querySelector('.vjs-control-bar') : null;
    if (!controlBar && player && typeof player.el === 'function') {
        const playerElement = player.el();
        if (playerElement) {
            controlBar = playerElement.querySelector('.vjs-control-bar');
        }
    }

    return controlBar;
}

function isSubtitleMaskControlBarVisible() {
    const playerElement = player && typeof player.el === 'function' ? player.el() : null;
    if (playerElement) {
        const isPlaying = playerElement.classList.contains('vjs-playing');
        const isInactive = playerElement.classList.contains('vjs-user-inactive');
        if (isPlaying && isInactive) {
            return false;
        }
    }

    if (player) {
        if (typeof player.paused === 'function' && player.paused()) {
            return true;
        }
        if (typeof player.userActive === 'function' && player.userActive()) {
            return true;
        }
    }

    const controlBar = getSubtitleMaskControlBar();
    if (!controlBar) return false;

    const computed = window.getComputedStyle(controlBar);
    if (
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        Number.parseFloat(computed.opacity || '1') < 0.05
    ) {
        return false;
    }

    const rect = controlBar.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function syncSubtitleMaskHandleVisibility() {
    if (!subtitleMaskOverlay) return;

    const shouldShowMobileHandle =
        isSubtitleMaskEnabled &&
        isMobileSubtitleMaskHandleMode() &&
        (isSubtitleMaskDragging || isSubtitleMaskControlBarVisible());

    subtitleMaskOverlay.classList.toggle('mobile-handle-visible', shouldShowMobileHandle);
}

function updateSubtitleMaskButton() {
    if (!subtitleMaskToggleBtn) return;

    subtitleMaskToggleBtn.classList.toggle('mode-on', isSubtitleMaskEnabled);

    if (isSubtitleMaskEnabled) {
        subtitleMaskToggleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3.5-5.5 10-5.5S22 12 22 12s-3.5 5.5-10 5.5S2 12 2 12z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    } else {
        subtitleMaskToggleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3.5-5.5 10-5.5S22 12 22 12s-3.5 5.5-10 5.5S2 12 2 12z"></path>
                <path d="M4 20L20 4"></path>
            </svg>
        `;
    }

    const label = isSubtitleMaskEnabled
        ? '台词遮罩：开（拖拽视频底部边缘调整高度）'
        : '台词遮罩：关（点击开启）';
    subtitleMaskToggleBtn.title = label;
    subtitleMaskToggleBtn.setAttribute('aria-label', label);
}

function getSubtitleMaskSafeBottomOffset() {
    const controlBar = getSubtitleMaskControlBar();
    if (!controlBar) return 48;

    const computed = window.getComputedStyle(controlBar);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
        return 48;
    }

    const height = controlBar.getBoundingClientRect().height;
    return Math.max(36, Math.ceil(height));
}

function applySubtitleMaskState() {
    if (!subtitleMaskOverlay) return;

    const safeBottom = getSubtitleMaskSafeBottomOffset();
    subtitleMaskOverlay.style.bottom = `${safeBottom}px`;

    const container = getSubtitleMaskContainer();
    if (container) {
        const rect = container.getBoundingClientRect();
        const availableHeight = Math.max(0, rect.height - safeBottom);
        const maskHeightPx = availableHeight * (subtitleMaskPercent / 100);
        subtitleMaskOverlay.style.height = `${maskHeightPx.toFixed(1)}px`;
    } else {
        subtitleMaskOverlay.style.height = `${subtitleMaskPercent.toFixed(2)}%`;
    }

    subtitleMaskOverlay.classList.toggle('enabled', isSubtitleMaskEnabled);
    subtitleMaskOverlay.classList.toggle('dragging', isSubtitleMaskDragging);
    syncSubtitleMaskHandleVisibility();
}

function setSubtitleMaskPercentByPointerY(pointerY) {
    const container = getSubtitleMaskContainer();
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (!rect.height) return;

    const safeBottom = getSubtitleMaskSafeBottomOffset();
    const maxMaskBottomY = rect.bottom - safeBottom;
    const availableHeight = maxMaskBottomY - rect.top;
    if (availableHeight <= 0) return;

    const clampedY = clamp(pointerY, rect.top, maxMaskBottomY);
    const nextPercent = ((maxMaskBottomY - clampedY) / availableHeight) * 100;
    subtitleMaskPercent = clamp(nextPercent, MIN_SUBTITLE_MASK_PERCENT, MAX_SUBTITLE_MASK_PERCENT);
    applySubtitleMaskState();
}

function startSubtitleMaskDrag(event) {
    if (!isSubtitleMaskEnabled) return;
    const pointerY = getSubtitleMaskPointerY(event);
    if (pointerY === null) return;

    event.preventDefault();
    event.stopPropagation();

    isSubtitleMaskDragging = true;
    document.body.classList.add('subtitle-mask-dragging');
    setSubtitleMaskPercentByPointerY(pointerY);
    applySubtitleMaskState();
}

function moveSubtitleMaskDrag(event) {
    if (!isSubtitleMaskDragging) return;
    const pointerY = getSubtitleMaskPointerY(event);
    if (pointerY === null) return;

    event.preventDefault();
    setSubtitleMaskPercentByPointerY(pointerY);
}

function endSubtitleMaskDrag() {
    if (!isSubtitleMaskDragging) return;
    isSubtitleMaskDragging = false;
    document.body.classList.remove('subtitle-mask-dragging');
    applySubtitleMaskState();
}

function initSubtitleMaskControls() {
    if (!subtitleMaskBaseParent && subtitleMaskOverlay) {
        subtitleMaskBaseParent = subtitleMaskOverlay.parentElement || videoWrapper;
    }

    updateSubtitleMaskButton();
    scheduleSubtitleMaskSync();

    if (subtitleMaskToggleBtn) {
        subtitleMaskToggleBtn.addEventListener('click', function() {
            isSubtitleMaskEnabled = !isSubtitleMaskEnabled;
            if (isSubtitleMaskEnabled && subtitleMaskPercent <= 0) {
                subtitleMaskPercent = DEFAULT_SUBTITLE_MASK_PERCENT;
            }
            if (!isSubtitleMaskEnabled) {
                endSubtitleMaskDrag();
                clearSubtitleMaskHandleTempState();
            }
            updateSubtitleMaskButton();
            syncSubtitleMaskContainer();
            if (isSubtitleMaskEnabled) {
                showSubtitleMaskHandleTemporarily();
            }
            showStatus(
                isSubtitleMaskEnabled ? '台词遮罩已开启：拖拽遮罩边缘可调整高度' : '台词遮罩已关闭',
                'info',
                2000,
                true
            );
        });
    }

    if (subtitleMaskHandle) {
        subtitleMaskHandle.addEventListener('mousedown', startSubtitleMaskDrag);
        subtitleMaskHandle.addEventListener('touchstart', startSubtitleMaskDrag, { passive: false });
    }

    document.addEventListener('mousemove', moveSubtitleMaskDrag);
    document.addEventListener('touchmove', moveSubtitleMaskDrag, { passive: false });
    document.addEventListener('mouseup', endSubtitleMaskDrag);
    document.addEventListener('touchend', endSubtitleMaskDrag);
    document.addEventListener('touchcancel', endSubtitleMaskDrag);

    window.addEventListener('resize', function() {
        scheduleSubtitleMaskSync();
    });
    document.addEventListener('fullscreenchange', scheduleSubtitleMaskSync);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function isDesktopLayout() {
    return window.matchMedia('(min-width: 1025px)').matches;
}

function getLayoutBounds() {
    if (!appContainer || !layoutResizer) return null;
    
    const containerWidth = appContainer.getBoundingClientRect().width;
    const resizerWidth = layoutResizer.getBoundingClientRect().width || 12;
    const maxSubtitleWidth = Math.max(MIN_SUBTITLE_WIDTH, containerWidth - MIN_VIDEO_WIDTH - resizerWidth);
    const minSubtitleWidth = Math.min(MIN_SUBTITLE_WIDTH, maxSubtitleWidth);
    
    return { minSubtitleWidth, maxSubtitleWidth };
}

function updateSubtitleFontScale(subtitleWidth) {
    if (!subtitleSection) return;
    
    const widthDelta = Math.max(0, subtitleWidth - DEFAULT_SUBTITLE_WIDTH);
    const scale = clamp(
        1 + widthDelta / 800,
        MIN_SUBTITLE_FONT_SCALE,
        MAX_SUBTITLE_FONT_SCALE
    );
    
    subtitleSection.style.setProperty('--subtitle-font-scale', scale.toFixed(3));

    const bounds = getLayoutBounds();
    if (!bounds) return;

    const maxWidth = Math.max(DEFAULT_SUBTITLE_WIDTH, bounds.maxSubtitleWidth);
    const widthRange = Math.max(1, maxWidth - DEFAULT_SUBTITLE_WIDTH);
    const progress = clamp((subtitleWidth - DEFAULT_SUBTITLE_WIDTH) / widthRange, 0, 1);

    // 和 srtviewer 的 "大" 档对齐：最宽时正文 28px、行高 2.2、时间 18px
    const textSize = 14 + (28 - 14) * progress;
    const timeSize = 12 + (18 - 12) * progress;
    const textLineHeight = 1.6 + (2.2 - 1.6) * progress;

    // 当前高亮字幕进一步放大并提高行高
    const activeTextSize = 16 + (32 - 16) * progress;
    const activeTimeSize = 13 + (18 - 13) * progress;
    const activeLineHeight = 1.8 + (2.35 - 1.8) * progress;

    subtitleSection.style.setProperty('--subtitle-text-size', `${textSize.toFixed(2)}px`);
    subtitleSection.style.setProperty('--subtitle-time-size', `${timeSize.toFixed(2)}px`);
    subtitleSection.style.setProperty('--subtitle-line-height', textLineHeight.toFixed(3));
    subtitleSection.style.setProperty('--subtitle-active-text-size', `${activeTextSize.toFixed(2)}px`);
    subtitleSection.style.setProperty('--subtitle-active-time-size', `${activeTimeSize.toFixed(2)}px`);
    subtitleSection.style.setProperty('--subtitle-active-line-height', activeLineHeight.toFixed(3));
}

function clearDesktopLayoutStyles() {
    if (!appContainer || !subtitleSection) return;
    
    appContainer.style.removeProperty('--subtitle-width');
    subtitleSection.style.removeProperty('--subtitle-font-scale');
    subtitleSection.style.removeProperty('--subtitle-text-size');
    subtitleSection.style.removeProperty('--subtitle-time-size');
    subtitleSection.style.removeProperty('--subtitle-line-height');
    subtitleSection.style.removeProperty('--subtitle-active-text-size');
    subtitleSection.style.removeProperty('--subtitle-active-time-size');
    subtitleSection.style.removeProperty('--subtitle-active-line-height');
}

function applyLayoutWidth(targetWidth, saveToStorage = false) {
    if (!appContainer || !subtitleSection || !layoutResizer) return;
    
    if (!isDesktopLayout()) {
        clearDesktopLayoutStyles();
        return;
    }
    
    const bounds = getLayoutBounds();
    if (!bounds) return;
    
    const nextWidth = clamp(targetWidth, bounds.minSubtitleWidth, bounds.maxSubtitleWidth);
    appContainer.style.setProperty('--subtitle-width', `${nextWidth}px`);
    updateSubtitleFontScale(nextWidth);
    preferredSubtitleWidth = nextWidth;
    
    if (saveToStorage) {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, String(Math.round(nextWidth)));
        } catch (e) {
        }
    }
}

function resetLayoutSize() {
    preferredSubtitleWidth = DEFAULT_SUBTITLE_WIDTH;
    
    try {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch (e) {
    }
    
    if (isDesktopLayout()) {
        applyLayoutWidth(DEFAULT_SUBTITLE_WIDTH, false);
    } else {
        clearDesktopLayoutStyles();
    }
}

function getPointerClientX(event) {
    if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientX;
    }
    return event.clientX;
}

function startLayoutResize(event) {
    if (!isDesktopLayout() || !subtitleSection) return;
    
    isLayoutResizing = true;
    layoutDragStartX = getPointerClientX(event);
    layoutStartSubtitleWidth = subtitleSection.getBoundingClientRect().width;
    document.body.classList.add('layout-resizing');
    event.preventDefault();
}

function moveLayoutResize(event) {
    if (!isLayoutResizing) return;
    
    const currentX = getPointerClientX(event);
    const deltaX = currentX - layoutDragStartX;
    const targetWidth = layoutStartSubtitleWidth - deltaX;
    
    applyLayoutWidth(targetWidth, false);
    event.preventDefault();
}

function endLayoutResize() {
    if (!isLayoutResizing) return;
    
    isLayoutResizing = false;
    document.body.classList.remove('layout-resizing');
    applyLayoutWidth(preferredSubtitleWidth, true);
}

function handleResizerKeydown(event) {
    if (!isDesktopLayout()) return;
    
    const step = event.shiftKey ? 30 : 12;
    
    if (event.key === 'ArrowLeft') {
        applyLayoutWidth(preferredSubtitleWidth + step, true);
        event.preventDefault();
    } else if (event.key === 'ArrowRight') {
        applyLayoutWidth(preferredSubtitleWidth - step, true);
        event.preventDefault();
    } else if (event.key === 'Home') {
        resetLayoutSize();
        event.preventDefault();
    }
}

function initResizableLayout() {
    if (!appContainer || !layoutResizer || !subtitleSection) return;
    
    try {
        const savedWidth = parseFloat(localStorage.getItem(LAYOUT_STORAGE_KEY));
        if (!Number.isNaN(savedWidth)) {
            preferredSubtitleWidth = savedWidth;
        }
    } catch (e) {
    }
    
    if (isDesktopLayout()) {
        applyLayoutWidth(preferredSubtitleWidth, false);
    } else {
        clearDesktopLayoutStyles();
    }
    
    layoutResizer.addEventListener('mousedown', startLayoutResize);
    layoutResizer.addEventListener('touchstart', startLayoutResize, { passive: false });
    layoutResizer.addEventListener('dblclick', resetLayoutSize);
    layoutResizer.addEventListener('keydown', handleResizerKeydown);
    
    document.addEventListener('mousemove', moveLayoutResize);
    document.addEventListener('touchmove', moveLayoutResize, { passive: false });
    document.addEventListener('mouseup', endLayoutResize);
    document.addEventListener('touchend', endLayoutResize);
    document.addEventListener('touchcancel', endLayoutResize);
    
    window.addEventListener('resize', function() {
        if (isDesktopLayout()) {
            applyLayoutWidth(preferredSubtitleWidth, false);
        } else {
            clearDesktopLayoutStyles();
        }
    });
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

videoSection.addEventListener('drop', function(e) {
    const files = Array.from(e.dataTransfer.files);
    
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
    const videoFile = files.find(file => 
        file.type.startsWith('video/') || 
        videoExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );
    const subtitleFile = files.find(file => file.name.toLowerCase().endsWith('.srt'));

    if (videoFile) {
        loadVideo(videoFile, { skipAutoSubtitle: Boolean(subtitleFile) });
        videoFileName.textContent = videoFile.name;
    }
    
    if (subtitleFile) {
        loadSubtitle(subtitleFile);
        subtitleFileName.textContent = subtitleFile.name;
    }
});

let dragCounter = 0;

videoSection.addEventListener('dragenter', function(e) {
    dragCounter++;
    videoSection.style.opacity = '0.6';
});

videoSection.addEventListener('dragleave', function(e) {
    dragCounter--;
    if (dragCounter === 0) {
        videoSection.style.opacity = '1';
    }
});

videoSection.addEventListener('drop', function(e) {
    dragCounter = 0;
    videoSection.style.opacity = '1';
});

document.addEventListener('keydown', function(e) {
    if (!player) return;
    
    if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (player.paused()) {
            player.play();
        } else {
            player.pause();
        }
    }
    
    if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const currentTime = player.currentTime();
        player.currentTime(Math.max(0, currentTime - 5));
    }
    
    if (e.code === 'ArrowRight') {
        e.preventDefault();
        const currentTime = player.currentTime();
        const duration = player.duration();
        player.currentTime(Math.min(duration, currentTime + 5));
    }
    
    if (e.code === 'ArrowUp' && subtitles.length > 0) {
        e.preventDefault();
        const prevIndex = Math.max(0, currentSubtitleIndex - 1);
        if (subtitles[prevIndex]) {
            player.currentTime(subtitles[prevIndex].startTime);
        }
    }
    
    if (e.code === 'ArrowDown' && subtitles.length > 0) {
        e.preventDefault();
        const nextIndex = Math.min(subtitles.length - 1, currentSubtitleIndex + 1);
        if (subtitles[nextIndex]) {
            player.currentTime(subtitles[nextIndex].startTime);
        }
    }
});

videoPlaceholder.addEventListener('click', function() {
    videoInput.click();
});

document.getElementById('closeMkvWarning').addEventListener('click', function() {
    document.getElementById('mkvWarningBanner').classList.remove('show');
});

selectAllCheckbox.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.subtitle-item-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = this.checked;
    });
    updateSelectedCount();
});

function handleCheckboxClick(e, currentIndex) {
    
    if (e.shiftKey && lastCheckedIndex !== -1) {
        const checkboxes = document.querySelectorAll('.subtitle-item-checkbox');
        const start = Math.min(lastCheckedIndex, currentIndex);
        const end = Math.max(lastCheckedIndex, currentIndex);
        
        const targetState = e.target.checked;
        
        for (let i = start; i <= end; i++) {
            if (checkboxes[i]) {
                checkboxes[i].checked = targetState;
            }
        }
        
        updateSelectedCount();
    }
    
    lastCheckedIndex = currentIndex;
}

function updateSinglePlayModeButton() {
    if (!singlePlayModeBtn) return;

    const isPlayState = singleLineModeState === SINGLE_LINE_MODE_PLAY;
    const isPreviewState = singleLineModeState === SINGLE_LINE_MODE_PREVIEW;

    singlePlayModeBtn.classList.toggle('mode-on', isPlayState);
    singlePlayModeBtn.classList.toggle('mode-preview', isPreviewState);

    if (isPreviewState) {
        singlePlayModeBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="7" y="7" width="10" height="10" rx="1"></rect>
            </svg>
        `;
    } else {
        singlePlayModeBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h16v10H9l-5 4z"></path>
                <path d="M11 10h5M11 13h3"></path>
                <path d="M6 3l1.2 2.3L9.5 6 7.2 7.2 6 9.5 4.8 7.2 2.5 6l2.3-1.2z"></path>
            </svg>
        `;
    }

    const label = isPlayState
        ? '单句播放（再次点击切换为单句定位）'
        : isPreviewState
            ? '单句定位（再次点击恢复正常模式）'
            : '单句播放模式：关（点击开启单句播放）';
    singlePlayModeBtn.title = label;
    singlePlayModeBtn.setAttribute('aria-label', label);
}

function updateSubtitleDisplayModeButton() {
    if (!subtitleDisplayModeBtn) return;

    subtitleDisplayModeBtn.classList.remove('mode-bilingual', 'mode-english', 'mode-chinese', 'mode-hidden');

    let label = '字幕显示：双语（点击切换为仅英文）';
    let shortLabel = 'EN|中';

    if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_ENGLISH) {
        subtitleDisplayModeBtn.classList.add('mode-english');
        label = '字幕显示：仅英文（点击切换为仅中文）';
        shortLabel = 'EN';
    } else if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_CHINESE) {
        subtitleDisplayModeBtn.classList.add('mode-chinese');
        label = '字幕显示：仅中文（点击切换为隐藏字幕）';
        shortLabel = '中';
    } else if (subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_HIDDEN) {
        subtitleDisplayModeBtn.classList.add('mode-hidden');
        label = '字幕显示：隐藏字幕（点击切换为双语）';
        shortLabel = '隐';
    } else {
        subtitleDisplayModeBtn.classList.add('mode-bilingual');
    }

    subtitleDisplayModeBtn.innerHTML = `<span class="subtitle-display-mode-label">${shortLabel}</span>`;
    subtitleDisplayModeBtn.title = label;
    subtitleDisplayModeBtn.setAttribute('aria-label', label);

    if (subtitleList) {
        subtitleList.classList.toggle('subtitle-text-hidden', subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_HIDDEN);
    }
}

function refreshSubtitleDisplayByMode() {
    filterSubtitles(subtitleSearchInput.value.trim());
    updateSubtitleHighlight();
}

function stopSingleLinePlay(shouldPause = true) {
    if (player && singleLineTimeUpdateHandler) {
        player.off('timeupdate', singleLineTimeUpdateHandler);
        singleLineTimeUpdateHandler = null;
    }

    if (shouldPause && player && !player.paused()) {
        player.pause();
    }

    isSingleLinePlaying = false;
}

function playSingleLineByIndex(index) {
    if (!player) return;
    const subtitle = subtitles[index];
    if (!subtitle) return;

    if (isRepeating) {
        stopRepeatPlay();
    }

    stopSingleLinePlay(false);
    isSingleLinePlaying = true;

    player.currentTime(subtitle.startTime);
    player.play();

    singleLineTimeUpdateHandler = function() {
        if (!isSingleLinePlaying || singleLineModeState !== SINGLE_LINE_MODE_PLAY) return;
        if (player.currentTime() >= subtitle.endTime) {
            stopSingleLinePlay(true);
        }
    };

    player.on('timeupdate', singleLineTimeUpdateHandler);
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.subtitle-item-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectedCountSpan.textContent = `已选 ${checkedCount} 条`;
    
    if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        generateScreenshotsBtn.disabled = true;
        if (isRepeating) {
            repeatPlayBtn.disabled = false;
        } else {
            repeatPlayBtn.disabled = true;
        }
    } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
        generateScreenshotsBtn.disabled = false;
        repeatPlayBtn.disabled = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
        generateScreenshotsBtn.disabled = false;
        repeatPlayBtn.disabled = false;
    }
}

if (singlePlayModeBtn) {
    singlePlayModeBtn.addEventListener('click', function() {
        singleLineModeState = (singleLineModeState + 1) % 3;

        if (singleLineModeState === SINGLE_LINE_MODE_PLAY) {
            if (isRepeating) {
                stopRepeatPlay();
            }
            showStatus('单句播放模式已开启：点击字幕仅播放该句', 'info', 2000, true);
        } else if (singleLineModeState === SINGLE_LINE_MODE_PREVIEW) {
            if (isRepeating) {
                stopRepeatPlay();
            }
            stopSingleLinePlay(true);
            showStatus('已切换到单句定位模式：点击字幕仅定位视频（不播放）', 'info', 2000, true);
        } else {
            stopSingleLinePlay(false);
            showStatus('已恢复正常播放模式', 'info', 2000, true);
        }

        updateSinglePlayModeButton();
    });
}

if (subtitleDisplayModeBtn) {
    subtitleDisplayModeBtn.addEventListener('click', function() {
        subtitleDisplayMode = (subtitleDisplayMode + 1) % 4;
        updateSubtitleDisplayModeButton();
        refreshSubtitleDisplayByMode();

        const modeMessage = subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_ENGLISH
            ? '字幕显示已切换：仅英文'
            : subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_CHINESE
                ? '字幕显示已切换：仅中文'
                : subtitleDisplayMode === SUBTITLE_DISPLAY_MODE_HIDDEN
                    ? '字幕显示已切换：隐藏字幕'
                    : '字幕显示已切换：双语';
        showStatus(modeMessage, 'info', 2000, true);
    });
}

repeatPlayBtn.addEventListener('click', function() {
    if (!player) {
        alert('请先加载视频');
        return;
    }

    if (isSingleLinePlaying) {
        stopSingleLinePlay(true);
    }
    
    if (isRepeating) {
        stopRepeatPlay();
    } else {
        startRepeatPlay();
    }
});
function isConsecutive(indices) {
    if (indices.length <= 1) return true;
    
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1) {
            return false;
        }
    }
    return true;
}

function updateRepeatPlayIcon(isPlaying) {
    if (isPlaying) {
        repeatPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    } else {
        repeatPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    }
}

function startRepeatPlay() {
    const checkboxes = document.querySelectorAll('.subtitle-item-checkbox:checked');
    if (checkboxes.length === 0) {
        return;
    }
    
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    selectedIndices.sort((a, b) => a - b);
    
    if (selectedIndices.length === 0) {
        return;
    }
    
    isRepeating = true;
    repeatPlayBtn.disabled = false;
    repeatPlayText.textContent = '停止循环';
    updateRepeatPlayIcon(true);
    
    const isConsecutiveSelection = isConsecutive(selectedIndices);
    
    if (isConsecutiveSelection && selectedIndices.length > 1) {
        const firstSubtitle = subtitles[selectedIndices[0]];
        const lastSubtitle = subtitles[selectedIndices[selectedIndices.length - 1]];
        
        if (firstSubtitle && lastSubtitle) {
            const startTime = firstSubtitle.startTime;
            const endTime = lastSubtitle.endTime;
            
            function playContinuous() {
                if (!isRepeating) {
                    if (repeatTimeUpdateHandler) {
                        player.off('timeupdate', repeatTimeUpdateHandler);
                        repeatTimeUpdateHandler = null;
                    }
                    return;
                }
                
                player.currentTime(startTime);
                player.play();
                
                if (repeatTimeUpdateHandler) {
                    player.off('timeupdate', repeatTimeUpdateHandler);
                }
                
                repeatTimeUpdateHandler = function() {
                    if (!isRepeating) return;
                    
                    const currentTime = player.currentTime();
                    if (currentTime >= endTime) {
                        player.off('timeupdate', repeatTimeUpdateHandler);
                        repeatTimeUpdateHandler = null;
                        
                        if (isRepeating) {
                            playContinuous();
                        }
                    }
                };
                
                player.on('timeupdate', repeatTimeUpdateHandler);
            }
            
            playContinuous();
            return;
        }
    }
    
    let currentIndex = 0;
    
    function playNext() {
        if (!isRepeating) {
            if (repeatTimeUpdateHandler) {
                player.off('timeupdate', repeatTimeUpdateHandler);
                repeatTimeUpdateHandler = null;
            }
            return;
        }
        
        const subtitle = subtitles[selectedIndices[currentIndex]];
        if (!subtitle) {
            currentIndex = 0;
            playNext();
            return;
        }
        
        player.currentTime(subtitle.startTime);
        player.play();
        
        if (repeatTimeUpdateHandler) {
            player.off('timeupdate', repeatTimeUpdateHandler);
        }
        
        repeatTimeUpdateHandler = function() {
            if (!isRepeating) return;
            
            const currentTime = player.currentTime();
            if (currentTime >= subtitle.endTime) {
                player.off('timeupdate', repeatTimeUpdateHandler);
                repeatTimeUpdateHandler = null;
                
                if (isRepeating) {
                    currentIndex = (currentIndex + 1) % selectedIndices.length;
                    playNext();
                }
            }
        };
        
        player.on('timeupdate', repeatTimeUpdateHandler);
    }
    
    playNext();
}

function stopRepeatPlay() {
    isRepeating = false;
    if (repeatInterval) {
        clearTimeout(repeatInterval);
        repeatInterval = null;
    }
    if (player && repeatTimeUpdateHandler) {
        player.off('timeupdate', repeatTimeUpdateHandler);
        repeatTimeUpdateHandler = null;
    }
    if (player) {
        player.pause();
    }
    repeatPlayText.textContent = '重复播放';
    updateRepeatPlayIcon(false);
}

generateScreenshotsBtn.addEventListener('click', async function() {
    const checkboxes = document.querySelectorAll('.subtitle-item-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请至少选择一条字幕');
        return;
    }
    
    if (checkboxes.length > 100) {
        alert(`最多只能选择 100 条字幕截图，当前选择了 ${checkboxes.length} 条`);
        return;
    }
    
    if (!player) {
        alert('请先加载视频');
        return;
    }
    
    generateScreenshotsBtn.disabled = true;
    const originalText = generateScreenshotsBtn.innerHTML;
    generateScreenshotsBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> 生成中...';
    
    try {
        
        const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
        selectedIndices.sort((a, b) => a - b); 
        
        const screenshots = await captureScreenshots(selectedIndices);
        
        openScreenshotEditor(screenshots);
        
        showStatus(`成功生成 ${screenshots.length} 张截图`, 'success');
    } catch (error) {
        console.error('生成截图失败:', error);
        showStatus('生成截图失败: ' + error.message, 'error');
        alert('生成截图失败，请查看控制台了解详情');
    } finally {
        generateScreenshotsBtn.disabled = false;
        generateScreenshotsBtn.innerHTML = originalText;
    }
});

subtitleSearchInput.addEventListener('input', function(e) {
    const keyword = e.target.value.trim();
    
    if (keyword) {
        clearSearchBtn.style.display = 'flex';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    
    filterSubtitles(keyword);
});

subtitleSearchInput.addEventListener('keydown', function(e) {
    
    if (e.key === 'Escape') {
        subtitleSearchInput.value = '';
        clearSearchBtn.style.display = 'none';
        filterSubtitles('');
    }
});

clearSearchBtn.addEventListener('click', function() {
    subtitleSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    filterSubtitles('');
    subtitleSearchInput.focus();
});

function filterSubtitles(keyword) {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    
    if (!keyword) {
        
        items.forEach(item => {
            item.style.display = '';
            
            const textDiv = item.querySelector('.subtitle-text');
            if (textDiv) {
                const index = parseInt(item.dataset.index);
                if (subtitles[index]) {
                    const displayText = getSubtitleDisplayText(subtitles[index]);
                    textDiv.innerHTML = escapeHtml(displayText);
                }
            }
        });
        searchResults.textContent = '';
        searchResults.className = 'search-results';
        return;
    }
    
    let matchCount = 0;
    const lowerKeyword = keyword.toLowerCase();
    
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        const subtitle = subtitles[index];
        const displayText = getSubtitleDisplayText(subtitle);
        
        if (displayText.toLowerCase().includes(lowerKeyword)) {
            
            item.style.display = '';
            matchCount++;
            
            const textDiv = item.querySelector('.subtitle-text');
            if (textDiv) {
                textDiv.innerHTML = highlightKeyword(displayText, keyword);
            }
        } else {
            
            item.style.display = 'none';
        }
    });
    
    if (matchCount > 0) {
        searchResults.textContent = `找到 ${matchCount} 条匹配的字幕`;
        searchResults.className = 'search-results has-results';
    } else {
        searchResults.textContent = '未找到匹配的字幕';
        searchResults.className = 'search-results no-results';
    }
}

function highlightKeyword(text, keyword) {
    const escapedText = escapeHtml(text);
    const escapedKeyword = escapeHtml(keyword);
    
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return escapedText.replace(regex, '<mark style="background: #fff59d; color: #000; padding: 2px 4px; border-radius: 3px; font-weight: 500;">$1</mark>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function captureScreenshots(indices) {
    const screenshots = [];
    const video = player.el().querySelector('video');
    
    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        const subtitle = subtitles[index];
        
        const percent = Math.round((i + 1) / indices.length * 100);
        generateScreenshotsBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> ${percent}%`;
        
        await seekToTime(subtitle.startTime);
        
        player.play();
        await new Promise(resolve => setTimeout(resolve, 400));
        player.pause();
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/png');
        
        screenshots.push({
            index: index,
            data: imageData,
            subtitle: subtitle,
            width: canvas.width,
            height: canvas.height
        });
    }
    
    return screenshots;
}

function seekToTime(time) {
    return new Promise((resolve) => {
        player.currentTime(time);
        player.one('seeked', resolve);
    });
}

function captureManualScreenshot() {
    if (!player) return;
    
    const video = player.el().querySelector('video');
    if (!video || video.readyState < 2) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/png');
    const currentTime = player.currentTime();
    
    const screenshot = {
        index: manualScreenshots.length,
        data: imageData,
        subtitle: {
            startTime: currentTime,
            endTime: currentTime,
            text: `手动截图 ${manualScreenshots.length + 1}`,
            index: manualScreenshots.length + 1
        },
        width: canvas.width,
        height: canvas.height
    };
    
    manualScreenshots.push(screenshot);
    
    updateManualScreenshotControls();
    
    showStatus(`已截取 ${manualScreenshots.length} 张截图`, 'success');
}

function clearManualScreenshots() {
    if (manualScreenshots.length === 0) return;
    manualScreenshots = [];
    updateManualScreenshotControls();
    showStatus('已清空手动截图', 'info');
}

const captureScreenshotBtn = document.getElementById('captureScreenshotBtn');
const openManualEditorBtn = document.getElementById('openManualEditorBtn');
const clearManualScreenshotsBtn = document.getElementById('clearManualScreenshotsBtn');

if (captureScreenshotBtn) {
    captureScreenshotBtn.addEventListener('click', function() {
        captureManualScreenshot();
        captureScreenshotBtn.blur();
    });
}

if (openManualEditorBtn) {
    openManualEditorBtn.addEventListener('click', function() {
        if (manualScreenshots.length === 0) return;
        openScreenshotEditor(manualScreenshots);
    });
}

if (clearManualScreenshotsBtn) {
    clearManualScreenshotsBtn.addEventListener('click', function() {
        clearManualScreenshots();
        clearManualScreenshotsBtn.blur();
    });
}

function drawSubtitleOnCanvas(ctx, canvas, subtitle) {
    const padding = 20;
    const fontSize = Math.max(24, canvas.width / 40);
    const lineHeight = fontSize * 1.4;
    
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const maxWidth = canvas.width - padding * 2;
    const lines = wrapText(ctx, subtitle.text, maxWidth);
    
    const totalHeight = lines.length * lineHeight + padding * 2;
    const startY = canvas.height - totalHeight;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, startY, canvas.width, totalHeight);
    
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'white';
    
    lines.forEach((line, i) => {
        const y = startY + padding + (i + 1) * lineHeight;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillText(line, canvas.width / 2, y);
    });
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + words[i];
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let editorScreenshots = [];
let currentEditingIndex = 0;
let cropData = {}; 
let stitchedImageData = null;
let currentStitchMode = 'dialogue';
let manualScreenshots = []; 

function updateManualScreenshotControls() {
    const countElement = document.getElementById('manualScreenshotCount');
    if (countElement) {
        countElement.textContent = manualScreenshots.length;
    }
    const editorBtn = document.getElementById('openManualEditorBtn');
    if (editorBtn) {
        editorBtn.disabled = manualScreenshots.length === 0;
    }
    const clearBtn = document.getElementById('clearManualScreenshotsBtn');
    if (clearBtn) {
        clearBtn.disabled = manualScreenshots.length === 0;
    }
}

const modal = document.getElementById('screenshotEditor');
const closeEditorBtn = document.getElementById('closeEditor');
const screenshotItemsList = document.getElementById('screenshotItemsList');
const screenshotListCount = document.getElementById('screenshotListCount');
const editorCanvas = document.getElementById('editorCanvas');
const cropOverlay = document.getElementById('cropOverlay');
const cropBox = cropOverlay.querySelector('.crop-box');
const stitchModeSelect = document.getElementById('stitchMode');
const modeTip = document.getElementById('modeTip');
const cropTip = document.getElementById('cropTip');

function openScreenshotEditor(screenshots) {
    
    if (player && !player.paused()) {
        player.pause();
    }
    
    editorScreenshots = screenshots;
    currentEditingIndex = 0;
    cropData = {};
    currentStitchMode = 'dialogue'; 
    
    screenshots.forEach((s, i) => {
        if (currentStitchMode === 'dialogue') {
            
            const subtitleHeight = Math.floor(s.height * 0.20); 
            cropData[i] = {
                x: 0,
                y: s.height - subtitleHeight,
                width: s.width,
                height: subtitleHeight
            };
        } else {
            
            cropData[i] = {
                x: 0,
                y: 0,
                width: s.width,
                height: s.height
            };
        }
    });
    
    modal.classList.add('show');
    
    stitchModeSelect.value = currentStitchMode;
    updateModeTip();
    
    loadScreenshotList();
    
    if (screenshots.length > 0) {
        selectScreenshot(0);
    }
}

closeEditorBtn.addEventListener('click', function() {
    modal.classList.remove('show');
    editorScreenshots = [];
    cropData = {};
    stitchedImageData = null;
    document.getElementById('downloadStitched').disabled = true;
    document.getElementById('previewContainer').innerHTML = '';
});

function loadScreenshotList() {
    screenshotItemsList.innerHTML = '';
    screenshotListCount.textContent = editorScreenshots.length;
    
    editorScreenshots.forEach((screenshot, index) => {
        const item = document.createElement('div');
        item.className = 'screenshot-item';
        if (index === currentEditingIndex) item.classList.add('active');
        item.dataset.index = index;
        
        const img = document.createElement('img');
        img.src = screenshot.data;
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.objectFit = 'cover';
        img.onerror = function() {
            this.style.display = 'none';
        };
        
        const info = document.createElement('div');
        info.className = 'screenshot-item-info';
        info.textContent = `#${index + 1} - ${screenshot.subtitle.text.substring(0, 20)}...`;
        
        const orderControls = document.createElement('div');
        orderControls.className = 'screenshot-order-controls';
        
        if (index > 0) {
            const upBtn = document.createElement('button');
            upBtn.className = 'screenshot-control-btn';
            upBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>';
            upBtn.title = '上移';
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moveScreenshot(index, 'up');
            });
            orderControls.appendChild(upBtn);
        }
        
        if (index < editorScreenshots.length - 1) {
            const downBtn = document.createElement('button');
            downBtn.className = 'screenshot-control-btn';
            downBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            downBtn.title = '下移';
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moveScreenshot(index, 'down');
            });
            orderControls.appendChild(downBtn);
        }
        
        const controls = document.createElement('div');
        controls.className = 'screenshot-item-controls';
        
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'screenshot-control-btn download-btn';
        downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
        downloadBtn.title = '下载此截图';
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadSingleScreenshot(index);
        });
        controls.appendChild(downloadBtn);
        
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'screenshot-control-btn replace-btn';
        replaceBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
        replaceBtn.title = '替换图片';
        replaceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            replaceScreenshot(index);
        });
        controls.appendChild(replaceBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'screenshot-control-btn delete-btn';
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteScreenshot(index);
        });
        controls.appendChild(deleteBtn);
        
        item.appendChild(img);
        item.appendChild(info);
        item.appendChild(orderControls);
        item.appendChild(controls);
        
        img.addEventListener('click', () => selectScreenshot(index));
        info.addEventListener('click', () => selectScreenshot(index));
        
        screenshotItemsList.appendChild(item);
    });
}

function selectScreenshot(index) {
    currentEditingIndex = index;
    
    document.querySelectorAll('.screenshot-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    
    displayImageInEditor(editorScreenshots[index]);
}

function replaceScreenshot(index) {
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            
            const reader = new FileReader();
            reader.onload = async function(event) {
                const img = new Image();
                img.onload = function() {
                    
                    editorScreenshots[index] = {
                        ...editorScreenshots[index],
                        data: event.target.result,
                        width: img.width,
                        height: img.height
                    };
                    
                    if (currentStitchMode === 'dialogue') {
                        
                        const subtitleHeight = Math.floor(img.height * 0.20);
                        cropData[index] = {
                            x: 0,
                            y: img.height - subtitleHeight,
                            width: img.width,
                            height: subtitleHeight
                        };
                    } else {
                        
                        cropData[index] = {
                            x: 0,
                            y: 0,
                            width: img.width,
                            height: img.height
                        };
                    }
                    
                    loadScreenshotList();
                    
                    if (currentEditingIndex === index) {
                        selectScreenshot(index);
                    }
                    
                    showStatus('图片替换成功', 'success');
                };
                img.onerror = function() {
                    alert('图片加载失败，请选择有效的图片文件');
                };
                img.src = event.target.result;
            };
            reader.onerror = function() {
                alert('文件读取失败');
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('替换图片失败:', error);
            alert('替换图片失败: ' + error.message);
        }
    });
    
    fileInput.click();
}

function downloadSingleScreenshot(index) {
    const screenshot = editorScreenshots[index];
    const crop = cropData[index];
    
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        
        const imageData = canvas.toDataURL('image/png');
        const filename = `${index + 1}.png`;
        downloadImage(imageData, filename);
        
        showStatus(`截图 ${index + 1} 下载成功`, 'success');
    };
    img.src = screenshot.data;
}

async function downloadAllScreenshots() {
    if (typeof JSZip === 'undefined') {
        alert('JSZip 库未加载，无法下载压缩包');
        return;
    }
    
    const btn = document.getElementById('downloadAllScreenshots');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> 生成中...';
    
    try {
        const zip = new JSZip();
        
        const promises = editorScreenshots.map((screenshot, index) => {
            return new Promise((resolve) => {
                const base64Data = screenshot.data.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'image/png' });
                zip.file(`${index + 1}.png`, blob);
                resolve();
            });
        });
        
        await Promise.all(promises);
        
        const content = await zip.generateAsync({type: 'blob'});
        
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `screenshots_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showStatus(`成功下载 ${editorScreenshots.length} 张截图`, 'success');
    } catch (error) {
        console.error('下载失败:', error);
        alert('下载失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

document.getElementById('downloadAllScreenshots').addEventListener('click', downloadAllScreenshots);

function deleteScreenshot(index) {
    if (editorScreenshots.length <= 1) {
        alert('至少需要保留一张截图');
        return;
    }
    
    editorScreenshots.splice(index, 1);
    
    const oldCropData = { ...cropData };
    cropData = {};
    editorScreenshots.forEach((s, i) => {
        
        const oldIndex = i >= index ? i + 1 : i;
        cropData[i] = oldCropData[oldIndex] || {
            x: 0,
            y: 0,
            width: s.width,
            height: s.height
        };
    });
    
    if (currentEditingIndex >= editorScreenshots.length) {
        currentEditingIndex = editorScreenshots.length - 1;
    }
    
    loadScreenshotList();
    
    if (editorScreenshots.length > 0) {
        selectScreenshot(currentEditingIndex);
    }
}

function moveScreenshot(index, direction) {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= editorScreenshots.length) {
        return;
    }
    
    [editorScreenshots[index], editorScreenshots[newIndex]] = 
    [editorScreenshots[newIndex], editorScreenshots[index]];
    
    [cropData[index], cropData[newIndex]] = 
    [cropData[newIndex], cropData[index]];
    
    if (currentEditingIndex === index) {
        currentEditingIndex = newIndex;
    } else if (currentEditingIndex === newIndex) {
        currentEditingIndex = index;
    }
    
    loadScreenshotList();
    
    selectScreenshot(currentEditingIndex);
}

async function displayImageInEditor(screenshot) {
    const img = await loadImage(screenshot.data);
    
    const wrapper = document.querySelector('.editor-canvas-wrapper');
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    
    const scale = Math.min(wrapperWidth / img.width, wrapperHeight / img.height);
    
    editorCanvas.width = img.width * scale;
    editorCanvas.height = img.height * scale;
    
    const ctx = editorCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    
    requestAnimationFrame(() => {
        updateCropBox();
    });
}

function updateCropBox() {
    const crop = cropData[currentEditingIndex];
    const screenshot = editorScreenshots[currentEditingIndex];
    const scale = editorCanvas.width / screenshot.width;
    
    const canvasRect = editorCanvas.getBoundingClientRect();
    const wrapperRect = document.querySelector('.editor-canvas-wrapper').getBoundingClientRect();
    
    const offsetX = canvasRect.left - wrapperRect.left;
    const offsetY = canvasRect.top - wrapperRect.top;
    
    cropBox.style.left = (offsetX + crop.x * scale) + 'px';
    cropBox.style.top = (offsetY + crop.y * scale) + 'px';
    cropBox.style.width = (crop.width * scale) + 'px';
    cropBox.style.height = (crop.height * scale) + 'px';
}

let isDragging = false;
let isResizing = false;
let dragStartX, dragStartY;
let resizeHandle = null;
let initialCrop = {};

function handleCropStart(e) {
    const touch = e.touches ? e.touches[0] : e;
    
    if (e.target.classList.contains('crop-handle')) {
        isResizing = true;
        resizeHandle = e.target;
    } else {
        isDragging = true;
    }
    
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    initialCrop = { ...cropData[currentEditingIndex] };
    
    e.preventDefault();
}

cropBox.addEventListener('mousedown', handleCropStart);
cropBox.addEventListener('touchstart', handleCropStart, { passive: false });

function handleCropMove(e) {
    if (!isDragging && !isResizing) return;
    
    const touch = e.touches ? e.touches[0] : e;
    const deltaX = touch.clientX - dragStartX;
    const deltaY = touch.clientY - dragStartY;
    const screenshot = editorScreenshots[currentEditingIndex];
    const scale = editorCanvas.width / screenshot.width;
    
    if (isDragging) {
        
        const newX = Math.max(0, Math.min(screenshot.width - initialCrop.width, initialCrop.x + deltaX / scale));
        const newY = Math.max(0, Math.min(screenshot.height - initialCrop.height, initialCrop.y + deltaY / scale));
        
        cropData[currentEditingIndex].x = newX;
        cropData[currentEditingIndex].y = newY;
    } else if (isResizing) {
        
        resizeCropBox(resizeHandle, deltaX / scale, deltaY / scale);
    }
    
    updateCropBox();
    e.preventDefault();
}

document.addEventListener('mousemove', handleCropMove);
document.addEventListener('touchmove', handleCropMove, { passive: false });

function handleCropEnd() {
    if ((isDragging || isResizing) && currentEditingIndex === 0) {
        autoApplyCropToAll();
    }
    
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
}

document.addEventListener('mouseup', handleCropEnd);
document.addEventListener('touchend', handleCropEnd);
document.addEventListener('touchcancel', handleCropEnd);

window.addEventListener('resize', function() {
    if (modal.classList.contains('show') && editorScreenshots.length > 0) {
        displayImageInEditor(editorScreenshots[currentEditingIndex]);
    }
});

function resizeCropBox(handle, deltaX, deltaY) {
    const crop = cropData[currentEditingIndex];
    const screenshot = editorScreenshots[currentEditingIndex];
    const initial = initialCrop;
    
    const handleClass = handle.className.split(' ')[1];
    
    switch(handleClass) {
        case 'handle-nw':
            crop.x = Math.max(0, Math.min(initial.x + initial.width - 10, initial.x + deltaX));
            crop.y = Math.max(0, Math.min(initial.y + initial.height - 10, initial.y + deltaY));
            crop.width = initial.width - (crop.x - initial.x);
            crop.height = initial.height - (crop.y - initial.y);
            break;
        case 'handle-ne':
            crop.y = Math.max(0, Math.min(initial.y + initial.height - 10, initial.y + deltaY));
            crop.width = Math.max(10, Math.min(screenshot.width - initial.x, initial.width + deltaX));
            crop.height = initial.height - (crop.y - initial.y);
            break;
        case 'handle-sw':
            crop.x = Math.max(0, Math.min(initial.x + initial.width - 10, initial.x + deltaX));
            crop.width = initial.width - (crop.x - initial.x);
            crop.height = Math.max(10, Math.min(screenshot.height - initial.y, initial.height + deltaY));
            break;
        case 'handle-se':
            crop.width = Math.max(10, Math.min(screenshot.width - initial.x, initial.width + deltaX));
            crop.height = Math.max(10, Math.min(screenshot.height - initial.y, initial.height + deltaY));
            break;
        case 'handle-n':
            crop.y = Math.max(0, Math.min(initial.y + initial.height - 10, initial.y + deltaY));
            crop.height = initial.height - (crop.y - initial.y);
            break;
        case 'handle-s':
            crop.height = Math.max(10, Math.min(screenshot.height - initial.y, initial.height + deltaY));
            break;
        case 'handle-w':
            crop.x = Math.max(0, Math.min(initial.x + initial.width - 10, initial.x + deltaX));
            crop.width = initial.width - (crop.x - initial.x);
            break;
        case 'handle-e':
            crop.width = Math.max(10, Math.min(screenshot.width - initial.x, initial.width + deltaX));
            break;
    }
}

document.getElementById('resetCrop').addEventListener('click', function() {
    const screenshot = editorScreenshots[currentEditingIndex];
    cropData[currentEditingIndex] = {
        x: 0,
        y: 0,
        width: screenshot.width,
        height: screenshot.height
    };
    updateCropBox();
    autoApplyCropToAll();
});

function autoApplyCropToAll() {
    if (currentEditingIndex !== 0) return; 
    
    const currentCrop = cropData[0];
    const currentScreenshot = editorScreenshots[0];
    
    const xRatio = currentCrop.x / currentScreenshot.width;
    const yRatio = currentCrop.y / currentScreenshot.height;
    const widthRatio = currentCrop.width / currentScreenshot.width;
    const heightRatio = currentCrop.height / currentScreenshot.height;
    
    editorScreenshots.forEach((s, i) => {
        if (currentStitchMode === 'scene') {
            
            cropData[i] = {
                x: Math.round(s.width * xRatio),
                y: Math.round(s.height * yRatio),
                width: Math.round(s.width * widthRatio),
                height: Math.round(s.height * heightRatio)
            };
        } else {
            
            if (i !== 0) {
                cropData[i] = {
                    x: Math.round(s.width * xRatio),
                    y: Math.round(s.height * yRatio),
                    width: Math.round(s.width * widthRatio),
                    height: Math.round(s.height * heightRatio)
                };
            }
        }
    });
}

stitchModeSelect.addEventListener('change', function(e) {
    currentStitchMode = e.target.value;
    
    editorScreenshots.forEach((s, i) => {
        if (currentStitchMode === 'dialogue') {
            
            const subtitleHeight = Math.floor(s.height * 0.20);
            cropData[i] = {
                x: 0,
                y: s.height - subtitleHeight,
                width: s.width,
                height: subtitleHeight
            };
        } else {
            
            cropData[i] = {
                x: 0,
                y: 0,
                width: s.width,
                height: s.height
            };
        }
    });
    
    updateModeTip();
    
    updateCropBox();
});

function updateModeTip() {
    const spacingInput = document.getElementById('stitchSpacing');
    const paddingInput = document.getElementById('stitchPadding');
    const spacingValue = document.getElementById('spacingValue');
    const paddingValue = document.getElementById('paddingValue');
    const advancedSettings = document.querySelectorAll('.setting-group-advanced');
    
    if (currentStitchMode === 'scene') {
        modeTip.textContent = '所有截图使用相同裁剪';
        cropTip.textContent = '💡 调整第1张图片的裁剪会自动应用到全部';
        
        if (spacingInput.value === '0') spacingInput.value = '10';
        if (paddingInput.value === '0') paddingInput.value = '10';
        
        advancedSettings.forEach(el => el.classList.remove('hidden'));
    } else {
        modeTip.textContent = '第1张完整画面，其余截图使用裁剪';
        cropTip.textContent = '💡 调整第1张图片的裁剪会应用到其余截图（第1张保持完整）';
        
        spacingInput.value = '0';
        paddingInput.value = '0';
        
        advancedSettings.forEach(el => el.classList.add('hidden'));
    }
    
    spacingValue.textContent = spacingInput.value;
    paddingValue.textContent = paddingInput.value;
}

document.getElementById('stitchSpacing').addEventListener('input', function(e) {
    document.getElementById('spacingValue').textContent = e.target.value;
});

document.getElementById('stitchPadding').addEventListener('input', function(e) {
    document.getElementById('paddingValue').textContent = e.target.value;
});

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

document.getElementById('previewStitch').addEventListener('click', async function() {
    this.disabled = true;
    this.textContent = '生成中...';
    
    try {
        const stitched = await generateStitchedImage();
        stitchedImageData = stitched;
        
        const previewContainer = document.getElementById('previewContainer');
        previewContainer.innerHTML = `<img src="${stitched}" alt="预览" />`;
        
        document.getElementById('downloadStitched').disabled = false;
    } catch (error) {
        alert('预览失败: ' + error.message);
    } finally {
        this.disabled = false;
        this.textContent = '预览拼接';
    }
});

document.getElementById('downloadStitched').addEventListener('click', function() {
    if (stitchedImageData) {
        downloadImage(stitchedImageData, 'subtitle-screenshots.png');
    }
});

async function generateStitchedImage() {
    const spacing = parseInt(document.getElementById('stitchSpacing').value);
    const padding = parseInt(document.getElementById('stitchPadding').value);
    const bgColor = document.querySelector('.color-btn.active').dataset.color;
    
    const croppedImages = await Promise.all(
        editorScreenshots.map(async (screenshot, i) => {
            const img = await loadImage(screenshot.data);
            
            let crop;
            if (currentStitchMode === 'dialogue' && i === 0) {
                const cropInfo = cropData[i] || {
                    x: 0,
                    y: screenshot.height - Math.floor(screenshot.height * 0.20),
                    width: screenshot.width,
                    height: Math.floor(screenshot.height * 0.20)
                };
                crop = {
                    x: 0,
                    y: 0,
                    width: screenshot.width,
                    height: cropInfo.y + cropInfo.height
                };
            } else {
                crop = cropData[i];
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = crop.width;
            canvas.height = crop.height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
            
            return {
                canvas: canvas,
                width: crop.width,
                height: crop.height
            };
        })
    );
    
    const maxWidth = Math.max(...croppedImages.map(img => img.width));
    
    const finalWidth = maxWidth + padding * 2;
    const finalHeight = croppedImages.reduce((sum, img) => sum + img.height, 0) + 
                       spacing * (croppedImages.length - 1) + padding * 2;
    
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = finalWidth;
    finalCanvas.height = finalHeight;
    const ctx = finalCanvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, finalWidth, finalHeight);
    
    let currentY = padding;
    
    for (const img of croppedImages) {
        
        const x = padding + (maxWidth - img.width) / 2;
        ctx.drawImage(img.canvas, x, currentY, img.width, img.height);
        currentY += img.height + spacing;
    }
    
    return finalCanvas.toDataURL('image/png');
}

async function loadDemoFiles() {
    const demoVideoPath = 'playback_demo/House-of-Cards-Series-Trailer_with_subtitles.mp4';
    const demoSubtitlePath = 'playback_demo/House-of-Cards-Series-Trailer.srt';
    const demoPosterPath = 'playback_demo/House-of-Cards-Series-Trailer-cover.jpg';
    
    try {
        const videoResponse = await fetch(demoVideoPath, { method: 'HEAD' });
        if (!videoResponse.ok) {
            return;
        }
        
        const subtitleResponse = await fetch(demoSubtitlePath, { method: 'HEAD' });
        if (!subtitleResponse.ok) {
            return;
        }
        
        if (!player) {
            initVideoPlayer();
        }
        
        player.poster(demoPosterPath);
        player.src({
            type: 'video/mp4',
            src: demoVideoPath
        });
        
        videoPlaceholder.classList.add('hidden');
        videoFileName.textContent = 'House-of-Cards-Series-Trailer_with_subtitles.mp4';
        
        player.one('loadeddata', function() {
            if (player.paused()) {
                const overlay = document.getElementById('manualScreenshotOverlay');
                if (overlay && player.readyState() >= 2) {
                    overlay.classList.add('show');
                }
            }
        });
        
        const subtitleBlob = await fetch(demoSubtitlePath).then(r => r.blob());
        const subtitleFile = new File([subtitleBlob], 'House-of-Cards-Series-Trailer.srt', { type: 'text/plain' });
        
        loadSubtitle(subtitleFile);
        subtitleFileName.textContent = subtitleFile.name;
    } catch (error) {
    }
}

if (typeof videojs !== 'undefined') {
    initVideoPlayer();
    setTimeout(loadDemoFiles, 300);
} else {
    document.addEventListener('DOMContentLoaded', function() {
        initVideoPlayer();
        setTimeout(loadDemoFiles, 300);
    });
}

console.log('视频字幕播放器已就绪');
console.log('支持的快捷键：');
console.log('  空格：播放/暂停');
console.log('  ←/→：后退/前进 5 秒');
console.log('  ↑/↓：跳转到上一条/下一条字幕');

// 教程弹窗控制
function initTutorialModal() {
    const helpBtn = document.getElementById('helpBtn');
    const tutorialModal = document.getElementById('tutorialModal');
    const closeTutorialBtn = document.getElementById('closeTutorialBtn');
    
    if (helpBtn && tutorialModal && closeTutorialBtn) {
        helpBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            tutorialModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        });
        
        closeTutorialBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            tutorialModal.classList.remove('show');
            document.body.style.overflow = '';
        });
        
        tutorialModal.addEventListener('click', function(e) {
            if (e.target === tutorialModal) {
                tutorialModal.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && tutorialModal.classList.contains('show')) {
                tutorialModal.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }
}

function initPageEnhancements() {
    initTutorialModal();
    initResizableLayout();
    initSubtitleMaskControls();
    updateSubtitleDisplayModeButton();
}

// 确保DOM加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageEnhancements);
} else {
    initPageEnhancements();
}
