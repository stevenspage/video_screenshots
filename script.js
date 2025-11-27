// DOM 元素
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

// 全局变量
let subtitles = [];
let currentSubtitleIndex = -1;
let videoFile = null;
let player = null;

// 初始化 Video.js 播放器
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

    // 监听时间更新事件
    player.on('timeupdate', function() {
        const currentTime = player.currentTime();
        updateCurrentSubtitle(currentTime);
    });

    return player;
}

// 等待 Video.js 加载完成后初始化
if (typeof videojs !== 'undefined') {
    initVideoPlayer();
} else {
    document.addEventListener('DOMContentLoaded', function() {
        initVideoPlayer();
    });
}

// 视频文件选择
videoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        videoFile = file;
        loadVideo(file);
        videoFileName.textContent = file.name;
        
        // 尝试自动加载同名字幕
        tryLoadSubtitleAutomatically(file);
    }
});

// 字幕文件选择
subtitleInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        loadSubtitle(file);
        subtitleFileName.textContent = file.name;
    }
});

// 加载视频
function loadVideo(file) {
    if (!player) {
        initVideoPlayer();
    }
    
    const url = URL.createObjectURL(file);
    
    // 使用 Video.js API 加载视频
    player.src({
        type: getMimeType(file),
        src: url
    });
    
    videoPlaceholder.classList.add('hidden');
    
    // 监听错误事件
    player.one('error', function() {
        const error = player.error();
        console.error('视频加载错误:', error);
        
        let errorMessage = '视频加载失败：';
        
        if (error && error.code === 4) {
            // MEDIA_ERR_SRC_NOT_SUPPORTED
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
    
    // 视频加载完成后
    player.one('loadeddata', function() {
        console.log('视频加载完成:', file.name);
        showStatus(`视频加载成功：${file.name}`, 'success');
    });
    
    // 播放视频
    player.ready(function() {
        // 播放器准备就绪
    });
}

// 根据文件扩展名获取 MIME 类型
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

// 尝试自动加载字幕
async function tryLoadSubtitleAutomatically(videoFile) {
    // 获取视频文件名（不含扩展名）
    const videoBaseName = videoFile.name.replace(/\.[^/.]+$/, '');
    
    // 尝试读取目录中的文件（这在浏览器中有限制）
    // 我们需要使用 File System Access API 或者提示用户选择
    showStatus('提示：如果同路径下有同名 .srt 字幕文件，请手动选择。', 'info');
}

// 加载字幕文件
function loadSubtitle(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 尝试自动检测编码
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
    
    // 读取为 ArrayBuffer 以便检测编码
    reader.readAsArrayBuffer(file);
}

// 检测并解码字幕文件
function detectAndDecodeSubtitle(uint8Array) {
    // 检查 BOM 标记
    if (uint8Array.length >= 3) {
        // UTF-8 BOM
        if (uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(uint8Array.slice(3));
        }
        // UTF-16 LE BOM
        if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
            const decoder = new TextDecoder('utf-16le');
            return decoder.decode(uint8Array.slice(2));
        }
        // UTF-16 BE BOM
        if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
            const decoder = new TextDecoder('utf-16be');
            return decoder.decode(uint8Array.slice(2));
        }
    }
    
    // 尝试 UTF-8 解码
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const text = decoder.decode(uint8Array);
        // 如果成功且没有替换字符，说明是 UTF-8
        if (!text.includes('\uFFFD')) {
            console.log('检测到 UTF-8 编码');
            return text;
        }
    } catch (e) {
        // UTF-8 解码失败，继续尝试其他编码
    }
    
    // 尝试 GBK/GB2312 编码（中文 Windows ANSI）
    const encodingsToTry = ['gbk', 'gb2312', 'gb18030'];
    for (const encoding of encodingsToTry) {
        try {
            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(uint8Array);
            // 检查是否有中文字符且没有明显的乱码
            if (text.length > 0 && /[\u4e00-\u9fa5]/.test(text)) {
                console.log(`检测到 ${encoding.toUpperCase()} 编码`);
                return text;
            }
        } catch (e) {
            // 浏览器不支持该编码，继续尝试
            continue;
        }
    }
    
    // 如果以上都失败，尝试其他常见编码
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
    
    // 最后使用 UTF-8（可能有乱码）
    console.warn('无法准确检测编码，使用 UTF-8（可能显示乱码）');
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(uint8Array);
}

