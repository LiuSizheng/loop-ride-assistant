<script setup lang="ts">
import { useMapStore } from '@/stores/map'

const mapStore = useMapStore()

const legendItems = [
  { key: 'HX1_NORMAL', label: '环线1路', color: '#2563EB' },
  { key: 'HX1_DINING', label: '就餐专线', color: '#F59E0B' },
  { key: 'HX2_NORMAL', label: '环线2路', color: '#10B981' },
  { key: 'HX3_NORMAL', label: '环线3路', color: '#8B5CF6' },
]

function isVisible(key: string): boolean {
  if (key === 'HX3_NORMAL') {
    return mapStore.visibleRouteList.includes('HX3_NORMAL') || mapStore.visibleRouteList.includes('HX3_GAOCHAO')
  }
  return mapStore.visibleRouteList.includes(key)
}

function toggleVisibility(key: string) {
  if (key === 'HX3_NORMAL') {
    // Toggle both 环线3路 variants together
    const next = new Set(mapStore.visibleRoutes)
    const visible = next.has('HX3_NORMAL') || next.has('HX3_GAOCHAO')
    if (visible) {
      next.delete('HX3_NORMAL')
      next.delete('HX3_GAOCHAO')
    } else {
      next.add('HX3_NORMAL')
      next.add('HX3_GAOCHAO')
    }
    mapStore.visibleRoutes = next
    return
  }
  mapStore.toggleRoute(key)
}
</script>

<template>
  <div class="map-legend">
    <!-- 路线切换 -->
    <div
      v-for="item in legendItems"
      :key="item.key"
      class="legend-item"
      :class="{ active: isVisible(item.key) }"
      @click="toggleVisibility(item.key)"
    >
      <span class="legend-dot" :style="{ background: item.color }"></span>
      <span class="legend-label">{{ item.label }}</span>
      <van-icon v-if="isVisible(item.key)" name="success" size="14" color="#10B981" />
    </div>

    <!-- 分隔 -->
    <div class="legend-divider"></div>

    <!-- 站名显示/隐藏 -->
    <div class="legend-item" @click="mapStore.toggleLabels()">
      <van-icon :name="mapStore.showLabels ? 'eye-o' : 'closed-eye'" size="16" />
      <span class="legend-label">{{ mapStore.showLabels ? '隐藏站名' : '显示站名' }}</span>
    </div>
  </div>
</template>

<style scoped>
.map-legend {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 60;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 12px;
  padding: 8px 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  min-width: 140px;
}
.legend-divider {
  height: 1px;
  background: #E5E7EB;
  margin: 4px 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
  user-select: none;
}
.legend-item:active {
  background: #F3F4F6;
}
.legend-item.active {
  opacity: 1;
}
.legend-item:not(.active) {
  opacity: 0.35;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-label {
  flex: 1;
  white-space: nowrap;
  color: var(--color-text);
}
</style>
