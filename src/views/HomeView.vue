<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNextBus } from '@/composables/useNextBus'
import { useGeolocation } from '@/composables/useGeolocation'
import { useWeather } from '@/composables/useWeather'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { formatDate, getDateType } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { findNearestStop } from '@/utils/geo'
import { getSecondsSinceMidnight } from '@/utils/datetime'
import { arrivalCountdown, departureCountdown } from '@/utils/countdown'
import RouteBadge from '@/components/common/RouteBadge.vue'
import ETAIndicator from '@/components/common/ETAIndicator.vue'
import BusStopTimeline from '@/components/common/BusStopTimeline.vue'

const router = useRouter()

const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
const { dateType, departingSoon, refresh } = useNextBus()
useGeolocation()
const { weather } = useWeather()

const todayDate = computed(() => formatDate())
const dateTypeLabel = computed(() => getDateLabel())
const isWeekday = computed(() => dateType.value === 'weekday')
const stopSearch = ref('')
const selectedStop = ref<string | null>(null)
const stopExpanded = ref(false)
const expandedBusId = ref<string | null>(null)
const nowTick = ref(0)  // 用于强制刷新
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight() })

// 站点点击频次
const clickFreq = ref<Record<string, number>>({})

onMounted(() => {
  try { clickFreq.value = JSON.parse(localStorage.getItem('stop_click_freq') || '{}') } catch { clickFreq.value = {} }
  setInterval(() => { refresh(); nowTick.value++ }, 1000)
})

function recordClick(stopName: string) {
  clickFreq.value[stopName] = (clickFreq.value[stopName] || 0) + 1
  try { localStorage.setItem('stop_click_freq', JSON.stringify(clickFreq.value)) } catch {}
}

// 按频次排序
const sortedStops = computed(() => {
  const stops = scheduleStore.stations.map(s => s.name)
  stops.sort((a, b) => (clickFreq.value[b] || 0) - (clickFreq.value[a] || 0))
  return stops
})
const collapsedStops = computed(() => sortedStops.value.slice(0, 6))
const filteredStops = computed(() => {
  if (!stopSearch.value) return []
  return sortedStops.value.filter(s => s.includes(stopSearch.value))
})
const freqTop3 = computed(() => sortedStops.value.slice(0, 3))

// 最近站点
const nearestStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  const result = findNearestStop(mapStore.userLat, mapStore.userLng, scheduleStore.stations)
  return result?.station ?? null
})
watch(nearestStop, (stop) => {
  if (stop && !selectedStop.value) { selectedStop.value = stop.name }
}, { immediate: true })

function selectStop(name: string) {
  if (selectedStop.value === name) {
    selectedStop.value = nearestStop.value?.name ?? null
    return
  }
  recordClick(name)
  selectedStop.value = name
  stopSearch.value = ''
}

// 展开/收起车次卡片
function toggleBusCard(key: string) {
  expandedBusId.value = expandedBusId.value === key ? null : key
}

// 跳转地图聚焦
function handleViewOnMap(departureId: string, routeKey: string) {
  router.push({ path: '/map', query: { route: routeKey, bus: departureId } })
}

