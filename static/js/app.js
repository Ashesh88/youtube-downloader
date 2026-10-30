// TubePull — Professional Workstation Engine Client Script

let activeVideo = null;
let selectedType = 'video';
let selectedOptionId = '1080';
let selectedLabel = '1080p Full HD';
let selectedSize = '';
let pollTimer = null;
let activeJobId = null;

// Initialize events
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('video-url');
    const clearBtn = document.getElementById('clear-btn');

    // Input changes
    input.addEventListener('input', () => {
        if (input.value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    });

    // Auto-fetch on paste event
    input.addEventListener('paste', (e) => {
        setTimeout(() => {
            const val = input.value.trim();
            if (isYouTubeUrl(val)) {
                handleFetch();
            }
        }, 80);
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Esc resets
        if (e.key === 'Escape') {
            resetWorkspace();
            clearInput();
        }
    });

    loadHistory();
});

function isYouTubeUrl(url) {
    const pattern = /(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/|.+\?v=)?([^&=%\?]{11})/;
    return pattern.test(url);
}

// Clear input field
function clearInput() {
    const input = document.getElementById('video-url');
    input.value = '';
    document.getElementById('clear-btn').classList.add('hidden');
    input.focus();
}

// Clipboard Paste
async function pasteClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            const input = document.getElementById('video-url');
            input.value = text.trim();
            document.getElementById('clear-btn').classList.remove('hidden');
            if (isYouTubeUrl(input.value)) {
                handleFetch();
            }
        }
    } catch {
        const input = document.getElementById('video-url');
        input.focus();
    }
}

// Quick Sample Video
function loadSample(url) {
    const input = document.getElementById('video-url');
    input.value = url;
    document.getElementById('clear-btn').classList.remove('hidden');
    handleFetch();
}

// Error Handling
function showError(title, message) {
    document.getElementById('error-title').textContent = title;
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-banner').classList.remove('hidden');
}

function hideError() {
    document.getElementById('error-banner').classList.add('hidden');
}

// Reset view states
function resetWorkspace() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    activeJobId = null;
    hideError();
    document.getElementById('skeleton-loader').classList.add('hidden');
    document.getElementById('inspector-card').classList.add('hidden');
    document.getElementById('progress-card').classList.add('hidden');
}

// Handle Form Submission (Inspect Video)
async function handleFetch(event) {
    if (event) event.preventDefault();
    hideError();

    const url = document.getElementById('video-url').value.trim();
    if (!url) {
        showError('Missing Link', 'Enter or paste a valid YouTube video or Shorts URL.');
        return;
    }

    if (!isYouTubeUrl(url)) {
        showError('Invalid URL', 'Please enter a valid YouTube video or Shorts link.');
        return;
    }

    resetWorkspace();

    const fetchBtn = document.getElementById('fetch-btn');
    const label = document.getElementById('fetch-btn-label');
    const icon = document.getElementById('fetch-btn-icon');
    const skeleton = document.getElementById('skeleton-loader');

    fetchBtn.disabled = true;
    label.textContent = 'Inspecting...';
    icon.className = 'fa-solid fa-circle-notch fa-spin text-xs';
    skeleton.classList.remove('hidden');

    try {
        const resp = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await resp.json();
        skeleton.classList.add('hidden');

        if (!resp.ok || !data.success) {
            showError('Extraction Failed', data.error || 'Could not fetch metadata for this video.');
            return;
        }

        activeVideo = data.data;
        renderInspector(activeVideo);

    } catch (err) {
        skeleton.classList.add('hidden');
        showError('Connection Error', 'Backend service did not respond. Verify the server is running.');
    } finally {
        fetchBtn.disabled = false;
        label.textContent = 'Extract';
        icon.className = 'fa-solid fa-arrow-right text-xs';
    }
}

