# 月光試驗場｜Moonlight Playground

> 有正職嘅香港工程師，夜晚學用 AI 將想法整成可以玩、可以用嘅工具同遊戲。

Moonlight Engineer 係一個放工後 AI 試驗場。這裡集中放置小型網頁遊戲、實用工具及概念驗證；有足夠價值、使用者或獨立發佈需要的實驗，會升級成獨立 Repo。

## 公開網址

首次合併並啟用 GitHub Pages 後：

`https://moonlightengineer.github.io/Moonlight-playground/`

## 現有實驗

| 項目 | 類別 | 狀態 | 公開路徑 |
|---|---|---|---|
| 字陣無雙 | 網頁遊戲 | 可遊玩 | `games/hanzi-generals/` |

## Repo 結構

```text
Moonlight-playground/
├─ index.html                         # 公開入口首頁
├─ projects.json                      # 首頁項目登記
├─ assets/                            # Playground 品牌與介面資源
├─ games/<slug>/                      # 各個獨立網頁遊戲
├─ tools/<slug>/                      # 各個獨立實用工具
├─ site-packages/                     # 首次匯入大型單檔作品的傳輸封裝
├─ scripts/build_site.py              # 建置及完整性驗證
├─ AGENTS.md                          # AI agent 工作規則
└─ .github/workflows/pages.yml        # PR 驗證及 GitHub Pages 部署
```

## 新增一個實驗

1. 建立 `games/<slug>/` 或 `tools/<slug>/`。
2. 確保資料夾內有可直接開啟的 `index.html`。
3. 在 `projects.json` 加入項目資料、封面及公開路徑。
4. 執行 `python scripts/build_site.py`。
5. 用本機靜態伺服器檢查 `_site/`。
6. 以 Pull Request 提交，由 Owner 合併。

`projects.json` 狀態只使用：

- `experiment`：試驗中
- `playable`：可使用／遊玩
- `paused`：暫停
- `graduated`：已升級成獨立項目

## 本機預覽與驗證

只需要 Python 3：

```bash
python scripts/build_site.py
python -m http.server 8000 --directory _site
```

然後開啟 `http://localhost:8000/`。

成功建置會顯示：

```text
SITE_VERIFY_OK projects=1 game_bytes=58434
```

## GitHub Pages 一次性設定

首次合併後，在 Repo 完成以下設定：

1. `Settings` → `Pages`。
2. `Build and deployment` → `Source` 選 `GitHub Actions`。
3. 如首次工作流程未自動重跑，到 `Actions` 手動執行 `Verify and deploy playground`。

之後每次合併到 `main`，工作流程會先重建及驗證網站，再自動發布。

## 「字陣無雙」封裝說明

首次遊戲由 ChatGPT 對話產生完整單檔 HTML。因連接器單次傳輸限制，Repo 內保存經 gzip＋Base64 分段的發佈封裝；`scripts/build_site.py` 會重建成公開頁面，並驗證遊戲標記及檔案大小。

這是首次匯入的特殊處理。日後新增一般實驗，應直接保存正常可讀的 HTML、CSS、JavaScript 原始檔，不需要使用分段封裝。

## 私隱與範圍

- 不存放秘密金鑰、公司文件、客戶資料或私人資料。
- 公開實驗不代表任何僱主、客戶或項目。
- 預設使用原創或獲合法授權的素材。
- 此 Repo 用作快速試驗，不取代成熟項目的正式文件、Issue、測試及版本管理。