// 当前选中站点作为目的地的车次推荐
const stopArrivals = computed(() => {
  if (!selectedStop.value) return []
  const destStop = selectedStop.value
  const preds = scheduleStore.getPredictionsForStop(destStop, dateType.value)
  const results: any[] = []

  // 判断是否有用户定位，用于推荐最近上车点
  const hasGps = mapStore.userLat !== null
  let originStop = ''
  if (hasGps) {
    const result = findNearestStop(mapStore.userLat!, mapStore.userLng!, scheduleStore.stations)
    originStop = result?.station.name ?? ''
  }

  // 收集所有经过目的地的 departureId 集合
  const seenDep = new Set<string>()
  for (const p of preds) {
    if (seenDep.has(p.departureId)) continue
    const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
    if (!dep) continue

    // 找到该车次在上车站的预测
    const originPred = (hasGps && originStop && originStop !== destStop)
      ? scheduleStore.predictions.find(
          pp => pp.departureId === p.departureId && pp.stopName === originStop
        )
      : null

    // 找到该车次在目的地且 stopSeq 大于上车站的预测（确保是同一趟车到了上车点之后才到目的地）
    const destPred = scheduleStore.predictions.find(
      pp => pp.departureId === p.departureId
        && pp.stopName === destStop
        && (!originPred || pp.stopSeq > originPred.stopSeq)
    )
    if (!destPred) continue

    const boardSec = originPred
      ? Math.round(originPred.arrivalMinutes * 60 - secondsNow.value)
      : Math.round(destPred.arrivalMinutes * 60 - secondsNow.value)

    if (boardSec < -60 || boardSec > 1800) continue
    if (destPred.arrivalMinutes * 60 - secondsNow.value > 1800) continue

    // 有定位且 origin ≠ dest 时，必须经过上车站
    if (hasGps && originStop && originStop !== destStop && !originPred) continue

    seenDep.add(p.departureId)

    if (hasGps && originStop && originStop !== destStop && originPred) {
      const isOriginDeparture = originPred.isDepartureStop ?? false
      const { label, status } = isOriginDeparture
        ? departureCountdown(boardSec)
        : arrivalCountdown(boardSec)
      results.push({
        departure: dep,
        originStop,
        destStop,
        isOriginDeparture,
        boardSec,
        boardLabel: label,
        boardStatus: status,
        boardTime: originPred.arrivalTime,
        destArrivalTime: destPred.arrivalTime,
      })
    } else {
      // 直接显示目的地到站信息：排除始发站（这些在「即将发车」中体现）
      if (destPred.isDepartureStop || destPred.isReturnStop) continue
      const { label, status } = arrivalCountdown(boardSec)
      results.push({
        departure: dep,
        destStop,
        secondsUntil: boardSec,
        label,
        status,
        arrivalTime: destPred.arrivalTime,
      })
    }
  }
  results.sort((a: any, b: any) => (a.boardSec ?? a.secondsUntil) - (b.boardSec ?? b.secondsUntil))
  return results.slice(0, 6)
})
</script>

<template>
  <div class="home-page">
    <div class="today-header">
      <div class="today-left">
        <div class="date-text">{{ todayDate }}</div>
        <div v-if="weather" class="weather-row">
          <span class="weather-icon">{{ weather.icon }}</span>
          <span class="weather-text">{{ weather.tempNow }}° {{ weather.tempMin }}°~{{ weather.tempMax }}°</span>
        </div>
      </div>
      <van-tag :type="isWeekday ? 'primary' : 'warning'" size="large" round>{{ dateTypeLabel }}</van-tag>
    </div>

    <div class="section">
      <van-search v-model="stopSearch" placeholder="搜索站点名称" shape="round" background="transparent" />
      <div class="stop-grid" v-if="!stopSearch">
        <template v-for="stop in (stopExpanded ? sortedStops : collapsedStops)" :key="stop">
          <span class="stop-chip" :class="{ active: selectedStop === stop }" @click="selectStop(stop)">
            {{ stop }}<span v-if="freqTop3.includes(stop)" class="freq-badge">常去</span>
          </span>
        </template>
        <span class="stop-chip more-btn" @click="stopExpanded = !stopExpanded">{{ stopExpanded ? '收起 ▲' : '更多 ▼' }}</span>
      </div>
      <div class="stop-grid" v-else>
        <span v-for="stop in filteredStops" :key="stop" class="stop-chip" :class="{ active: selectedStop === stop }" @click="selectStop(stop)">{{ stop }}</span>
        <span v-if="filteredStops.length === 0" class="no-result">未找到匹配站点</span>
      </div>
    </div>

    <div v-if="selectedStop && scheduleStore.isDataLoaded" class="section">
      <div class="section-title">「{{ selectedStop }}」</div>
      <div v-if="stopArrivals.length === 0" class="empty-hint">当前时段暂无经过此站的车次</div>
      <div v-for="item in stopArrivals" :key="`${(item as any).departure?.recordId}-${(item as any).destStop || item.destStop || ''}`" class="bus-card" :class="{ expanded: expandedBusId === 'arrival-' + (item as any).departure?.recordId }">
        <div class="bus-card-main" @click="toggleBusCard('arrival-' + (item as any).departure?.recordId)">
        <div class="bus-card-left">
          <RouteBadge :route="(item as any).departure?.route" :dining="(item as any).departure?.routeKey === 'HX1_DINING'" />
          <span class="bus-shift">{{ (item as any).departure?.shiftName }}</span>
        </div>
        <div class="bus-card-right" v-if="(item as any).originStop">
          <div class="boarding-info">在「{{ (item as any).originStop }}」上车</div>
          <ETAIndicator
            :seconds-until="(item as any).boardSec"
            :type="(item as any).isOriginDeparture ? 'departure' : 'arrival'"
          />
          <div class="board-time">于{{ (item as any).boardTime }}{{ (item as any).isOriginDeparture ? '发车' : '到站' }}</div>
          <div class="dest-info">预计{{ (item as any).destArrivalTime }} 到「{{ (item as any).destStop }}」</div>
        </div>
        <div class="bus-card-right" v-else>
          <div class="arrival-time">{{ (item as any).arrivalTime }}</div>
          <ETAIndicator :seconds-until="(item as any).secondsUntil" type="arrival" />
        </div>
        </div>
        <BusStopTimeline
          v-if="expandedBusId === 'arrival-' + (item as any).departure?.recordId"
          :departure-id="(item as any).departure?.recordId"
          :route-key="(item as any).departure?.routeKey"
          :highlight-stop="(item as any).destStop || selectedStop"
          @view-on-map="handleViewOnMap"
        />
      </div>
    </div>

    <div v-if="!selectedStop && !mapStore.userLat" class="gps-card">
      <van-icon name="location-o" size="20" />
      <span>开启定位后自动推荐最近上车站点</span>
    </div>

    <div v-if="departingSoon.length > 0" class="section">
      <div class="section-title">即将发车</div>
      <div v-for="item in departingSoon" :key="item.departure.recordId" class="bus-card departing">
        <div class="bus-card-left">
          <RouteBadge :route="item.departure.route" :dining="item.departure.routeKey === 'HX1_DINING'" />
          <span class="bus-shift">{{ item.departure.shiftName }}</span>
          <span class="bus-from" v-if="item.departure.isGaochaoDeparture">高超楼发车</span>
        </div>
        <div class="bus-card-right">
          <div class="departure-time">{{ item.departure.departureTime }}</div>
          <ETAIndicator :seconds-until="item.secondsUntil" type="departure" />
        </div>
      </div>
    </div>

    <div v-if="!scheduleStore.isDataLoaded" class="loading">
      <van-loading size="32" />
      <p>加载时刻表数据...</p>
    </div>
  </div>
