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
let busMarkers: any[] = []
let routePolylines: any[] = []
let userMarker: any = null
let positionInterval: ReturnType<typeof setInterval> | null = null

// 在地图上显示所有站点
function renderStops() {
  if (!mapInstance) return
  stopMarkers.forEach((m) => m.remove())
  stopMarkers = []
  routePolylines.forEach((p) => p.remove())
  routePolylines = []

  const routeColors: Record<string, string> = {
    HX1_NORMAL: '#2563EB',
    HX1_DINING: '#F59E0B',
    HX2_NORMAL: '#10B981',
    HX3_NORMAL: '#8B5CF6',
    HX3_GAOCHAO: '#7C3AED',
  }

  // 为每条路线绘制折线（优先使用途经点细化路径）
  for (const pattern of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(pattern.routeKey)) continue

    let path: [number, number][]

    // Use detailed waypoint path if available
    if (scheduleStore.routePaths[pattern.routeKey]) {
      path = scheduleStore.routePaths[pattern.routeKey]
    } else {
      // Fallback: simple stop-to-stop lines
      path = []
      for (const stop of pattern.stops) {
        const station = scheduleStore.stations.find((s) => s.name === stop.currentStop)
        if (station) {
          path.push([station.lng, station.lat])
        }
      }
    }

    if (path.length > 1) {
      const color = routeColors[pattern.routeKey] || '#999'
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

  // 为每条可见路线，按路线专属坐标显示站点标记
  const routeColorMap: Record<string, string> = {
    HX1_NORMAL: '#2563EB',
    HX1_DINING: '#F59E0B',
    HX2_NORMAL: '#10B981',
    HX3_NORMAL: '#8B5CF6',
    HX3_GAOCHAO: '#8B5CF6',
  }

  const shownStops = new Set<string>()  // dedup: "routeKey|stopName"

  for (const pattern of scheduleStore.routePatterns) {
    const rk = pattern.routeKey
    if (!mapStore.visibleRoutes.has(rk)) continue

    const stops = scheduleStore.routeStops[rk]
    if (!stops) continue

    const color = routeColorMap[rk] || '#6B7280'

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
              background:${color};
              color:#fff;
              padding:2px 6px;
              border-radius:10px;
              font-size:11px;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,0.3);
            ">${stop.name}</div>`,
            offset: new (window as any).AMap.Pixel(0, -22),
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

// 更新公交车位置
function updateBusPositions() {
  if (!mapInstance) return
  busMarkers.forEach((m) => m.remove())
  busMarkers = []

  const dateType = getDateType()
  const deps = scheduleStore.getDepartures(dateType)
  const patternMap = new Map(
    scheduleStore.routePatterns.map((rp) => [rp.routeKey, rp])
  )
  const positions = computeActiveBusPositions(
    deps,
    patternMap,
    scheduleStore.stations
  )
  mapStore.setBusPositions(positions)

  for (const pos of positions) {
    const color = pos.routeKey === 'HX1_DINING' ? '#F59E0B'
      : pos.routeKey?.includes('HX1') ? '#2563EB'
      : pos.routeKey?.includes('HX2') ? '#10B981'
      : '#8B5CF6'

    const content = `<div style="
      width:24px;height:24px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;color:#fff;
      transform:rotate(${pos.heading}deg);
    ">🚌</div>`

    const marker = new (window as any).AMap.Marker({
      position: [pos.lng, pos.lat],
      content,
      offset: new (window as any).AMap.Pixel(-12, -12),
      zIndex: 80,
    })
    marker.setMap(mapInstance)
    busMarkers.push(marker)
  }
}

// 更新用户位置标记
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

// 定时更新
function startPositionUpdates() {
  positionInterval = setInterval(() => {
    updateBusPositions()
    updateUserMarker()
  }, 5000)
}

onMounted(async () => {
  try {
    await loadAMap()
    if (!mapContainer.value) return

    // 提前计算校园边界，避免地图先在错误位置闪现再跳转
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
    updateBusPositions()
    startPositionUpdates()
    mapLoading.value = false
  } catch (e: any) {
    mapError.value = e.message || '地图加载失败'
    mapLoading.value = false
  }
})

onUnmounted(() => {
  if (positionInterval) clearInterval(positionInterval)
  if (mapInstance) {
    mapInstance.destroy()
    mapInstance = null
  }
})

// 当路线可见性变化时重新渲染
watch(() => mapStore.visibleRoutes, () => {
  renderStops()
  updateBusPositions()
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
</style>