// Render Video Inspector
function renderInspector(media) {
    document.getElementById('media-thumb').src = media.thumbnail;
    document.getElementById('media-title').textContent = media.title;
    document.getElementById('media-duration').textContent = media.duration;
    document.getElementById('media-channel').textContent = media.channel;
    document.getElementById('media-views').textContent = media.views;
    document.getElementById('media-external-link').href = media.url;

    // Render Video Grid
    const videoGrid = document.getElementById('video-grid');
    videoGrid.innerHTML = '';

    let defaultOption = media.video_options.find(o => o.is_default) || media.video_options[0];
    selectedOptionId = defaultOption ? defaultOption.id : 'best';
    selectedLabel = defaultOption ? defaultOption.label : 'Video';
    selectedSize = defaultOption ? defaultOption.size : '';

    media.video_options.forEach(opt => {
        const isActive = opt.id === selectedOptionId;
        const card = document.createElement('div');
        card.className = `quality-card ${isActive ? 'is-active' : ''}`;
        card.dataset.id = opt.id;
        card.dataset.type = 'video';
        card.dataset.label = opt.label;
        card.dataset.size = opt.size || '';

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="radio-dot"></div>
                <div>
                    <div class="text-xs sm:text-sm font-semibold text-white tracking-tight">${opt.label}</div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">${opt.desc}</div>
                </div>
            </div>
            <div class="text-right shrink-0">
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-slate-300 block mb-0.5">
                    ${opt.badge}
                </span>
                ${opt.size ? `<span class="text-[10px] text-slate-400 font-mono block">${opt.size}</span>` : ''}
            </div>
        `;

        card.onclick = () => selectCard('video', opt.id, opt.label, opt.size || '');
        videoGrid.appendChild(card);
    });

    // Render Audio Grid
    const audioGrid = document.getElementById('audio-grid');
    audioGrid.innerHTML = '';

    media.audio_options.forEach(opt => {
        const card = document.createElement('div');
        card.className = `quality-card`;
        card.dataset.id = opt.id;
        card.dataset.type = 'audio';
        card.dataset.label = opt.label;
        card.dataset.size = opt.size || '';

        card.innerHTML = `
            <div class="flex items-center gap-2.5">
                <div class="radio-dot"></div>
                <div>
                    <div class="text-xs font-semibold text-white tracking-tight">${opt.label}</div>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5">${opt.desc}</div>
                </div>
            </div>
            <div class="text-right shrink-0">
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-amber-300/80 block mb-0.5">
                    ${opt.badge}
                </span>
                ${opt.size ? `<span class="text-[10px] text-slate-400 font-mono block">${opt.size}</span>` : ''}
            </div>
        `;

        card.onclick = () => selectCard('audio', opt.id, opt.label, opt.size || '');
        audioGrid.appendChild(card);
    });

    switchFormatTab('video');
    updateActionLabel();

    document.getElementById('inspector-card').classList.remove('hidden');
    document.getElementById('inspector-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Switch between Video and Audio format views
function switchFormatTab(type) {
    selectedType = type;
    const tabVideoBtn = document.getElementById('tab-video-btn');
    const tabAudioBtn = document.getElementById('tab-audio-btn');
    const videoGrid = document.getElementById('video-grid');
    const audioGrid = document.getElementById('audio-grid');

    if (type === 'video') {
        tabVideoBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 bg-white/[0.08] text-white shadow-sm';
        tabAudioBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-white';
        videoGrid.classList.remove('hidden');
        audioGrid.classList.add('hidden');

        // Select active or first video option
        const activeCard = videoGrid.querySelector('.quality-card.is-active') || videoGrid.querySelector('.quality-card');
        if (activeCard) {
            selectCard('video', activeCard.dataset.id, activeCard.dataset.label, activeCard.dataset.size);
        }
    } else {
        tabAudioBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 bg-white/[0.08] text-white shadow-sm';
        tabVideoBtn.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-white';
        videoGrid.classList.add('hidden');
        audioGrid.classList.remove('hidden');

        // Select active or first audio option
        const activeCard = audioGrid.querySelector('.quality-card.is-active') || audioGrid.querySelector('.quality-card');
        if (activeCard) {
            selectCard('audio', activeCard.dataset.id, activeCard.dataset.label, activeCard.dataset.size);
        }
    }
}

// Quality card selection
function selectCard(type, id, label, size) {
    selectedType = type;
    selectedOptionId = id;
    selectedLabel = label;
    selectedSize = size;

    const container = type === 'video' ? document.getElementById('video-grid') : document.getElementById('audio-grid');
    const cards = container.querySelectorAll('.quality-card');
    cards.forEach(c => {
        if (c.dataset.id === id) {
            c.classList.add('is-active');
        } else {
            c.classList.remove('is-active');
        }
    });

    updateActionLabel();
}

// Update Action button text with format and file size
function updateActionLabel() {
    const btnLabel = document.getElementById('execute-btn-label');
    const summaryText = document.getElementById('selected-summary-text');
    const ext = selectedType === 'video' ? 'MP4' : (selectedOptionId === 'm4a' ? 'M4A' : 'MP3');

    const sizeStr = selectedSize ? ` • ${selectedSize}` : '';
    btnLabel.textContent = `Download ${ext} (${selectedLabel}${sizeStr})`;
    summaryText.textContent = `Format: ${ext} • ${selectedLabel} ${sizeStr}`;
}

// Execute Download Pipeline
async function executeDownload() {
    if (!activeVideo) return;

    const payload = {
        url: activeVideo.url,
        type: selectedType,
        option_id: selectedOptionId,
        title: activeVideo.title
    };

    document.getElementById('inspector-card').classList.add('hidden');
    const progressCard = document.getElementById('progress-card');
    progressCard.classList.remove('hidden');
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Reset progress UI
    updateTelemetry({
        status: 'queued',
        progress: 0,
        speed: 'Connecting...',
        eta: '--',
        message: 'Initializing media pipeline with server...'
    });

    document.getElementById('completed-panel').classList.add('hidden');
    document.getElementById('failure-panel').classList.add('hidden');
    document.getElementById('telemetry-box').classList.remove('hidden');

    try {
        const resp = await fetch('/api/start-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const res = await resp.json();
        if (!resp.ok || !res.success) {
            handleFailedProcess(res.error || 'Pipeline failed to initiate.');
            return;
        }

        activeJobId = res.job_id;
        pollTimer = setInterval(pollJobState, 700);

    } catch (err) {
        handleFailedProcess('Network disconnected from extraction service.');
    }
}

// Poll Job Status
async function pollJobState() {
    if (!activeJobId) return;

    try {
        const resp = await fetch(`/api/progress/${activeJobId}`);
        const res = await resp.json();

        if (!resp.ok || !res.success) {
            clearInterval(pollTimer);
            handleFailedProcess(res.error || 'Tracking failure.');
            return;
        }

        updateTelemetry(res);

        if (res.status === 'completed') {
            clearInterval(pollTimer);
            handleCompletedProcess(res);
        } else if (res.status === 'error') {
            clearInterval(pollTimer);
            handleFailedProcess(res.error || 'Extraction process reported an error.');
        }

    } catch (err) {
        console.error('Telemetry error:', err);
    }
}

// Update telemetry UI
function updateTelemetry(job) {
    const percent = Math.round(job.progress || 0);
    document.getElementById('progress-fill').style.width = `${percent}%`;
    document.getElementById('progress-percentage-val').textContent = `${percent}%`;

    document.getElementById('telemetry-speed').textContent = job.speed || '-- MB/s';
    document.getElementById('telemetry-eta').textContent = job.eta || '--';
    document.getElementById('telemetry-pipeline').textContent = job.message || 'Stream Copy';

    const titleEl = document.getElementById('progress-title');
    const descEl = document.getElementById('progress-desc');
    const iconEl = document.getElementById('progress-indicator-icon');

    if (job.status === 'merging') {
        titleEl.textContent = 'FFmpeg Multiplexing';
        descEl.textContent = 'Remuxing video stream and audio container...';
        iconEl.innerHTML = '<i class="fa-solid fa-gear fa-spin text-amber-400"></i>';
        iconEl.className = 'w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-sm shrink-0';
    } else if (job.status === 'downloading') {
        titleEl.textContent = 'Streaming Tracks';
        descEl.textContent = 'Receiving high-throughput stream chunks...';
        iconEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-crimson-500"></i>';
        iconEl.className = 'w-10 h-10 rounded-xl bg-crimson-500/10 border border-crimson-500/20 text-crimson-500 flex items-center justify-center text-sm shrink-0';
    }
}

// Process Complete
function handleCompletedProcess(job) {
    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('progress-percentage-val').textContent = '100%';

    const titleEl = document.getElementById('progress-title');
    const descEl = document.getElementById('progress-desc');
    const iconEl = document.getElementById('progress-indicator-icon');

    titleEl.textContent = 'Extraction Complete';
    descEl.textContent = `Saved ${job.file_size || ''} to local filesystem.`;
    iconEl.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i>';
    iconEl.className = 'w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm shrink-0';

    const downloadUrl = `/api/file/${activeJobId}`;
    const saveBtn = document.getElementById('save-file-link');
    saveBtn.href = downloadUrl;

    document.getElementById('completed-size-tag').textContent = `Ready • ${job.file_size || 'Complete'}`;
    document.getElementById('completed-panel').classList.remove('hidden');

    // Trigger auto download in browser
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Save to history storage
    saveToHistoryStorage({
        title: activeVideo.title,
        thumbnail: activeVideo.thumbnail,
        format: selectedType === 'video' ? 'MP4' : (selectedOptionId === 'm4a' ? 'M4A' : 'MP3'),
        spec: selectedLabel,
        size: job.file_size || selectedSize || '',
        url: activeVideo.url,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
}

// Process Failed
function handleFailedProcess(errorMsg) {
    const titleEl = document.getElementById('progress-title');
    const descEl = document.getElementById('progress-desc');
    const iconEl = document.getElementById('progress-indicator-icon');

    titleEl.textContent = 'Extraction Aborted';
    descEl.textContent = errorMsg;
    iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i>';
    iconEl.className = 'w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-sm shrink-0';

    document.getElementById('failure-msg').textContent = errorMsg;
    document.getElementById('failure-panel').classList.remove('hidden');
}

// Session History Storage
function getHistoryStorage() {
    try {
        return JSON.parse(localStorage.getItem('tubepull_history') || '[]');
    } catch {
        return [];
    }
}

function saveToHistoryStorage(entry) {
    let history = getHistoryStorage();
    history = history.filter(item => item.url !== entry.url);
    history.unshift(entry);
    if (history.length > 6) history = history.slice(0, 6);
    localStorage.setItem('tubepull_history', JSON.stringify(history));
    loadHistory();
}

function clearHistoryStorage() {
    localStorage.removeItem('tubepull_history');
    loadHistory();
}

function loadHistory() {
    const history = getHistoryStorage();
    const container = document.getElementById('history-container');
    const clearBtn = document.getElementById('clear-history-action');

    if (history.length === 0) {
        container.innerHTML = `
            <div id="history-empty" class="p-6 text-center rounded-xl border border-dashed border-surface-border text-xs text-slate-400 font-mono">
                No extractions recorded in this session.
            </div>
        `;
        clearBtn.classList.add('hidden');
        return;
    }

    clearBtn.classList.remove('hidden');
    container.innerHTML = '';

    history.forEach(item => {
        const row = document.createElement('div');
        row.className = 'p-3 bg-surface-100 border border-surface-border rounded-xl flex items-center justify-between gap-3 hover:border-white/[0.12] transition';
        row.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <img src="${item.thumbnail}" class="w-14 aspect-video object-cover rounded-md bg-black shrink-0 border border-white/[0.06]">
                <div class="min-w-0">
                    <h4 class="text-xs font-semibold text-white truncate max-w-sm sm:max-w-md">${item.title}</h4>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span class="px-1.5 py-0.2 rounded bg-white/[0.05] text-slate-300 font-semibold text-[10px]">${item.format} • ${item.spec}</span>
                        ${item.size ? `<span>${item.size}</span><span>•</span>` : ''}
                        <span>${item.timestamp}</span>
                    </div>
                </div>
            </div>
            <button onclick="loadSample('${item.url}')" class="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-surface-200 hover:bg-crimson-600 hover:text-white text-slate-300 border border-surface-border transition shrink-0 flex items-center gap-1.5">
                <i class="fa-solid fa-arrow-rotate-right text-[10px]"></i>
                <span class="hidden sm:inline">Inspect</span>
            </button>
        `;
        container.appendChild(row);
    });
}
