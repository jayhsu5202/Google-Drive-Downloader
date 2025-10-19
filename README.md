# Google Drive Downloader 🐾

Express 全棧 Google Drive 下載器，使用 gdown CLI，支援批量下載、進度追蹤、斷點續傳與 Cookie 管理。

## ✨ 功能特色

### 核心功能
- ✅ **批量下載**：支援多個 Google Drive 資料夾同時下載
- ✅ **實時進度**：Server-Sent Events (SSE) 推送下載進度
- ✅ **斷點續傳**：支援中斷後繼續下載，不重複下載已完成檔案
- ✅ **任務管理**：持久化任務狀態，服務重啟後自動恢復
- ✅ **檔案校驗**：MD5/SHA256 hash 計算與驗證
- ✅ **Cookie 管理**：內建 Cookie 編輯器，解決 Google Drive 流量限制

### 進階功能
- ✅ **重啟下載**：一鍵重啟失敗任務，自動清除錯誤狀態
- ✅ **錯誤恢復**：區分警告與錯誤，QUOTA_EXCEEDED 不會終止下載
- ✅ **自動重啟**：更新 Cookie 後可自動重啟下載
- ✅ **進度追蹤**：8 種進度模式解析，精確顯示下載狀態
- ✅ **整合式 UI**：Tab 設計，下載、Cookie 管理、系統設定一頁搞定

### 技術特色
- ✅ **TypeScript**：完整類型定義，TSC 與 ESLint 檢查通過
- ✅ **現代 UI**：響應式設計，支援桌面/平板/手機
- ✅ **Docker 支援**：一鍵部署，包含 Node.js + Python + gdown
- ✅ **效能優化**：自動保存機制，減少 97.5% 檔案 I/O

## 技術棧

- **後端**：Express + TypeScript
- **前端**：原生 HTML/CSS/JS
- **CLI 工具**：gdown (Python)
- **進度推送**：Server-Sent Events (SSE)
- **檔案校驗**：Node.js crypto 模組

## 安裝需求

1. **Node.js**：v18+ (建議 v22+)
2. **Python**：v3.7+
3. **gdown**：安裝指令
   ```bash
   pip install gdown
   ```

## 🚀 快速開始

### 方式 1：本地開發

#### 1. 安裝依賴

```bash
npm install
```

#### 2. 安裝 gdown

```bash
pip install gdown
```

#### 3. 啟動開發伺服器

```bash
npm run dev
```

伺服器將在 `http://localhost:3000` 啟動。

### 方式 2：Docker 部署

```bash
# 建置並啟動容器
docker-compose up -d

# 查看日誌
docker-compose logs -f
```

詳細說明請參考 [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)

## 📖 使用方式

### 1. 下載檔案

1. 開啟瀏覽器訪問 `http://localhost:3000`
2. 切換到「📥 下載」頁面
3. 貼上 Google Drive 資料夾連結（支援多個，一行一個）
4. 點擊「開始下載」
5. 即時查看下載進度與檔案列表

### 2. 解決流量限制

如果遇到 `QUOTA_EXCEEDED` 錯誤：

1. 切換到「🍪 Cookie 管理」頁面
2. 按照說明從瀏覽器複製 Cookie
3. 貼上並儲存
4. 系統會自動詢問是否重啟下載

### 3. 重啟下載

如果下載失敗或卡住：

1. 點擊「🔄 重啟下載」按鈕
2. 系統會自動重置錯誤任務並繼續下載
3. 已下載的檔案不會重複下載（斷點續傳）

## 📁 專案結構

