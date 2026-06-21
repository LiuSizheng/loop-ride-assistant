<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType } from '@/utils/datetime'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { gcj02ToPixel } from '@/utils/map_project'
import { getNow } from '@/utils/time'
import MapLegend from '@/components/map/MapLegend.vue'
import StopInfoPanel from '@/components/map/StopInfoPanel.vue'
import type { BusPosition } from '@/types'

const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
const route = useRoute()
useGeolocation()

const mapContainer = ref<HTMLDivElement>()
const mapLoading = ref(true)

// ---- 底图参数 ----
const IMG_W = 5120
const IMG_H = 7424

// ---- 路线颜色 ----
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  HX2_NORMAL: '#10B981', HX3_NORMAL: '#8B5CF6', HX3_GAOCHAO: '#7C3AED',
}
function getRouteColor(key: string) { return ROUTE_COLORS[key] || '#6B7280' }

// ---- 班次数字提取 ----
const CN: Record<string, number> = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10 }
function extractShiftNum(name: string): number | null {
  for (const [cn, n] of Object.entries(CN)) { if (name.includes(cn)) return n }
  return null
}

// ---- 公交车图标 ----
const BASE_URL = import.meta.env.BASE_URL
const BUS_ICON: Record<string, string> = {
  HX1_NORMAL: 'icons/环线1路.png', HX1_DINING: 'icons/就餐专线.png',
  HX2_NORMAL: 'icons/环线2路.png', HX3_NORMAL: 'icons/环线3路.png', HX3_GAOCHAO: 'icons/环线3路.png',
}
function busIconHtml(rk: string, shift: string, heading: number): string {
  const file = BUS_ICON[rk] || BUS_ICON['HX1_NORMAL']
  const sz = rk.includes('HX1') ? 42 : 36
  const badge = extractShiftNum(shift)
  const badgeHtml = badge !== null
    ? `<div style="position:absolute;top:-8px;right:-8px;width:18px;height:18px;background:#DC2626;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:2">${badge}</div>`
    : ''
  return `<div style="position:relative;width:${sz}px;height:${sz}px"><img src="${BASE_URL}${file}" width="${sz}" height="${sz}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));transform:rotate(${heading - 90}deg)">${badgeHtml}</div>`
}

// ---- 平移缩放 ----
const panX = ref(0)
const panY = ref(0)
const scale = ref(1)
const MAX_SCALE = 4
const BOUND_BUFFER = 200 // 拖拽边界留白

// 动态最小缩放：让整张图能放进屏幕（留 40px 边距）
const MIN_SCALE = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const fitW = (vw - 40) / IMG_W
  const fitH = (vh - 40) / IMG_H
  return Math.min(fitW, fitH, 0.15) // 上限 0.15，桌面端不会缩太小
})

