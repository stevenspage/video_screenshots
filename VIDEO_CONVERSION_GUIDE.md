# 视频格式转换指南

如果您的 MKV 视频无法在浏览器中播放，通常是因为音频编码不兼容。本指南将帮助您快速转换视频格式。

## 🎯 问题原因

浏览器只支持以下音频编码：
- ✅ AAC
- ✅ MP3
- ✅ Opus
- ✅ Vorbis

常见不支持的音频编码：
- ❌ AC3 (杜比数字)
- ❌ DTS
- ❌ TrueHD
- ❌ EAC3

## 💡 解决方案

### 方案一：使用 FFmpeg（命令行，推荐）

#### 1. 安装 FFmpeg

**Windows**：
```powershell
# 使用 Chocolatey
choco install ffmpeg

# 或使用 Scoop
scoop install ffmpeg

# 或从官网下载：https://ffmpeg.org/download.html
```

**macOS**：
```bash
brew install ffmpeg
```

**Linux**：
```bash
sudo apt install ffmpeg  # Ubuntu/Debian
sudo yum install ffmpeg  # CentOS/RHEL
```

#### 2. 转换命令

**快速转换（推荐）**：
```bash
# 只转换音频，保持视频不变（速度快）
ffmpeg -i input.mkv -c:v copy -c:a aac -b:a 192k output.mp4
```

**完整转换**：
```bash
# 同时转换视频和音频（兼容性最好）
ffmpeg -i input.mkv -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -movflags +faststart output.mp4
```

**批量转换（PowerShell）**：
```powershell
# 转换当前目录下所有 MKV 文件
Get-ChildItem *.mkv | ForEach-Object {
    $output = $_.BaseName + "_converted.mp4"
    ffmpeg -i $_.Name -c:v copy -c:a aac -b:a 192k $output
}
```

**批量转换（Bash/Linux/macOS）**：
```bash
# 转换当前目录下所有 MKV 文件
for file in *.mkv; do
    ffmpeg -i "$file" -c:v copy -c:a aac -b:a 192k "${file%.mkv}_converted.mp4"
done
```

### 方案二：使用图形界面工具

#### HandBrake（免费、开源）
1. 下载：https://handbrake.fr/
2. 打开 MKV 文件
3. 选择预设："Fast 1080p30" 或 "Web > Gmail"
4. 音频编码器选择 "AAC"
5. 点击 "Start Encode"

#### 格式工厂（免费，仅 Windows）
1. 下载：http://www.pcfreetime.com/
2. 选择"视频" -> "MP4"
3. 添加文件
4. 点击"开始"转换

#### VLC 媒体播放器（免费）
1. 打开 VLC
2. 媒体 → 转换/保存
3. 添加文件
4. 转换
5. 配置文件选择："Video - H.264 + MP3 (MP4)"
6. 开始转换

### 方案三：在线转换（小文件）

适合小于 100MB 的文件：
- CloudConvert：https://cloudconvert.com/
- Online-Convert：https://www.online-convert.com/
- FreeConvert：https://www.freeconvert.com/

⚠️ **注意**：不要上传敏感或私密视频到在线服务

## 📋 参数说明

### FFmpeg 常用参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `-c:v copy` | 复制视频流（不重新编码） | 速度最快 |
| `-c:v libx264` | 使用 H.264 编码 | 兼容性最好 |
| `-crf` | 视频质量 (0-51) | 18-23（越小质量越好） |
| `-preset` | 编码速度 | fast/medium/slow |
| `-c:a aac` | 音频编码为 AAC | 浏览器完美支持 |
| `-b:a` | 音频码率 | 128k-192k |
| `-movflags +faststart` | 优化网络播放 | Web 播放必须 |

### 质量与文件大小

**CRF 值建议**：
- `18` - 高质量，文件较大
- `23` - **推荐**，质量与大小平衡
- `28` - 较低质量，文件小

**音频码率建议**：
- `128k` - 普通质量
- `192k` - **推荐**，好质量
- `256k` - 高质量

## 🚀 快速检查视频信息

**使用 FFmpeg 查看视频编码**：
```bash
ffmpeg -i your_video.mkv
```

**使用 MediaInfo（图形界面）**：
1. 下载：https://mediaarea.net/en/MediaInfo
2. 打开视频文件
3. 查看音频编码格式

## ❓ 常见问题

**Q: 转换会损失画质吗？**  
A: 使用 `-c:v copy` 不会损失画质。使用 `-c:v libx264 -crf 23` 几乎看不出差异。

**Q: 转换需要多长时间？**  
A: 
- 只转音频（`-c:v copy`）：1-2 分钟（1GB文件）
- 完整转换：5-15 分钟（取决于CPU和参数）

**Q: 转换后文件更大了？**  
A: 可能是码率设置过高。尝试降低 `-crf` 值或 `-b:a` 值。

**Q: 我不想转换，有其他办法吗？**  
A: 很遗憾，这是浏览器的限制，无法绕过。转换是唯一解决方案。

## 📞 需要帮助？

如果遇到问题，请检查：
1. FFmpeg 是否正确安装（运行 `ffmpeg -version`）
2. 输入文件路径是否正确
3. 输出文件是否有写权限
4. 磁盘空间是否充足

---

**推荐组合（最快最好）**：
```bash
ffmpeg -i input.mkv -c:v copy -c:a aac -b:a 192k -movflags +faststart output.mp4
```

这个命令会保持视频质量不变，只转换音频，速度最快！✨


