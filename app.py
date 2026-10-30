import os
import re
import time
import uuid
import glob
import threading
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, abort
from flask_cors import CORS
import yt_dlp
import imageio_ffmpeg

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Path to ffmpeg binary provided by imageio_ffmpeg
FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

# In-memory tracking of active/recent download jobs
jobs = {}
jobs_lock = threading.Lock()


def sanitize_filename(name):
    """Sanitize title to be safe for filenames across Windows and Unix."""
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = re.sub(r'\s+', " ", cleaned).strip()
    return cleaned[:120] if cleaned else "youtube_media"


def format_duration(seconds):
    """Format seconds into HH:MM:SS or MM:SS."""
    if not seconds:
        return "00:00"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_bytes(size):
    """Format bytes into readable MB/GB string."""
    if not size or size <= 0:
        return ""
    if size >= 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024 * 1024):.1f} GB"
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    if size >= 1024:
        return f"{size / 1024:.0f} KB"
    return f"{size} B"


def estimate_video_size(formats, target_height, duration):
    """Estimate combined video + best audio size for a given resolution."""
    # Find best audio size
    audio_formats = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
    best_audio_size = 0
    if audio_formats:
        best_audio = max(audio_formats, key=lambda x: x.get('abr') or 0)
        best_audio_size = best_audio.get('filesize') or best_audio.get('filesize_approx') or 0
        if not best_audio_size and duration and best_audio.get('abr'):
            best_audio_size = int((best_audio['abr'] * 1000 * duration) / 8)

    # If duration exists and audio still 0, assume 128kbps audio
    if not best_audio_size and duration:
        best_audio_size = int((128 * 1000 * duration) / 8)

    # Find video stream matching target_height
    video_matches = [
        f for f in formats 
        if f.get('vcodec') != 'none' and f.get('height') == target_height
    ]
    if video_matches:
        best_v = max(video_matches, key=lambda x: x.get('tbr') or x.get('vbr') or 0)
        v_size = best_v.get('filesize') or best_v.get('filesize_approx') or 0
        if not v_size and duration and (best_v.get('vbr') or best_v.get('tbr')):
            bitrate = best_v.get('vbr') or best_v.get('tbr')
            v_size = int((bitrate * 1000 * duration) / 8)
        
        if v_size:
            return format_bytes(v_size + best_audio_size)

    # Rough fallback estimation based on resolution & duration
    if duration:
        bitrate_map = {
            2160: 20000, # ~20 Mbps
            1440: 10000, # ~10 Mbps
            1080: 4500,  # ~4.5 Mbps
            720: 2500,   # ~2.5 Mbps
            480: 1200,   # ~1.2 Mbps
            360: 700     # ~700 Kbps
        }
        br = bitrate_map.get(target_height, 2000)
        total_b = int(((br + 128) * 1000 * duration) / 8)
        return f"~{format_bytes(total_b)}"
    
    return ""
    if not seconds:
        return "00:00"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_views(count):
    """Format view count into readable string (e.g. 1.2M, 45K)."""
    if not count:
        return "0"
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M"
    if count >= 1_000:
        return f"{count / 1_000:.1f}K"
    return str(count)


def cleanup_old_files():
    """Remove downloaded files older than 1 hour to prevent disk bloat."""
    try:
        now = time.time()
        for f in glob.glob(os.path.join(DOWNLOAD_DIR, "*")):
            if os.path.isfile(f):
                # If older than 1 hour (3600 seconds)
                if now - os.path.getmtime(f) > 3600:
                    try:
                        os.remove(f)
                    except Exception:
                        pass
    except Exception as e:
        print(f"Cleanup error: {e}")


