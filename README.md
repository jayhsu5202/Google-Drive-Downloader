# Google Drive Downloader 🐾

Express 全棧 Google Drive 下載器，使用 gdown CLI，支援進度追蹤與檔案校驗。

## 功能特色

- ✅ **資料夾下載**：支援 Google Drive 資料夾批次下載（最多 50 檔案）
- ✅ **實時進度**：Server-Sent Events (SSE) 推送下載進度
- ✅ **檔案校驗**：MD5/SHA256 hash 計算與驗證
- ✅ **現代 UI**：響應式設計，支援桌面/平板/手機
- ✅ **TypeScript**：完整類型定義，TSC 與 ESLint 檢查通過

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

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動開發伺服器

```bash
npm run dev
```

伺服器將在 `http://localhost:3000` 啟動。

### 3. 使用方式

1. 開啟瀏覽器訪問 `http://localhost:3000`
2. 貼上 Google Drive 資料夾連結或 ID
3. 點擊「開始下載」
4. 即時查看下載進度與檔案列表

## 專案結構

```
google-drive-downloader/
├── src/
│   ├── index.ts              # Express 主程式
│   ├── types.ts              # TypeScript 類型定義
│   ├── routes/
│   │   └── download.ts       # 下載 API 路由
│   └── services/
│       ├── gdown.ts          # gdown CLI 封裝
│       └── fileVerify.ts     # 檔案校驗模組
├── public/
│   ├── index.html            # 前端頁面
│   ├── app.js                # 前端邏輯
│   └── style.css             # 樣式
├── downloads/                # 下載目錄（自動建立）
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## API 端點

### POST /api/download/start
開始下載 Google Drive 資料夾

**Request Body:**
```json
{
  "url": "https://drive.google.com/drive/folders/...",
  "outputDir": "./downloads"
}
```

**Response:**
```json
{
  "status": "started",
  "message": "Download started successfully"
}
```

### GET /api/download/progress
Server-Sent Events 端點，推送實時進度

**Event Data:**
```json
{
  "current": 3,
  "total": 10,
  "currentFile": "example.pdf",
  "percentage": 30,
  "status": "downloading"
}
```

### POST /api/download/cancel
取消正在進行的下載

### GET /api/download/files
取得已下載檔案列表

**Query Parameters:**
- `dir`: 輸出目錄（選填，預設 `./downloads`）

## 開發指令

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

## 注意事項

1. **gdown 限制**：每個資料夾最多下載 50 個檔案
2. **Google Drive 權限**：檔案需設定為「知道連結的任何人」
3. **下載限制**：Google 可能限制大量下載，建議使用 cookies 驗證
4. **Port 佔用**：預設使用 port 3000，可在 `src/index.ts` 修改

## 授權

MIT License

## 作者

Made with ❤️ by Claude 4.0 Sonnet

