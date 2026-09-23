/**
 * 页面坐标几何 — 缩放与坐标换算的唯一来源
 *
 * scale=1 的页面基础尺寸在文档加载后只预计算一次；页面 CSS 尺寸、
 * 搜索跳转偏移、文字层 / 高亮矩形定位都依赖「基础尺寸 × 当前缩放」
 * 这同一组换算。此前这些乘法分散在 PdfViewer.vue 与 pdf-engine.ts
 * 多处，改一处就要手工同步其余几处。本模块把换算收拢到 PageGeometry：
 *
 * - 页面 CSS 像素尺寸：getScaledSize()
 * - 文字层 / 高亮层的统一绘制口径：getLayout()
 * - PDF 文本坐标（scale=1）→ 当前缩放像素：mapUnits() / mapTransform()
 * - 适合宽度缩放比：fitWidthScale()
 *
 * 纯数值计算，不持有 PDF.js 页面对象，大文档下不引入额外异步开销。
 */

/** 单页基础尺寸（PDF.js viewport scale=1 时的 CSS 像素） */
export interface PageBaseSize {
  baseWidth: number
  baseHeight: number
}

/** 单页在当前缩放下的像素尺寸 */
export interface PagePixelSize {
  width: number
  height: number
}

/**
 * 单页在当前缩放下的完整布局口径。
 * 页面尺寸、文字层、高亮矩形统一从此对象取值，保证缩放后互相对齐。
 */
export interface PageLayout extends PagePixelSize {
  /** 与 PDF.js 文字层一致的缩放比（相对 scale=1） */
  scale: number
  /** PDF 文本单位（scale=1 像素）→ 当前缩放像素 */
  mapUnits(value: number): number
  /**
   * PDF.js 文本 transform [a,b,c,d,e,f] → 当前缩放下的 CSS matrix 分量。
   * 口径与 PDF.js text layer 内部完全一致，高亮矩形据此与文字对齐。
   */
  mapTransform(transform: ArrayLike<number>): number[]
}

/**
 * 全部页面坐标换算的单一数据源。
 * 基础尺寸预计算后整份载入，当前缩放通过 setScale() 同步。
 */
export class PageGeometry {
  private readonly baseDims = new Map<number, PageBaseSize>()
  private currentScale: number

  constructor(initialScale = 1) {
    this.currentScale = initialScale
  }

  get scale(): number {
    return this.currentScale
  }

  setScale(value: number): void {
    this.currentScale = value
  }

  /** 载入预计算的基础尺寸（整份替换，保留当前缩放） */
  setBaseSizes(dims: Map<number, PageBaseSize>): void {
    this.baseDims.clear()
    for (const [n, dim] of dims) {
      this.baseDims.set(n, dim)
    }
  }

  clear(): void {
    this.baseDims.clear()
  }

  hasPage(pageNumber: number): boolean {
    return this.baseDims.has(pageNumber)
  }

  getBaseSize(pageNumber: number): PageBaseSize | undefined {
    return this.baseDims.get(pageNumber)
  }

  entries(): IterableIterator<[number, PageBaseSize]> {
    return this.baseDims.entries()
  }

  pageNumbers(): IterableIterator<number> {
    return this.baseDims.keys()
  }

  /** 当前缩放下的页面像素尺寸；页面尚未预计算时返回 undefined */
  getScaledSize(pageNumber: number): PagePixelSize | undefined {
    const base = this.baseDims.get(pageNumber)
    if (!base) return undefined
    const s = this.currentScale
    return { width: base.baseWidth * s, height: base.baseHeight * s }
  }

  /**
   * 当前缩放下的页面布局口径，供文字层 / 高亮层绘制使用；
   * 页面尚未预计算时返回 undefined。
   */
  getLayout(pageNumber: number): PageLayout | undefined {
    const size = this.getScaledSize(pageNumber)
    if (!size) return undefined
    const s = this.currentScale
    return {
      width: size.width,
      height: size.height,
      scale: s,
      mapUnits: (v) => v * s,
      mapTransform: (t) => [
        t[0] * s, t[1] * s, t[2] * s,
        t[3] * s, t[4] * s, t[5] * s,
      ],
    }
  }

  /** PDF 文本坐标（scale=1 像素）→ 当前缩放像素 */
  mapUnits(value: number): number {
    return value * this.currentScale
  }

  /**
   * 适合宽度：给定滚动容器 clientWidth 与两侧留白，
   * 计算指定页（默认第一页）撑满可用宽度所需的缩放比。
   * 页面尚未预计算时返回 undefined。
   */
  fitWidthScale(clientWidth: number, padding = 64, pageNumber = 1): number | undefined {
    const base = this.baseDims.get(pageNumber)
    if (!base) return undefined
    return (clientWidth - padding) / base.baseWidth
  }
}

/** 创建页面坐标几何实例（initialScale 应与初始缩放状态一致） */
export function createPageGeometry(initialScale = 1): PageGeometry {
  return new PageGeometry(initialScale)
}
