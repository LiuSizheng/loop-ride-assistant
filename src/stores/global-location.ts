import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 全局位置模拟 Store
 *
 * 用法：
 *   store.isActive             — 是否激活
 *   store.lat / store.lng      — 模拟坐标（GCJ-02）
 *   store.setLocation(lat, lng) — 设置模拟位置
 *   store.reset()              — 恢复真实 GPS
 */
export const useGlobalLocation = defineStore('global-location', () => {
  const lat = ref<number | null>(null)
  const lng = ref<number | null>(null)

  const isActive = computed(() => lat.value !== null && lng.value !== null)

  function setLocation(newLat: number, newLng: number) {
    lat.value = newLat
    lng.value = newLng
  }

  function reset() {
    lat.value = null
    lng.value = null
  }

  return { lat, lng, isActive, setLocation, reset }
})
