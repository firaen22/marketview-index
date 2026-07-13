<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app / React 專案設定與部署指南

This contains everything you need to run your app locally.

## 🚀 專案啟動 (Project Setup)

已經在 `package.json` 中配置好對應的 scripts 與相關套件。請依照以下步驟在本地端啟動開發伺服器：

**環境要求:** Node.js

1. 安裝相依套件：
   ```bash
   npm install
   ```
2. 設定環境變數：將 `.env.example` 複製為 `.env.local` 並填入對應的 API Key。
   - `ALPHA_VANTAGE_API_KEY`: 來自 [Alpha Vantage](https://www.alphavantage.co/)
   - `KV_REST_API_URL` & `KV_REST_API_TOKEN`: 來自 Vercel Project -> Storage -> KV
3. 啟動開發伺服器：
   ```bash
   npm run dev
   # 或使用
   npm start
   ```

## 📊 數據獲取 (Yahoo Finance & Redis 快取)

專案透過 `yahoo-finance2` 獲取行情，並使用 **Upstash Redis (Vercel KV)** 進行快取（每組 range 快取 1 小時），以減少對 Yahoo Finance 的呼叫次數並防止 IP Ban。

- **Cron 執行時間 (HKT)**: 每日 9:30 AM（`/api/cron/update-market-data`，預先寫入 1M / 3M / YTD / 1Y 四組快取；需設定 `CRON_SECRET` 環境變數）。
- **On-demand 更新**: 快取過期或前端帶 `refresh=true` 時即時向 Yahoo Finance 拉取新資料並回寫 Redis（60 秒 throttle）。
- **優雅降級 (Fallback)**: 若直接呼叫 API 失敗（例如超過 25 次限制），或是伺服器錯誤，前端將會自動讀取並凍結在 **最後一次成功寫入 Redis** 的大盤數據，不再顯示錯誤的 Mock Data。

## 📂 版本控制與安全 (.gitignore)

專案已設定完善的 `.gitignore` 檔案，以確保安全與環境整潔：
- **環境變數檔 (.env*)**: 避免將包含敏感資訊 (API Keys, Secrets) 的檔案上傳，只保留 `.env.example` 作為範本。
- **依賴與建置資料夾**: 略過 `node_modules/`, `dist/`, `build/` 以減少版控體積。
- **日誌與系統檔**: 隱藏各類 `*.log` 與 `.DS_Store`，防止開發過程產生的暫存檔污染遠端程式庫。

## ☁️ 自動化部署 (Vercel)

專案已內建 GitHub Actions Workflow (`.github/workflows/deploy.yml`)，用於全方位控制 Vercel 的部署：

1. 只要將程式碼推送到 `main` 分支，預設會觸發 Action 進行 Vercel Production 部署。
2. **前置設定（在 GitHub Repo 的 Secrets 中設置）**：
   - `VERCEL_TOKEN`: 取得自 Vercel 帳號設定 (Settings -> Tokens)。
   - `VERCEL_ORG_ID`: 取得自本地端先執行 `npx vercel link` 之後產生的 `.vercel/project.json` 裡的 `orgId`。
   - `VERCEL_PROJECT_ID`: 取得自本地端先執行 `npx vercel link` 之後產生的 `.vercel/project.json` 裡的 `projectId`。
3. 如果您選擇直接在 Vercel 後台匯入 GitHub 儲存庫，Vercel 將能實現全自動部署，這個 Action 也可以幫助您進行更為彈性的自訂化 CI/CD pipeline（如跑測試、產生額外靜態檔案才部署等）。
