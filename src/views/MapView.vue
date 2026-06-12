<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { loadAMap } from '@/utils/amap'
import MapLegend from '@/components/map/MapLegend.vue'
import StopInfoPanel from '@/components/map/StopInfoPanel.vue'
import type { BusPosition } from '@/types'

const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
useGeolocation()

const mapContainer = ref<HTMLDivElement | null>(null)
const mapLoading = ref(true)
const mapError = ref<string | null>(null)
let mapInstance: any = null
let stopMarkers: any[] = []
let routePolylines: any[] = []
let userMarker: any = null
let userMarkerInterval: ReturnType<typeof setInterval> | null = null

// ---- 路线颜色 ----
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB',
  HX1_DINING: '#F59E0B',
  HX2_NORMAL: '#10B981',
  HX3_NORMAL: '#8B5CF6',
  HX3_GAOCHAO: '#7C3AED',
}

function getRouteColor(routeKey: string): string {
  return ROUTE_COLORS[routeKey] || '#6B7280'
}

// ---- 班次数字提取 ----
const CN_NUM_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}

function extractShiftNumber(shiftName: string): number | null {
  for (const [cn, n] of Object.entries(CN_NUM_MAP)) {
    if (shiftName.includes(cn)) return n
  }
  return null
}

// ---- 公交车图标 HTML ----
function createBusIconContent(routeKey: string, shiftName: string, heading: number): string {
  const color = getRouteColor(routeKey)
  const shiftNum = extractShiftNumber(shiftName)
  const isBus = routeKey.includes('HX1')
  const bodyW = isBus ? 36 : 28
  const bodyH = isBus ? 20 : 18
  const containerW = bodyW + 10
  const containerH = bodyH + 8

  const badgeHtml = shiftNum !== null ? `
    <div style="
      position:absolute;top:-7px;right:-7px;
      width:16px;height:16px;
      background:#DC2626;border-radius:50%;
      color:#fff;font-size:10px;font-weight:700;
      display:flex;align-items:center;justify-content:center;
      line-height:1;border:1.5px solid #fff;
    ">${shiftNum}</div>` : ''

  return `<div style="
    width:${containerW}px;height:${containerH}px;
    position:relative;
    transform:rotate(${heading}deg);
  ">
    <div style="
      width:${bodyW}px;height:${bodyH}px;
      background:${color};
      border-radius:5px;
      position:absolute;left:0;top:0;
      box-shadow:0 2px 4px rgba(0,0,0,0.25);
    "></div>
    <div style="
      position:absolute;bottom:-2px;left:${isBus ? 6 : 4}px;
      width:6px;height:6px;background:#1F2937;border-radius:50%;
      box-shadow:inset 0 1px 1px rgba(255,255,255,0.3);
    "></div>
    <div style="
      position:absolute;bottom:-2px;right:${isBus ? 10 : 7}px;
      width:6px;height:6px;background:#1F2937;border-radius:50%;
      box-shadow:inset 0 1px 1px rgba(255,255,255,0.3);
    "></div>
    ${badgeHtml}
  </div>`
}

function getBusMarkerOffset(routeKey: string): [number, number] {
  const isBus = routeKey.includes('HX1')
  const bodyW = isBus ? 36 : 28
  const bodyH = isBus ? 20 : 18
  return [-(bodyW + 10) / 2, -(bodyH + 8) / 2]
}

// ---- 站点渲染 ----
function renderStops() {
  if (!mapInstance) return
  stopMarkers.forEach((m) => m.remove())
  stopMarkers = []
  routePolylines.forEach((p) => p.remove())
  routePolylines = []

  // 为每条路线绘制折线
  for (const pattern of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(pattern.routeKey)) continue

    let path: [number, number][]
    if (scheduleStore.routePaths[pattern.routeKey]) {
      path = scheduleStore.routePaths[pattern.routeKey]
    } else {
      path = []
      for (const stop of pattern.stops) {
        const station = scheduleStore.stations.find((s) => s.name === stop.currentStop)
        if (station) path.push([station.lng, station.lat])
      }
    }

    if (path.length > 1) {
      const color = getRouteColor(pattern.routeKey)
      const polyline = new (window as any).AMap.Polyline({
        path,
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.6,
        strokeStyle: pattern.routeKey === 'HX1_DINING' ? 'dashed' : 'solid',
        zIndex: 10,
      })
      polyline.setMap(mapInstance)
      routePolylines.push(polyline)
    }
  }

  // 站点标记
  const shownStops = new Set<string>()

  for (const pattern of scheduleStore.routePatterns) {
    const rk = pattern.routeKey
    if (!mapStore.visibleRoutes.has(rk)) continue

    const stops = scheduleStore.routeStops[rk]
    if (!stops) continue

    const color = getRouteColor(rk)

    for (const stop of stops) {
      const dedupKey = `${rk}|${stop.name}`
      if (shownStops.has(dedupKey)) continue
      shownStops.add(dedupKey)

      const markerContent = `<div style="
        width:12px;height:12px;
        background:${color};
        border:2px solid #fff;
        border-radius:50%;
        box-shadow:0 1px 3px rgba(0,0,0,0.3);
      "></div>`

      const marker = new (window as any).AMap.Marker({
        position: [stop.lng, stop.lat],
        title: stop.name,
        content: markerContent,
        offset: new (window as any).AMap.Pixel(-6, -6),
        ...(mapStore.showLabels ? {
          label: {
            content: `<div style="
              color:#1F2937;font-size:11px;font-weight:500;white-space:nowrap;
              text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;
            ">${stop.name}</div>`,
            offset: new (window as any).AMap.Pixel(0, -20),
          },
        } : {}),
        zIndex: 50,
      })

      marker.on('click', () => {
        mapStore.selectStop(stop.name)
      })

      marker.setMap(mapInstance)
      stopMarkers.push(marker)
    }
  }
}

