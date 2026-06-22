<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType } from '@/utils/datetime'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { wgs84ToPixel } from '@/utils/map_project'
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
const IMG_W = 2816
const IMG_H = 2816

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

const layerStyle = computed(() => ({
  width: IMG_W + 'px', height: IMG_H + 'px',
  transform: `translate(${panX.value}px,${panY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

// ---- 固定视觉大小（使用 SVG vector-effect）----
// 基准值（固定像素大小，不随缩放变化）
const STROKE_WIDTH = 3
const FONT_SIZE = 10
const CIRCLE_RADIUS = 4
const LABEL_PADDING_X = 8
const LABEL_PADDING_Y = 4
const LABEL_HEIGHT = 20
const LABEL_RX = 10

// ---- 边界限制（防止显示黑色区域）----
function clampPan() {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const scaledW = IMG_W * scale.value
  const scaledH = IMG_H * scale.value

  // 限制：图片边缘不能拖进屏幕内（最小为0，最大为屏幕尺寸减去图片尺寸）
  panX.value = Math.min(0, Math.max(vw - scaledW, panX.value))
  panY.value = Math.min(0, Math.max(vh - scaledH, panY.value))
}

// 最小缩放：图片至少能占满屏幕
const MIN_SCALE = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  return Math.max(vw / IMG_W, vh / IMG_H)
})

// 判断地图是否偏离太远（有边界限制时基本不会触发）
const isMapLost = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const imgRight = panX.value + IMG_W * scale.value
  const imgBottom = panY.value + IMG_H * scale.value
  return imgRight < 0 || panX.value > vw || imgBottom < 0 || panY.value > vh
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
  clampPan() // 应用边界限制
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
  clampPan() // 应用边界限制
}

// ---- 双击缩放（以点击位置为中心） ----
function onDblClick(e: MouseEvent) {
  e.preventDefault()
  const newScale = Math.min(MAX_SCALE, scale.value * 1.5)
  const ratio = newScale / scale.value
  panX.value = e.clientX - (e.clientX - panX.value) * ratio
  panY.value = e.clientY - (e.clientY - panY.value) * ratio
  scale.value = newScale
  clampPan() // 应用边界限制
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
    clampPan() // 应用边界限制
  }
}

// ---- 定位按钮 ----
function recenterOnUser() {
  if (mapStore.userLat === null || mapStore.userLng === null) return
  const p = wgs84ToPixel(mapStore.userLng, mapStore.userLat)
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  scale.value = 1.6
  panX.value = vw / 2 - p.x * scale.value
  panY.value = vh / 2 - p.y * scale.value
  clampPan() // 应用边界限制
  mapStore.recenterOnUser()
}

// 一键回中（显示整个校园线路）
function recenterMap() {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight

  // 计算所有站点的边界范围
  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (const station of scheduleStore.stations) {
    minLng = Math.min(minLng, station.lng)
    maxLng = Math.max(maxLng, station.lng)
    minLat = Math.min(minLat, station.lat)
    maxLat = Math.max(maxLat, station.lat)
  }

  // 计算边界中心点
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const centerPx = wgs84ToPixel(centerLng, centerLat)

  // 计算边界像素范围
  const topLeft = wgs84ToPixel(minLng, maxLat)
  const bottomRight = wgs84ToPixel(maxLng, minLat)
  const boundsW = bottomRight.x - topLeft.x
  const boundsH = bottomRight.y - topLeft.y

  // 计算合适的缩放比例，留出边距（上多下少，整体放大）
  const paddingTop = 60
  const paddingBottom = 30
  const paddingLeft = 50
  const paddingRight = 50
  const scaleX = (vw - paddingLeft - paddingRight) / boundsW
  const scaleY = (vh - paddingTop - paddingBottom) / boundsH
  const initialScale = Math.min(scaleX, scaleY, 0.6)

  // 居中显示整个校园
  scale.value = initialScale
  panX.value = vw / 2 - centerPx.x * scale.value
  panY.value = (vh - paddingBottom + paddingTop) / 2 - centerPx.y * scale.value
  clampPan() // 应用边界限制
}

// ---- 路线折线像素坐标 ----
const routeLines = computed(() => {
  const lines: Array<{ points: string; color: string; dashed: boolean }> = []
  for (const p of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(p.routeKey)) continue
    const path = scheduleStore.routePaths[p.routeKey]
    if (!path || path.length < 2) continue
    const pts = path.map(([lng, lat]) => { const px = wgs84ToPixel(lng, lat); return `${px.x},${px.y}` }).join(' ')
    lines.push({ points: pts, color: getRouteColor(p.routeKey), dashed: p.routeKey === 'HX1_DINING' })
  }
  return lines
})

// 固定视觉大小的缩放补偿
const invScale = computed(() => 1 / scale.value)

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
      const px = wgs84ToPixel(s.lng, s.lat)
      markers.push({ x: px.x, y: px.y, name: s.name, color, rk: p.routeKey })
    }
  }
  return markers
})

// ---- 公交车位置 ----
const busPositions = ref<BusPosition[]>([])
const busMarkers = computed(() => busPositions.value.map(b => {
  const px = wgs84ToPixel(b.lng, b.lat)
  return { ...b, px: px.x, py: px.y }
}))

// ---- 用户位置 ----
const userPixel = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  return wgs84ToPixel(mapStore.userLng, mapStore.userLat)
})

// ---- 动画循环 ----
let animFrameId: number | null = null
const trackedBusId = ref<string | null>(null)

function animate() {
  const now = getNow()
  const dt = getDateType(now)
  const deps = scheduleStore.getDepartures(dt)
  const patternMap = new Map(scheduleStore.routePatterns.map(rp => [rp.routeKey, rp]))
  const positions = computeActiveBusPositions(deps, patternMap, scheduleStore.stations, scheduleStore.routePaths, scheduleStore.routeStops, now)
  const visible = positions.filter(p => mapStore.visibleRoutes.has(p.routeKey))
  busPositions.value = visible
  mapStore.setBusPositions(visible)

  if (trackedBusId.value) {
    const t = visible.find(p => p.departureId === trackedBusId.value)
    if (t) {
      const px = wgs84ToPixel(t.lng, t.lat)
      const vw = mapContainer.value?.clientWidth ?? window.innerWidth
      const vh = mapContainer.value?.clientHeight ?? window.innerHeight
      scale.value = 1.6
      panX.value = vw / 2 - px.x * scale.value
      panY.value = vh / 2 - px.y * scale.value
      clampPan() // 应用边界限制
      trackedBusId.value = null
    }
  }
  animFrameId = requestAnimationFrame(animate)
}

function selectStop(name: string) { mapStore.selectStop(name) }

// ---- 初始化 ----
let initializing = false

function initMapView() {
  if (scheduleStore.stations.length === 0) return // 数据未到，等 watch 触发

  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight

  // 计算所有站点的边界范围，以便初始显示整个校园
  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (const station of scheduleStore.stations) {
    minLng = Math.min(minLng, station.lng)
    maxLng = Math.max(maxLng, station.lng)
    minLat = Math.min(minLat, station.lat)
    maxLat = Math.max(maxLat, station.lat)
  }

  // 计算边界中心点
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const centerPx = wgs84ToPixel(centerLng, centerLat)

  // 计算边界像素范围
  const topLeft = wgs84ToPixel(minLng, maxLat)
  const bottomRight = wgs84ToPixel(maxLng, minLat)
  const boundsW = bottomRight.x - topLeft.x
  const boundsH = bottomRight.y - topLeft.y

  // 计算合适的缩放比例，留出边距（上多下少，整体放大）
  const paddingTop = 50
  const paddingBottom = 20
  const paddingLeft = 40
  const paddingRight = 40
  const scaleX = (vw - paddingLeft - paddingRight) / boundsW
  const scaleY = (vh - paddingTop - paddingBottom) / boundsH
  const initialScale = Math.min(scaleX, scaleY, 0.7) // 最大0.7，更贴近

  // 设置初始缩放和位置，让整个校园居中显示（上多下少）
  scale.value = initialScale
  panX.value = vw / 2 - centerPx.x * scale.value
  panY.value = (vh - paddingBottom + paddingTop) / 2 - centerPx.y * scale.value
  clampPan() // 应用边界限制

  // 路线可见性
  initializing = true
  const q = route.query
  if (q.route) { mapStore.toggleRouteOnly(q.route as string) }
  else { mapStore.setAllRoutesVisible() }
  initializing = false

  animFrameId = requestAnimationFrame(animate)
  if (q.bus) trackedBusId.value = q.bus as string

  mapLoading.value = false
}

onMounted(() => {
  initMapView()
})

// 数据异步加载：首次进入时 stations 可能为空，等数据到齐重新初始化
watch(() => scheduleStore.isDataLoaded, (loaded) => {
  if (loaded) initMapView()
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
})

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
        <!-- 卫星底图（GPU 加速优化） -->
        <img :src="`${BASE_URL}data/campus-satellite.jpg`" :width="IMG_W" :height="IMG_H"
          style="display:block;user-select:none;pointer-events:none;will-change:transform;transform:translateZ(0);backface-visibility:hidden"
          decoding="async" loading="lazy" draggable="false">

        <!-- SVG 路线折线（与底图共用 transform，消除不同浏览器渲染偏差） -->
        <svg style="position:absolute;top:0;left:0;width:1px;height:1px;overflow:visible;pointer-events:none;">
          <g v-for="(line, i) in routeLines" :key="'l'+i">
            <polyline
              :points="line.points" fill="none" :stroke="line.color"
              :stroke-width="STROKE_WIDTH" stroke-opacity="0.7"
              :stroke-dasharray="line.dashed ? '10 6' : undefined"
              stroke-linecap="round" stroke-linejoin="round"
              vector-effect="non-scaling-stroke" />
          </g>
        </svg>

        <!-- 站点标记（与底图共用 transform） -->
        <div v-for="(m, i) in stationMarkers" :key="'s'+i"
          :style="{
            position: 'absolute',
            left: m.x + 'px',
            top: m.y + 'px',
            transform: `translate(-50%,-100%) scale(${invScale})`,
            transformOrigin: 'bottom center',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }"
          @click="selectStop(m.name)">
          <template v-if="mapStore.showLabels">
            <div :style="{
              background: m.color,
              borderRadius: '10px',
              padding: '3px 8px',
              whiteSpace: 'nowrap',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '1'
            }">
              <span style="color:white;font-size:10px;font-weight:600;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">{{ m.name }}</span>
            </div>
          </template>
          <div :style="{
            width: CIRCLE_RADIUS * 2 + 'px',
            height: CIRCLE_RADIUS * 2 + 'px',
            borderRadius: '50%',
            background: m.color,
            border: '2px solid white',
            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            margin: '0 auto'
          }"></div>
        </div>

        <!-- 用户位置（与底图共用 transform） -->
        <div v-if="userPixel" :style="{
          position: 'absolute',
          left: userPixel.x + 'px',
          top: userPixel.y + 'px',
          transform: `translate(-50%,-50%) scale(${invScale})`,
          transformOrigin: 'center',
          pointerEvents: 'none'
        }">
          <div style="width:16px;height:16px;border-radius:50%;background:rgba(59,130,246,0.2);"></div>
          <div style="width:10px;height:10px;border-radius:50%;background:#3B82F6;border:3px solid white;position:absolute;top:3px;left:3px;"></div>
        </div>

        <!-- 公交车标记（与底图共用 transform） -->
        <div v-for="b in busMarkers" :key="b.departureId"
          class="bus-marker"
          :style="{
            position: 'absolute',
            left: b.px + 'px',
            top: b.py + 'px',
            transform: `translate(-50%,-50%) scale(${invScale})`,
            transformOrigin: 'center',
            zIndex: 10
          }"
          v-html="busIconHtml(b.routeKey, b.shiftName, b.heading)" />
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
  pointer-events: none;
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
