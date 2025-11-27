
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
const selectedCountSpan = document.getElementById('selectedCount');
const subtitleToolbar = document.querySelector('.subtitle-toolbar');

let subtitles = [];
let currentSubtitleIndex = -1;
let videoFile = null;
let player = null;
let lastCheckedIndex = -1; 

function initVideoPlayer() {
    player = videojs('videoPlayer', {
        controls: true,
        fluid: true,
        preload: 'auto',
        language: 'zh-CN',
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
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
        }
    });

    player.on('timeupdate', function() {
        const currentTime = player.currentTime();
        updateCurrentSubtitle(currentTime);
    });

    return player;
}

if (typeof videojs !== 'undefined') {
    initVideoPlayer();
} else {
    document.addEventListener('DOMContentLoaded', function() {
        initVideoPlayer();
    });
}

videoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
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

function loadVideo(file) {
    if (!player) {
        initVideoPlayer();
    }
    
    const url = URL.createObjectURL(file);
    
    player.src({
        type: getMimeType(file),
        src: url
    });
    
    videoPlaceholder.classList.add('hidden');
    
    player.one('error', function() {
        const error = player.error();
        console.error('视频加载错误:', error);
        
        let errorMessage = '视频加载失败：';
        
        if (error && error.code === 4) {
            
            errorMessage += '该视频格式不被支持。\n\n';
            
            if (file.name.toLowerCase().endsWith('.mkv')) {
                errorMessage += '可能原因：\n';
                errorMessage += '• MKV 文件的音频编码不被浏览器支持（如 AC3、DTS）\n';
                errorMessage += '• 视频编码格式浏览器不支持\n\n';
                errorMessage += '解决方案：\n';
                errorMessage += '1. 使用 FFmpeg 转换音频为 AAC：\n';
                errorMessage += '   ffmpeg -i input.mkv -c:v copy -c:a aac output.mp4\n\n';
                errorMessage += '2. 或使用格式工厂等软件转换为 MP4 格式';
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
    });
    
    player.ready(function() {
        
    });
}

function getMimeType(file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.mp4')) return 'video/mp4';
    if (fileName.endsWith('.webm')) return 'video/webm';
    if (fileName.endsWith('.ogg')) return 'video/ogg';
    if (fileName.endsWith('.mkv')) return 'video/x-matroska';
    if (fileName.endsWith('.avi')) return 'video/x-msvideo';
    if (fileName.endsWith('.mov')) return 'video/quicktime';
    return file.type || 'video/mp4';
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
            showStatus(`成功加载 ${subtitles.length} 条字幕`, 'success');
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
                
                subtitles.push({
                    index: index,
                    startTime: startTime,
                    endTime: endTime,
                    text: text
                });
            }
        }
    });
    
    return subtitles;
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
        textDiv.textContent = subtitle.text;
        
        contentDiv.appendChild(timeDiv);
        contentDiv.appendChild(textDiv);
        
        item.appendChild(checkbox);
        item.appendChild(contentDiv);
        
        contentDiv.addEventListener('click', function() {
            if (player) {
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
}

function updateCurrentSubtitle(currentTime) {
    
    let newIndex = -1;
    for (let i = 0; i < subtitles.length; i++) {
        if (currentTime >= subtitles[i].startTime && currentTime <= subtitles[i].endTime) {
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
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        } else {
            item.classList.remove('active');
        }
    });
}

function showStatus(message, type) {
    subtitleStatus.textContent = message;
    subtitleStatus.className = `subtitle-status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            subtitleStatus.style.display = 'none';
        }, 3000);
    }
}

const videoSection = document.querySelector('.video-section');

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
    if (videoFile) {
        loadVideo(videoFile);
        videoFileName.textContent = videoFile.name;
    }
    
    const subtitleFile = files.find(file => file.name.endsWith('.srt'));
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

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.subtitle-item-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectedCountSpan.textContent = `已选 ${checkedCount} 条`;
    
    if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        generateScreenshotsBtn.disabled = true;
    } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
        generateScreenshotsBtn.disabled = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
        generateScreenshotsBtn.disabled = false;
    }
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
                    textDiv.innerHTML = escapeHtml(subtitles[index].text);
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
        
        if (subtitle && subtitle.text.toLowerCase().includes(lowerKeyword)) {
            
            item.style.display = '';
            matchCount++;
            
            const textDiv = item.querySelector('.subtitle-text');
            if (textDiv) {
                textDiv.innerHTML = highlightKeyword(subtitle.text, keyword);
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
        await new Promise(resolve => setTimeout(resolve, 300));
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

cropBox.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('crop-handle')) {
        isResizing = true;
        resizeHandle = e.target;
    } else {
        isDragging = true;
    }
    
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialCrop = { ...cropData[currentEditingIndex] };
    
    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (!isDragging && !isResizing) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
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
});

document.addEventListener('mouseup', function() {
    
    if ((isDragging || isResizing) && currentEditingIndex === 0) {
        autoApplyCropToAll();
    }
    
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
});

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
    
    if (currentStitchMode === 'scene') {
        modeTip.textContent = '所有截图使用相同裁剪';
        cropTip.textContent = '💡 调整第1张图片的裁剪会自动应用到全部';
        
        if (spacingInput.value === '0') spacingInput.value = '10';
        if (paddingInput.value === '0') paddingInput.value = '10';
    } else {
        modeTip.textContent = '第1张完整画面，其余截图使用裁剪';
        cropTip.textContent = '💡 调整第1张图片的裁剪会应用到其余截图（第1张保持完整）';
        
        spacingInput.value = '0';
        paddingInput.value = '0';
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
                crop = {
                    x: 0,
                    y: 0,
                    width: screenshot.width,
                    height: screenshot.height
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

console.log('视频字幕播放器已就绪');
console.log('支持的快捷键：');
console.log('  空格：播放/暂停');
console.log('  ←/→：后退/前进 5 秒');
console.log('  ↑/↓：跳转到上一条/下一条字幕');