// ---- 平滑公交车动画 ----
const busMarkerMap = new Map<string, any>()
const lastHeadingMap = new Map<string, number>()
let animFrameId: number | null = null

function animateBusPositions() {
  if (!mapInstance) {
    animFrameId = requestAnimationFrame(animateBusPositions)
    return
  }

  const currentDate = mapStore.simulatedDate
  const dateType = getDateType(currentDate)
  const deps = scheduleStore.getDepartures(dateType)
  const patternMap = new Map(
    scheduleStore.routePatterns.map((rp) => [rp.routeKey, rp])
  )
  const positions = computeActiveBusPositions(
    deps,
    patternMap,
    scheduleStore.stations,
    currentDate
  )

  // 按路线可见性筛选
  const visiblePositions = positions.filter((p) =>
    mapStore.visibleRoutes.has(p.routeKey)
  )
  mapStore.setBusPositions(visiblePositions)

  const activeIds = new Set(visiblePositions.map((p) => p.departureId))

  // 移除不再活跃的标记
  for (const [id, marker] of busMarkerMap) {
    if (!activeIds.has(id)) {
      marker.remove()
      busMarkerMap.delete(id)
      lastHeadingMap.delete(id)
    }
  }

  // 更新已有标记 / 创建新标记
  for (const pos of visiblePositions) {
    const existing = busMarkerMap.get(pos.departureId)
    if (existing) {
      existing.setPosition([pos.lng, pos.lat])
      // 仅在 heading 变化 >10° 时更新图标方向
      const prevH = lastHeadingMap.get(pos.departureId) ?? -999
      if (Math.abs(pos.heading - prevH) > 10) {
        existing.setContent(createBusIconContent(pos.routeKey, pos.shiftName, pos.heading))
        lastHeadingMap.set(pos.departureId, pos.heading)
      }
    } else {
      const content = createBusIconContent(pos.routeKey, pos.shiftName, pos.heading)
      const offset = getBusMarkerOffset(pos.routeKey)
      const marker = new (window as any).AMap.Marker({
        position: [pos.lng, pos.lat],
        content,
        offset: new (window as any).AMap.Pixel(offset[0], offset[1]),
        zIndex: 80,
      })
      marker.setMap(mapInstance)
      busMarkerMap.set(pos.departureId, marker)
      lastHeadingMap.set(pos.departureId, pos.heading)
    }
  }

  animFrameId = requestAnimationFrame(animateBusPositions)
}

// ---- 用户位置标记 ----
function updateUserMarker() {
  if (!mapInstance || mapStore.userLat === null || mapStore.userLng === null) {
    if (userMarker) {
      userMarker.remove()
      userMarker = null
    }
    return
  }

  if (!userMarker) {
    userMarker = new (window as any).AMap.Marker({
      position: [mapStore.userLng, mapStore.userLat],
      content: `<div style="
        width:16px;height:16px;
        background:#3B82F6;
        border:3px solid #fff;
        border-radius:50%;
        box-shadow:0 0 0 4px rgba(59,130,246,0.3);
      "></div>`,
      offset: new (window as any).AMap.Pixel(-8, -8),
      zIndex: 100,
    })
    userMarker.setMap(mapInstance)
  } else {
    userMarker.setPosition([mapStore.userLng, mapStore.userLat])
  }
}

