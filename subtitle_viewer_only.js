const subtitleInput = document.getElementById('subtitleInput');
const subtitleList = document.getElementById('subtitleList');
const subtitleFileName = document.getElementById('subtitleFileName');
const subtitleStatus = document.getElementById('subtitleStatus');
const subtitleCount = document.getElementById('subtitleCount');
const subtitleSearchInput = document.getElementById('subtitleSearchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const searchResults = document.getElementById('searchResults');
const subtitleSearch = document.querySelector('.subtitle-search');
const selectAllCheckbox = document.getElementById('selectAllSubtitles');
const selectedCountSpan = document.getElementById('selectedCount');
const subtitleToolbar = document.querySelector('.subtitle-toolbar');

let subtitles = [];
let lastCheckedIndex = -1;
let currentHighlightedIndex = -1;
let lastHighlightedIndex = -1; // 用于 Shift 连选
let currentSubtitleMode = 'both'; // 'both', 'chinese', 'english'

subtitleInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        loadSubtitle(file);
        subtitleFileName.textContent = file.name;
    }
});

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

// 从 URL 加载字幕文件
async function loadSubtitleFromUrl(url, filename) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let content = detectAndDecodeSubtitle(uint8Array);
        
        subtitles = parseSRT(content);
        
        if (subtitles.length > 0) {
            displaySubtitles();
            showStatus(`成功加载 ${subtitles.length} 条字幕`, 'success');
            subtitleFileName.textContent = filename || 'demo.srt';
        } else {
            showStatus('字幕文件格式错误或为空', 'error');
        }
    } catch (error) {
        console.error('加载字幕文件失败:', error);
        showStatus('加载字幕文件失败: ' + error.message, 'error');
    }
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
                
                // 分离中英文：第一行为中文，第二行为英文
                const textLines = lines.slice(2);
                let chineseText = '';
                let englishText = '';
                
                if (textLines.length >= 1) {
                    chineseText = textLines[0].trim();
                }
                if (textLines.length >= 2) {
                    englishText = textLines[1].trim();
                }
                
                // 如果只有一行，尝试判断是中文还是英文
                if (textLines.length === 1) {
                    const text = textLines[0].trim();
                    // 简单判断：如果包含中文字符，认为是中文；否则认为是英文
                    if (/[\u4e00-\u9fa5]/.test(text)) {
                        chineseText = text;
                    } else {
                        englishText = text;
                    }
                }
                
                subtitles.push({
                    index: index,
                    startTime: startTime,
                    endTime: endTime,
                    chinese: chineseText,
                    english: englishText,
                    text: chineseText && englishText ? `${chineseText}\n${englishText}` : (chineseText || englishText) // 保留原始格式用于搜索
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
        
        // 根据模式显示不同的内容
        if (currentSubtitleMode === 'both') {
            // 双语模式：显示中英文（保持现有格式）
            textDiv.textContent = subtitle.text;
        } else if (currentSubtitleMode === 'chinese') {
            // 仅中文模式
            textDiv.textContent = subtitle.chinese || '';
        } else if (currentSubtitleMode === 'english') {
            // 仅英文模式
            textDiv.textContent = subtitle.english || '';
        }
        
        contentDiv.appendChild(timeDiv);
        contentDiv.appendChild(textDiv);
        
        item.appendChild(checkbox);
        item.appendChild(contentDiv);
        
        // 跟踪是否正在拖拽选择文本
        let isSelectingText = false;
        let mouseDownX = 0;
        let mouseDownY = 0;
        
        // 添加点击事件，高亮当前字幕，淡出其他字幕
        item.addEventListener('click', function(e) {
            // 如果点击的是复选框，不触发高亮
            if (e.target.type === 'checkbox') {
                return;
            }
            
            // 如果用户正在选择文本（鼠标移动了），不触发高亮
            if (isSelectingText) {
                isSelectingText = false;
                return;
            }
            
            // 如果按住 Shift 键，阻止文本选择
            if (e.shiftKey) {
                e.preventDefault();
            }
            
            highlightSubtitle(index, e.shiftKey);
        });
        
        // 监听鼠标按下
        item.addEventListener('mousedown', function(e) {
            // 如果点击的是复选框，不处理
            if (e.target.type === 'checkbox') {
                return;
            }
            
            // 记录鼠标按下位置
            mouseDownX = e.clientX;
            mouseDownY = e.clientY;
            isSelectingText = false;
            
            // 如果按住 Shift 键，阻止文本选择
            if (e.shiftKey) {
                e.preventDefault();
                // 标记为不选择文本
                isSelectingText = false;
            }
        });
        
        // 监听鼠标移动，如果移动了说明用户在拖拽选择文本
        item.addEventListener('mousemove', function(e) {
            if (e.buttons === 1) { // 鼠标左键按下
                const deltaX = Math.abs(e.clientX - mouseDownX);
                const deltaY = Math.abs(e.clientY - mouseDownY);
                // 如果移动距离超过 5 像素，认为是拖拽选择文本
                if (deltaX > 5 || deltaY > 5) {
                    isSelectingText = true;
                }
            }
        });
        
        // 阻止 Shift + 点击时的文本选择
        item.addEventListener('selectstart', function(e) {
            // 如果点击的是复选框，不阻止
            if (e.target.type === 'checkbox') {
                return;
            }
            // 如果按住 Shift 键，阻止文本选择
            if (e.shiftKey) {
                e.preventDefault();
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

function showStatus(message, type) {
    subtitleStatus.textContent = message;
    subtitleStatus.className = `subtitle-status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            subtitleStatus.style.display = 'none';
        }, 3000);
    }
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

document.body.addEventListener('drop', function(e) {
    const files = Array.from(e.dataTransfer.files);
    
    const subtitleFile = files.find(file => file.name.endsWith('.srt'));
    if (subtitleFile) {
        loadSubtitle(subtitleFile);
        subtitleFileName.textContent = subtitleFile.name;
        subtitleInput.files = e.dataTransfer.files;
    }
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
    } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

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
                const subtitle = subtitles[index];
                if (subtitle) {
                    // 根据模式显示不同的内容
                    if (currentSubtitleMode === 'both') {
                        textDiv.innerHTML = escapeHtml(subtitle.text);
                    } else if (currentSubtitleMode === 'chinese') {
                        textDiv.innerHTML = escapeHtml(subtitle.chinese || '');
                    } else if (currentSubtitleMode === 'english') {
                        textDiv.innerHTML = escapeHtml(subtitle.english || '');
                    }
                }
            }
        });
        searchResults.textContent = '';
        searchResults.className = 'search-results';
        // 恢复高亮状态
        updateSubtitleHighlight();
        return;
    }
    
    let matchCount = 0;
    const lowerKeyword = keyword.toLowerCase();
    
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        const subtitle = subtitles[index];
        
        // 搜索中英文内容
        const searchText = `${subtitle.chinese || ''} ${subtitle.english || ''}`.toLowerCase();
        
        if (subtitle && searchText.includes(lowerKeyword)) {
            item.style.display = '';
            matchCount++;
            
            const textDiv = item.querySelector('.subtitle-text');
            if (textDiv) {
                // 根据模式显示不同的内容并高亮关键词
                if (currentSubtitleMode === 'both') {
                    textDiv.innerHTML = highlightKeyword(subtitle.text, keyword);
                } else if (currentSubtitleMode === 'chinese') {
                    textDiv.innerHTML = highlightKeyword(subtitle.chinese || '', keyword);
                } else if (currentSubtitleMode === 'english') {
                    textDiv.innerHTML = highlightKeyword(subtitle.english || '', keyword);
                }
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
    
    // 更新高亮状态（如果当前高亮的字幕被隐藏了，取消高亮）
    if (currentHighlightedIndex !== -1) {
        const highlightedItem = subtitleList.querySelector(`.subtitle-item[data-index="${currentHighlightedIndex}"]`);
        if (!highlightedItem || highlightedItem.style.display === 'none') {
            currentHighlightedIndex = -1;
        }
        updateSubtitleHighlight();
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

function highlightSubtitle(index, isShiftKey = false) {
    // 如果点击的是同一个字幕，取消高亮
    if (currentHighlightedIndex === index && !isShiftKey) {
        currentHighlightedIndex = -1;
        lastHighlightedIndex = -1;
        updateSubtitleHighlight();
        return;
    }
    
    // 如果按住 Shift 键，进行连选
    if (isShiftKey && lastHighlightedIndex !== -1) {
        // 从上次高亮的字幕到当前点击的字幕之间的所有字幕都高亮
        const start = Math.min(lastHighlightedIndex, index);
        const end = Math.max(lastHighlightedIndex, index);
        
        // 获取所有可见的字幕项
        const visibleItems = Array.from(subtitleList.querySelectorAll('.subtitle-item'))
            .filter(item => item.style.display !== 'none')
            .map(item => parseInt(item.dataset.index));
        
        // 找到在可见范围内的所有字幕索引
        const rangeItems = [];
        for (let i = start; i <= end; i++) {
            if (visibleItems.includes(i)) {
                rangeItems.push(i);
            }
        }
        
        // 如果找到了范围内的字幕，高亮它们
        if (rangeItems.length > 0) {
            // 设置当前高亮为最后点击的字幕
            currentHighlightedIndex = index;
            lastHighlightedIndex = index;
            // 存储所有需要高亮的索引
            window.highlightedRange = rangeItems;
            updateSubtitleHighlight();
        } else {
            // 如果没有可见的字幕，只高亮当前点击的
            currentHighlightedIndex = index;
            lastHighlightedIndex = index;
            window.highlightedRange = [index];
            updateSubtitleHighlight();
        }
    } else {
        // 普通点击，只高亮当前字幕
        currentHighlightedIndex = index;
        lastHighlightedIndex = index;
        window.highlightedRange = [index];
        updateSubtitleHighlight();
    }
}

function updateSubtitleHighlight() {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    const highlightedRange = window.highlightedRange || [];
    
    // 如果没有高亮范围，清空
    if (currentHighlightedIndex === -1 || highlightedRange.length === 0) {
        items.forEach((item) => {
            item.classList.remove('highlighted');
            item.classList.remove('faded');
        });
        window.highlightedRange = [];
        return;
    }
    
    let shouldScroll = false;
    let scrollTarget = null;
    
    items.forEach((item, index) => {
        if (highlightedRange.includes(index)) {
            // 在范围内的字幕高亮
            item.classList.add('highlighted');
            item.classList.remove('faded');
            
            // 如果是当前主要高亮的字幕，需要滚动
            if (index === currentHighlightedIndex) {
                shouldScroll = true;
                scrollTarget = item;
            }
        } else {
            // 其他字幕淡出
            item.classList.remove('highlighted');
            item.classList.add('faded');
        }
    });
    
    // 滚动到当前主要高亮的字幕
    if (shouldScroll && scrollTarget) {
        const listRect = subtitleList.getBoundingClientRect();
        const itemRect = scrollTarget.getBoundingClientRect();
        
        if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
            const listHeight = subtitleList.clientHeight;
            const currentScrollTop = subtitleList.scrollTop;
            const itemHeight = itemRect.height;
            
            const itemTopRelativeToViewport = itemRect.top;
            const listTopRelativeToViewport = listRect.top;
            const itemTopRelativeToList = itemTopRelativeToViewport - listTopRelativeToViewport + currentScrollTop;
            const itemCenterRelativeToList = itemTopRelativeToList + (itemHeight / 2);
            const targetScrollTop = itemCenterRelativeToList - (listHeight / 2);
            
            subtitleList.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
            });
        }
    }
}

// 键盘导航功能
document.addEventListener('keydown', function(e) {
    // 如果没有字幕，不处理
    if (subtitles.length === 0) {
        return;
    }
    
    // 如果正在输入框中输入，检查是否应该处理方向键
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    // 处理方向键
    if (e.key === 'ArrowUp' || e.code === 'ArrowUp') {
        // 如果在搜索框，允许方向键导航（阻止默认的文本选择行为）
        if (isInputFocused && activeElement.id === 'subtitleSearchInput') {
            e.preventDefault();
        } else if (isInputFocused) {
            // 其他输入框不处理
            return;
        }
        e.preventDefault();
        navigateHighlight(-1); // 向上
    } else if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
        // 如果在搜索框，允许方向键导航
        if (isInputFocused && activeElement.id === 'subtitleSearchInput') {
            e.preventDefault();
        } else if (isInputFocused) {
            // 其他输入框不处理
            return;
        }
        e.preventDefault();
        navigateHighlight(1); // 向下
    }
});

function navigateHighlight(direction) {
    // 获取所有可见的字幕项（排除被搜索过滤隐藏的）
    const visibleItems = Array.from(subtitleList.querySelectorAll('.subtitle-item'))
        .filter(item => item.style.display !== 'none')
        .map(item => parseInt(item.dataset.index));
    
    if (visibleItems.length === 0) {
        return;
    }
    
    // 如果没有高亮的字幕，从第一条或最后一条开始
    if (currentHighlightedIndex === -1) {
        if (direction > 0) {
            // 向下：从第一条可见字幕开始
            currentHighlightedIndex = visibleItems[0];
        } else {
            // 向上：从最后一条可见字幕开始
            currentHighlightedIndex = visibleItems[visibleItems.length - 1];
        }
        lastHighlightedIndex = currentHighlightedIndex;
        window.highlightedRange = [currentHighlightedIndex];
    } else {
        // 找到当前高亮字幕在可见列表中的位置
        const currentPosition = visibleItems.indexOf(currentHighlightedIndex);
        
        if (currentPosition === -1) {
            // 当前高亮的字幕不可见，从第一条或最后一条开始
            if (direction > 0) {
                currentHighlightedIndex = visibleItems[0];
            } else {
                currentHighlightedIndex = visibleItems[visibleItems.length - 1];
            }
            lastHighlightedIndex = currentHighlightedIndex;
            window.highlightedRange = [currentHighlightedIndex];
        } else {
            // 计算新的位置
            const newPosition = currentPosition + direction;
            
            // 检查边界
            if (newPosition < 0) {
                currentHighlightedIndex = visibleItems[0];
            } else if (newPosition >= visibleItems.length) {
                currentHighlightedIndex = visibleItems[visibleItems.length - 1];
            } else {
                currentHighlightedIndex = visibleItems[newPosition];
            }
            lastHighlightedIndex = currentHighlightedIndex;
            window.highlightedRange = [currentHighlightedIndex];
        }
    }
    
    // 更新高亮显示
    updateSubtitleHighlight();
}

// 字体大小控制
const fontSizeButtons = document.querySelectorAll('.font-size-btn');
const subtitleSection = document.querySelector('.subtitle-section');

// 从本地存储读取字体大小设置
let currentFontSize = localStorage.getItem('subtitleFontSize') || 'medium';
subtitleSection.classList.add(`font-size-${currentFontSize}`);
document.querySelector(`.font-size-btn[data-size="${currentFontSize}"]`)?.classList.add('active');

fontSizeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
        const size = this.dataset.size;
        
        // 移除所有字体大小类
        subtitleSection.classList.remove('font-size-small', 'font-size-medium', 'font-size-large');
        // 添加新的字体大小类
        subtitleSection.classList.add(`font-size-${size}`);
        
        // 更新按钮状态
        fontSizeButtons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // 保存到本地存储
        localStorage.setItem('subtitleFontSize', size);
        currentFontSize = size;
    });
});

// 全屏功能
const fullscreenBtn = document.getElementById('fullscreenBtn');
let isFullscreen = false;

function toggleFullscreen() {
    if (!isFullscreen) {
        // 进入全屏
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
        document.body.classList.add('fullscreen');
        isFullscreen = true;
    } else {
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        document.body.classList.remove('fullscreen');
        isFullscreen = false;
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);

// 监听全屏状态变化
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen');
        isFullscreen = false;
    }
});

document.addEventListener('webkitfullscreenchange', function() {
    if (!document.webkitFullscreenElement) {
        document.body.classList.remove('fullscreen');
        isFullscreen = false;
    }
});

document.addEventListener('msfullscreenchange', function() {
    if (!document.msFullscreenElement) {
        document.body.classList.remove('fullscreen');
        isFullscreen = false;
    }
});

// 字幕显示模式控制
const modeButtons = document.querySelectorAll('.mode-btn');

// 从本地存储读取显示模式设置
currentSubtitleMode = localStorage.getItem('subtitleMode') || 'both';
document.querySelector(`.mode-btn[data-mode="${currentSubtitleMode}"]`)?.classList.add('active');

modeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
        const mode = this.dataset.mode;
        
        // 更新按钮状态
        modeButtons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // 更新模式
        currentSubtitleMode = mode;
        
        // 保存到本地存储
        localStorage.setItem('subtitleMode', mode);
        
        // 更新所有字幕显示
        updateSubtitleDisplayMode();
    });
});

function updateSubtitleDisplayMode() {
    const items = subtitleList.querySelectorAll('.subtitle-item');
    
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        const subtitle = subtitles[index];
        if (!subtitle) return;
        
        const textDiv = item.querySelector('.subtitle-text');
        if (textDiv) {
            // 根据模式显示不同的内容
            if (currentSubtitleMode === 'both') {
                textDiv.textContent = subtitle.text;
            } else if (currentSubtitleMode === 'chinese') {
                textDiv.textContent = subtitle.chinese || '';
            } else if (currentSubtitleMode === 'english') {
                textDiv.textContent = subtitle.english || '';
            }
        }
    });
}

// 自动加载演示字幕文件
async function loadDemoSubtitle() {
    const demoSubtitlePath = 'playback_demo/House-of-Cards-Series-Trailer.srt';
    
    try {
        // 检查文件是否存在
        const response = await fetch(demoSubtitlePath, { method: 'HEAD' });
        if (response.ok) {
            // 文件存在，加载它
            await loadSubtitleFromUrl(demoSubtitlePath, 'House-of-Cards-Series-Trailer.srt');
        }
    } catch (error) {
        // 文件不存在或加载失败，静默失败（不显示错误）
        console.log('演示字幕文件不存在，跳过自动加载');
    }
}

// 页面加载完成后自动加载演示字幕
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(loadDemoSubtitle, 300);
    });
} else {
    setTimeout(loadDemoSubtitle, 300);
}

console.log('字幕浏览器已就绪');

