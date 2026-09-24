# 庫倫 Coulomb × 異相工作室｜Out of Phase Studio

> 用工程的眼光，拆解日常與科技。

庫倫 Coulomb 的個人創作入口，集中展示異相工作室的內容方向、社交入口與已公開的小型網頁遊戲、工具及概念驗證。成熟實驗仍保留獨立 Repo，不將所有正式產品搬回此處。

Repo 及 GitHub Pages 路徑沿用 `Moonlight-playground`，避免破壞既有連結；月光試驗場為歷史名稱。

## 公開網址

`https://moonlightengineer.github.io/Moonlight-playground/`

首頁修改以 PR 提交；合併並完成既有 GitHub Pages workflow 後才會反映到公開網址。

## 現有實驗

| 項目 | 類別 | 狀態 | 公開路徑 |
|---|---|---|---|
| 字陣無雙 | 網頁遊戲 | 可遊玩 | `games/hanzi-generals/` |

## 首頁品牌與發布邊界

- 創作者：庫倫 Coulomb；內容品牌：異相工作室 Out of Phase Studio。
- 四個內容方向：AI・科技、零序 Zero Sequence、空想科學台、異相實驗室。連結指向同一個 YouTube 頻道，不宣稱已有個別影片或 Playlist。
- 社交入口依已確認帳號：YouTube `@outofphasehk`、Instagram／Threads `coulomb.hk`、X `@coulombhk`。
- 首頁採文字識別，`coulomb-type.svg` 只是文字 C 的網站小圖示；不是待驗收的 TRI PHASE Studio Logo。波形為裝飾，不是最終 Logo。
- 不公開私人 Repo、未發布實驗、公司／客戶資料或登入用電郵。`projects.json` 仍只登記已公開作品。
- 讀取 registry 前或讀取失敗時保留可點擊的 HTML 作品卡；分類只在有效資料載入後啟用。JavaScript 停用時仍可使用作品及社交連結。

## Repo 結構

```text
Moonlight-playground/
├─ index.html                         # 個人創作／內容／作品入口
├─ projects.json                      # 首頁項目登記
├─ assets/                            # 首頁介面資源
├─ games/<slug>/                      # 各個獨立網頁遊戲
├─ tools/<slug>/                      # 各個獨立實用工具
├─ site-packages/                     # 首次匯入大型單檔作品的傳輸封裝
├─ scripts/build_site.py              # 建置及完整性驗證
├─ tests/homepage_browser.py          # 可選的離線首頁 browser smoke test
├─ AGENTS.md                          # AI agent 工作規則
└─ .github/workflows/pages.yml        # PR 驗證及 GitHub Pages 部署
```

## 新增一個實驗

1. 建立 `games/<slug>/` 或 `tools/<slug>/`。
2. 確保資料夾內有可直接開啟的 `index.html`。
3. 在 `projects.json` 加入項目資料、封面及公開路徑，並同步首頁靜態 fallback。
4. 執行 `python scripts/build_site.py`。
5. 用本機靜態伺服器檢查 `_site/`。
6. 以 Pull Request 提交，由 Owner 合併。

`projects.json` 狀態只使用：

- `experiment`：試驗中
- `playable`：可使用／遊玩
- `paused`：暫停
- `graduated`：已升級成獨立項目

## 本機預覽與驗證

需要 Python 3 及 Node.js 20：

```bash
npm test
python -m unittest tests/test_build_site.py -v
python scripts/build_site.py
python -m http.server 8000 --directory _site
```

然後開啟 `http://localhost:8000/`。

成功建置會顯示：

```text
SITE_VERIFY_OK projects=1 game_bytes=58434 v2=1
```

### 可選首頁 browser smoke test

不增加網站 runtime dependency。開發環境安裝 Playwright 與 Chromium 後執行：

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/homepage_browser.py
# 使用已安裝的 Chromium：
python tests/homepage_browser.py --browser /usr/bin/chromium
```

輸出到 `artifacts/homepage/`。測試將原始 HTML／CSS／封面在記憶體內載入，僅 mock registry 網絡回應，覆蓋手機／桌面尺寸、分類、鍵盤、錯誤／慢速資料、無 JavaScript 與減少動態效果。這不是正式站網絡驗證、Safari／實體 iPhone 驗收或完整遊戲試玩；不應混稱。

## GitHub Pages 一次性設定

首次合併後，在 Repo 完成以下設定：

1. `Settings` → `Pages`。
2. `Build and deployment` → `Source` 選 `GitHub Actions`。
3. 如首次工作流程未自動重跑，到 `Actions` 手動執行 `Verify and deploy playground`。

之後每次合併到 `main`，工作流程會先重建及驗證網站，再自動發布。

## 「字陣無雙」封裝說明

首次遊戲由 ChatGPT 對話產生完整單檔 HTML。因連接器單次傳輸限制，Repo 內保存經 gzip＋Base64 分段的發佈封裝；`scripts/build_site.py` 會重建成公開頁面，並驗證遊戲標記及檔案大小。

這是首次匯入的特殊處理。日後新增一般實驗，應直接保存正常可讀的 HTML、CSS、JavaScript 原始檔，不需要使用分段封裝。

## 字陣無雙 v2 隱藏測試版

Vertical Slice 完成後由以下路徑提供指定測試者使用：

`/games/hanzi-generals/v2/`

- v2 使用正常可讀 ES modules，唔沿用 Classic 分段封裝作架構基礎。
- v2 不加入 `projects.json`，Playground 首頁不會顯示。
- v2 不取代 Classic；兩者有獨立 runtime 及回歸驗證。
- 設計、實作及試玩規格見 `docs/superpowers/` 與 `docs/playtests/`。

## 私隱與範圍

- 不存放秘密金鑰、公司文件、客戶資料或私人資料。
- 公開實驗不代表任何僱主、客戶或項目。
- 預設使用原創或獲合法授權的素材。
- 此 Repo 用作快速試驗，不取代成熟項目的正式文件、Issue、測試及版本管理。
