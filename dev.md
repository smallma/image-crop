# PMKT Image Studio 開發接手文件

## 1. 專案目標

PMKT Image Studio 是純前端圖片裁切、Resize 與格式轉換工具。所有圖片只在使用者瀏覽器記憶體中處理，不會上傳伺服器。

主要使用情境：

- PMKT 同時匯入多張行銷圖片。
- 自由裁切、旋轉、翻轉、縮放與拖曳定位。
- 套用 Instagram、Facebook、LinkedIn、YouTube 常用尺寸。
- 匯出 JPG、PNG、WebP。

## 2. 技術堆疊

- React 19
- TypeScript 6
- Vite 8
- 原生 Canvas API
- Lucide React 圖示
- 原生 CSS，未使用 Tailwind 或元件框架
- Vercel Preview 部署

常用指令：

```bash
npm install
npm run dev
npm run build
npm run lint
vercel --target=preview --yes
```

## 3. 重要檔案

```text
src/App.tsx       所有狀態、圖片處理與主要 UI
src/App.css       工作台、自由裁切與響應式樣式
src/index.css     全域字體、基礎樣式與 focus 狀態
index.html        頁面 metadata
package.json      依賴與執行指令
```

目前功能集中在 `App.tsx`。若功能繼續增加，優先拆分：

```text
src/components/ImageLibrary.tsx
src/components/CropEditor.tsx
src/components/CanvasEditor.tsx
src/components/SettingsPanel.tsx
src/lib/image-processing.ts
src/types/editor.ts
```

## 4. 核心資料模型

`ImageItem` 代表一張圖片的完整工作階段。每張圖片都獨立保存：

- 原始圖片與目前裁切結果 URL
- 原始尺寸與目前圖片尺寸
- 輸出寬高
- 縮放、位置、旋轉、翻轉
- 匯出格式與品質
- 已套用自由裁切範圍

重要欄位：

```ts
type ImageItem = {
  id: string
  fileName: string
  imageUrl: string       // 目前裁切後圖片
  originalUrl: string    // 可再次自由裁切的完整原圖
  naturalSize: Size      // imageUrl 尺寸
  originalSize: Size     // originalUrl 尺寸
  width: number          // 輸出寬度
  height: number         // 輸出高度
  zoom: number           // 1–250%
  offsetX: number        // 實際輸出像素座標
  offsetY: number        // 實際輸出像素座標
  rotation: number
  flipX: boolean
  flipY: boolean
  format: Format
  quality: number
  appliedCrop: CropRect
}
```

`CropRect` 使用原圖比例座標，而不是畫面像素：

```ts
type CropRect = {
  x: number
  y: number
  width: number
  height: number
}
```

值域為 `0–1`，因此響應式縮放不會影響裁切精準度。

## 5. 多圖片工作階段

主要狀態：

```ts
const [images, setImages] = useState<ImageItem[]>([])
const [activeId, setActiveId] = useState('')
```

流程：

1. `loadFiles()` 可一次處理多個檔案。
2. `createImageItem()` 將每個檔案轉為 Object URL 與初始狀態。
3. `hydrateImage()` 把選取的 `ImageItem` 載入目前編輯狀態。
4. `currentSnapshot()` 取得目前編輯狀態。
5. `switchImage()` 切換前先保存目前狀態，再載入目標圖片。
6. `closeImage()` 與 `removeImage()` 會釋放 Object URL，並自動切換相鄰圖片。

修改多圖片邏輯時，必須確認切換圖片後以下狀態不會遺失：

- 自由裁切結果
- Resize 尺寸
- 縮放與位置
- 旋轉與翻轉
- 格式與品質

## 6. 自由裁切

自由裁切是非破壞式流程。

### 進入裁切

`beginCrop()`：

- 顯示完整原圖，而不是目前裁切後圖片。
- 保留目前旋轉與翻轉方向。
- 若有旋轉或翻轉，使用 `createOrientedImage()` 建立工作副本。
- 使用 `transformCropRect()` 將既有裁切框轉換到新方向。

### 操作裁切框

- 框內拖曳：移動裁切區域。
- 四角與四邊控制點：調整大小。
- 最小裁切範圍為原圖的 8%。
- `resizeCrop()` 負責邊界與最小尺寸限制。

### 套用裁切

`applyCrop()`：

1. 使用 Canvas 從 `cropSourceUrl` 擷取裁切區域。
2. 產生新的 `imageUrl`。
3. 保存完整方向圖為新的 `originalUrl`。
4. 套用旋轉／翻轉後將其狀態歸零，避免重複旋轉。
5. 更新目前圖片與 `images` 清單。

### 取消裁切

`cancelCrop()`：

- 釋放暫時工作副本。
- 保留進入裁切前的旋轉、翻轉、縮放與位置。

### 再次裁切

再次點擊自由裁切時必須顯示完整 `originalUrl`，裁切框則顯示目前 `appliedCrop`，讓使用者能向外拉回先前裁掉的內容。

## 7. 圖片縮放與拖曳定位

圖片縮放範圍：

```text
1%–250%
```

水平與垂直位置使用實際輸出像素，不是百分比：

