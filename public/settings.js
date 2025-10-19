// DOM elements
const pythonVersion = document.getElementById('pythonVersion');
const pythonStatus = document.getElementById('pythonStatus');
const gdownVersion = document.getElementById('gdownVersion');
const gdownStatus = document.getElementById('gdownStatus');
const installBtn = document.getElementById('installBtn');
const refreshBtn = document.getElementById('refreshBtn');
const installOutput = document.getElementById('installOutput');

// Cookie elements
const cookiePath = document.getElementById('cookiePath');
const cookieEditor = document.getElementById('cookieEditor');
const saveCookiesBtn = document.getElementById('saveCookiesBtn');
const loadCookiesBtn = document.getElementById('loadCookiesBtn');
const clearCookiesBtn = document.getElementById('clearCookiesBtn');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Check system status on load
checkSystemStatus();
loadCookies();

// Event listeners
installBtn.addEventListener('click', installGdown);
refreshBtn.addEventListener('click', checkSystemStatus);
saveCookiesBtn.addEventListener('click', saveCookies);
loadCookiesBtn.addEventListener('click', loadCookies);
clearCookiesBtn.addEventListener('click', clearCookies);

// Tab switching
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
  });
});

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
      alert(`✅ Cookies 儲存成功！\n\n檔案路徑：${data.path}`);
    } else {
      alert(`❌ 儲存失敗：${data.error}`);
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

