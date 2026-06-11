import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'
import { useScheduleStore } from '@/stores/schedule'
import type { DateType } from '@/types'

export interface TimeSegment {
  from: string
  to: string
  seconds: number
}

export interface Measurement {
  id: number
  user_id: string
  route: string
  shift: string
  depart_time: string
  vehicle_no?: string
  driver?: string
  date: string
  segments: TimeSegment[]
  created_at: string
}

export const useUploadStore = defineStore('upload', () => {
  const nickname = ref(localStorage.getItem('bus_nickname') || '')
  const uploading = ref(false)
  const submitResult = ref<'success' | 'error' | null>(null)
  const history = ref<Measurement[]>([])
  const loadingHistory = ref(false)

  // 计时状态
  const startTime = ref<number | null>(null)        // 上一站出发时间 (Date.now())
  const recordedSegments = ref<TimeSegment[]>([])     // 已记录的区间
  const currentFromStop = ref<string>('')             // 当前"出发站"
  const segmentSeconds = ref<number[]>([])             // 每段已记录的秒数（用于显示）
  const timingActive = ref(false)

  function saveNickname(name: string) {
    nickname.value = name
    localStorage.setItem('bus_nickname', name)
  }

  const scheduleStore = useScheduleStore()

  /** 获取当前线路的站点序列 */
  function getStopsForRoute(route: string): string[] {
    const rp = scheduleStore.routePatterns.find(p => p.route === route)
    if (!rp) return []
    // 取对应 routeKey 的 stops，HX1 用 NORMAL，HX2/HX3 同理
    return rp.stops.map(s => s.currentStop)
  }

  /** 开始新的一次记录 */
  function startRecording(route: string) {
    recordedSegments.value = []
    segmentSeconds.value = []
    timingActive.value = true
    const stops = getStopsForRoute(route)
    currentFromStop.value = stops[0] || ''
    startTime.value = Date.now()
  }

  /** 在指定站点上车，开始计时 */
  function startRecordingAt(stopName: string, allStops: string[]) {
    recordedSegments.value = []
    segmentSeconds.value = []
    timingActive.value = true
    currentFromStop.value = stopName
    startTime.value = Date.now()
  }

  /** 按下[计时]按钮：记录从 currentFromStop 到 targetStop 的时间 */
  function recordSegment(toStop: string) {
    if (!startTime.value || !timingActive.value) return
    const elapsed = Math.round((Date.now() - startTime.value) / 1000)
    const seg: TimeSegment = {
      from: currentFromStop.value,
      to: toStop,
      seconds: elapsed,
    }
    recordedSegments.value.push(seg)
    segmentSeconds.value.push(elapsed)
    currentFromStop.value = toStop
    startTime.value = Date.now()  // 下一段开始计时
  }

  /** 重置计时状态 */
  function resetRecording() {
    startTime.value = null
    recordedSegments.value = []
    segmentSeconds.value = []
    currentFromStop.value = ''
    timingActive.value = false
  }

  /** 提交记录到 Supabase */
  async function submit(params: {
    route: string
    shift: string
    departTime: string
    vehicleNo?: string
    driver?: string
    date: string
  }): Promise<boolean> {
    if (!nickname.value || recordedSegments.value.length === 0) return false
    uploading.value = true
    submitResult.value = null

    try {
      const { error } = await supabase.from('measurements').insert({
        user_id: nickname.value,
        route: params.route,
        shift: params.shift,
        depart_time: params.departTime,
        vehicle_no: params.vehicleNo || null,
        driver: params.driver || null,
        date: params.date,
        segments: recordedSegments.value,
      })
      if (error) throw error
      submitResult.value = 'success'
      resetRecording()
      await loadHistory()
      return true
    } catch (e) {
      console.error('Upload failed:', e)
      submitResult.value = 'error'
      return false
    } finally {
      uploading.value = false
    }
  }

  /** 加载我的历史记录 */
  async function loadHistory() {
    if (!nickname.value) return
    loadingHistory.value = true
    try {
      const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('user_id', nickname.value)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      history.value = (data || []) as Measurement[]
    } catch (e) {
      console.error('Load history failed:', e)
    } finally {
      loadingHistory.value = false
    }
  }

  /** 删除一条记录 */
  async function deleteRecord(id: number) {
    try {
      const { error } = await supabase
        .from('measurements')
        .delete()
        .eq('id', id)
      if (error) throw error
      history.value = history.value.filter(r => r.id !== id)
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  return {
    nickname,
    saveNickname,
    uploading,
    submitResult,
    history,
    loadingHistory,
    startTime,
    recordedSegments,
    currentFromStop,
    segmentSeconds,
    timingActive,
    startRecording,
    startRecordingAt,
    recordSegment,
    resetRecording,
    submit,
    loadHistory,
    deleteRecord,
  }
})
