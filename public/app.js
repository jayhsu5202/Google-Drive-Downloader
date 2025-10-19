// DOM Elements - Download Tab
const driveUrlInput = document.getElementById('driveUrl');
const outputDirInput = document.getElementById('outputDir');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const restartBtn = document.getElementById('restartBtn');
const progressSection = document.getElementById('progressSection');
const progressStatus = document.getElementById('progressStatus');
const progressPercentage = document.getElementById('progressPercentage');
const progressFill = document.getElementById('progressFill');
const currentFile = document.getElementById('currentFile');
const fileCount = document.getElementById('fileCount');
const fileList = document.getElementById('fileList');

// DOM Elements - Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// DOM Elements - Cookie Tab
const cookiePath = document.getElementById('cookiePath');
const cookieEditor = document.getElementById('cookieEditor');
const cookieStatus = document.getElementById('cookieStatus');
const saveCookiesBtn = document.getElementById('saveCookiesBtn');
const loadCookiesBtn = document.getElementById('loadCookiesBtn');
const clearCookiesBtn = document.getElementById('clearCookiesBtn');

// DOM Elements - System Tab
const pythonVersion = document.getElementById('pythonVersion');
const pythonStatus = document.getElementById('pythonStatus');
const gdownVersion = document.getElementById('gdownVersion');
const gdownStatus = document.getElementById('gdownStatus');
const installBtn = document.getElementById('installBtn');
const refreshBtn = document.getElementById('refreshBtn');
const installOutput = document.getElementById('installOutput');

// State
let eventSource = null;
let isDownloading = false;
let lastDownloadUrl = '';
let lastOutputDir = '';

// Event Listeners - Download Tab
startBtn.addEventListener('click', startDownload);
cancelBtn.addEventListener('click', cancelDownload);
restartBtn.addEventListener('click', restartDownload);

// Event Listeners - Tabs
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update tab active state
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update content active state
    tabContents.forEach(content => {
      if (content.id === targetTab) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Load data when switching to specific tabs
    if (targetTab === 'cookies') {
      loadCookies();
    } else if (targetTab === 'system') {
      checkSystemStatus();
    }
  });
});

// Event Listeners - Cookie Tab
saveCookiesBtn.addEventListener('click', saveCookies);
loadCookiesBtn.addEventListener('click', loadCookies);
clearCookiesBtn.addEventListener('click', clearCookies);

// Event Listeners - System Tab
installBtn.addEventListener('click', installGdown);
refreshBtn.addEventListener('click', checkSystemStatus);

// Check for ongoing downloads on page load
window.addEventListener('DOMContentLoaded', checkDownloadStatus);

/**
 * Check download status on page load
 */