```
google-drive-downloader/
├── src/
│   ├── index.ts              # Express 主程式
│   ├── types.ts              # TypeScript 類型定義
│   ├── routes/
│   │   ├── download.ts       # 下載 API 路由
│   │   └── system.ts         # 系統設定 API 路由
│   └── services/
│       ├── gdown.ts          # gdown CLI 封裝
│       ├── fileVerify.ts     # 檔案校驗模組
│       └── taskManager.ts    # 任務管理模組
├── public/
│   ├── index.html            # 前端頁面（整合式 Tab 設計）
│   ├── app.js                # 前端邏輯
│   └── style.css             # 樣式
├── downloads/                # 下載目錄（自動建立）
├── tasks.json                # 任務狀態（持久化）
├── Dockerfile                # Docker 映像檔定義
├── docker-compose.yml        # Docker Compose 配置
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## 📡 API 端點

### 下載相關

#### POST /api/download/batch
批量下載多個 Google Drive 資料夾

**Request Body:**
```json
{
  "urls": [
    "https://drive.google.com/drive/folders/...",
    "https://drive.google.com/drive/folders/..."
  ],
  "outputDir": "./downloads"
}
```

#### GET /api/download/progress
Server-Sent Events 端點，推送實時進度

**Event Types:**
- `progress`: 進度更新
- `warning`: 警告訊息（如 QUOTA_EXCEEDED）
- `task_complete`: 任務完成
- `task_error`: 任務錯誤

#### POST /api/download/restart
重啟所有失敗任務

#### POST /api/download/cancel
取消正在進行的下載

#### GET /api/download/status
取得當前下載狀態

#### GET /api/download/files
取得已下載檔案列表

### 系統相關

#### GET /api/system/check
檢查系統環境（Python、gdown）

#### POST /api/system/install-gdown
自動安裝 gdown

#### GET /api/system/cookies
讀取 gdown cookies

#### POST /api/system/cookies
儲存 gdown cookies

**Request Body:**
```json
{
  "content": "# Netscape HTTP Cookie File\n..."
}
```

## 🛠️ 開發指令

```bash
# 啟動開發伺服器
npm run dev

# TypeScript 類型檢查
npm run type-check

# ESLint 檢查
npm run lint

# ESLint 自動修正
npm run lint:fix
```

## ⚠️ 注意事項

### Google Drive 限制

1. **資料夾檔案數量**：gdown 每個資料夾最多下載 50 個檔案
2. **檔案權限**：檔案需設定為「知道連結的任何人」
3. **流量限制**：Google 可能限制大量下載，請使用 Cookie 管理功能

### 解決流量限制

當遇到 `QUOTA_EXCEEDED` 錯誤時：

1. 在瀏覽器中登入 Google 帳號
2. 訪問要下載的資料夾
3. 開啟開發者工具（F12）→ Application → Cookies
4. 複製所有 Cookie（格式：Netscape HTTP Cookie File）
5. 在應用中切換到「Cookie 管理」頁面
6. 貼上並儲存
7. 系統會自動重啟下載

### 其他注意事項

- **Port 佔用**：預設使用 port 3000，可在 `src/index.ts` 或 `docker-compose.yml` 修改
- **磁碟空間**：確保有足夠空間存放下載檔案
- **網路穩定**：建議在穩定網路環境下使用

## 🐛 故障排除

### 下載卡住或失敗

1. 點擊「🔄 重啟下載」按鈕
2. 檢查網路連線
3. 確認 Google Drive 連結權限

### 進度不更新

1. 重新整理頁面
2. 檢查瀏覽器控制台是否有錯誤
3. 確認 SSE 連線正常

### gdown 無法執行

1. 確認 Python 已安裝：`python --version`
2. 確認 gdown 已安裝：`python -m gdown --version`
3. 使用系統設定頁面自動安裝

## 📊 效能優化

- **自動保存機制**：每 5 秒自動保存任務狀態，減少 97.5% 檔案 I/O
- **斷點續傳**：已下載的檔案不會重複下載
- **批量處理**：支援多個任務同時下載
- **進度快取**：進度更新僅在變化時發送

## 🔒 安全性

- Cookie 儲存在本地 `~/.cache/gdown/cookies.txt`
- 不會上傳任何資料到第三方伺服器
- 所有下載都在本地進行

## 📝 更新日誌

### v1.0.0 (2025-01-19)

- ✅ 批量下載支援
- ✅ 任務管理系統
- ✅ 斷點續傳
- ✅ Cookie 管理
- ✅ 重啟下載功能
- ✅ 整合式 Tab 設計
- ✅ Warning/Error 分離
- ✅ 自動保存機制
- ✅ Docker 部署支援

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

## 📄 授權

MIT License

## 👨‍💻 作者

Jay Hsu

## 🔗 相關連結

- [GitHub Repository](https://github.com/jayhsu5202/Google-Drive-Downloader)
- [Docker Deployment Guide](./DOCKER_DEPLOYMENT.md)
- [gdown Documentation](https://github.com/wkentaro/gdown)

