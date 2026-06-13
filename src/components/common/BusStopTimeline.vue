<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
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

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { tick.value++ }, 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  HX2_NORMAL: '#10B981', HX3_NORMAL: '#8B5CF6', HX3_GAOCHAO: '#7C3AED',
}
const routeColor = computed(() => ROUTE_COLORS[props.routeKey] || '#6B7280')

const stops = computed<ArrivalPrediction[]>(() => {
  return scheduleStore.predictions
    .filter((p) => p.departureId === props.departureId)
    .sort((a, b) => a.stopSeq - b.stopSeq)
})

// 各段时长（秒），用于按比例分配间距
const segmentDurations = computed(() => {
  const s = stops.value
  const d: number[] = []
  for (let i = 1; i < s.length; i++) {
    d.push(Math.max(1, s[i].cumulativeSeconds - s[i - 1].cumulativeSeconds))
  }
  return d
})

const totalDuration = computed(() => {
  const s = stops.value
  if (s.length < 2) return 1
  return s[s.length - 1].cumulativeSeconds - s[0].cumulativeSeconds
})

const busProgress = computed(() => {
  void tick.value
  if (stops.value.length < 2) return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }
  const nowSec = getSecondsSinceMidnight(getNow())
  const departureMin = stops.value[0]?.departureMinutes ?? 0
  if (nowSec < departureMin) return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }
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
      return { currentIdx: i - 1, fraction: Math.max(0, Math.min(1, fraction)), isBeforeStart: false, isAfterEnd: false }
    }
  }
  return { currentIdx: stops.value.length - 1, fraction: 0, isBeforeStart: false, isAfterEnd: true }
})

// 按时间比例计算进度（0~1）
const progressFraction = computed(() => {
  const { currentIdx, fraction, isBeforeStart, isAfterEnd } = busProgress.value
  const s = stops.value
  if (s.length < 2 || isBeforeStart) return 0
  if (isAfterEnd) return 1
  const elapsed = s[currentIdx].cumulativeSeconds + fraction * (segmentDurations.value[currentIdx] || 1)
  return elapsed / totalDuration.value
})

const showBus = computed(() => !busProgress.value.isBeforeStart && !busProgress.value.isAfterEnd)

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

// 公交位置：按时间比例映射到进度条区间（top:11px ~ bottom:11px）
const busTopStyle = computed(() => {
  if (!showBus.value) return '0px'
  const p = progressFraction.value * 100
  return `calc(${p}% - ${p * 0.22}px + 11px)`
})

// 进度条渐变
const railStyle = computed(() => {
  const pct = Math.round(progressFraction.value * 100)
  return { background: `linear-gradient(to bottom, ${routeColor.value} ${pct}%, #E5E7EB ${pct}%)` }
})

// 各占位段 flex-grow = 段时长（按比例分配间距）
function spacerFlex(idx: number): Record<string, string> {
  const dur = segmentDurations.value[idx] || 1
  return { flex: `${dur} 0 0` }
}
</script>

<template>
  <div class="timeline-root">
    <div class="stop-list">
      <div class="progress-rail" :style="railStyle"></div>

      <div v-if="showBus" class="bus-on-line" :style="{ top: busTopStyle }">
        <img :src="`${BASE_URL}${iconFile}`" width="20" height="20"
          style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))" />
      </div>

      <div v-for="(stop, idx) in stops" :key="idx" class="stop-row">
        <div class="stop-indicator">
          <div v-if="stop.isDepartureStop" class="dot start">发</div>
          <div v-else-if="stop.isReturnStop" class="dot end">终</div>
          <div v-else class="dot normal"
            :class="{ passed: idx <= busProgress.currentIdx && !busProgress.isBeforeStart }"
            :style="(idx <= busProgress.currentIdx && !busProgress.isBeforeStart) ? { background: routeColor } : {}"
          ></div>
          <div v-if="idx < stops.length - 1" class="spacer" :style="spacerFlex(idx)"></div>
        </div>
        <span class="stop-name">{{ stop.stopName }}</span>
        <span class="stop-time">{{ stop.arrivalTime }}</span>
      </div>
    </div>

    <div class="timeline-footer" @click.stop="handleViewOnMap">
      <span>在地图上查看</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/>
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
.bus-on-line {
  position: absolute;
  left: 9px;
  z-index: 3;
  transform: translate(-50%, -50%);
  transition: top 0.5s linear;
  pointer-events: none;
}

/* 核心：stop-list 使用 flex 列布局，spacer 按时间比例分配高度 */
.stop-list {
  position: relative;
  display: flex;
  flex-direction: column;
}
.stop-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 0;
  font-size: 13px;
  line-height: 20px;
}
.stop-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 18px;
  flex-shrink: 0;
  align-self: stretch;
  position: relative;
  z-index: 2;
}
/* 圆点上方加对称占位，使圆点位于 indicator 垂直中心 → 与同行文字中心对齐 */
.stop-indicator::before {
  content: '';
  flex: 1 1 0;
  min-height: 0;
}
.dot {
  width: 8px; height: 8px;
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
/* 占位段：flex-grow 按段时长比例，最小 4px */
.spacer {
  width: 2px;
  flex: 1 0 4px;
  min-height: 4px;
}

.progress-rail {
  position: absolute;
  left: 8px;
  top: 11px;
  bottom: 11px;
  width: 2px;
  z-index: 1;
  border-radius: 1px;
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
  display: flex; align-items: center; justify-content: center;
  gap: 6px; padding: 8px 0 10px; margin-top: 4px;
  font-size: 12px; color: var(--color-primary);
  cursor: pointer; user-select: none;
  border-top: 1px dashed #E5E7EB;
}
.timeline-footer:active { opacity: 0.7; }
</style>
