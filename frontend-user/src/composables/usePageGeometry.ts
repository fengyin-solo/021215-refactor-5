/**
 * 页面尺寸状态 —— 页面基础尺寸与当前缩放下像素尺寸的唯一持有者。
 *
 * 预计算结果（scale=1）存于 pageBaseDims；getPageStyle 驱动模板用的
 * pageDimensions 始终由 pageBaseDims 经 page-geometry 的统一换算生成，
 * 不再接受渲染后用真实 viewport 二次回填（rotation=0 时两者数值完全相同）。
 */
import { reactive, shallowReactive } from 'vue'
import type { PdfjsDocument } from '@/utils/pdf-engine'
import {
  loadPageBaseDims,
  scalePageDims,
  type PageBaseDims,
  type PageDims,
} from '@/utils/page-geometry'

export function usePageGeometry() {
  /** 每页基础尺寸（scale=1），reactive(Map) 保证 set/delete 触发视图更新 */
  const pageBaseDims = reactive(new Map<number, PageBaseDims>())

  /** 每页当前缩放比下的实际像素尺寸；getPageStyle() 依赖它驱动 .pdf-page 宽高 */
  const pageDimensions = shallowReactive(new Map<number, PageDims>())

  /** 清空所有已缓存的尺寸（切换文档时调用） */
  function clearPageDims() {
    pageBaseDims.clear()
    pageDimensions.clear()
  }

  /**
   * 预计算全部页面的基础尺寸，并按当前缩放比生成像素尺寸。
   * 大文档沿用分批并发策略，表现与原实现一致。
   */
  async function precompute(doc: PdfjsDocument, scale: number) {
    const baseDims = await loadPageBaseDims(doc)
    pageBaseDims.clear()
    pageDimensions.clear()
    for (const [n, dim] of baseDims) {
      pageBaseDims.set(n, dim)
      pageDimensions.set(n, scalePageDims(dim, scale))
    }
  }

  /** 缩放变化后，依据同一份基础尺寸重新计算所有页面像素尺寸 */
  function recompute(scale: number) {
    pageDimensions.clear()
    for (const [n, base] of pageBaseDims) {
      pageDimensions.set(n, scalePageDims(base, scale))
    }
  }

  function getBaseDims(pageNum: number): PageBaseDims | undefined {
    return pageBaseDims.get(pageNum)
  }

  function getScaledDims(pageNum: number): PageDims | undefined {
    return pageDimensions.get(pageNum)
  }

  return {
    pageDimensions,
    clearPageDims,
    precompute,
    recompute,
    getBaseDims,
    getScaledDims,
  }
}