const layerStyle = computed(() => ({
  width: IMG_W + 'px', height: IMG_H + 'px',
  transform: `translate(${panX.value}px,${panY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

// 判断地图是否偏离太远
const isMapLost = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const imgRight = panX.value + IMG_W * scale.value
  const imgBottom = panY.value + IMG_H * scale.value
  // 图片完全不在视口内
  return imgRight < -BOUND_BUFFER || panX.value > vw + BOUND_BUFFER
      || imgBottom < -BOUND_BUFFER || panY.value > vh + BOUND_BUFFER
})

// ---- 单指拖拽 ----
let isDragging = false
let lastX = 0, lastY = 0

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch' && (e as any).isPrimary === false) return
  isDragging = true; lastX = e.clientX; lastY = e.clientY
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!isDragging) return
  panX.value += e.clientX - lastX
  panY.value += e.clientY - lastY
  lastX = e.clientX; lastY = e.clientY
}
function onPointerUp() { isDragging = false }

// ---- 滚轮缩放（以光标为中心） ----
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(MIN_SCALE.value, Math.min(MAX_SCALE, scale.value * factor))
  const ratio = newScale / scale.value
  // 保持光标位置不变：pan += (1 - ratio) * (cursor - pan)
  panX.value = e.clientX - (e.clientX - panX.value) * ratio
  panY.value = e.clientY - (e.clientY - panY.value) * ratio
  scale.value = newScale
}

// ---- 双击缩放（以点击位置为中心） ----
function onDblClick(e: MouseEvent) {
  e.preventDefault()
  const newScale = Math.min(MAX_SCALE, scale.value * 1.5)
  const ratio = newScale / scale.value
  panX.value = e.clientX - (e.clientX - panX.value) * ratio
  panY.value = e.clientY - (e.clientY - panY.value) * ratio
  scale.value = newScale
}

// ---- 双指缩放（以双指中心为基准） ----
let pinchDist = 0, pinchScale = 1
let pinchCenterX = 0, pinchCenterY = 0, pinchPanX = 0, pinchPanY = 0

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    pinchDist = Math.hypot(dx, dy)
    pinchScale = scale.value
    pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2
    pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2
    pinchPanX = panX.value
    pinchPanY = panY.value
    isDragging = false
  }
}
function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.hypot(dx, dy)
    const newScale = Math.max(MIN_SCALE.value, Math.min(MAX_SCALE, pinchScale * (dist / pinchDist)))
    // 双指中心新位置
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
    // 保持双指中心点固定在屏幕上
    const ratio = newScale / pinchScale
    panX.value = cx - (pinchCenterX - pinchPanX) * ratio
    panY.value = cy - (pinchCenterY - pinchPanY) * ratio
    scale.value = newScale
  }
}

// ---- 定位按钮 ----
function recenterOnUser() {
  if (mapStore.userLat === null || mapStore.userLng === null) return
  const p = gcj02ToPixel(mapStore.userLng, mapStore.userLat)
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  scale.value = 1.6
  panX.value = vw / 2 - p.x * scale.value
  panY.value = vh / 2 - p.y * scale.value
  mapStore.recenterOnUser()
}

// 一键回中（适配屏幕大小）
function recenterMap() {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  scale.value = MIN_SCALE.value
  panX.value = (vw - IMG_W * scale.value) / 2
  panY.value = (vh - IMG_H * scale.value) / 2
}

// ---- 路线折线像素坐标 ----
const routeLines = computed(() => {
  const lines: Array<{ points: string; color: string; dashed: boolean }> = []
  for (const p of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(p.routeKey)) continue
    const path = scheduleStore.routePaths[p.routeKey]
    if (!path || path.length < 2) continue
    const pts = path.map(([lng, lat]) => { const px = gcj02ToPixel(lng, lat); return `${px.x},${px.y}` }).join(' ')
    lines.push({ points: pts, color: getRouteColor(p.routeKey), dashed: p.routeKey === 'HX1_DINING' })
  }
  return lines
})

// ---- 站点标记 ----
interface StationMarker { x: number; y: number; name: string; color: string; rk: string }

const stationMarkers = computed<StationMarker[]>(() => {
  const markers: StationMarker[] = []
  const shown = new Set<string>()
  for (const p of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(p.routeKey)) continue
    const stops = scheduleStore.routeStops[p.routeKey]
    if (!stops) continue
    const color = getRouteColor(p.routeKey)
    for (const s of stops) {
      const key = `${p.routeKey}|${s.name}|${s.lat.toFixed(6)}|${s.lng.toFixed(6)}`
      if (shown.has(key)) continue
      shown.add(key)
      const px = gcj02ToPixel(s.lng, s.lat)
      markers.push({ x: px.x, y: px.y, name: s.name, color, rk: p.routeKey })
    }
  }
  return markers
})

// ---- 公交车位置 ----
const busPositions = ref<BusPosition[]>([])
const busMarkers = computed(() => busPositions.value.map(b => {
  const px = gcj02ToPixel(b.lng, b.lat)
  return { ...b, px: px.x, py: px.y }
}))

// ---- 用户位置 ----
const userPixel = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  return gcj02ToPixel(mapStore.userLng, mapStore.userLat)
})

// ---- 动画循环 ----
let animFrameId: number | null = null
const trackedBusId = ref<string | null>(null)

function animate() {
  const now = getNow()
  const dt = getDateType(now)
  const deps = scheduleStore.getDepartures(dt)
  const patternMap = new Map(scheduleStore.routePatterns.map(rp => [rp.routeKey, rp]))
  const positions = computeActiveBusPositions(deps, patternMap, scheduleStore.stations, scheduleStore.routePaths, now)
  const visible = positions.filter(p => mapStore.visibleRoutes.has(p.routeKey))
  busPositions.value = visible
  mapStore.setBusPositions(visible)

  if (trackedBusId.value) {
    const t = visible.find(p => p.departureId === trackedBusId.value)
    if (t) {
      const px = gcj02ToPixel(t.lng, t.lat)
      const vw = mapContainer.value?.clientWidth ?? window.innerWidth
      const vh = mapContainer.value?.clientHeight ?? window.innerHeight
      scale.value = 1.6
      panX.value = vw / 2 - px.x * scale.value
      panY.value = vh / 2 - px.y * scale.value
      trackedBusId.value = null
    }
  }
  animFrameId = requestAnimationFrame(animate)
}

function selectStop(name: string) { mapStore.selectStop(name) }

// ---- 初始化 ----
let initializing = false

onMounted(() => {
  // 计算初始居中（适配屏幕大小显示全图）
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  scale.value = MIN_SCALE.value
  panX.value = (vw - IMG_W * scale.value) / 2
  panY.value = (vh - IMG_H * scale.value) / 2

  // 路线可见性
  initializing = true
  const q = route.query
  if (q.route) { mapStore.toggleRouteOnly(q.route as string) }
  else { mapStore.setAllRoutesVisible() }
  initializing = false

  animFrameId = requestAnimationFrame(animate)
  if (q.bus) trackedBusId.value = q.bus as string

  mapLoading.value = false
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
})

watch(() => mapStore.visibleRoutes, () => { if (!initializing) {} })
</script>

<template>
  <div class="map-page">
    <div v-if="mapLoading" class="map-loading">
      <van-loading size="32" />
      <span>加载地图...</span>
    </div>

    <div ref="mapContainer" class="map-viewport"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
      @wheel.prevent="onWheel" @dblclick.prevent="onDblClick"
      @touchstart.passive="onTouchStart" @touchmove="onTouchMove"
      style="touch-action:none">

      <div class="map-layer" :style="layerStyle">
        <!-- 卫星底图 -->
        <img :src="`${BASE_URL}data/campus-satellite.jpg`" :width="IMG_W" :height="IMG_H"
          style="display:block;user-select:none;pointer-events:none;will-change:transform"
          decoding="async" draggable="false">

        <!-- SVG 叠加层 -->
        <svg :width="IMG_W" :height="IMG_H" style="position:absolute;top:0;left:0;pointer-events:none">
          <!-- 路线折线 -->
          <polyline v-for="(line, i) in routeLines" :key="'l'+i"
            :points="line.points" fill="none" :stroke="line.color"
            stroke-width="3" stroke-opacity="0.6" :stroke-dasharray="line.dashed ? '8 5' : undefined"
            stroke-linecap="round" stroke-linejoin="round" />

          <!-- 站点标记 -->
          <g v-for="(m, i) in stationMarkers" :key="'s'+i"
            :transform="`translate(${m.x},${m.y})`" @click="selectStop(m.name)"
            style="cursor:pointer;pointer-events:auto">
            <template v-if="mapStore.showLabels">
              <rect :x="-m.name.length * 3.5 - 6" y="-24" :width="m.name.length * 7 + 12" height="20"
                rx="10" :fill="m.color" />
              <text x="0" y="-10" text-anchor="middle" fill="#fff" font-size="11"
                font-weight="600" style="pointer-events:none">{{ m.name }}</text>
              <circle cx="0" cy="0" r="5" :fill="m.color" stroke="#fff" stroke-width="2"
                style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))" />
            </template>
            <template v-else>
              <circle cx="0" cy="0" r="5" :fill="m.color" stroke="#fff" stroke-width="2"
                style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))" />
            </template>
          </g>

          <!-- 用户位置 -->
          <g v-if="userPixel" :transform="`translate(${userPixel.x},${userPixel.y})`">
            <circle cx="0" cy="0" r="8" fill="#3B82F6" fill-opacity="0.2" stroke="none" />
            <circle cx="0" cy="0" r="5" fill="#3B82F6" stroke="#fff" stroke-width="3" />
          </g>
        </svg>

        <!-- 公交车标记 -->
        <div v-for="b in busMarkers" :key="b.departureId"
          class="bus-marker"
          :style="{ left: b.px + 'px', top: b.py + 'px', transform: 'translate(-50%,-50%)' }"
          v-html="busIconHtml(b.routeKey, b.shiftName, b.heading)" />
      </div>
    </div>

    <MapLegend />
    <div class="map-controls">
      <div v-if="isMapLost" class="locate-btn recenter-btn" @click="recenterMap">
        <van-icon name="replay" size="20" />
      </div>
      <div class="locate-btn" @click="recenterOnUser">
        <van-icon name="aim" size="20" />
      </div>
    </div>
    <StopInfoPanel />
  </div>
</template>

<style scoped>
.map-page {
  position: relative; width: 100%; height: calc(100vh - 60px);
  overflow: hidden; background: #1a1a1a;
}
.map-viewport {
  width: 100%; height: 100%; overflow: hidden; cursor: grab;
  position: relative;
}
.map-viewport:active { cursor: grabbing; }
.map-layer {
  position: absolute; top: 0; left: 0;
  will-change: transform;
}
.bus-marker {
  position: absolute; z-index: 10; pointer-events: none;
}
.map-loading {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--color-bg); z-index: 100; gap: 12px;
}
.map-controls {
  position: absolute; bottom: 60px; right: 16px; z-index: 60;
}
.locate-btn {
  width: 44px; height: 44px; background: var(--color-card); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15); cursor: pointer; color: var(--color-primary);
  margin-bottom: 10px;
}
.locate-btn:active { background: #F3F4F6; }
.recenter-btn { color: #F59E0B; }
</style>
