<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType, getDateTypeLabel } from '@/utils/datetime'
import type { RouteName, DateType } from '@/types'
import RouteBadge from '@/components/common/RouteBadge.vue'
import BusStopTimeline from '@/components/common/BusStopTimeline.vue'

const scheduleStore = useScheduleStore()
const selectedRoute = ref<RouteName>('环线1路')
const selectedDateType = ref<DateType>(getDateType())
const expandedId = ref<string | null>(null)

const routes: RouteName[] = ['环线1路', '环线2路', '环线3路']

// ─── 行程规划 ───
const plannerMode = ref(false)
const planOrigin = ref('')
const planDest = ref('')
const planDeadline = ref('') // "HH:MM"
const planResults = ref<any[]>([])

const allStops = computed(() => {
  const names = new Set<string>()
  for (const rp of scheduleStore.routePatterns) {
    for (const s of rp.stops) names.add(s.currentStop)
  }
  return [...names].sort()
})

function doSearch() {
  if (!planOrigin.value || !planDest.value || !planDeadline.value) return
  const [dh, dm] = planDeadline.value.split(':').map(Number)
  const deadlineMin = dh * 60 + dm
  const dt = selectedDateType.value
  const results: any[] = []

  for (const r of routes) {
    const deps = scheduleStore.getDepartures(dt, r)
    for (const dep of deps) {
      const preds = scheduleStore.predictions
        .filter(p => p.departureId === dep.recordId)
        .sort((a, b) => a.stopSeq - b.stopSeq)

      const originIdx = preds.findIndex(p => p.stopName === planOrigin.value)
      const destIdx = preds.findIndex(p => p.stopName === planDest.value)
      if (originIdx < 0 || destIdx < 0 || originIdx >= destIdx) continue

      const destPred = preds[destIdx]
      const arrivalMin = destPred.arrivalMinutes
      if (arrivalMin > deadlineMin) continue

      const originPred = preds[originIdx]
      results.push({
        departure: dep,
        boardStop: originPred.stopName,
        boardTime: originPred.arrivalTime,
        boardMinutes: originPred.arrivalMinutes,
        destStop: destPred.stopName,
        destTime: destPred.arrivalTime,
        destMinutes: destPred.arrivalMinutes,
        isBoardDeparture: originPred.isDepartureStop,
      })
    }
  }

  results.sort((a, b) => a.destMinutes - b.destMinutes)
  planResults.value = results
}

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
    <!-- 模式切换 -->
    <div class="mode-toggle">
      <span class="mode-btn" :class="{ active: !plannerMode }" @click="plannerMode = false">时刻表</span>
      <span class="mode-btn" :class="{ active: plannerMode }" @click="plannerMode = true">行程规划</span>
    </div>

    <!-- 行程规划面板 -->
    <div v-if="plannerMode" class="planner-panel">
      <div class="planner-row">
        <label>出发</label>
        <select v-model="planOrigin">
          <option value="">选择出发站</option>
          <option v-for="s in allStops" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="planner-row">
        <label>到达</label>
        <select v-model="planDest">
          <option value="">选择到达站</option>
          <option v-for="s in allStops" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="planner-row">
        <label>期限</label>
        <input v-model="planDeadline" type="time" placeholder="在此时间前到达" />
      </div>
      <van-button type="primary" block round @click="doSearch" :disabled="!planOrigin || !planDest || !planDeadline">查询可乘线路</van-button>

      <!-- 结果 -->
      <div v-if="planResults.length > 0" class="plan-results">
        <div class="plan-result-title">找到 {{ planResults.length }} 趟可乘车次</div>
        <div v-for="(r, i) in planResults" :key="i" class="plan-card">
          <div class="plan-card-top">
            <RouteBadge :route="r.departure.route" :dining="r.departure.routeKey === 'HX1_DINING'" />
            <span class="plan-shift">{{ r.departure.shiftName }}</span>
            <span class="plan-from" v-if="r.departure.isGaochaoDeparture">高超楼发车</span>
          </div>
          <div class="plan-card-body">
            <div class="plan-step">
              <span class="plan-step-dot start"></span>
              <span class="plan-step-text">{{ r.boardTime }} 在「{{ r.boardStop }}」{{ r.isBoardDeparture ? '发车' : '上车' }}</span>
            </div>
            <div class="plan-step-line"></div>
            <div class="plan-step">
              <span class="plan-step-dot end"></span>
              <span class="plan-step-text">{{ r.destTime }} 到达「{{ r.destStop }}」</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="planResults.length === 0 && planOrigin" class="plan-empty">该时段无可乘线路</div>
    </div>

    <!-- 时刻表模式 -->
    <template v-if="!plannerMode">
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

          <!-- 展开的站点序列（带公交车动画） -->
          <BusStopTimeline
            v-if="expandedId === dep.recordId"
            :departure-id="dep.recordId"
            :route-key="dep.routeKey"
            :show-map-btn="false"
          />
        </div>
      </div>
    </div>

    <div v-else-if="scheduleStore.isDataLoaded" class="empty">
      该日期类型暂无此线路发车
    </div>
    </template>
  </div>
</template>

<style scoped>
.schedule-page {
  padding-bottom: 20px;
}

/* 模式切换 */
.mode-toggle {
  display: flex; padding: 8px 16px; gap: 8px; background: var(--color-card);
}
.mode-btn {
  padding: 4px 16px; border-radius: 14px; font-size: 13px; cursor: pointer;
  background: #F3F4F6; color: var(--color-text-secondary); user-select: none;
}
.mode-btn.active { background: var(--color-primary); color: #fff; }

/* 行程规划 */
.planner-panel { padding: 12px 16px; }
.planner-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px;
}
.planner-row label { width: 36px; color: var(--color-text-secondary); flex-shrink: 0; }
.planner-row select, .planner-row input {
  flex: 1; padding: 6px 10px; border: 1px solid var(--color-border);
  border-radius: 8px; font-size: 14px; outline: none; background: #fff;
}
.planner-row select:focus, .planner-row input:focus { border-color: var(--color-primary); }

.plan-results { margin-top: 16px; }
.plan-result-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; }
.plan-card {
  background: var(--color-card); border-radius: 10px; padding: 12px 14px;
  margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.plan-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.plan-shift { font-size: 13px; color: var(--color-text-secondary); }
.plan-from { font-size: 11px; color: #F59E0B; }
.plan-card-body { padding-left: 8px; }
.plan-step { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.plan-step-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.plan-step-dot.start { background: var(--color-hx2); }
.plan-step-dot.end { background: var(--color-hx1); }
.plan-step-line {
  width: 2px; height: 10px; background: #E5E7EB; margin: 1px 3px;
}
.plan-step-text { font-size: 13px; color: var(--color-text); }
.plan-empty { text-align: center; padding: 24px; color: var(--color-text-secondary); font-size: 13px; }

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

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}
</style>
