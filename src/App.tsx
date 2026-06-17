import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Crop,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Lock,
  Maximize2,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import './App.css'

type Preset = { name: string; detail: string; width: number; height: number }
type Format = 'image/jpeg' | 'image/png' | 'image/webp'
type CropRect = { x: number; y: number; width: number; height: number }
type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type CropInteraction = { handle: CropHandle; startX: number; startY: number; rect: CropRect }
type PanInteraction = { startX: number; startY: number; offsetX: number; offsetY: number }
type ImageItem = {
  id: string
  fileName: string
  imageUrl: string
  originalUrl: string
  naturalSize: { width: number; height: number }
  originalSize: { width: number; height: number }
  width: number
  height: number
  locked: boolean
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
  flipX: boolean
  flipY: boolean
  format: Format
  quality: number
  appliedCrop: CropRect
}

const fullCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 }

const presets: Preset[] = [
  { name: 'Instagram 貼文', detail: '1:1', width: 1080, height: 1080 },
  { name: 'Instagram 限時動態', detail: '9:16', width: 1080, height: 1920 },
  { name: 'Facebook 貼文', detail: '1.91:1', width: 1200, height: 630 },
  { name: 'LinkedIn 橫幅', detail: '4:1', width: 1584, height: 396 },
  { name: 'YouTube 縮圖', detail: '16:9', width: 1280, height: 720 },
]