```ts
offsetX: number
offsetY: number
```

動態位置範圍：

```ts
const positionLimitX = Math.max(1000, width * 2)
const positionLimitY = Math.max(1000, height * 2)
```

預覽畫面會將輸出像素換算為 CSS 百分比：

```ts
const previewOffsetX = (offsetX / width) * 100
const previewOffsetY = (offsetY / height) * 100
```

Canvas 匯出則直接使用像素：

```ts
ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
```

這兩套換算必須維持一致，否則預覽與下載圖片位置會不同。

直接拖曳由 `PanInteraction` 與第二個 pointer event `useEffect` 管理。自由裁切模式啟用時，不允許圖片定位拖曳，避免和裁切框衝突。

## 8. Resize 與社群預設

社群尺寸定義在 `presets`：

```ts
const presets = [
  { name: 'Instagram 貼文', width: 1080, height: 1080 },
  // ...
]
```

輸出尺寸限制為 `1–10000px`。

鎖定長寬比時，修改寬度或高度會同步更新另一邊。平台尺寸預設只更新輸出畫布，不會破壞原圖或自由裁切資料。

## 9. 匯出流程

`exportImage()` 使用 Canvas：

1. 建立指定輸出寬高的 Canvas。
2. JPG 先填白色背景。
3. 根據旋轉方向計算視覺寬高。
4. 使用 cover scale 填滿畫布。
5. 套用縮放、實際像素位置、旋轉與翻轉。
6. 使用 `canvas.toDataURL()` 產生下載。

格式：

- JPG：有品質設定，透明區域為白色。
- PNG：保留透明，無品質設定。
- WebP：有品質設定。

## 10. Object URL 生命週期

圖片完全在本機處理，大量使用：

```ts
URL.createObjectURL()
URL.revokeObjectURL()
```

修改圖片關閉、重新裁切、取消裁切或切換原圖流程時，必須避免：

- 太早 revoke，導致圖片突然失效。
- 忘記 revoke，導致多圖片工作階段記憶體持續增加。
- `imageUrl === originalUrl` 時重複 revoke。

## 11. UI 與無障礙硬性規範

使用者要求：

- 所有可見文字最小 `18px`。
- 文字與背景對比至少 `4.5:1`。
- 鍵盤 focus 必須清楚。
- 點擊區域至少約 `44px`。
- 手機版不可水平溢位。

目前主要色彩對比約為：

```text
主要文字 / 背景       18.81:1
次要文字 / 面板       10.52:1
主要按鈕文字 / 按鈕   10.39:1
```

修改 CSS 後執行字級掃描：

```bash
rg -n "font-size:\s*(1[0-7]|[0-9])px|font-size:\s*0" src --glob '*.css'
```

響應式斷點：

```text
1200px  右側設定區移至下方
820px   改為單欄工作區
560px   手機操作與工具列調整
```

## 12. 驗證方式

每次修改後至少執行：

```bash
npm run build
npm run lint
```

建議瀏覽器實測情境：

1. 一次匯入兩張不同尺寸圖片。
2. 第一張裁切、旋轉、縮放、拖曳定位。
3. 切換第二張後確認狀態獨立。
4. 切回第一張確認狀態保存。
5. 再次自由裁切，確認完整原圖仍可拉回。
6. 旋轉後進入自由裁切，確認方向維持。
7. 關閉目前圖片，確認自動切換相鄰圖片。
8. 中途再加入圖片。
9. 測試 `390×844`，確認沒有水平溢位且最小字級為 `18px`。
10. 匯出 JPG、PNG、WebP，比對預覽位置與下載結果。

## 13. 部署

Preview 部署：

```bash
vercel --target=preview --yes
```

部署後確認：

```bash
vercel inspect <preview-url>
```

狀態必須為 `Ready`。

Vercel Preview 目前可能啟用 Deployment Protection，未登入時會收到 `401`，不可擅自關閉保護設定。

## 14. 已知限制與後續建議

- `App.tsx` 已偏大，下一次功能擴充前建議先拆分元件與圖片處理工具。
- 尚未提供「批次全部匯出」與 ZIP 下載。
- 尚未提供復原／重做歷史紀錄。
- 尚未支援鍵盤方向鍵微調圖片位置與裁切框。
- 大尺寸圖片與大量圖片可能占用較多瀏覽器記憶體，可考慮加入圖片數量／像素警告。
- 匯出目前使用 `toDataURL()`，大型圖片可改用 `canvas.toBlob()` 降低記憶體峰值。
- Google Fonts 目前透過 CSS `@import` 載入；若要改善離線與隱私，可改為自託管字型。

## 15. 不可破壞的行為

後續修改必須維持：

- 圖片不離開瀏覽器。
- 再次自由裁切能看到完整原圖。
- 旋轉／翻轉後進入自由裁切不會回朔方向。
- 自由裁切取消後保留先前狀態。
- 每張圖片獨立保存所有設定。
- 預覽與匯出使用相同位置座標。
- 縮放維持 `1%–250%`。
- 位置可超過 `±100px`，並依輸出尺寸動態調整。
- 最小字級 `18px`、對比至少 `4.5:1`。
