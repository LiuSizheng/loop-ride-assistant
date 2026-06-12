<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType, getDateTypeLabel } from '@/utils/datetime'
import type { RouteName, DateType } from '@/types'
import RouteBadge from '@/components/common/RouteBadge.vue'

const scheduleStore = useScheduleStore()
const selectedRoute = ref<RouteName>('环线1路')
const selectedDateType = ref<DateType>(getDateType())
const expandedId = ref<string | null>(null)

const routes: RouteName[] = ['环线1路', '环线2路', '环线3路']

// 当前查询的发车列表
const departures = computed(() => {
  return scheduleStore.getDepartures(selectedDateType.value, selectedRoute.value)
})

// 按班次分组（按数字顺序排序）
const groupedDepartures = computed(() => {
  const groups = new Map<string, typeof departures.value>()
  for (const dep of departures.value) {
    if (!groups.has(dep.shiftName)) {
      groups.set(dep.shiftName, [])
    }
    groups.get(dep.shiftName)!.push(dep)
  }
  // 按班次名中的数字排序（第一班=1, 第二班=2...）
  // 中文数字映射
  const cnNum: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 }
  function shiftOrder(name: string): number {
    // 尝试从中文名提取数字：第一班→1, 第四班（夜1）→4
    for (const [cn, n] of Object.entries(cnNum)) {
      if (name.includes(cn)) return n
    }
    return 0
  }
  const sorted = new Map([...groups.entries()].sort((a, b) => {
    return shiftOrder(a[0]) - shiftOrder(b[0])
  }))
  return sorted
})

function toggleExpand(recordId: string) {
  expandedId.value = expandedId.value === recordId ? null : recordId
}

// 获取某条发车的站序
function getStopSequence(dep: (typeof departures.value)[0]) {
  const pattern = scheduleStore.getPattern(dep.routeKey)
  if (!pattern) return []
  const preds = scheduleStore.predictions.filter(
    (p) => p.departureId === dep.recordId
  )
  return preds.sort((a, b) => a.stopSeq - b.stopSeq)
}

function isDining(dep: (typeof departures.value)[0]): boolean {
  return dep.routeKey === 'HX1_DINING'
}

// 周末切换环线1路时，提醒不可用
watch(selectedRoute, (r) => {
  if (r === '环线1路' && selectedDateType.value === 'weekend_holiday') {
    selectedDateType.value = 'weekday'
  }
})
</script>

<template>
  <div class="schedule-page">
    <!-- 线路选择 -->
    <van-tabs
      v-model:active="selectedRoute"
      type="card"
      color="var(--color-primary)"
      @update:active="(name: string) => selectedRoute = name as RouteName"
    >
      <van-tab v-for="r in routes" :key="r" :name="r" :title="r" />
    </van-tabs>

    <!-- 日期类型切换 -->
    <div class="date-toggle">
      <van-button
        :type="selectedDateType === 'weekday' ? 'primary' : 'default'"
        size="small"
        @click="selectedDateType = 'weekday'"
      >工作日</van-button>
      <van-button
        :type="selectedDateType === 'weekend_holiday' ? 'primary' : 'default'"
        size="small"
        @click="selectedDateType = 'weekend_holiday'"
      >周末/节假日</van-button>
    </div>

    <!-- 环线1路周末提示 -->
    <div
      v-if="selectedRoute === '环线1路' && selectedDateType === 'weekend_holiday'"
      class="notice"
    >
      环线1路仅在<strong>工作日</strong>运行，周末/节假日无环线1路车次。
    </div>

    <!-- 发车列表按班次分组 -->
    <div v-if="departures.length > 0" class="departures">
      <div v-for="[shift, deps] in groupedDepartures" :key="shift" class="shift-group">
        <div class="shift-title">{{ shift }}</div>
        <div
          v-for="dep in deps"
          :key="dep.recordId"
          class="dep-row"
          :class="{ expanded: expandedId === dep.recordId }"
        >
          <div class="dep-main" @click="toggleExpand(dep.recordId)">
            <div class="dep-left">
              <RouteBadge :route="dep.route" :dining="isDining(dep)" />
              <span class="dep-time">{{ dep.departureTime }}</span>
              <span class="dep-station" v-if="dep.isGaochaoDeparture">高超楼发车</span>
            </div>
            <div class="dep-right">
              <span v-if="dep.confidence === 'speculative'" class="tag-spec">
                待确认
              </span>
              <span v-if="isDining(dep)" class="tag-dining">就餐</span>
              <van-icon name="arrow-down" :class="{ rotated: expandedId === dep.recordId }" />
            </div>
          </div>

          <!-- 展开的站点序列 -->
          <div v-if="expandedId === dep.recordId" class="stop-sequence">
            <div
              v-for="(stop, idx) in getStopSequence(dep)"
              :key="idx"
              class="stop-row"
              :class="{ 'is-start': stop.isDepartureStop, 'is-end': stop.isReturnStop }"
            >
              <div class="stop-indicator">
                <div v-if="stop.isDepartureStop" class="dot start">发</div>
                <div v-else-if="stop.isReturnStop" class="dot end">终</div>
                <div v-else class="dot normal"></div>
                <div v-if="idx < getStopSequence(dep).length - 1" class="line"></div>
              </div>
              <span class="stop-name">{{ stop.stopName }}</span>
              <span class="stop-time">{{ stop.arrivalTime }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="scheduleStore.isDataLoaded" class="empty">
      该日期类型暂无此线路发车
    </div>
  </div>
</template>

<style scoped>
.schedule-page {
  padding-bottom: 20px;
}

.date-toggle {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-card);
}

.notice {
  margin: 12px 16px;
  padding: 12px;
  background: #FEF3C7;
  color: #92400E;
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
}

.shift-group {
  padding: 0 16px;
}
.shift-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 12px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dep-row {
  background: var(--color-card);
  border-radius: 8px;
  margin-bottom: 4px;
  overflow: hidden;
}
.dep-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}
.dep-main:active {
  background: #F9FAFB;
}
.dep-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dep-time {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dep-station { font-size: 11px; color: #F59E0B; white-space: nowrap; }
.dep-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-spec {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #FEF3C7;
  color: #92400E;
}
.tag-dining {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #FDE68A;
  color: #7C2D12;
}

.rotated {
  transform: rotate(180deg);
  transition: transform 0.2s;
}

.stop-sequence {
  padding: 4px 14px 12px 26px;
  border-top: 1px solid var(--color-border);
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
}
.dot.normal { background: #CBD5E1; }
.dot.start { background: var(--color-hx2); width: 16px; height: 16px; font-size: 10px; color: #fff; display: flex; align-items: center; justify-content: center; }
.dot.end { background: var(--color-hx1); width: 16px; height: 16px; font-size: 10px; color: #fff; display: flex; align-items: center; justify-content: center; }
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
.is-start .stop-name,
.is-end .stop-name {
  font-weight: 600;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}
</style>
