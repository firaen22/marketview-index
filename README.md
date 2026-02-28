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
2. 設定環境變數：將 `.env.example` 複製為 `.env.local` 並填入對應的 API Key (例如：`GEMINI_API_KEY`)。
3. 啟動開發伺服器：
   ```bash
   npm run dev
   # 或使用
   npm start
   ```

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
