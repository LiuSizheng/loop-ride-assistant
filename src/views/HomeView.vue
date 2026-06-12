<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useNextBus } from '@/composables/useNextBus'
import { useGeolocation } from '@/composables/useGeolocation'
import { useWeather } from '@/composables/useWeather'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { formatDate, getDateType } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { findNearestStop } from '@/utils/geo'
import { getSecondsSinceMidnight } from '@/utils/datetime'
import { arrivalCountdown } from '@/utils/countdown'
import RouteBadge from '@/components/common/RouteBadge.vue'
import ETAIndicator from '@/components/common/ETAIndicator.vue'

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
const secondsNow = computed(() => getSecondsSinceMidnight())

// 站点点击频次（localStorage）
const clickFreq = ref<Record<string, number>>({})
try {
  clickFreq.value = JSON.parse(localStorage.getItem('stop_click_freq') || '{}')
} catch { clickFreq.value = {} }

function recordClick(stopName: string) {
  clickFreq.value[stopName] = (clickFreq.value[stopName] || 0) + 1
  localStorage.setItem('stop_click_freq', JSON.stringify(clickFreq.value))
}

// 按频次排序的站点列表
const sortedStops = computed(() => {
  const stops = scheduleStore.stations.map(s => s.name)
  stops.sort((a, b) => (clickFreq.value[b] || 0) - (clickFreq.value[a] || 0))
  return stops
})

// 折叠时显示的站点（前6个高频 + 最近站点）
const collapsedStops = computed(() => {
  const freq = sortedStops.value.slice(0, 6)
  return freq
})

// 搜索过滤
const filteredStops = computed(() => {
  if (!stopSearch.value) return []
  return sortedStops.value.filter(s => s.includes(stopSearch.value))
})

// 自动推荐最近站点
const nearestStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  const result = findNearestStop(mapStore.userLat, mapStore.userLng, scheduleStore.stations)
  return result?.station ?? null
})

// 当定位可用时自动选中最近站点
watch(nearestStop, (stop) => {
  if (stop && !selectedStop.value) {
    selectedStop.value = stop.name
  }
}, { immediate: true })

