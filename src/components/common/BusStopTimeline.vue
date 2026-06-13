<script setup lang="ts">
import { computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getNow } from '@/utils/time'
import { getSecondsSinceMidnight } from '@/utils/datetime'
import type { ArrivalPrediction } from '@/types'

const props = defineProps<{
  departureId: string
  routeKey: string
}>()

const emit = defineEmits<{
  'view-on-map': [departureId: string, routeKey: string]
}>()

const scheduleStore = useScheduleStore()

// 路线颜色
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB',
  HX1_DINING: '#F59E0B',
  HX2_NORMAL: '#10B981',
  HX3_NORMAL: '#8B5CF6',
  HX3_GAOCHAO: '#7C3AED',
}
const routeColor = computed(() => ROUTE_COLORS[props.routeKey] || '#6B7280')

// 获取该班次的所有站点预测（按 stopSeq 排序）
const stops = computed<ArrivalPrediction[]>(() => {
  return scheduleStore.predictions
    .filter((p) => p.departureId === props.departureId)
    .sort((a, b) => a.stopSeq - b.stopSeq)
})

// 当前时间进度：计算车辆在哪个站之间
const busProgress = computed(() => {
  if (stops.value.length < 2) return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }

  const nowSec = getSecondsSinceMidnight(getNow())
  const departureMin = stops.value[0]?.departureMinutes ?? 0

  if (nowSec < departureMin) {
    return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }
  }

  const lastStop = stops.value[stops.value.length - 1]
  if (nowSec >= lastStop.cumulativeSeconds + departureMin * 60) {
    return { currentIdx: stops.value.length - 1, fraction: 0, isBeforeStart: false, isAfterEnd: true }
  }

  for (let i = 1; i < stops.value.length; i++) {
    const segStart = stops.value[i - 1].cumulativeSeconds
    const segEnd = stops.value[i].cumulativeSeconds
    if (nowSec <= departureMin * 60 + segEnd) {
      const duration = segEnd - segStart
      const fraction = duration > 0 ? (nowSec - departureMin * 60 - segStart) / duration : 0
      return {
        currentIdx: i - 1,
        fraction: Math.max(0, Math.min(1, fraction)),
        isBeforeStart: false,
        isAfterEnd: false,
      }
    }
  }

  return { currentIdx: stops.value.length - 1, fraction: 0, isBeforeStart: false, isAfterEnd: true }
})

// 公交车图标在时间线上的位置百分比（对齐到站点圆点列的中心）
const busTopPercent = computed(() => {
  const { currentIdx, fraction, isBeforeStart, isAfterEnd } = busProgress.value
  const total = stops.value.length
  if (total <= 1) return 0
  if (isBeforeStart) return 0
  if (isAfterEnd) return 100
  return ((currentIdx + fraction) / (total - 1)) * 100
})

const showBus = computed(() => {
  return !busProgress.value.isBeforeStart && !busProgress.value.isAfterEnd
})

// 图标文件
const iconFile = computed(() => {
  if (props.routeKey === 'HX1_DINING') return 'icons/就餐专线.png'
  if (props.routeKey.includes('HX2')) return 'icons/环线2路.png'
  if (props.routeKey.includes('HX3')) return 'icons/环线3路.png'
  return 'icons/环线1路.png'
})

const BASE_URL = import.meta.env.BASE_URL

function handleViewOnMap() {
  emit('view-on-map', props.departureId, props.routeKey)
}
</script>

<template>
  <div class="timeline-root">
    <!-- 公交车图标 —— 沿垂直时间线移动 -->
    <div
      v-if="showBus"
      class="bus-on-line"
      :style="{ top: busTopPercent + '%' }"
    >
      <img
        :src="`${BASE_URL}${iconFile}`"
        width="20" height="20"
        style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))"
      />
    </div>

    <!-- 站点列表 -->
    <div class="stop-list">
      <div
        v-for="(stop, idx) in stops"
        :key="idx"
        class="stop-row"
      >
        <!-- 圆点 + 线 -->
        <div class="stop-indicator">
          <div v-if="stop.isDepartureStop" class="dot start">发</div>
          <div v-else-if="stop.isReturnStop" class="dot end">终</div>
          <div
            v-else
            class="dot normal"
            :class="{ passed: idx <= busProgress.currentIdx && !busProgress.isBeforeStart }"
            :style="(idx <= busProgress.currentIdx && !busProgress.isBeforeStart) ? { background: routeColor } : {}"
          ></div>
          <div v-if="idx < stops.length - 1" class="line"></div>
        </div>

        <span class="stop-name">{{ stop.stopName }}</span>
        <span class="stop-time">{{ stop.arrivalTime }}</span>
      </div>
    </div>

    <!-- 底部跳转地图 -->
    <div class="timeline-footer" @click.stop="handleViewOnMap">
      <span>在地图上查看</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/>
        <path d="M8 2v16M16 6v16"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.timeline-root {
  position: relative;
  padding: 4px 14px 0 26px;
  border-top: 1px solid var(--color-border);
  background: #FAFBFC;
}

/* 公交车在垂直线上 */
.bus-on-line {
  position: absolute;
  left: 17px;  /* 对齐 stop-indicator 中心（26px padding - 9px half indicator width） */
  z-index: 2;
  transform: translate(-50%, -50%);
  transition: top 0.8s ease;
  pointer-events: none;
}

.stop-list {
  position: relative;
}

.stop-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 0;
  font-size: 13px;
}

.stop-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 18px;
  flex-shrink: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.4s;
}
.dot.normal { background: #CBD5E1; }
.dot.normal.passed { box-shadow: 0 0 4px rgba(0,0,0,0.15); }
.dot.start {
  background: var(--color-hx2);
  width: 16px; height: 16px;
  font-size: 10px; color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.dot.end {
  background: var(--color-hx1);
  width: 16px; height: 16px;
  font-size: 10px; color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.line {
  width: 2px;
  height: 14px;
  background: #E5E7EB;
  margin: 2px 0;
}

.stop-name {
  flex: 1;
  color: var(--color-text);
}
.stop-time {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.timeline-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
  user-select: none;
  border-top: 1px dashed #E5E7EB;
}
.timeline-footer:active {
  opacity: 0.7;
}
</style>