// 解析 SRT 字幕格式
function parseSRT(content) {
    const subtitles = [];
    
    // 标准化换行符
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 分割字幕块
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

// 解析时间为秒
function parseTime(hours, minutes, seconds, milliseconds) {
    return parseInt(hours) * 3600 + 
           parseInt(minutes) * 60 + 
           parseInt(seconds) + 
           parseInt(milliseconds) / 1000;
}

// 格式化时间显示
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// 显示字幕列表
function displaySubtitles() {
    subtitleList.innerHTML = '';
    subtitleCount.textContent = `${subtitles.length} 条字幕`;
    
    subtitles.forEach((subtitle, index) => {
        const item = document.createElement('div');
        item.className = 'subtitle-item';
        item.dataset.index = index;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'subtitle-time';
        timeDiv.textContent = `${formatTime(subtitle.startTime)} --> ${formatTime(subtitle.endTime)}`;
        
        const textDiv = document.createElement('div');
        textDiv.className = 'subtitle-text';
        textDiv.textContent = subtitle.text;
        
        item.appendChild(timeDiv);
        item.appendChild(textDiv);
        
        // 点击字幕跳转视频
        item.addEventListener('click', function() {
            if (player) {
                player.currentTime(subtitle.startTime);
                player.play();
            }
        });
        
        subtitleList.appendChild(item);
    });
    
    // 显示搜索框（有字幕时才显示）
    if (subtitles.length > 0) {
        subtitleSearch.classList.add('visible');
    }
    
    // 重置搜索框
    subtitleSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResults.textContent = '';
    searchResults.className = 'search-results';
}

// 更新当前字幕（由 Video.js 的 timeupdate 事件调用）
function updateCurrentSubtitle(currentTime) {
    // 找到当前时间对应的字幕
    let newIndex = -1;
    for (let i = 0; i < subtitles.length; i++) {
        if (currentTime >= subtitles[i].startTime && currentTime <= subtitles[i].endTime) {
            newIndex = i;
            break;
        }
    }
    
    // 如果字幕索引改变，更新高亮
    if (newIndex !== currentSubtitleIndex) {
        currentSubtitleIndex = newIndex;
        updateSubtitleHighlight();
    }
}

// 更新字幕高亮和滚动
function updateSubtitleHighlight() {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    
    items.forEach((item, index) => {
        if (index === currentSubtitleIndex) {
            item.classList.add('active');
            
            // 滚动到当前字幕
            const listRect = subtitleList.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            
            // 如果字幕不在可视区域，则滚动
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

// 显示状态消息
function showStatus(message, type) {
    subtitleStatus.textContent = message;
    subtitleStatus.className = `subtitle-status ${type}`;
    
    // 3秒后自动隐藏成功消息
    if (type === 'success') {
        setTimeout(() => {
            subtitleStatus.style.display = 'none';
        }, 3000);
    }
}

// 拖放支持
const videoSection = document.querySelector('.video-section');

// 阻止默认拖放行为
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// 处理文件拖放
videoSection.addEventListener('drop', function(e) {
    const files = Array.from(e.dataTransfer.files);
    
    // 查找视频文件（支持 MIME 类型检测和扩展名检测）
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
    const videoFile = files.find(file => 
        file.type.startsWith('video/') || 
        videoExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );
    if (videoFile) {
        loadVideo(videoFile);
        videoFileName.textContent = videoFile.name;
    }
    
    // 查找字幕文件
    const subtitleFile = files.find(file => file.name.endsWith('.srt'));
    if (subtitleFile) {
        loadSubtitle(subtitleFile);
        subtitleFileName.textContent = subtitleFile.name;
    }
});

// 添加拖放视觉反馈
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

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    if (!player) return;
    
    // 空格：播放/暂停
    if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (player.paused()) {
            player.play();
        } else {
            player.pause();
        }
    }
    
    // 左箭头：后退 5 秒
    if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const currentTime = player.currentTime();
        player.currentTime(Math.max(0, currentTime - 5));
    }
    
    // 右箭头：前进 5 秒
    if (e.code === 'ArrowRight') {
        e.preventDefault();
        const currentTime = player.currentTime();
        const duration = player.duration();
        player.currentTime(Math.min(duration, currentTime + 5));
    }
    
    // 上箭头：跳转到上一条字幕
    if (e.code === 'ArrowUp' && subtitles.length > 0) {
        e.preventDefault();
        const prevIndex = Math.max(0, currentSubtitleIndex - 1);
        if (subtitles[prevIndex]) {
            player.currentTime(subtitles[prevIndex].startTime);
        }
    }
    
    // 下箭头：跳转到下一条字幕
    if (e.code === 'ArrowDown' && subtitles.length > 0) {
        e.preventDefault();
        const nextIndex = Math.min(subtitles.length - 1, currentSubtitleIndex + 1);
        if (subtitles[nextIndex]) {
            player.currentTime(subtitles[nextIndex].startTime);
        }
    }
});

// 点击占位区域选择视频
videoPlaceholder.addEventListener('click', function() {
    videoInput.click();
});

// 字幕搜索功能
subtitleSearchInput.addEventListener('input', function(e) {
    const keyword = e.target.value.trim();
    
    // 显示/隐藏清除按钮
    if (keyword) {
        clearSearchBtn.style.display = 'flex';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    
    filterSubtitles(keyword);
});

// 搜索框按键事件
subtitleSearchInput.addEventListener('keydown', function(e) {
    // ESC 键清除搜索
    if (e.key === 'Escape') {
        subtitleSearchInput.value = '';
        clearSearchBtn.style.display = 'none';
        filterSubtitles('');
    }
});

// 清除搜索
clearSearchBtn.addEventListener('click', function() {
    subtitleSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    filterSubtitles('');
    subtitleSearchInput.focus();
});

// 过滤字幕
function filterSubtitles(keyword) {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    
    if (!keyword) {
        // 没有关键词，显示所有字幕
        items.forEach(item => {
            item.style.display = '';
            // 移除高亮
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
            // 匹配，显示并高亮
            item.style.display = '';
            matchCount++;
            
            // 高亮关键词
            const textDiv = item.querySelector('.subtitle-text');
            if (textDiv) {
                textDiv.innerHTML = highlightKeyword(subtitle.text, keyword);
            }
        } else {
            // 不匹配，隐藏
            item.style.display = 'none';
        }
    });
    
    // 显示搜索结果统计
    if (matchCount > 0) {
        searchResults.textContent = `找到 ${matchCount} 条匹配的字幕`;
        searchResults.className = 'search-results has-results';
    } else {
        searchResults.textContent = '未找到匹配的字幕';
        searchResults.className = 'search-results no-results';
    }
}

// 高亮关键词
function highlightKeyword(text, keyword) {
    const escapedText = escapeHtml(text);
    const escapedKeyword = escapeHtml(keyword);
    
    // 使用正则表达式进行不区分大小写的替换
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return escapedText.replace(regex, '<mark style="background: #fff59d; color: #000; padding: 2px 4px; border-radius: 3px; font-weight: 500;">$1</mark>');
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初始化提示
console.log('视频字幕播放器已就绪');
console.log('支持的快捷键：');
console.log('  空格：播放/暂停');
console.log('  ←/→：后退/前进 5 秒');
console.log('  ↑/↓：跳转到上一条/下一条字幕');