def get_base_ydl_opts():
    """Common yt-dlp options."""
    return {
        'ffmpeg_location': FFMPEG_EXE,
        'remote_components': ['ejs:github'],
        'js_runtimes': {'node': {}},
        'quiet': True,
        'no_warnings': True,
        'cachedir': False,
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Fetch video metadata and available quality options."""
    cleanup_old_files()
    data = request.get_json() or {}
    url = (data.get('url') or '').strip()

    if not url:
        return jsonify({'success': False, 'error': 'Kripya YouTube video ka URL daalein.'}), 400

    # Basic YouTube URL check
    yt_pattern = r'(https?://)?(www\.|m\.)?(youtube\.com|youtu\.be)/(watch\?v=|embed/|v/|shorts/|.+\?v=)?([^&=%\?]{11})'
    if not re.search(yt_pattern, url):
        return jsonify({'success': False, 'error': 'Amaanaya (invalid) YouTube URL. Kripya sahi link daalein.'}), 400

    ydl_opts = get_base_ydl_opts()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Video basic info
        title = info.get('title', 'Unknown Title')
        thumbnail = info.get('thumbnail', '')
        duration = format_duration(info.get('duration', 0))
        duration_raw = info.get('duration', 0)
        channel = info.get('uploader') or info.get('channel') or 'Unknown Channel'
        channel_url = info.get('uploader_url') or info.get('channel_url') or ''
        views = format_views(info.get('view_count', 0))
        video_id = info.get('id', '')

        # Analyze formats
        formats = info.get('formats', [])
        available_heights = set()
        for f in formats:
            height = f.get('height')
            vcodec = f.get('vcodec')
            if height and vcodec and vcodec != 'none':
                available_heights.add(height)

        sorted_heights = sorted(list(available_heights), reverse=True)

        # Standard resolution options to present
        standard_resolutions = [
            {'height': 2160, 'label': '4K Ultra HD', 'res': '2160p', 'badge': '4K UHD', 'desc': '3840×2160 • High Bitrate'},
            {'height': 1440, 'label': '2K Quad HD', 'res': '1440p', 'badge': '1440p QHD', 'desc': '2560×1440 • 60fps'},
            {'height': 1080, 'label': '1080p Full HD', 'res': '1080p', 'badge': '1080p FHD', 'desc': '1920×1080 • Crystal Clear'},
            {'height': 720, 'label': '720p HD', 'res': '720p', 'badge': '720p HD', 'desc': '1280×720 • Standard HD'},
            {'height': 480, 'label': '480p Standard', 'res': '480p', 'badge': '480p SD', 'desc': '854×480 • Mobile Optimized'},
            {'height': 360, 'label': '360p Compact', 'res': '360p', 'badge': '360p', 'desc': '640×360 • Minimum Data'},
        ]

        video_options = []
        for res in standard_resolutions:
            if any(h >= res['height'] for h in sorted_heights):
                size_str = estimate_video_size(formats, res['height'], duration_raw)
                video_options.append({
                    'id': str(res['height']),
                    'label': res['label'],
                    'resolution': res['res'],
                    'badge': res['badge'],
                    'desc': res['desc'],
                    'size': size_str,
                    'is_default': (res['height'] == 1080 or (not video_options and res['height'] <= 1080))
                })

        # If no standard matched or 1080p wasn't marked default, mark first
        if video_options:
            if not any(v.get('is_default') for v in video_options):
                video_options[0]['is_default'] = True
        else:
            video_options.append({
                'id': 'best',
                'label': 'Best Available Quality',
                'resolution': 'Auto MP4',
                'badge': 'AUTO',
                'desc': 'Highest available video & audio',
                'size': '',
                'is_default': True
            })

        # Calculate Audio Sizes
        mp3_320_size = format_bytes(int((320 * 1000 * duration_raw) / 8)) if duration_raw else ""
        mp3_192_size = format_bytes(int((192 * 1000 * duration_raw) / 8)) if duration_raw else ""
        m4a_size = format_bytes(int((140 * 1000 * duration_raw) / 8)) if duration_raw else ""

        audio_options = [
            {
                'id': 'mp3_320',
                'label': 'MP3 Extreme (320 kbps)',
                'format': 'MP3',
                'quality': '320k',
                'badge': '320 KBPS',
                'desc': 'Audiophile quality • Studio grade CBR',
                'size': mp3_320_size
            },
            {
                'id': 'mp3_192',
                'label': 'MP3 Standard (192 kbps)',
                'format': 'MP3',
                'quality': '192k',
                'badge': '192 KBPS',
                'desc': 'Optimal balance of quality & file size',
                'size': mp3_192_size
            },
            {
                'id': 'm4a',
                'label': 'M4A Original (AAC)',
                'format': 'M4A',
                'quality': 'Original',
                'badge': 'ORIGINAL',
                'desc': 'Lossless stream copy without re-encoding',
                'size': m4a_size
            }
        ]

        return jsonify({
            'success': True,
            'data': {
                'id': video_id,
                'title': title,
                'thumbnail': thumbnail,
                'duration': duration,
                'duration_raw': duration_raw,
                'channel': channel,
                'channel_url': channel_url,
                'views': views,
                'url': url,
                'video_options': video_options,
                'audio_options': audio_options
            }
        })

    except yt_dlp.utils.DownloadError as de:
        error_msg = str(de)
        if "Private video" in error_msg:
            msg = "Yeh video Private hai aur download nahi ho sakti."
        elif "Sign in to confirm your age" in error_msg or "age-restricted" in error_msg:
            msg = "Yeh video Age-restricted hai."
        elif "Video unavailable" in error_msg:
            msg = "Video uplabdh (available) nahi hai ya delete ho chuki hai."
        else:
            msg = f"Video info nikaalne mein dikkat aayi: {error_msg}"
        return jsonify({'success': False, 'error': msg}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f"An unexpected error occurred: {str(e)}"}), 500


def background_downloader(job_id, url, download_type, option_id, title):
    """Executes download in background thread and updates job state."""
    job_file_prefix = os.path.join(DOWNLOAD_DIR, job_id)

    def progress_hook(d):
        with jobs_lock:
            if job_id not in jobs:
                return
            status = d.get('status')
            if status == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                if total > 0:
                    percent = min(round((downloaded / total) * 92, 1), 92.0)
                else:
                    percent = 50.0

                speed = d.get('_speed_str', '').strip()
                eta = d.get('_eta_str', '').strip()

                jobs[job_id]['status'] = 'downloading'
                jobs[job_id]['progress'] = percent
                jobs[job_id]['speed'] = speed or 'Calculating...'
                jobs[job_id]['eta'] = eta or 'Calculating...'
                jobs[job_id]['message'] = f"Downloading streams... {percent}%"

            elif status == 'finished':
                jobs[job_id]['status'] = 'merging'
                jobs[job_id]['progress'] = 94.0
                jobs[job_id]['message'] = "Streams download complete. Processing & merging with FFmpeg..."

    def postprocessor_hook(d):
        with jobs_lock:
            if job_id not in jobs:
                return
            status = d.get('status')
            if status == 'started':
                jobs[job_id]['status'] = 'merging'
                jobs[job_id]['progress'] = 96.0
                jobs[job_id]['message'] = "Audio & video convert / merge ho raha hai..."

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'outtmpl': f"{job_file_prefix}.%(ext)s",
        'progress_hooks': [progress_hook],
        'postprocessor_hooks': [postprocessor_hook],
    })

    ext = 'mp4'
    if download_type == 'audio':
        if option_id == 'mp3_320':
            ext = 'mp3'
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }],
            })
        elif option_id == 'mp3_192':
            ext = 'mp3'
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            })
        elif option_id == 'm4a':
            ext = 'm4a'
            ydl_opts.update({
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'm4a',
                }],
            })
    else:
        # Video download
        ext = 'mp4'
        if option_id == 'best':
            ydl_opts.update({
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
                'merge_output_format': 'mp4',
            })
        else:
            try:
                target_height = int(option_id)
                ydl_opts.update({
                    'format': f'bestvideo[height<={target_height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={target_height}]+bestaudio/best[height<={target_height}]/best',
                    'merge_output_format': 'mp4',
                })
            except ValueError:
                ydl_opts.update({
                    'format': 'bestvideo+bestaudio/best',
                    'merge_output_format': 'mp4',
                })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find final file on disk matching the job_id
        pattern = os.path.join(DOWNLOAD_DIR, f"{job_id}.*")
        matching = [f for f in glob.glob(pattern) if not f.endswith('.part') and not f.endswith('.ytdl')]

        if not matching:
            raise FileNotFoundError("Merged file was not created.")

        final_path = matching[0]
        actual_ext = os.path.splitext(final_path)[1].replace('.', '')
        file_size_bytes = os.path.getsize(final_path)
        file_size_mb = f"{file_size_bytes / (1024 * 1024):.1f} MB"

        with jobs_lock:
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['progress'] = 100.0
            jobs[job_id]['file_path'] = final_path
            jobs[job_id]['actual_ext'] = actual_ext
            jobs[job_id]['file_size'] = file_size_mb
            jobs[job_id]['message'] = 'Download complete! File taiyar hai.'

    except Exception as e:
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = str(e)
            jobs[job_id]['message'] = f"Download fail ho gaya: {str(e)}"


@app.route('/api/start-download', methods=['POST'])
def start_download():
    """Initiates an asynchronous download job."""
    data = request.get_json() or {}
    url = (data.get('url') or '').strip()
    download_type = data.get('type', 'video')  # 'video' or 'audio'
    option_id = data.get('option_id', 'best')
    title = (data.get('title') or 'youtube_media').strip()

    if not url:
        return jsonify({'success': False, 'error': 'Missing URL'}), 400

    job_id = str(uuid.uuid4())
    safe_name = sanitize_filename(title)

    with jobs_lock:
        jobs[job_id] = {
            'id': job_id,
            'url': url,
            'title': safe_name,
            'type': download_type,
            'option_id': option_id,
            'status': 'queued',
            'progress': 0.0,
            'speed': '0 KB/s',
            'eta': '--',
            'message': 'Download queue ho raha hai...',
            'file_path': None,
            'error': None,
            'created_at': time.time(),
        }

    thread = threading.Thread(
        target=background_downloader,
        args=(job_id, url, download_type, option_id, safe_name),
        daemon=True
    )
    thread.start()

    return jsonify({'success': True, 'job_id': job_id})


@app.route('/api/progress/<job_id>', methods=['GET'])
def get_progress(job_id):
    """Poll status of an active download job."""
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({'success': False, 'error': 'Job not found'}), 404

        return jsonify({
            'success': True,
            'status': job['status'],
            'progress': job['progress'],
            'speed': job.get('speed', ''),
            'eta': job.get('eta', ''),
            'message': job.get('message', ''),
            'file_size': job.get('file_size', ''),
            'error': job.get('error')
        })


@app.route('/api/file/<job_id>', methods=['GET'])
def download_file(job_id):
    """Streams the completed downloaded file directly to the user's browser."""
    with jobs_lock:
        job = jobs.get(job_id)

    if not job or job.get('status') != 'completed':
        # Check if file exists anyway
        pattern = os.path.join(DOWNLOAD_DIR, f"{job_id}.*")
        matching = [f for f in glob.glob(pattern) if not f.endswith('.part') and not f.endswith('.ytdl')]
        if not matching:
            return abort(404, description="File nahi mili ya abhi download poora nahi hua.")
        file_path = matching[0]
        actual_ext = os.path.splitext(file_path)[1].replace('.', '')
        filename = f"youtube_media.{actual_ext}"
    else:
        file_path = job.get('file_path')
        actual_ext = job.get('actual_ext', 'mp4')
        clean_title = job.get('title', 'youtube_media')
        filename = f"{clean_title}.{actual_ext}"

    if not file_path or not os.path.exists(file_path):
        return abort(404, description="File disk par uplabdh nahi hai.")

    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename,
        conditional=True
    )


if __name__ == '__main__':
    # Set utf-8 encoding for standard output if available
    import sys
    if sys.platform == 'win32':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')

    print("=" * 60)
    print("[*] YouTube Video Downloader Server Starting...")
    print(f"[*] URL: http://localhost:{port}")
    print("[*] FFmpeg Location:", FFMPEG_EXE)
    print("=" * 60)
    app.run(host=host, port=port, debug=False)