// 当前选中站点的到站预测
const stopArrivals = computed(() => {
  if (!selectedStop.value) return []
  const preds = scheduleStore.getPredictionsForStop(selectedStop.value, dateType.value)
  return preds
    .map((p) => {
      if (p.isDepartureStop || p.isReturnStop) return null
      const secondsAway = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
      if (secondsAway < -120 || secondsAway > 600) return null
      const { label, status } = arrivalCountdown(secondsAway)
      const departure = scheduleStore.departures.find(d => d.recordId === p.departureId)
      if (!departure) return null
      return { ...p, departure, secondsUntil: secondsAway, label, status }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.secondsUntil - b.secondsUntil)
    .slice(0, 6)
})

function selectStop(name: string) {
  recordClick(name)
  selectedStop.value = name
  stopSearch.value = ''
}

// 定时刷新
let refreshTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { refreshTimer = setInterval(refresh, 15000) })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div class="home-page">
    <!-- 今日状态 -->
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

    <!-- 站点选择 -->
    <div class="section">
      <van-search
        v-model="stopSearch"
        placeholder="搜索站点名称"
        shape="round"
        background="transparent"
      />
      <!-- 站点标签 -->
      <div class="stop-grid" v-if="!stopSearch">
        <template v-for="stop in (stopExpanded ? sortedStops : collapsedStops)" :key="stop">
          <span class="stop-chip"
            :class="{ active: selectedStop === stop }"
            @click="selectStop(stop)"
          >{{ stop }}<span v-if="freqTop3.includes(stop)" class="freq-badge">常去</span></span>
        </template>
        <span class="stop-chip more-btn" @click="stopExpanded = !stopExpanded">
          {{ stopExpanded ? '收起 ▲' : '更多 ▼' }}
        </span>
      </div>
      <div class="stop-grid" v-else>
        <span v-for="stop in filteredStops" :key="stop" class="stop-chip"
          :class="{ active: selectedStop === stop }"
          @click="selectStop(stop)"
        >{{ stop }}</span>
        <span v-if="filteredStops.length === 0" class="no-result">未找到匹配站点</span>
      </div>
    </div>

    <!-- 选中站点的到站信息 -->
    <div v-if="selectedStop && scheduleStore.isDataLoaded" class="section">
      <div class="section-title">「{{ selectedStop }}」</div>

      <div v-if="stopArrivals.length === 0" class="empty-hint">
        当前时段暂无经过此站的车次
      </div>

      <div v-for="item in stopArrivals" :key="`${(item as any).departureId}-${(item as any).stopName}`" class="bus-card">
        <div class="bus-card-left">
          <RouteBadge
            :route="(item as any).departure?.route"
            :dining="(item as any).departure?.routeKey === 'HX1_DINING'"
          />
          <span class="bus-shift">{{ (item as any).departure?.shiftName }}</span>
        </div>
        <div class="bus-card-right">
          <div class="arrival-time">{{ (item as any).arrivalTime }}</div>
          <ETAIndicator :seconds-until="(item as any).secondsUntil" type="arrival" />
        </div>
      </div>
    </div>

    <!-- 自动推荐提示（未开启定位时） -->
    <div v-if="!selectedStop && !mapStore.userLat" class="gps-card">
      <van-icon name="location-o" size="20" />
      <span>开启定位后自动推荐最近上车站点</span>
    </div>

    <!-- 即将发车 -->
    <div v-if="departingSoon.length > 0" class="section">
      <div class="section-title">即将发车</div>
      <div v-for="item in departingSoon" :key="item.departure.recordId" class="bus-card departing">
        <div class="bus-card-left">
          <RouteBadge
            :route="item.departure.route"
            :dining="item.departure.routeKey === 'HX1_DINING'"
          />
          <span class="bus-shift">{{ item.departure.shiftName }}</span>
          <span class="bus-stop">{{ item.departure.departureStation }}发车</span>
        </div>
        <div class="bus-card-right">
          <div class="departure-time">{{ item.departure.departureTime }}</div>
          <ETAIndicator :seconds-until="item.secondsUntil" type="departure" />
        </div>
      </div>
    </div>

    <!-- 加载中 -->
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

.weather-icon { font-size: 16px; margin-left: 8px; vertical-align: middle; }
.weather-text { font-size: 13px; color: var(--color-text-secondary); margin-left: 4px; vertical-align: middle; }

.section { margin-bottom: 20px; }
.section-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--color-text); }

.stop-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px; }
.stop-chip {
  padding: 6px 14px; background: var(--color-card); border-radius: 16px;
  font-size: 14px; border: 1px solid var(--color-border); cursor: pointer;
  position: relative; transition: all 0.15s;
}
.stop-chip:active { background: #EFF6FF; border-color: var(--color-primary); }
.stop-chip.active { background: #EFF6FF; border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.freq-badge {
  position: absolute; top: -6px; right: -6px;
  background: var(--color-primary); color: #fff; font-size: 10px;
  padding: 0 4px; border-radius: 6px; line-height: 14px;
}
.more-btn { background: #F3F4F6; border-color: #D1D5DB; color: var(--color-text-secondary); }
.no-result { font-size: 13px; color: var(--color-text-secondary); padding: 4px; }

.gps-card { display: flex; align-items: center; gap: 10px; padding: 14px; background: #EFF6FF; border-radius: 10px; font-size: 14px; color: var(--color-primary); margin-bottom: 16px; }

.empty-hint { color: var(--color-text-secondary); font-size: 13px; text-align: center; padding: 24px; }

.bus-card { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: var(--color-card); border-radius: 10px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.bus-card.departing { border-left: 3px solid var(--color-primary); }
.bus-card-left { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
.bus-shift { font-size: 13px; color: var(--color-text-secondary); white-space: nowrap; }
.bus-stop { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bus-card-right { text-align: right; flex-shrink: 0; }
.arrival-time { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-text); }
.departure-time { font-size: 20px; font-weight: 700; color: var(--color-primary); }

.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: var(--color-text-secondary); gap: 12px; }
</style>

