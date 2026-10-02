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

## `games/hanzi-generals/**`｜字陣無雙開發路由

本節只適用於《字陣無雙》。它選擇性整合 `mattpocock/skills` 的對齊、規格、TDD、除錯、review 及 handoff 原則；不安裝整套流程，不取代現有 MPOS、Notion SOT 或 GitHub 規則。

### 開工順序與真相來源

1. 先讀 Notion「字陣無雙｜Project Brain」。
2. 再核對最新 approved repository／PR exact HEAD、diff、測試及 workflow。
3. 最後只讀本次工作真正相關的 SOT。

Notion 保存已批准決定、設計、架構、專案狀態及交接；GitHub 保存實作真相；Chat 只作臨時工作空間。除非 Project Brain 明確批准，不新增 `CONTEXT.md`、ADR、平行 issue tracker、重複規格或散落交接文件。

### 按任務選流程

- **細小而完整定義的工作：** 直接實作及驗證；不要為使用流程而強行訪談、寫長規格或拆大量 tickets。
- **會實質改變產品、玩法、UX、架構、資料或成本的模糊工作：** 先完成 Decision Baseline，只向 Ken 提交真正需要人作決定的分支；可由 repo、Notion 或工具查到的事實由 agent 自行查證。未批准前不可寫 production code。
- **已批准、跨多步驟的改動：** 將既有決定整理成精簡 spec、out-of-scope、驗收準則及測試邊界，寫入現有 Notion SOT 或相連 GitHub issue。只有超過一個安全 PR／session或存在依賴時才拆 tickets。
- **功能或一般修正：** 以最小垂直切片推進；優先在既有 public seam 驗證玩家可見行為。適用時先建立會失敗的測試，再寫最少 production code 令其通過；不得為增加測試數量而測 private implementation。
- **困難 bug／效能問題：** 先建立能捕捉原始症狀、可重複及可由 agent 執行的 feedback loop；縮小重現案例，再列出可證偽假設、精準 instrument、修正根因及加入 regression test。完成前移除臨時 log、harness 及 debug artifact。
- **Review：** 先固定 base／merge-base及 exact HEAD，再分開檢查：① Spec／SOT 是否完整落實、有否 scope creep；② Repo 標準、回歸、安全、私隱、資料格式及可維護性。舊 SHA 的綠燈不可當成新 HEAD 證據。
- **Handoff：** 只引用 Project Brain、SOT、issue、PR、commit、測試及 artifact，不重抄已保存內容。狀態或決定有改變便更新 Project Brain；未完成而下一位 AI 無法直接接手便留下 Handoff。

### 角色及範圍邊界

- Gameplay 負責玩法；UX 負責呈現及互動；Research 只提出建議；Codex／Implementation 只實作已批准工作。
- UX 不可自行改玩法；Implementation 不可補作產品決定；跨範圍 finding 以 Handoff 交回正確角色。
- 自動測試及 Chromium browser gate 不可冒充真實 iPhone／Safari 玩家驗收。
- 不把目前 PR 號碼、SHA 或短期進度寫死在本檔；每次由 Project Brain 及 GitHub 重新取得。
- AI 不得自行 merge。

### 字陣無雙完成標準

1. 玩家可見效果符合已批准 SOT／issue及驗收準則。
2. Focused tests、完整 test suite、static build及適用 browser gate均在同一 exact HEAD 通過。
3. 無 unrelated refactor、臨時檔、秘密、資料格式不一致或未說明風險。
4. PR 清楚列出實際效果、exact-SHA證據、已知限制及需人手確認項目。
5. 如專案狀態、決定或下一步有改變，Project Brain／Handoff 已同步，令下一位 AI 毋須閱讀本次對話即可繼續。
