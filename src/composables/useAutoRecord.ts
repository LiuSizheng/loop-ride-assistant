import { onMounted, onUnmounted, watch } from 'vue'
import { useAutoRecordStore } from '@/stores/autoRecord'
import { useMapStore } from '@/stores/map'

export function useAutoRecord() {
  const autoStore = useAutoRecordStore()
  const mapStore = useMapStore()

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  let wakeLock: any = null
  let gpsWatchStop: (() => void) | null = null
  let lastProcessedTs = 0

  // ---- 1 秒 tick ----
  function startTick() {
    if (tickTimer) return
    tickTimer = setInterval(() => {
      autoStore.tick()
      // 检查离开路线倒计时
      const leaveSince = autoStore.leaveOutOfRangeSince
      if (leaveSince !== null && autoStore.sessionState === 'active') {
        if (Date.now() - leaveSince >= 10000) {
          autoStore.autoLeave()
        }
      }
    }, 1000)
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
  }

  // ---- GPS 监听 ----
  function startGpsWatch() {
    gpsWatchStop = watch(
      () => [mapStore.userLat, mapStore.userLng] as const,
      ([lat, lng]) => {
        if (lat === null || lng === null) return
        if (autoStore.sessionState !== 'active') return
        const now = Date.now()
        if (now - lastProcessedTs < 1000) return // 每秒最多一次
        lastProcessedTs = now
        autoStore.processGpsUpdate(lat, lng, now)
      },
      { immediate: true }
    )
  }

  function stopGpsWatch() {
    if (gpsWatchStop) { gpsWatchStop(); gpsWatchStop = null }
  }

  // ---- wakeLock ----
  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen')
        wakeLock?.addEventListener('release', () => {
          // OS 释放了 wakeLock（如省电模式）→ 暂停
          if (autoStore.sessionState === 'active') {
            autoStore.pauseSession()
          }
        })
      }
    } catch {
      // wakeLock 不可用，忽略
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null }
    } catch { /* ignore */ }
  }

  // ---- visibilitychange ----
  function onVisibilityChange() {
    if (document.hidden) {
      if (autoStore.sessionState === 'active') {
        autoStore.pauseSession()
        releaseWakeLock()
      }
    }
    // 回到前台不自动恢复，用户需手动点"继续记录"
  }

  // ---- 开始 ----
  function startRecording(route: string) {
    autoStore.startSession(route)
    if (autoStore.sessionState === 'active') {
      acquireWakeLock()
      startTick()
      startGpsWatch()
    }
  }

  // ---- 恢复 ----
  function resumeRecording() {
    autoStore.resumeSession()
    if (autoStore.sessionState === 'active') {
      acquireWakeLock()
      startGpsWatch()
      lastProcessedTs = 0 // 重置节流
    }
  }

  // ---- 手动结束 ----
  function stopRecording() {
    stopGpsWatch()
    stopTick()
    releaseWakeLock()
    autoStore.manualLeave()
  }

  // ---- 取消 ----
  function cancelRecording() {
    stopGpsWatch()
    stopTick()
    releaseWakeLock()
    autoStore.reset()
  }

  // ---- 生命周期 ----
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stopGpsWatch()
    stopTick()
    releaseWakeLock()
  })

  return {
    startRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  }
}
