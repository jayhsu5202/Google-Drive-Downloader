// DOM Elements
const driveUrlInput = document.getElementById('driveUrl');
const outputDirInput = document.getElementById('outputDir');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressSection = document.getElementById('progressSection');
const progressStatus = document.getElementById('progressStatus');
const progressPercentage = document.getElementById('progressPercentage');
const progressFill = document.getElementById('progressFill');
const currentFile = document.getElementById('currentFile');
const fileCount = document.getElementById('fileCount');
const fileList = document.getElementById('fileList');

// State
let eventSource = null;
let isDownloading = false;

// Event Listeners
startBtn.addEventListener('click', startDownload);
cancelBtn.addEventListener('click', cancelDownload);

/**
 * Start download process
 */
async function startDownload() {
  const urlsText = driveUrlInput.value.trim();
  const outputDir = outputDirInput.value.trim() || './downloads';

  if (!urlsText) {
    alert('請輸入 Google Drive 連結或資料夾 ID');
    return;
  }

  // Parse multiple URLs (one per line)
  const urls = urlsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (urls.length === 0) {
    alert('請輸入至少一個有效的連結');
    return;
  }

  try {
    // Update UI
    isDownloading = true;
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    progressSection.style.display = 'block';
    progressStatus.textContent = `準備下載 ${urls.length} 個任務...`;
    progressPercentage.textContent = '0%';
    progressFill.style.width = '0%';

    // Start batch download via API
    const response = await fetch('/api/download/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, outputDir })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start download');
    }

    // Connect to SSE for progress updates
    connectToProgressStream();

  } catch (error) {
    console.error('Error starting download:', error);
    alert(`下載失敗：${error.message}`);
    resetUI();
  }
}

/**
 * Cancel download process
 */
async function cancelDownload() {
  try {
    const response = await fetch('/api/download/cancel', {
      method: 'POST'
    });

    const data = await response.json();

    if (response.ok) {
      progressStatus.textContent = '已取消';
      disconnectProgressStream();
      resetUI();
    } else {
      throw new Error(data.error || 'Failed to cancel download');
    }
  } catch (error) {
    console.error('Error cancelling download:', error);
    alert(`取消失敗：${error.message}`);
  }
}

/**
 * Connect to SSE progress stream
 */
function connectToProgressStream() {
  eventSource = new EventSource('/api/download/progress');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Progress update:', data);

    if (data.status === 'connected') {
      progressStatus.textContent = '已連接，等待下載開始...';
    } else if (data.type === 'task_start') {
      progressStatus.textContent = `開始下載：${data.task.url}`;
    } else if (data.type === 'progress') {
      updateProgress(data.progress);
    } else if (data.type === 'task_complete') {
      handleDownloadComplete(data);
    } else if (data.type === 'task_error') {
      handleDownloadError(data);
    } else if (data.status === 'downloading') {
      updateProgress(data);
    } else if (data.status === 'completed') {
      handleDownloadComplete(data);
    } else if (data.status === 'error') {
      handleDownloadError(data);
    } else if (data.status === 'cancelled') {
      progressStatus.textContent = '下載已取消';
      resetUI();
    } else {
      // Regular progress update
      updateProgress(data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    disconnectProgressStream();
  };
}

/**
 * Disconnect from SSE progress stream
 */
function disconnectProgressStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/**
 * Update progress UI
 */
function updateProgress(data) {
  const { current, total, currentFile: file, percentage } = data;

  progressStatus.textContent = '下載中...';
  progressPercentage.textContent = `${percentage}%`;
  progressFill.style.width = `${percentage}%`;
  currentFile.textContent = file || '-';
  fileCount.textContent = `${current} / ${total}`;
}

/**
 * Handle download completion
 */
function handleDownloadComplete(data) {
  progressStatus.textContent = '✅ 下載完成！';
  progressPercentage.textContent = '100%';
  progressFill.style.width = '100%';

  // Update file list
  if (data.files && data.files.length > 0) {
    displayFiles(data.files);
  } else {
    loadFiles();
  }

  disconnectProgressStream();
  resetUI();
}

/**
 * Handle download error
 */
function handleDownloadError(data) {
  progressStatus.textContent = '❌ 下載失敗';
  alert(`下載錯誤：${data.error || '未知錯誤'}`);
  disconnectProgressStream();
  resetUI();
}

/**
 * Reset UI to initial state
 */
function resetUI() {
  isDownloading = false;
  startBtn.disabled = false;
  cancelBtn.disabled = true;
}

/**
 * Load downloaded files from server
 */
async function loadFiles() {
  try {
    const outputDir = outputDirInput.value.trim() || './downloads';
    const response = await fetch(`/api/download/files?dir=${encodeURIComponent(outputDir)}`);
    const data = await response.json();

    if (response.ok && data.files) {
      displayFiles(data.files);
    }
  } catch (error) {
    console.error('Error loading files:', error);
  }
}

/**
 * Display files in the file list
 */
function displayFiles(files) {
  if (!files || files.length === 0) {
    fileList.innerHTML = '<p class="empty-message">尚無下載檔案</p>';
    return;
  }

  fileList.innerHTML = files.map(file => `
    <div class="file-item">
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <div class="file-status">
        <span class="status-icon">${file.verified ? '✅' : '⏳'}</span>
        <span>${file.verified ? '已驗證' : '待驗證'}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Format file size to human-readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load files on page load
window.addEventListener('DOMContentLoaded', () => {
  loadFiles();
});

