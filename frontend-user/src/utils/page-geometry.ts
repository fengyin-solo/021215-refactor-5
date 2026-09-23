/**
 * 页面坐标换算 —— 全应用唯一的尺寸/坐标换算口径
 *
 * 背景：缩放比、页面高度、文字层与高亮矩形之间的换算原先分别写在
 * PdfViewer.vue（页面尺寸、搜索跳转、适合宽度、手造 viewport）与
 * pdf-engine.ts（高亮矩形绘制、基础尺寸预计算）中，改一处需要手工同步多处。
 *
 * 本模块统一收口所有换算：
 *  - PDF 单位 → CSS 像素：pdfToCssPixels（即 PDF 单位 × 当前 scale）
 *  - 页面基础尺寸预计算：loadPageBaseDims（页面尺寸的唯一数据来源）
 *  - 页面缩放后尺寸：scalePageDims
 *  - 高亮矩形绘制参数：fragmentToHighlightRect（与搜索跳转共用同一缩放口径）
 *  - 搜索跳转纵向定位：pdfYToPageOffset
 *  - 适合宽度缩放比：fitWidthScale
 *
 * 整个 viewer 固定 rotation = 0，以上换算均为线性缩放，不涉及旋转/翻转；
 * 后续若要调整对齐口径，只需修改本文件。
 */
import type { PdfjsDocument } from './pdf-engine'

/** 页面基础尺寸（PDF 单位，即 scale = 1 时的 viewport 尺寸） */
export interface PageBaseDims {
  baseWidth: number
  baseHeight: number
}

/** 页面在当前缩放比下的 CSS 像素尺寸 */
export interface PageDims {
  width: number
  height: number
}

/** 高亮层绘制所需的页面尺寸信息（统一按预计算的基础尺寸取值） */
export interface HighlightDrawInfo extends PageDims {
  scale: number
}

/** 单个高亮矩形的 CSS 像素绘制参数 */
export interface HighlightRect {
  /** CSS transform: matrix(a,b,c,d,e,f) 的六个分量 */
  matrix: number[]
  width: number
  height: number
}

/**
 * PDF 单位长度 → CSS 像素长度。
 * 所有缩放换算的唯一入口，禁止在本模块之外再手写 `value * scale`。
 */
export function pdfToCssPixels(value: number, scale: number): number {
  return value * scale
}

/** 按当前缩放比计算单页 CSS 像素尺寸（基础尺寸 × scale） */
export function scalePageDims(base: PageBaseDims, scale: number): PageDims {
  return {
    width: pdfToCssPixels(base.baseWidth, scale),
    height: pdfToCssPixels(base.baseHeight, scale),
  }
}

/**
 * 搜索匹配片段（PDF 单位的 transform/宽高）→ 高亮矩形绘制参数（CSS 像素）。
 * buildHighlightLayer 与搜索跳转滚动定位都通过这里的口径换算，
 * 保证缩放后高亮矩形与跳转位置保持一致。
 */
export function fragmentToHighlightRect(
  fragment: { transform: readonly number[]; width: number; height: number },
  scale: number,
): HighlightRect {
  const [scaleX, skewX, skewY, scaleY, translateX, translateY] = fragment.transform
  return {
    matrix: [
      pdfToCssPixels(scaleX, scale),
      pdfToCssPixels(skewX, scale),
      pdfToCssPixels(skewY, scale),
      pdfToCssPixels(scaleY, scale),
      pdfToCssPixels(translateX, scale),
      pdfToCssPixels(translateY, scale),
    ],
    width: pdfToCssPixels(fragment.width, scale),
    height: pdfToCssPixels(fragment.height, scale),
  }
}

/**
 * 匹配项基线的纵向坐标（PDF 单位）→ 页内纵向偏移（CSS 像素），
 * 供搜索跳转滚动定位使用，与高亮矩形绘制共用 pdfToCssPixels 口径。
 */
export function pdfYToPageOffset(y: number, scale: number): number {
  return pdfToCssPixels(y, scale)
}

/** 容器内容宽度 / 页面基础宽度 → 适合宽度的缩放比（保留两位小数，与缩放按钮口径一致） */
export function fitWidthScale(containerContentWidth: number, baseWidth: number): number {
  return +(containerContentWidth / baseWidth).toFixed(2)
}

/**
 * 预计算所有页面的基础尺寸（scale = 1）。
 * 逐页获取 viewport，正确处理混合页面大小（纵向/横向/不同尺寸），
 * 是 viewer 中所有页面尺寸的唯一数据来源。
 * 并发分批（每批 10 页），大文档下不会一次性发起过多 getPage 请求。
 */
export async function loadPageBaseDims(
  doc: PdfjsDocument,
): Promise<Map<number, PageBaseDims>> {
  const result = new Map<number, PageBaseDims>()
  const batchSize = 10
  for (let start = 1; start <= doc.numPages; start += batchSize) {
    const end = Math.min(start + batchSize - 1, doc.numPages)
    const promises: Promise<void>[] = []
    for (let i = start; i <= end; i++) {
      promises.push(
        doc.getPage(i).then((page) => {
          const vp = page.getViewport({ scale: 1 })
          result.set(i, { baseWidth: vp.width, baseHeight: vp.height })
        }),
      )
    }
    await Promise.all(promises)
  }
  return result
}
