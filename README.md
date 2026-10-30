# 🎬 TubePull — High-Fidelity YouTube Video & Audio Extractor

A professional, studio-grade YouTube video and audio extractor web application built with Python Flask, yt-dlp, and FFmpeg.

---

## ✨ Features

- **Pristine Quality Video**: Up to 4K Ultra HD (2160p), 1440p, 1080p FHD, 720p HD with zero re-encoding loss.
- **Audio Extraction**: Studio-grade MP3 (320 kbps & 192 kbps CBR) and original M4A streams.
- **FFmpeg Multiplexing**: Automatically merges discrete video and audio tracks losslessly.
- **Instant Auto-Inspect**: Instant metadata extraction on link paste (`Ctrl+V`).
- **Telemetry Progress**: Live download speed (MB/s), ETA, and pipeline stage tracker.
- **Shorts & Videos**: Full support for YouTube Shorts, standard videos, and music clips.
- **Workstation UI**: Obsidian dark design inspired by Linear, Cobalt, and Apple interfaces.

---

## 🚀 Quick Start (Local)

### 1. Requirements
- Python 3.10+
- Dependencies: `pip install -r requirements.txt`

### 2. Run
**On Windows:**
Double-click `run.bat` or run:
```powershell
python app.py
```
Open your browser at: **[http://localhost:5000](http://localhost:5000)**

---

## ☁️ Deployment

### Option 1: Deploy on Render (Free)
1. Push this repository to GitHub.
2. Go to [Render.com](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Environment**: `Python 3` (or `Docker`)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 300`
5. Click **Deploy Web Service**!

### Option 2: Deploy with Docker
```bash
docker build -t tubepull .
docker run -p 5000:5000 tubepull
```

---

## 🛠️ Tech Stack
- **Backend**: Python 3, Flask, yt-dlp, imageio-ffmpeg
- **Frontend**: Vanilla JavaScript (ES6+), Tailwind CSS, FontAwesome, Google Fonts
- **Deployment**: Gunicorn, Docker, Render/Railway ready
