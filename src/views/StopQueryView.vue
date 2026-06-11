<script setup lang="ts">
import { ref, computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import RouteBadge from '@/components/common/RouteBadge.vue'
import ETAIndicator from '@/components/common/ETAIndicator.vue'

const scheduleStore = useScheduleStore()
const searchText = ref('')
const selectedStop = ref<string | null>(null)
const dateType = computed(() => getDateType())
const secondsNow = computed(() => getSecondsSinceMidnight())

// 所有站点名
const allStops = computed(() => {
  return scheduleStore.stations.map((s) => s.name)
})

// 搜索过滤的站点
const filteredStops = computed(() => {
  if (!searchText.value) return allStops.value
  return allStops.value.filter((s) => s.includes(searchText.value))
})

// 当前站点的到站预测
const arrivals = computed(() => {
  if (!selectedStop.value) return []
  const preds = scheduleStore.getPredictionsForStop(selectedStop.value, dateType.value)

  return preds
    .map((p) => {
      let delta = p.arrivalMinutes * 60 - secondsNow.value
      if (delta < -3600) return null
      if (delta < -120) return null
      if (delta > 3600) return null

      const departure = scheduleStore.departures.find(
        (d) => d.recordId === p.departureId
      )

      return {
        ...p,
        departure,
        secondsUntil: Math.round(delta),
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.secondsUntil - b.secondsUntil)
})

function selectStop(name: string) {
  selectedStop.value = name
}

function clearStop() {
  selectedStop.value = null
  searchText.value = ''
}
</script>

<template>
  <div class="stop-page">
    <!-- 搜索 -->
    <div class="search-bar">
      <van-search
        v-model="searchText"
        placeholder="搜索站点名称"
        shape="round"
        background="transparent"
      />
    </div>

    <!-- 站点列表或到站列表 -->
    <div v-if="!selectedStop" class="stop-list">
      <div class="section-title">所有站点 ({{ allStops.length }})</div>
      <div class="stop-grid">
        <div
          v-for="stop in filteredStops"
          :key="stop"
          class="stop-chip"
          @click="selectStop(stop)"
        >
          {{ stop }}
        </div>
      </div>
    </div>

    <!-- 选中站点的到站列表 -->
    <div v-else class="arrivals">
      <div class="arrival-header">
        <van-icon name="arrow-left" @click="clearStop" />
        <span class="arrival-stop-name">{{ selectedStop }}</span>
        <span class="arrival-date">{{ dateType === 'weekday' ? '工作日' : '周末/节假日' }}</span>
      </div>

      <div v-if="arrivals.length === 0" class="empty">
        当前时段无经过此站的车次
      </div>

      <div
        v-for="(item, idx) in arrivals"
        :key="idx"
        class="arrival-card"
      >
        <div class="arrival-left">
          <RouteBadge
            :route="(item as any).departure?.route"
            :dining="(item as any).departure?.routeKey === 'HX1_DINING'"
          />
          <span class="arrival-time">{{ (item as any).arrivalTime }}</span>
        </div>
        <div class="arrival-right">
          <ETAIndicator
            :seconds-until="(item as any).secondsUntil"
          />
          <div class="arrival-meta">
            <template v-if="(item as any).departure">
              {{ (item as any).departure.departureTime }} 发车
              <template v-if="(item as any).departure.confidence === 'speculative'">
                · <span class="spec-tag">待确认</span>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stop-page {
  padding: 0 0 20px;
}

.search-bar {
  padding: 8px 16px;
  background: var(--color-card);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  padding: 16px 16px 10px;
}

.stop-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px;
}
.stop-chip {
  padding: 8px 14px;
  background: var(--color-card);
  border-radius: 20px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.15s;
}
.stop-chip:active {
  background: #EFF6FF;
  border-color: var(--color-primary);
}

.arrivals {
  padding: 0;
}
.arrival-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
}
.arrival-stop-name {
  font-size: 17px;
  font-weight: 600;
  flex: 1;
}
.arrival-date {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.arrival-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--color-card);
  border-bottom: 1px solid #F3F4F6;
}
.arrival-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.arrival-time {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.arrival-right {
  text-align: right;
}
.arrival-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.spec-tag {
  color: #92400E;
  font-weight: 500;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
}
</style>
