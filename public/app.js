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

// Check for ongoing downloads on page load
window.addEventListener('DOMContentLoaded', checkDownloadStatus);

/**
 * Check download status on page load
 */
async function checkDownloadStatus() {
  try {
    const response = await fetch('/api/download/status');
    const data = await response.json();

    if (data.isDownloading && data.pendingTasks.length > 0) {
      console.log('Found ongoing downloads, reconnecting...', data);

      // Update UI
      isDownloading = true;
      startBtn.disabled = true;
      cancelBtn.disabled = false;
      progressSection.style.display = 'block';

      // Show current task info
      if (data.currentTask) {
        progressStatus.textContent = `恢復下載：${data.currentTask.url}`;
        progressPercentage.textContent = `${data.currentTask.progress || 0}%`;
        progressFill.style.width = `${data.currentTask.progress || 0}%`;
      } else {
        progressStatus.textContent = `等待下載 ${data.pendingTasks.length} 個任務...`;
      }

      // Connect to SSE
      connectToProgressStream();
    }
  } catch (error) {
    console.error('Error checking download status:', error);
  }
}

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
    // Don't disconnect immediately - SSE will auto-reconnect
    // Only disconnect if user is not downloading
    if (!isDownloading) {
      disconnectProgressStream();
    }
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
  const { current = 0, total = 0, currentFile: file = '', percentage = 0 } = data;

  console.log('Updating progress:', { current, total, file, percentage });

  progressStatus.textContent = '下載中...';
  progressPercentage.textContent = `${percentage}%`;
  progressFill.style.width = `${percentage}%`;
  currentFile.textContent = file || '準備中...';
  fileCount.textContent = total > 0 ? `${current} / ${total}` : '計算中...';

  // Ensure progress section is visible
  progressSection.style.display = 'block';
}

/**
 * Handle download completion
 */
function handleDownloadComplete(data) {
  console.log('Download complete:', data);

  // For batch downloads, check if there are more tasks
  if (data.taskId) {
    progressStatus.textContent = `✅ 任務 ${data.taskId} 完成`;
    // Update file list
    if (data.files && data.files.length > 0) {
      displayFiles(data.files);
    }
    // Don't disconnect - other tasks may still be downloading
    // Check if all tasks are done
    checkIfAllTasksComplete();
  } else {
    // Single download complete
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
}

/**
 * Check if all tasks are complete
 */
async function checkIfAllTasksComplete() {
  try {
    const response = await fetch('/api/download/status');
    const data = await response.json();

    if (!data.isDownloading && data.pendingTasks.length === 0) {
      // All tasks complete
      progressStatus.textContent = '✅ 所有任務完成！';
      progressPercentage.textContent = '100%';
      progressFill.style.width = '100%';

      setTimeout(() => {
        disconnectProgressStream();
        resetUI();
      }, 2000);
    }
  } catch (error) {
    console.error('Error checking task status:', error);
  }
}

/**
 * Handle download error
 */
function handleDownloadError(data) {
  console.error('Download error:', data);

  // For batch downloads, show error but don't stop
  if (data.taskId) {
    progressStatus.textContent = `⚠️ 任務 ${data.taskId} 失敗：${data.error || '未知錯誤'}`;
    // Don't disconnect - other tasks may still be downloading
    // Don't reset UI - keep showing progress
  } else {
    // Single download error
    progressStatus.textContent = '❌ 下載失敗';
    alert(`下載錯誤：${data.error || '未知錯誤'}`);
    disconnectProgressStream();
    resetUI();
  }
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

