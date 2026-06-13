import { useGlobalTime } from '@/stores/global-time'

/**
 * 返回当前时间（模拟或真实）
 *
 * 全站统一入口：所有 `new Date()` 都应替换为此调用。
 * 在非组件上下文中需要先获取 store 实例：
 *   const store = useGlobalTime()
 *   const now = store.getNow()
 * 在 Pinia setup stores 中可直接调用。
 */
export function getNow(): Date {
  // 尝试获取 store；若 Pinia 尚未初始化则回退到真实时间
  try {
    const store = useGlobalTime()
    return store.getNow()
  } catch {
    return new Date()
  }
}
