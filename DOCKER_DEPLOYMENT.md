# Docker 部署指南 🐳

Google Drive Downloader 的 Docker Compose 部署方案。

## 📋 前置需求

- Docker Engine 20.10+
- Docker Compose 2.0+

## 🚀 快速開始

### 1. 建置並啟動容器

```bash
docker-compose up -d
```

### 2. 查看日誌

```bash
docker-compose logs -f
```

### 3. 訪問應用

開啟瀏覽器訪問：
- 主頁面：http://localhost:3000
- 設定頁面：http://localhost:3000/settings.html

### 4. 停止容器

```bash
docker-compose down
```

## 📁 目錄結構

```
google-drive-downloader/
├── Dockerfile              # Docker 映像檔定義
├── docker-compose.yml      # Docker Compose 配置
├── .dockerignore          # Docker 忽略檔案
├── downloads/             # 下載檔案目錄（持久化）
├── tasks.json             # 任務資料（持久化）
└── ~/.cache/gdown/        # gdown cookies（選用）
```

## 🔧 配置說明

### Port 映射

預設映射 `3000:3000`，可在 `docker-compose.yml` 中修改：

```yaml
ports:
  - "8080:3000"  # 將容器的 3000 映射到主機的 8080
```

### Volume 掛載

1. **下載目錄**：`./downloads:/app/downloads`
   - 持久化下載的檔案

2. **任務資料**：`./tasks.json:/app/tasks.json`
   - 持久化任務狀態（支援斷點續傳）

3. **gdown Cookies**（選用）：`~/.cache/gdown:/root/.cache/gdown:ro`
   - 用於 Google Drive 認證
   - 如果不需要，可以移除此行

### 環境變數

可在 `docker-compose.yml` 中自訂：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
```

## 🔍 健康檢查

容器內建健康檢查，每 30 秒檢查一次：

```bash
# 查看健康狀態
docker-compose ps
```

## 🛠️ 常用指令

### 重新建置映像檔

```bash
docker-compose build --no-cache
```

### 重啟容器

```bash
docker-compose restart
```

### 查看容器狀態

```bash
docker-compose ps
```

### 進入容器 Shell

```bash
docker-compose exec google-drive-downloader sh
```

### 清理所有資料

```bash
docker-compose down -v
rm -rf downloads/ tasks.json
```

## 📦 映像檔說明

### 基礎映像

- **Node.js**：22-alpine（輕量化）
- **Python**：3.x（透過 apk 安裝）
- **gdown**：最新版本（透過 pip 安裝）

### 映像檔大小

約 200-300 MB（包含 Node.js + Python + gdown）

### 多階段建置

使用多階段建置減少最終映像檔大小：
1. **Builder Stage**：安裝依賴、複製原始碼
2. **Production Stage**：僅包含執行所需檔案

## 🔐 安全性建議

1. **不要在映像檔中包含敏感資料**
   - 使用 `.dockerignore` 排除 `.env` 檔案

2. **使用 Volume 掛載 Cookies**
   - 避免將 Google 認證資訊打包進映像檔

3. **定期更新基礎映像**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

## 🌐 生產環境部署

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 使用 HTTPS

建議使用 Let's Encrypt + Certbot：

```bash
sudo certbot --nginx -d your-domain.com
```

## 🐛 故障排除

### 容器無法啟動

```bash
# 查看詳細日誌
docker-compose logs google-drive-downloader

# 檢查容器狀態
docker-compose ps
```

### gdown 無法執行

```bash
# 進入容器檢查
docker-compose exec google-drive-downloader sh
python -m gdown --version
```

### Port 已被佔用

修改 `docker-compose.yml` 中的 port 映射：

```yaml
ports:
  - "3001:3000"  # 使用其他 port
```

## 📊 監控與日誌

### 查看即時日誌

```bash
docker-compose logs -f --tail=100
```

### 匯出日誌

```bash
docker-compose logs > app.log
```

## 🔄 更新應用

```bash
# 1. 停止容器
docker-compose down

# 2. 拉取最新代碼
git pull

# 3. 重新建置
docker-compose build

# 4. 啟動容器
docker-compose up -d
```

## 💡 最佳實踐

1. **定期備份**
   ```bash
   tar -czf backup-$(date +%Y%m%d).tar.gz downloads/ tasks.json
   ```

2. **監控磁碟空間**
   ```bash
   df -h
   ```

3. **清理舊的映像檔**
   ```bash
   docker system prune -a
   ```

## 📞 支援

如有問題，請查看：
- [README.md](./README.md)
- [GitHub Issues](https://github.com/your-repo/issues)

---

Made with ❤️ by Claude 4.0 Sonnet