async function checkDownloadStatus() {
  try {
    const response = await fetch('/api/download/status');
    const data = await response.json();

    // Enable restart button if there are any tasks (including error tasks)
    const allTasks = data.pendingTasks || [];
    if (allTasks.length > 0) {
      restartBtn.disabled = false;
      // Save the first task's URL for reference
      if (allTasks[0]) {
        lastDownloadUrl = allTasks[0].url;
        lastOutputDir = allTasks[0].outputDir;
      }
    }

    if (data.isDownloading && data.pendingTasks.length > 0) {
      console.log('Found ongoing downloads, reconnecting...', data);

      // Update UI
      isDownloading = true;
      startBtn.disabled = true;
      cancelBtn.disabled = false;
      restartBtn.disabled = false;
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

  // Save for restart
  lastDownloadUrl = urlsText;
  lastOutputDir = outputDir;

  try {
    // Update UI
    isDownloading = true;
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    restartBtn.disabled = false;
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
 * Restart download process
 */
async function restartDownload() {
  console.log('Restarting all tasks...');

  try {
    // Call restart API to reset all error tasks
    const response = await fetch('/api/download/restart', { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to restart tasks');
    }

    console.log(`Restarted ${data.count} tasks`);

    // Disconnect and reconnect SSE
    disconnectProgressStream();
    await new Promise(resolve => setTimeout(resolve, 500));
    connectToProgressStream();

    // Update UI
    progressStatus.textContent = `✅ 已重啟 ${data.count} 個任務`;
    progressStatus.style.color = '#4CAF50'; // Green color for success
    progressSection.style.display = 'block';

    // Auto-hide success message after 3 seconds
    setTimeout(() => {
      if (progressStatus.textContent.includes('已重啟')) {
        progressStatus.style.color = '';
      }
    }, 3000);
  } catch (error) {
    console.error('Error restarting tasks:', error);
    progressStatus.textContent = `❌ 重啟失敗：${error.message}`;
    progressStatus.style.color = '#f44336'; // Red color for error
    progressSection.style.display = 'block';
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
      // Don't show "waiting" message if we're resuming
      // The backend will send task_start immediately if there's an active task
      console.log('SSE connected');
    } else if (data.type === 'task_start') {
      progressStatus.textContent = `開始下載：${data.task.url}`;
      progressSection.style.display = 'block';
    } else if (data.type === 'progress') {
      updateProgress(data.progress);
    } else if (data.type === 'warning') {
      handleDownloadWarning(data);
    } else if (data.type === 'task_complete') {
      handleDownloadComplete(data);
    } else if (data.type === 'task_error') {
      handleDownloadError(data);
    } else if (data.status === 'completed') {
      handleDownloadComplete(data);
    } else if (data.status === 'error') {
      handleDownloadError(data);
    } else if (data.status === 'cancelled') {
      progressStatus.textContent = '下載已取消';
      resetUI();
    } else if (data.status === 'downloading' || data.status === 'scanning') {
      // Handle direct progress updates (for backward compatibility)
      updateProgress(data);
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
  const { current = 0, total = 0, currentFile: file = '', percentage = 0, status = 'downloading' } = data;

  console.log('Updating progress:', { current, total, file, percentage, status });

  // Handle scanning status
  if (status === 'scanning') {
    progressStatus.textContent = `掃描中... 已發現 ${total} 個檔案`;
    progressStatus.style.color = '#2196F3'; // Blue color for scanning
    progressPercentage.textContent = '0%';
    progressFill.style.width = '0%';
    currentFile.textContent = file || '正在掃描資料夾...';
    fileCount.textContent = `已發現 ${total} 個檔案`;
  } else {
    // Normal downloading status
    progressStatus.textContent = '下載中...';
    progressStatus.style.color = ''; // Reset color to default
    progressPercentage.textContent = `${percentage}%`;
    progressFill.style.width = `${percentage}%`;
    currentFile.textContent = file || '準備中...';
    fileCount.textContent = total > 0 ? `${current} / ${total}` : '計算中...';
  }

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
 * Handle download warning (non-fatal errors)
 */
function handleDownloadWarning(data) {
  console.warn('Download warning:', data);

  const warning = data.warning || '未知警告';
  const cleanWarning = warning.replace(/^(QUOTA_EXCEEDED|PERMISSION_DENIED):/, '');

  // Show warning but don't stop download
  progressStatus.textContent = `⚠️ ${cleanWarning}`;
  progressStatus.style.color = '#ff9800'; // Orange color for warning

  // Show alert for important warnings
  if (warning.includes('QUOTA_EXCEEDED')) {
    alert(`⚠️ ${cleanWarning}\n\n請切換到「Cookie 管理」頁面更新 Cookie，然後下載會自動繼續。`);
  }
}

/**
 * Handle download error (fatal errors)
 */
function handleDownloadError(data) {
  console.error('Download error:', data);

  const error = data.error || '未知錯誤';
  const cleanError = error.replace(/^(QUOTA_EXCEEDED|PERMISSION_DENIED):/, '');

  // For batch downloads, show error but don't stop
  if (data.taskId) {
    progressStatus.textContent = `❌ 任務失敗：${cleanError}`;
    progressStatus.style.color = '#f44336'; // Red color for error
    // Don't disconnect - other tasks may still be downloading
    // Don't reset UI - keep showing progress
  } else {
    // Single download error
    progressStatus.textContent = '❌ 下載失敗';
    progressStatus.style.color = '#f44336'; // Red color for error
    alert(`下載錯誤：${cleanError}`);
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
  // Keep restart button enabled if there's a last download
  restartBtn.disabled = !lastDownloadUrl;
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

// ============================================
// Cookie Management Functions
// ============================================

/**
 * Load cookies from server
 */
async function loadCookies() {
  try {
    const response = await fetch('/api/system/cookies');
    const data = await response.json();

    cookiePath.textContent = data.path || '未知';

    if (data.exists) {
      cookieEditor.value = data.content;
      cookieEditor.placeholder = '將 cookies.txt 內容貼到這裡...';
    } else {
      cookieEditor.value = '';
      cookieEditor.placeholder = `Cookie 檔案不存在\n\n將 cookies.txt 內容貼到這裡，然後點擊「儲存 Cookies」\n\n檔案將會儲存到：${data.path}`;
    }
  } catch (error) {
    console.error('Error loading cookies:', error);
    alert(`載入 Cookies 失敗：${error.message}`);
  }
}

/**
 * Save cookies to server
 */
async function saveCookies() {
  try {
    const content = cookieEditor.value.trim();

    if (!content) {
      alert('請輸入 Cookies 內容');
      return;
    }

    saveCookiesBtn.disabled = true;
    saveCookiesBtn.textContent = '儲存中...';

    const response = await fetch('/api/system/cookies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });

    const data = await response.json();

    if (data.success) {
      // Show success message in UI
      cookieStatus.textContent = `✅ Cookies 儲存成功！路徑：${data.path}`;
      cookieStatus.style.color = '#4CAF50'; // Green color

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        cookieStatus.textContent = '';
        cookieStatus.style.color = '';
      }, 3000);

      // Auto-restart download if there's an active download
      if (isDownloading && lastDownloadUrl) {
        // Switch to download tab
        const downloadTab = document.querySelector('.tab[data-tab="download"]');
        if (downloadTab) {
          downloadTab.click();
        }

        // Wait for tab switch animation, then restart
        setTimeout(() => {
          restartDownload();
        }, 300);
      }
    } else {
      cookieStatus.textContent = `❌ 儲存失敗：${data.error}`;
      cookieStatus.style.color = '#f44336'; // Red color
    }
  } catch (error) {
    console.error('Error saving cookies:', error);
    alert(`儲存 Cookies 失敗：${error.message}`);
  } finally {
    saveCookiesBtn.disabled = false;
    saveCookiesBtn.textContent = '💾 儲存 Cookies';
  }
}

/**
 * Clear cookies
 */
async function clearCookies() {
  if (!confirm('確定要清除 Cookies 嗎？')) {
    return;
  }

  try {
    clearCookiesBtn.disabled = true;
    clearCookiesBtn.textContent = '清除中...';

    const response = await fetch('/api/system/cookies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: '' })
    });

    const data = await response.json();

    if (data.success) {
      cookieEditor.value = '';
      alert('✅ Cookies 已清除');
    } else {
      alert(`❌ 清除失敗：${data.error}`);
    }
  } catch (error) {
    console.error('Error clearing cookies:', error);
    alert(`清除 Cookies 失敗：${error.message}`);
  } finally {
    clearCookiesBtn.disabled = false;
    clearCookiesBtn.textContent = '🗑️ 清除 Cookies';
  }
}

// ============================================
// System Settings Functions
// ============================================

/**
 * Check system environment status
 */
async function checkSystemStatus() {
  try {
    // Reset UI
    pythonVersion.textContent = '檢查中...';
    pythonStatus.textContent = '檢查中';
    pythonStatus.className = 'status-badge loading';
    gdownVersion.textContent = '檢查中...';
    gdownStatus.textContent = '檢查中';
    gdownStatus.className = 'status-badge loading';
    installBtn.disabled = true;

    const response = await fetch('/api/system/status');
    const data = await response.json();

    // Update Python status
    if (data.python.installed) {
      pythonVersion.textContent = `v${data.python.version}`;
      pythonStatus.textContent = '已安裝';
      pythonStatus.className = 'status-badge success';
    } else {
      pythonVersion.textContent = data.python.error || '未安裝';
      pythonStatus.textContent = '未安裝';
      pythonStatus.className = 'status-badge error';
    }

    // Update gdown status
    if (data.gdown.installed) {
      gdownVersion.textContent = `v${data.gdown.version}`;
      gdownStatus.textContent = '已安裝';
      gdownStatus.className = 'status-badge success';
      installBtn.disabled = true;
      installBtn.textContent = 'gdown 已安裝';
    } else {
      gdownVersion.textContent = data.gdown.error || '未安裝';
      gdownStatus.textContent = '未安裝';
      gdownStatus.className = 'status-badge error';

      // Enable install button only if Python is installed
      if (data.python.installed) {
        installBtn.disabled = false;
        installBtn.textContent = '安裝 gdown';
      } else {
        installBtn.disabled = true;
        installBtn.textContent = '請先安裝 Python';
      }
    }
  } catch (error) {
    console.error('Error checking system status:', error);
    alert(`檢查失敗：${error.message}`);
  }
}

/**
 * Install gdown via pip
 */
async function installGdown() {
  try {
    installBtn.disabled = true;
    installBtn.textContent = '安裝中...';
    installOutput.style.display = 'block';
    installOutput.textContent = '正在執行 pip install gdown...\n';

    const response = await fetch('/api/system/install-gdown', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      installOutput.textContent += '\n✅ 安裝成功！\n\n' + (data.output || '');
      alert('gdown 安裝成功！');

      // Refresh status after 1 second
      setTimeout(checkSystemStatus, 1000);
    } else {
      installOutput.textContent += '\n❌ 安裝失敗\n\n' + (data.output || data.message);
      alert(`安裝失敗：${data.message}`);
      installBtn.disabled = false;
      installBtn.textContent = '重試安裝';
    }
  } catch (error) {
    console.error('Error installing gdown:', error);
    installOutput.textContent += `\n❌ 錯誤：${error.message}`;
    alert(`安裝失敗：${error.message}`);
    installBtn.disabled = false;
    installBtn.textContent = '重試安裝';
  }
}

