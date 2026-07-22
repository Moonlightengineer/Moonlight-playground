# Moonlight Playground｜AI Agent 工作規則

## 定位

此 Repo 是 Moonlight Engineer 的公開輕量試驗場，用來快速發布小型網頁遊戲、工具及概念驗證；不是所有正式產品的集中式單體程式庫。

## 預設做法

- 優先使用純 HTML、CSS、原生 JavaScript；沒有明確需要時不要加入框架、資料庫、登入或後端。
- 每個實驗放在獨立資料夾：`games/<slug>/` 或 `tools/<slug>/`。
- 每個公開實驗必須有自己的入口，不可依賴其他實驗的內部程式。
- 新增、改名、封存或升級項目時，同步更新根目錄 `projects.json`。
- 首頁由 `projects.json` 產生項目卡；保留靜態 fallback，避免資料載入失敗時出現空白頁。
- 優先手機操作、可見鍵盤焦點、合理文字對比及減少動態效果支援。
- 修改前先執行 `python scripts/build_site.py`；修改後再次執行並確認輸出 `SITE_VERIFY_OK`。

## `site-packages/` 特別規則

- `site-packages/hanzi-generals...part-*` 是首次匯入「字陣無雙」時，因連接器傳輸限制而產生的封裝檔。
- GitHub Actions 會將分段內容重建成 `_site/games/hanzi-generals/index.html`；不要直接手改分段字串。
- 日後新增一般實驗，應優先提交正常可讀的 HTML、CSS、JavaScript 原始檔，不要照搬分段封裝做法。
- 如要修改「字陣無雙」，先由完整源碼重新產生及測試單檔版，再更新整套分段，並驗證重建結果完全一致。

## 不可做

- 不得提交 API Key、Token、密碼、公司文件、客戶資料或任何秘密資料。
- 不得為單一實驗破壞其他已公開項目。
- 不得未經確認直接把成熟獨立項目搬回此 Repo。
- 不得直接複製第三方品牌介面、角色圖像或未獲授權素材。
- 不得由 AI agent 自行合併 Pull Request；Owner 負責最終合併。

## 新增實驗完成標準

1. 新資料夾可由靜態伺服器直接開啟。
2. `projects.json` 登記完整，路徑及封面存在。
3. 手機寬度 320px 不出現橫向溢出。
4. 重要互動可用正常觸控操作；適用時亦可用鍵盤。
5. `python scripts/build_site.py` 通過。
6. README 如有操作、結構或部署方式變更已同步更新。

## 升級成獨立 Repo 的條件

出現以下任何一項便應提出拆分建議：正式產品路線圖、後端或資料庫、秘密環境變數、真實使用者資料、多人協作、獨立發佈節奏、比賽或商業用途。

## GitHub 流程

- 預設以新 branch + Pull Request 修改；Owner 負責最終合併。
- PR 說明要列出實際使用效果、測試證據、風險及需要人手確認的項目。
- 不做與當前實驗無關的大型重構。
