// DOM elements
const pythonVersion = document.getElementById('pythonVersion');
const pythonStatus = document.getElementById('pythonStatus');
const gdownVersion = document.getElementById('gdownVersion');
const gdownStatus = document.getElementById('gdownStatus');
const installBtn = document.getElementById('installBtn');
const refreshBtn = document.getElementById('refreshBtn');
const installOutput = document.getElementById('installOutput');

// Check system status on load
checkSystemStatus();

// Event listeners
installBtn.addEventListener('click', installGdown);
refreshBtn.addEventListener('click', checkSystemStatus);

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