const formats: { value: Format; label: string }[] = [
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
]

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const cropSurfaceRef = useRef<HTMLDivElement>(null)
  const cropBoardRef = useRef<HTMLDivElement>(null)
  const [images, setImages] = useState<ImageItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [originalUrl, setOriginalUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 })
  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(1080)
  const [locked, setLocked] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [format, setFormat] = useState<Format>('image/jpeg')
  const [quality, setQuality] = useState(90)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect>(fullCrop)
  const [appliedCrop, setAppliedCrop] = useState<CropRect>(fullCrop)
  const [cropSourceUrl, setCropSourceUrl] = useState('')
  const [cropSourceSize, setCropSourceSize] = useState({ width: 0, height: 0 })
  const [cropInteraction, setCropInteraction] = useState<CropInteraction | null>(null)
  const [panInteraction, setPanInteraction] = useState<PanInteraction | null>(null)

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!cropInteraction || !cropSurfaceRef.current) return
      const bounds = cropSurfaceRef.current.getBoundingClientRect()
      const dx = (event.clientX - cropInteraction.startX) / bounds.width
      const dy = (event.clientY - cropInteraction.startY) / bounds.height
      setCropRect(resizeCrop(cropInteraction.rect, cropInteraction.handle, dx, dy))
    }
    const stopInteraction = () => setCropInteraction(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopInteraction)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopInteraction)
    }
  }, [cropInteraction])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!panInteraction || !cropBoardRef.current) return
      const bounds = cropBoardRef.current.getBoundingClientRect()
      const nextX = panInteraction.offsetX + ((event.clientX - panInteraction.startX) / bounds.width) * width
      const nextY = panInteraction.offsetY + ((event.clientY - panInteraction.startY) / bounds.height) * height
      const { limitX, limitY } = computePanLimits(naturalSize, width, height, zoom, rotation)
      setOffsetX(Math.round(clamp(nextX, -limitX, limitX)))
      setOffsetY(Math.round(clamp(nextY, -limitY, limitY)))
    }
    const stopInteraction = () => setPanInteraction(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopInteraction)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopInteraction)
    }
  }, [panInteraction, width, height, zoom, rotation, naturalSize])

  const createImageItem = (file: File) => new Promise<ImageItem>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('invalid file'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({
      id: crypto.randomUUID(),
      fileName: file.name,
      imageUrl: url,
      originalUrl: url,
      naturalSize: { width: image.naturalWidth, height: image.naturalHeight },
      originalSize: { width: image.naturalWidth, height: image.naturalHeight },
      width: Math.min(10000, image.naturalWidth),
      height: Math.min(10000, image.naturalHeight),
      locked: false,
      zoom: 100,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
      format: 'image/jpeg',
      quality: 90,
      appliedCrop: fullCrop,
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    image.src = url
  })

  const hydrateImage = (item: ImageItem) => {
    setActiveId(item.id)
    setImageUrl(item.imageUrl)
    setOriginalUrl(item.originalUrl)
    setFileName(item.fileName)
    setNaturalSize(item.naturalSize)
    setOriginalSize(item.originalSize)
    setWidth(item.width)
    setHeight(item.height)
    setLocked(item.locked)
    setZoom(item.zoom)
    setOffsetX(item.offsetX)
    setOffsetY(item.offsetY)
    setRotation(item.rotation)
    setFlipX(item.flipX)
    setFlipY(item.flipY)
    setFormat(item.format)
    setQuality(item.quality)
    setAppliedCrop(item.appliedCrop)
    setCropRect(item.appliedCrop)
    setCropSourceUrl(item.originalUrl)
    setCropSourceSize(item.originalSize)
    setCropMode(false)
  }

  const currentSnapshot = (): ImageItem => ({
    id: activeId,
    fileName,
    imageUrl,
    originalUrl,
    naturalSize,
    originalSize,
    width,
    height,
    locked,
    zoom,
    offsetX,
    offsetY,
    rotation,
    flipX,
    flipY,
    format,
    quality,
    appliedCrop,
  })

  const saveCurrent = () => {
    if (!activeId) return
    const snapshot = currentSnapshot()
    setImages((items) => items.map((item) => item.id === activeId ? snapshot : item))
  }

  const switchImage = (id: string) => {
    if (id === activeId) return
    const target = images.find((item) => item.id === id)
    if (!target) return
    const snapshot = activeId ? currentSnapshot() : null
    setImages((items) => items.map((item) => snapshot && item.id === activeId ? snapshot : item))
    hydrateImage(target)
    setNotice(`已切換至 ${target.fileName}。`)
  }

  const loadFiles = async (fileList?: FileList | File[]) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'))
    if (!files.length) {
      setNotice('請選擇 JPG、PNG 或 WebP 圖片。')
      return
    }
    const loaded = await Promise.all(files.map(createImageItem))
    if (activeId) saveCurrent()
    setImages((items) => [...items, ...loaded])
    hydrateImage(loaded[0])
    setNotice(`已加入 ${loaded.length} 張圖片。`)
  }

  const resetTransform = () => {
    setZoom(100)
    setOffsetX(0)
    setOffsetY(0)
    setRotation(0)
    setFlipX(false)
    setFlipY(false)
  }

  const beginCrop = async () => {
    const normalizedRotation = normalizeRotation(rotation)
    if (normalizedRotation || flipX || flipY) {
      const transformed = await createOrientedImage(originalUrl, originalSize, normalizedRotation, flipX, flipY)
      setCropSourceUrl(transformed.url)
      setCropSourceSize(transformed.size)
      setCropRect(transformCropRect(appliedCrop, normalizedRotation, flipX, flipY))
    } else {
      setCropSourceUrl(originalUrl)
      setCropSourceSize(originalSize)
      setCropRect(appliedCrop)
    }
    setCropMode(true)
    setNotice('已維持目前旋轉與翻轉方向，可在完整原圖上調整裁切。')
  }

  const startCropInteraction = (event: ReactPointerEvent, handle: CropHandle) => {
    event.preventDefault()
    event.stopPropagation()
    setCropInteraction({ handle, startX: event.clientX, startY: event.clientY, rect: cropRect })
  }

  const startPanInteraction = (event: ReactPointerEvent) => {
    if (!imageUrl || cropMode) return
    event.preventDefault()
    const { limitX, limitY } = computePanLimits(naturalSize, width, height, zoom, rotation)
    setPanInteraction({
      startX: event.clientX,
      startY: event.clientY,
      offsetX: clamp(offsetX, -limitX, limitX),
      offsetY: clamp(offsetY, -limitY, limitY),
    })
  }

  const applyCrop = () => {
    const image = new Image()
    image.onload = () => {
      const cropWidth = Math.max(1, Math.round(cropSourceSize.width * cropRect.width))
      const cropHeight = Math.max(1, Math.round(cropSourceSize.height * cropRect.height))
      const canvas = document.createElement('canvas')
      canvas.width = cropWidth
      canvas.height = cropHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(
        image,
        Math.round(image.naturalWidth * cropRect.x),
        Math.round(image.naturalHeight * cropRect.y),
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      )
      canvas.toBlob((blob) => {
        if (!blob) return
        if (imageUrl !== originalUrl) URL.revokeObjectURL(imageUrl)
        const nextOriginalUrl = cropSourceUrl
        const nextOriginalSize = cropSourceSize
        if (nextOriginalUrl !== originalUrl) URL.revokeObjectURL(originalUrl)
        const nextUrl = URL.createObjectURL(blob)
        setImageUrl(nextUrl)
        setOriginalUrl(nextOriginalUrl)
        setOriginalSize(nextOriginalSize)
        setNaturalSize({ width: cropWidth, height: cropHeight })
        setWidth(Math.min(10000, cropWidth))
        setHeight(Math.min(10000, cropHeight))
        setCropMode(false)
        setAppliedCrop(cropRect)
        setImages((items) => items.map((item) => item.id === activeId ? {
          ...item,
          imageUrl: nextUrl,
          originalUrl: nextOriginalUrl,
          originalSize: nextOriginalSize,
          naturalSize: { width: cropWidth, height: cropHeight },
          width: Math.min(10000, cropWidth),
          height: Math.min(10000, cropHeight),
          appliedCrop: cropRect,
          rotation: 0,
          flipX: false,
          flipY: false,
        } : item))
        setRotation(0)
        setFlipX(false)
        setFlipY(false)
        setNotice(`已套用自由裁切：${cropWidth} × ${cropHeight} px。`)
      }, 'image/png')
    }
    image.src = cropSourceUrl
  }

  const cancelCrop = () => {
    if (cropSourceUrl && cropSourceUrl !== originalUrl) URL.revokeObjectURL(cropSourceUrl)
    setCropSourceUrl(originalUrl)
    setCropSourceSize(originalSize)
    setCropMode(false)
    setCropRect(appliedCrop)
  }

  const restoreOriginal = () => {
    if (!originalUrl) return
    if (imageUrl !== originalUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(originalUrl)
    setNaturalSize(originalSize)
    setWidth(Math.min(10000, originalSize.width))
    setHeight(Math.min(10000, originalSize.height))
    setCropMode(false)
    setCropRect(fullCrop)
    setAppliedCrop(fullCrop)
    setCropSourceUrl(originalUrl)
    setCropSourceSize(originalSize)
    setImages((items) => items.map((item) => item.id === activeId ? {
      ...item,
      imageUrl: originalUrl,
      naturalSize: originalSize,
      width: Math.min(10000, originalSize.width),
      height: Math.min(10000, originalSize.height),
      appliedCrop: fullCrop,
    } : item))
    resetTransform()
    setNotice('已回復為原始圖片。')
  }

  const removeImage = () => {
    const activeIndex = images.findIndex((item) => item.id === activeId)
    const remaining = images.filter((item) => item.id !== activeId)
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    if (imageUrl && imageUrl !== originalUrl) URL.revokeObjectURL(imageUrl)
    setImages(remaining)
    const next = remaining[Math.min(activeIndex, remaining.length - 1)]
    if (next) {
      hydrateImage(next)
      setNotice('圖片已關閉，已切換至下一張。')
    } else {
      setActiveId('')
      setImageUrl('')
      setOriginalUrl('')
      setFileName('')
      setNaturalSize({ width: 0, height: 0 })
      setOriginalSize({ width: 0, height: 0 })
      setCropMode(false)
      setCropRect(fullCrop)
      setAppliedCrop(fullCrop)
      setCropSourceUrl('')
      setCropSourceSize({ width: 0, height: 0 })
      setNotice('所有圖片已關閉。')
    }
  }

  const closeImage = (id: string) => {
    if (id === activeId) {
      removeImage()
      return
    }
    const target = images.find((item) => item.id === id)
    if (!target) return
    URL.revokeObjectURL(target.originalUrl)
    if (target.imageUrl !== target.originalUrl) URL.revokeObjectURL(target.imageUrl)
    setImages((items) => items.filter((item) => item.id !== id))
    setNotice(`已關閉 ${target.fileName}。`)
  }

  const applyPreset = (preset: Preset) => {
    setWidth(preset.width)
    setHeight(preset.height)
    setNotice(`已套用 ${preset.name} 尺寸。`)
  }

  const updateWidth = (next: number) => {
    next = Math.min(10000, Math.max(1, next || 1))
    setWidth(next)
    if (locked && width > 0) setHeight(Math.min(10000, Math.max(1, Math.round(height * (next / width)))))
  }

  const updateHeight = (next: number) => {
    next = Math.min(10000, Math.max(1, next || 1))
    setHeight(next)
    if (locked && height > 0) setWidth(Math.min(10000, Math.max(1, Math.round(width * (next / height)))))
  }

  const exportImage = () => {
    if (!imageUrl) {
      setNotice('請先上傳一張圖片。')
      return
    }
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
      }
      const swapped = Math.abs(rotation % 180) === 90
      const visualWidth = swapped ? image.naturalHeight : image.naturalWidth
      const visualHeight = swapped ? image.naturalWidth : image.naturalHeight
      const coverScale = Math.max(width / visualWidth, height / visualHeight)
      const scale = coverScale * (zoom / 100)
      const limitX = Math.max(0, (visualWidth * scale - width) / 2)
      const limitY = Math.max(0, (visualHeight * scale - height) / 2)
      ctx.translate(width / 2 + clamp(offsetX, -limitX, limitX), height / 2 + clamp(offsetY, -limitY, limitY))
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale)
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      const extension = format.split('/')[1].replace('jpeg', 'jpg')
      const link = document.createElement('a')
      link.download = `${fileName.replace(/\.[^/.]+$/, '') || 'pmkt-image'}-${width}x${height}.${extension}`
      link.href = canvas.toDataURL(format, quality / 100)
      link.click()
      setNotice('圖片已匯出並開始下載。')
    }
    image.src = imageUrl
  }

  const aspectRatio = `${width} / ${height}`
  const panLimits = computePanLimits(naturalSize, width, height, zoom, rotation)
  const positionLimitX = Math.round(panLimits.limitX)
  const positionLimitY = Math.round(panLimits.limitY)
  const safeOffsetX = clamp(offsetX, -positionLimitX, positionLimitX)
  const safeOffsetY = clamp(offsetY, -positionLimitY, positionLimitY)
  const previewOffsetX = width ? (safeOffsetX / width) * 100 : 0
  const previewOffsetY = height ? (safeOffsetY / height) * 100 : 0
  const transform = `translate(calc(-50% + ${previewOffsetX}%), calc(-50% + ${previewOffsetY}%)) rotate(${rotation}deg) scale(${(zoom / 100) * (flipX ? -1 : 1)}, ${(zoom / 100) * (flipY ? -1 : 1)})`

  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor">跳至圖片編輯區</a>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Maximize2 /></div>
          <div>
            <strong>PMKT Image Studio</strong>
            <span>圖片裁切與尺寸最佳化</span>
          </div>
        </div>
        <div className="privacy-badge"><ShieldCheck aria-hidden="true" /> 圖片只在本機處理</div>
        <button className="primary-button top-export" onClick={exportImage}><Download aria-hidden="true" /> 匯出圖片</button>
      </header>

      <main id="editor" className="workspace">
        <aside className="sidebar left-panel" aria-label="尺寸預設">
          <section className="image-library">
            <div className="section-heading library-heading">
              <div><span className="eyebrow">工作階段</span><h2>照片清單 <span className="count-badge">{images.length}</span></h2></div>
              <button className="icon-button add-image" aria-label="加入更多照片" onClick={() => inputRef.current?.click()}><ImagePlus /></button>
            </div>
            {images.length ? (
              <div className="image-list">
                {images.map((item) => (
                  <div className={item.id === activeId ? 'image-item active' : 'image-item'} key={item.id}>
                    <button className="image-select" onClick={() => switchImage(item.id)} aria-label={`切換至 ${item.fileName}`}>
                      <img src={item.imageUrl} alt="" />
                      <span><strong>{item.fileName}</strong><small>{item.naturalSize.width} × {item.naturalSize.height} px</small></span>
                    </button>
                    <button className="image-close" aria-label={`關閉 ${item.fileName}`} onClick={() => closeImage(item.id)}><X /></button>
                  </div>
                ))}
              </div>
            ) : (
              <button className="library-empty" onClick={() => inputRef.current?.click()}><ImagePlus aria-hidden="true" /><span>加入照片開始處理</span></button>
            )}
          </section>
          <section>
            <div className="section-heading">
              <div><span className="eyebrow">快速開始</span><h2>行銷尺寸</h2></div>
              <Sparkles aria-hidden="true" />
            </div>
            <div className="preset-list">
              {presets.map((preset) => (
                <button className={width === preset.width && height === preset.height ? 'preset active' : 'preset'} key={preset.name} onClick={() => applyPreset(preset)}>
                  <span><strong>{preset.name}</strong><small>{preset.width} × {preset.height} px</small></span>
                  <span className="ratio">{preset.detail}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="tip-card">
            <WandSparkles aria-hidden="true" />
            <div><strong>PMKT 小提示</strong><p>選擇平台尺寸後，圖片會自動填滿裁切範圍。</p></div>
          </section>
        </aside>

        <section className="canvas-area" aria-label="圖片預覽與裁切">
          <div className="canvas-toolbar">
            <div className="file-info">
              <span className="status-dot" aria-hidden="true"></span>
              <div><strong>{fileName || '尚未選擇圖片'}</strong><span>{naturalSize.width ? `${naturalSize.width} × ${naturalSize.height} px` : '支援 JPG、PNG、WebP'}</span></div>
            </div>
            <div className="canvas-actions">
              <button className="secondary-button add-more-button" onClick={() => inputRef.current?.click()}><ImagePlus aria-hidden="true" />加入照片</button>
              {imageUrl && <button className="icon-button danger" aria-label="關閉目前照片" onClick={removeImage}><Trash2 /></button>}
            </div>
          </div>

          <div className={`canvas-stage ${cropMode ? 'crop-mode' : ''}`}>
            {cropMode && imageUrl ? (
              <div className="free-crop-shell">
                <div className="crop-instruction"><Crop aria-hidden="true" />拖曳框內移動，拉動控制點調整大小</div>
                <div
                  ref={cropSurfaceRef}
                  className="free-crop-surface"
                  style={{
                    aspectRatio: `${cropSourceSize.width} / ${cropSourceSize.height}`,
                    width: `min(100%, calc(58vh * ${cropSourceSize.width / cropSourceSize.height}))`,
                  }}
                >
                  <img src={cropSourceUrl} alt="自由裁切完整原圖預覽" draggable="false" />
                  <div className="crop-shade shade-top" style={{ height: `${cropRect.y * 100}%` }} />
                  <div className="crop-shade shade-left" style={{ top: `${cropRect.y * 100}%`, width: `${cropRect.x * 100}%`, height: `${cropRect.height * 100}%` }} />
                  <div className="crop-shade shade-right" style={{ top: `${cropRect.y * 100}%`, left: `${(cropRect.x + cropRect.width) * 100}%`, height: `${cropRect.height * 100}%` }} />
                  <div className="crop-shade shade-bottom" style={{ top: `${(cropRect.y + cropRect.height) * 100}%` }} />
                  <div
                    className="free-crop-box"
                    style={{ left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.width * 100}%`, height: `${cropRect.height * 100}%` }}
                    onPointerDown={(event) => startCropInteraction(event, 'move')}
                  >
                    <div className="crop-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                    <div className="crop-size">{Math.round(cropSourceSize.width * cropRect.width)} × {Math.round(cropSourceSize.height * cropRect.height)} px</div>
                    {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as CropHandle[]).map((handle) => (
                      <button key={handle} className={`crop-handle handle-${handle}`} aria-label={`調整裁切範圍 ${handle}`} onPointerDown={(event) => startCropInteraction(event, handle)} />
                    ))}
                  </div>
                </div>
                <div className="crop-actions">
                  <button className="secondary-button" onClick={cancelCrop}>取消</button>
                  <button className="primary-button" onClick={applyCrop}><Check aria-hidden="true" />套用裁切</button>
                </div>
              </div>
            ) : (
            <div
              ref={cropBoardRef}
              className={`crop-board ${dragging ? 'dragging' : ''} ${imageUrl ? 'pannable' : ''} ${panInteraction ? 'panning' : ''}`}
              style={{ aspectRatio }}
              onPointerDown={startPanInteraction}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); loadFiles(event.dataTransfer.files) }}
            >
              {imageUrl ? (
                <>
                  <img className="preview-image" src={imageUrl} alt="目前裁切圖片預覽" style={{ transform }} />
                  <div className="crop-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                  <div className="size-pill">{width} × {height}</div>
                </>
              ) : (
                <button className="upload-prompt" onClick={() => inputRef.current?.click()}>
                  <span className="upload-icon"><ImagePlus aria-hidden="true" /></span>
                  <strong>拖曳圖片到這裡</strong>
                  <span>或點擊選擇圖片開始處理</span>
                  <span className="upload-action"><Upload aria-hidden="true" /> 選擇圖片</span>
                </button>
              )}
            </div>
            )}
          </div>

          <div className="bottom-toolbar" aria-label="圖片變形工具">
            <button onClick={beginCrop} disabled={!imageUrl || cropMode} className={cropMode ? 'selected' : ''}><Crop aria-hidden="true" />自由裁切</button>
            <button disabled={cropMode} onClick={() => setRotation((rotation - 90) % 360)}><RotateCcw aria-hidden="true" />向左旋轉</button>
            <button disabled={cropMode} onClick={() => setRotation((rotation + 90) % 360)}><RotateCw aria-hidden="true" />向右旋轉</button>
            <button disabled={cropMode} onClick={() => setFlipX(!flipX)} className={flipX ? 'selected' : ''}><FlipHorizontal2 aria-hidden="true" />水平翻轉</button>
            <button disabled={cropMode} onClick={() => setFlipY(!flipY)} className={flipY ? 'selected' : ''}><FlipVertical2 aria-hidden="true" />垂直翻轉</button>
            <button disabled={cropMode} onClick={resetTransform}><X aria-hidden="true" />重設</button>
            {imageUrl && imageUrl !== originalUrl && <button onClick={restoreOriginal}><RotateCcw aria-hidden="true" />回復原圖</button>}
          </div>
        </section>

        <aside className="sidebar right-panel" aria-label="圖片設定">
          <section>
            <div className="section-heading"><div><span className="eyebrow">精準調整</span><h2>圖片設定</h2></div></div>
            <div className="form-group">
              <div className="label-row"><div className="form-label">輸出尺寸</div><button className={locked ? 'lock-button active' : 'lock-button'} onClick={() => setLocked(!locked)} aria-label="鎖定長寬比例"><Lock /></button></div>
              <div className="dimension-row">
                <div><label htmlFor="width">寬度</label><input id="width" type="number" min="1" max="10000" value={width} onChange={(event) => updateWidth(Number(event.target.value))} /><small>px</small></div>
                <ArrowLeftRight aria-hidden="true" />
                <div><label htmlFor="height">高度</label><input id="height" type="number" min="1" max="10000" value={height} onChange={(event) => updateHeight(Number(event.target.value))} /><small>px</small></div>
              </div>
            </div>
            <RangeControl id="zoom" label="圖片縮放" value={zoom} min={1} max={250} suffix="%" onChange={setZoom} />
            <RangeControl id="position-x" label="水平位置" value={safeOffsetX} min={-positionLimitX} max={positionLimitX} suffix=" px" onChange={setOffsetX} hint="此方向已填滿，放大「圖片縮放」即可左右微調。" />
            <RangeControl id="position-y" label="垂直位置" value={safeOffsetY} min={-positionLimitY} max={positionLimitY} suffix=" px" onChange={setOffsetY} hint="此方向已填滿，放大「圖片縮放」即可上下微調。" />
          </section>

          <section className="export-settings">
            <h2>匯出設定</h2>
            <label htmlFor="format">圖片格式</label>
            <div className="select-wrap"><select id="format" value={format} onChange={(event) => setFormat(event.target.value as Format)}>{formats.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown aria-hidden="true" /></div>
            {format !== 'image/png' && <RangeControl id="quality" label="圖片品質" value={quality} min={20} max={100} suffix="%" onChange={setQuality} />}
            <button className="primary-button full-button" onClick={exportImage}><Download aria-hidden="true" /> 匯出 {width} × {height}</button>
          </section>
        </aside>
      </main>

      <footer className="app-footer">
        <span className="signature">CMD - Rain Lin</span>
      </footer>

      <input ref={inputRef} className="visually-hidden" aria-label="上傳圖片" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { loadFiles(event.target.files || undefined); event.target.value = '' }} />
      {notice && <div className="toast" role="status"><Check aria-hidden="true" />{notice}<button aria-label="關閉通知" onClick={() => setNotice('')}><X /></button></div>}
    </div>
  )
}

function RangeControl({ id, label, value, min, max, suffix, onChange, hint }: { id: string; label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void; hint?: string }) {
  const locked = min === max
  return (
    <div className="form-group range-group">
      <div className="label-row"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}{suffix}</output></div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={locked} />
      {hint && locked && <small className="range-hint">{hint}</small>}
    </div>
  )
}

function createOrientedImage(url: string, size: { width: number; height: number }, rotation: number, flipX: boolean, flipY: boolean) {
  return new Promise<{ url: string; size: { width: number; height: number } }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const swapped = rotation === 90 || rotation === 270
      const orientedSize = swapped ? { width: size.height, height: size.width } : size
      const canvas = document.createElement('canvas')
      canvas.width = orientedSize.width
      canvas.height = orientedSize.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas unavailable'))
        return
      }
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('image transform failed'))
          return
        }
        resolve({ url: URL.createObjectURL(blob), size: orientedSize })
      }, 'image/png')
    }
    image.onerror = () => reject(new Error('image load failed'))
    image.src = url
  })
}

function transformCropRect(rect: CropRect, rotation: number, flipX: boolean, flipY: boolean): CropRect {
  const next = { ...rect }
  if (flipX) next.x = 1 - next.x - next.width
  if (flipY) next.y = 1 - next.y - next.height
  if (rotation === 90) return { x: 1 - next.y - next.height, y: next.x, width: next.height, height: next.width }
  if (rotation === 180) return { x: 1 - next.x - next.width, y: 1 - next.y - next.height, width: next.width, height: next.height }
  if (rotation === 270) return { x: next.y, y: 1 - next.x - next.width, width: next.height, height: next.width }
  return next
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360
}

function resizeCrop(rect: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  const min = 0.08
  if (handle === 'move') {
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
    }
  }

  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  if (handle.includes('w')) left = clamp(rect.x + dx, 0, right - min)
  if (handle.includes('e')) right = clamp(rect.x + rect.width + dx, left + min, 1)
  if (handle.includes('n')) top = clamp(rect.y + dy, 0, bottom - min)
  if (handle.includes('s')) bottom = clamp(rect.y + rect.height + dy, top + min, 1)

  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// 計算「不露白」的最大平移量（輸出像素）：圖片以 cover 填滿輸出框並套用縮放後，
// 邊緣最多只能拖到貼齊框邊。cover 正好貼齊的那一軸餘量為 0，需放大縮放才有移動空間。
function computePanLimits(
  natural: { width: number; height: number },
  width: number,
  height: number,
  zoom: number,
  rotation: number,
) {
  if (!natural.width || !natural.height || !width || !height) return { limitX: 0, limitY: 0 }
  const swapped = Math.abs(rotation % 180) === 90
  const visualWidth = swapped ? natural.height : natural.width
  const visualHeight = swapped ? natural.width : natural.height
  const coverScale = Math.max(width / visualWidth, height / visualHeight)
  const scale = coverScale * (zoom / 100)
  return {
    limitX: Math.max(0, (visualWidth * scale - width) / 2),
    limitY: Math.max(0, (visualHeight * scale - height) / 2),
  }
}

export default App