</template>

<style scoped>
.home-page { padding: 16px; max-width: 480px; margin: 0 auto; }
.today-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.date-text { font-size: 16px; font-weight: 600; }
.weather-row { display: flex; align-items: center; gap: 4px; }
.weather-icon { font-size: 16px; }
.weather-text { font-size: 13px; color: var(--color-text-secondary); white-space: nowrap; }
.section { margin-bottom: 20px; }
.section-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--color-text); }
.stop-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px; }
.stop-chip { padding: 6px 14px; background: var(--color-card); border-radius: 16px; font-size: 14px; border: 1px solid var(--color-border); cursor: pointer; position: relative; transition: all 0.15s; }
.stop-chip:active { background: #EFF6FF; border-color: var(--color-primary); }
.stop-chip.active { background: #EFF6FF; border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.freq-badge { position: absolute; top: -6px; right: -6px; background: var(--color-primary); color: #fff; font-size: 10px; padding: 0 4px; border-radius: 6px; line-height: 14px; }
.more-btn { background: #F3F4F6; border-color: #D1D5DB; color: var(--color-text-secondary); }
.no-result { font-size: 13px; color: var(--color-text-secondary); padding: 4px; }
.gps-card { display: flex; align-items: center; gap: 10px; padding: 14px; background: #EFF6FF; border-radius: 10px; font-size: 14px; color: var(--color-primary); margin-bottom: 16px; }
.empty-hint { color: var(--color-text-secondary); font-size: 13px; text-align: center; padding: 24px; }
.bus-card { background: var(--color-card); border-radius: 10px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); overflow: hidden; }
.bus-card.departing { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-left: 3px solid var(--color-primary); }
.bus-card.expanded { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.bus-card-main { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; cursor: pointer; user-select: none; }
.bus-card-main:active { background: #F9FAFB; }
.bus-card-left { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
.bus-shift { font-size: 13px; color: var(--color-text-secondary); white-space: nowrap; }
.bus-from { font-size: 11px; color: #F59E0B; white-space: nowrap; }
.bus-card-right { text-align: right; flex-shrink: 0; }
.arrival-time { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-text); }
.departure-time { font-size: 20px; font-weight: 700; color: var(--color-primary); }
.boarding-info { font-size: 12px; color: #10B981; }
.dest-info { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.board-time { font-size: 12px; color: var(--color-text-secondary); }
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: var(--color-text-secondary); gap: 12px; }
</style>
