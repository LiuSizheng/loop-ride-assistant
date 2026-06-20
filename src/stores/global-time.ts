import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 全局时间模拟 Store
 * 类似 Chrome DevTools Sensors 面板的时间覆写
 *
 * 用法：
 *   store.getNow()           — 返回模拟时间或真实时间
 *   store.set('2026-06-15T08:00')  — 设置模拟日期时间
 *   store.setPreset(7, 30)   — 快捷设置：今天 07:30
 *   store.reset()            — 恢复真实时间
 */
export const useGlobalTime = defineStore('global-time', () => {
  // 模拟基准：{ realNow, targetSimulated }
  const simBase = ref<{ real: number; target: number } | null>(null)

  /** 返回当前应使用的 Date（模拟或真实） */
  function getNow(): Date {
    if (simBase.value === null) return new Date()
    const elapsed = Date.now() - simBase.value.real
    return new Date(simBase.value.target + elapsed)
  }

  /** 设置模拟日期时间（ISO 字符串，如 "2026-06-15T08:00"） */
  function setSimulated(isoString: string): void {
    simBase.value = {
      real: Date.now(),
      target: new Date(isoString).getTime(),
    }
  }

  /** 快捷设置：当前模拟日期（或真实日期）+ 指定时分 */
  function setPreset(hour: number, minute: number): void {
    const base = simBase.value ? new Date(simBase.value.target) : new Date()
    base.setHours(hour, minute, 0, 0)
    simBase.value = { real: Date.now(), target: base.getTime() }
  }

  /** 设置完整日期（年月日 + 时分） */
  function setDateTime(year: number, month: number, day: number, hour: number, minute: number): void {
    simBase.value = {
      real: Date.now(),
      target: new Date(year, month - 1, day, hour, minute).getTime(),
    }
  }

  /** 恢复真实时间 */
  function reset(): void {
    simBase.value = null
  }

  const isActive = computed(() => simBase.value !== null)

  return {
    simBase,
    isActive,
    getNow,
    setSimulated,
    setPreset,
    setDateTime,
    reset,
  }
})