// ---- 生命周期 ----
onMounted(async () => {
  try {
    await loadAMap()
    if (!mapContainer.value) return

    let initCenter: [number, number] = [113.042, 28.263]
    let initZoom = 15
    if (scheduleStore.stations.length > 0) {
      const lngs = scheduleStore.stations.map((s) => s.lng)
      const lats = scheduleStore.stations.map((s) => s.lat)
      initCenter = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2 + 0.002]
    }

    mapInstance = new (window as any).AMap.Map(mapContainer.value, {
      center: initCenter,
      zoom: initZoom,
      layers: [new (window as any).AMap.TileLayer.Satellite()],
    })

    renderStops()
    animFrameId = requestAnimationFrame(animateBusPositions)
    userMarkerInterval = setInterval(updateUserMarker, 5000)
    mapLoading.value = false
  } catch (e: any) {
    mapError.value = e.message || '地图加载失败'
    mapLoading.value = false
  }
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (userMarkerInterval) clearInterval(userMarkerInterval)
  for (const marker of busMarkerMap.values()) marker.remove()
  busMarkerMap.clear()
  if (mapInstance) {
    mapInstance.destroy()
    mapInstance = null
  }
})

// 当路线可见性变化时重新渲染站点和折线（公交车由动画循环自动筛选）
watch(() => mapStore.visibleRoutes, () => {
  renderStops()
}, { deep: true })

// 当站点标签可见性变化时重新渲染
watch(() => mapStore.showLabels, () => {
  renderStops()
})

// 定位按钮
function recenterOnUser() {
  mapStore.recenterOnUser()
  if (mapInstance && mapStore.userLat !== null && mapStore.userLng !== null) {
    mapInstance.setCenter([mapStore.userLng, mapStore.userLat])
    mapInstance.setZoom(16)
  }
}

// 时间模拟
const timePresets = [
  { label: '实时', minutes: null },
  { label: '07:30', minutes: 7 * 60 + 30 },
  { label: '08:00', minutes: 8 * 60 },
  { label: '09:00', minutes: 9 * 60 },
  { label: '11:30', minutes: 11 * 60 + 30 },
  { label: '14:00', minutes: 14 * 60 },
  { label: '17:00', minutes: 17 * 60 },
]

function setTimePreset(minutes: number | null) {
  mapStore.setSimulatedTime(minutes)
}
</script>

<template>
  <div class="map-page">
    <!-- 加载中 -->
    <div v-if="mapLoading" class="map-loading">
      <van-loading size="32" />
      <span>加载地图...</span>
    </div>

    <!-- 错误 -->
    <div v-if="mapError" class="map-error">
      <van-icon name="warning-o" size="32" />
      <p>{{ mapError }}</p>
      <p class="map-error-hint">
        请确保已配置高德地图 API Key
      </p>
    </div>

    <!-- 地图容器 -->
    <div ref="mapContainer" class="map-container" />

    <!-- 时间模拟面板 -->
    <div class="time-panel">
      <div class="time-panel-label">
        {{ mapStore.simulatedMinutes !== null ? '模拟时间' : '实时' }}
      </div>
      <div class="time-presets">
        <span
          v-for="preset in timePresets"
          :key="preset.label"
          class="time-preset-btn"
          :class="{ active: mapStore.simulatedMinutes === preset.minutes }"
          @click="setTimePreset(preset.minutes)"
        >{{ preset.label }}</span>
      </div>
    </div>

    <!-- 图例 -->
    <MapLegend />

    <!-- 定位按钮 -->
    <div class="map-controls">
      <div class="locate-btn" @click="recenterOnUser">
        <van-icon name="aim" size="20" />
      </div>
    </div>

    <!-- 站点详情面板 -->
    <StopInfoPanel />
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: calc(100vh - 60px);
}

.map-page :deep(.amap-logo),
.map-page :deep(.amap-copyright) {
  display: none !important;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-loading,
.map-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  z-index: 100;
  gap: 12px;
}
.map-error p {
  color: #DC2626;
}
.map-error-hint {
  color: var(--color-text-secondary) !important;
  font-size: 13px;
}

.map-controls {
  position: absolute;
  bottom: 60px;
  right: 16px;
  z-index: 60;
}
.locate-btn {
  width: 44px;
  height: 44px;
  background: var(--color-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15);
  cursor: pointer;
  color: var(--color-primary);
}
.locate-btn:active {
  background: #F3F4F6;
}

.time-panel {
  position: absolute;
  bottom: 60px;
  left: 12px;
  z-index: 60;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 10px;
  padding: 8px 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}
.time-panel-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  text-align: center;
}
.time-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.time-preset-btn {
  padding: 2px 8px;
  background: #F3F4F6;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text);
  white-space: nowrap;
  user-select: none;
  transition: background 0.15s;
}
.time-preset-btn.active {
  background: var(--color-primary);
  color: #fff;
}
.time-preset-btn:active {
  background: #E5E7EB;
}
</style>
