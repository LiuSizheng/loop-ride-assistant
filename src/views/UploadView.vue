<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUploadStore } from '@/stores/upload'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { findNearestStop } from '@/utils/geo'
import { showConfirmDialog, showSuccessToast, showFailToast } from 'vant'

const uploadStore = useUploadStore()
const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
useGeolocation()

const tabActive = ref(0)
const nickInput = ref(uploadStore.nickname)

// 表单
const selectedRoute = ref('环线1路')
const vehicleNo = ref('')
const dateStr = ref(new Date().toISOString().slice(0, 10))

// 线路选项
const routeOptions = ['环线1路', '环线2路', '环线3路', '就餐专线']

// routeKey 映射
const routeToKey: Record<string, string> = {
  '环线1路': 'HX1_NORMAL', '环线2路': 'HX2_NORMAL', '环线3路': 'HX3_NORMAL', '就餐专线': 'HX1_DINING'
}

// 当前路线的站点序列
const routeStops = computed(() => {
  const rk = routeToKey[selectedRoute.value]
  const rp = scheduleStore.routePatterns.find(p => p.routeKey === rk)
  if (!rp) return []
  return rp.stops.filter(s => !s.isReturnStop).map(s => s.currentStop)
})

// 推荐最近上车站点
const nearestRouteStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  // 只从当前路线的站点中找
  const routeStopNames = new Set(routeStops.value)
  const routeStations = scheduleStore.stations.filter(s => routeStopNames.has(s.name))
  const result = findNearestStop(mapStore.userLat, mapStore.userLng, routeStations)
  return result?.station.name ?? null
})

// 已完成的段数
const recordedCount = computed(() => uploadStore.recordedSegments.length)
// 当前应该记录第几站（0 = 还没上车，>= 1 = 正在计时）
const currentStopIdx = computed(() => uploadStore.recordedSegments.length)

const canSubmit = computed(() =>
  !!uploadStore.nickname && recordedCount.value > 0 && !uploadStore.uploading
)

function saveNick() {
  uploadStore.saveNickname(nickInput.value)
}

// 选择上车站点 → 开始计时
function boardAt(stopName: string) {
  if (uploadStore.timingActive) return
  uploadStore.startRecordingAt(stopName, routeStops.value)
  showSuccessToast(`已上车：${stopName}`)
}

// 按顺序记录到站
function tapStop(stopName: string) {
  if (!uploadStore.timingActive) return
  const idx = routeStops.value.indexOf(stopName)
  if (idx <= currentStopIdx.value) return // 已经过了
  if (idx !== currentStopIdx.value + 1) {
    showFailToast('请按站点顺序依次记录')
    return
  }
  uploadStore.recordSegment(stopName)
}

function isStopRecorded(idx: number): boolean {
  return idx > currentStopIdx.value && idx <= recordedCount.value + currentStopIdx.value
}
function getSegmentSeconds(idx: number): string {
  const segIdx = idx - currentStopIdx.value - 1
  if (segIdx < 0 || segIdx >= uploadStore.segmentSeconds.length) return ''
  return `${uploadStore.segmentSeconds[segIdx]}秒`
}
function isBoardingStop(idx: number): boolean {
  return idx === currentStopIdx.value && uploadStore.timingActive
}
function isCurrentStop(idx: number): boolean {
  return idx === currentStopIdx.value + 1 && uploadStore.timingActive
}

async function handleSubmit() {
  try {
    await showConfirmDialog({
      title: '确认提交',
      message: `提交 ${recordedCount.value} 段行程记录？`,
    })
  } catch { return }

  const ok = await uploadStore.submit({
    route: selectedRoute.value,
    shift: '',
    departTime: '',
    vehicleNo: vehicleNo.value || undefined,
    date: dateStr.value,
  })
  if (ok) {
    showSuccessToast('提交成功！')
  } else {
    showFailToast('提交失败，请重试')
  }
}

// 加载历史
watch(tabActive, (v) => {
  if (v === 1) uploadStore.loadHistory()
})
onMounted(() => {
  if (tabActive.value === 1) uploadStore.loadHistory()
})
watch(selectedRoute, () => { uploadStore.resetRecording() })
</script>

<template>
  <div class="upload-page">
    <van-tabs v-model:active="tabActive">
      <!-- Tab 1: 记录上传 -->
      <van-tab title="记录上传">
        <div class="form-section">
          <!-- 昵称 -->
          <div class="nick-row">
            <span>昵称</span>
            <input v-model="nickInput" placeholder="输入你的昵称" @blur="saveNick" class="nick-input" />
          </div>

          <!-- 线路 -->
          <div class="field-row">
            <span class="label">线路</span>
            <van-radio-group v-model="selectedRoute" direction="horizontal">
              <van-radio v-for="r in routeOptions" :key="r" :name="r">{{ r.replace('环线1路','环1').replace('环线2路','环2').replace('环线3路','环3').replace('就餐专线','就餐') }}</van-radio>
            </van-radio-group>
          </div>

          <!-- 车号/日期 -->
          <div class="field-row">
            <span class="label">车号</span>
            <input v-model="vehicleNo" placeholder="选填" class="text-input" />
            <span class="label" style="margin-left:12px">日期</span>
            <input type="date" v-model="dateStr" class="text-input" />
          </div>

          <!-- 站点 + 计时 -->
          <div v-if="routeStops.length" class="stops-section">
            <!-- 推荐上车：定位最近站点 -->
            <div v-if="nearestRouteStop && !uploadStore.timingActive" class="nearest-card" @click="boardAt(nearestRouteStop)">
              <van-icon name="location-o" />
              <span>距你最近「{{ nearestRouteStop }}」，点此一键上车</span>
            </div>

            <div class="stops-title" v-if="!uploadStore.timingActive">或者手动选择上车站点</div>
            <div class="stops-title" v-else>到站请点「计时」</div>

            <div v-for="(stop, idx) in routeStops" :key="stop" class="stop-row">
              <span class="stop-dot" :class="{
                done: isStopRecorded(idx),
                boarding: isBoardingStop(idx),
                current: isCurrentStop(idx)
              }">{{ isBoardingStop(idx) ? '上' : isStopRecorded(idx) ? '✓' : idx + 1 }}</span>
              <span class="stop-name" :class="{ bold: isBoardingStop(idx) }">{{ stop }}</span>
              <span v-if="isStopRecorded(idx)" class="seg-secs">{{ getSegmentSeconds(idx) }}</span>
              <van-button
                v-if="!uploadStore.timingActive"
                size="small"
                type="primary"
                round
                @click="boardAt(stop)"
              >上车</van-button>
              <van-button
                v-if="isCurrentStop(idx)"
                size="small"
                type="warning"
                round
                @click="tapStop(stop)"
              >计时</van-button>
            </div>

            <!-- 提交 -->
            <div v-if="uploadStore.timingActive && recordedCount > 0" style="margin-top:16px">
              <van-button
                type="success"
                block
                round
                :disabled="!canSubmit"
                :loading="uploadStore.uploading"
                @click="handleSubmit"
              >{{ `已记录 ${recordedCount} 段，提交` }}</van-button>
            </div>
          </div>
        </div>
      </van-tab>

      <!-- Tab 2: 我的记录 -->
      <van-tab title="我的记录">
        <div class="history-section">
          <div v-if="!uploadStore.nickname" class="hint">请先在「记录上传」中输入昵称</div>
          <van-loading v-if="uploadStore.loadingHistory" size="24" style="margin:40px auto;display:block" />
          <div v-if="uploadStore.history.length === 0 && !uploadStore.loadingHistory && uploadStore.nickname" class="hint">暂无记录</div>

          <div v-for="rec in uploadStore.history" :key="rec.id" class="history-card">
            <div class="history-header">
              <span>{{ rec.date }} {{ rec.route }}</span>
              <van-button size="mini" type="danger" plain @click="uploadStore.deleteRecord(rec.id)">撤销</van-button>
            </div>
            <div class="history-segs">
              <span v-for="(seg, i) in rec.segments" :key="i" class="hseg">
                {{ i > 0 ? ' → ' : '' }}{{ seg.from }}→{{ seg.to }} {{ seg.seconds }}s
              </span>
            </div>
          </div>
        </div>
      </van-tab>
    </van-tabs>
  </div>
</template>

<style scoped>
.upload-page { padding-bottom: 20px; max-width: 480px; margin: 0 auto; }
.form-section { padding: 16px; }
.nick-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 15px; }
.nick-input { flex: 1; border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; font-size: 14px; outline: none; }
.nick-input:focus { border-color: var(--color-primary); }

.field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; flex-wrap: wrap; }
.label { color: var(--color-text-secondary); white-space: nowrap; min-width: 36px; }
.text-input { border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 8px; font-size: 13px; width: 80px; outline: none; }
.text-input:focus { border-color: var(--color-primary); }
.hint { color: var(--color-text-secondary); font-size: 13px; }

.stops-section { margin-top: 12px; }
.stops-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
.nearest-card {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; background: #EFF6FF; border-radius: 10px;
  border: 1px solid var(--color-primary); font-size: 14px; color: var(--color-primary);
  cursor: pointer; margin-bottom: 12px;
}
.nearest-card:active { background: #DBEAFE; }

.stop-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
.stop-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; background: #E5E7EB; color: #6B7280; flex-shrink: 0; }
.stop-dot.done { background: #10B981; color: #fff; }
.stop-dot.boarding { background: var(--color-primary); color: #fff; font-size: 10px; }
.stop-dot.current { background: #F59E0B; color: #fff; }
.stop-name { flex: 1; font-size: 14px; }
.stop-name.bold { font-weight: 600; }
.seg-secs { font-size: 13px; color: #10B981; font-weight: 600; min-width: 40px; text-align: right; }

.history-section { padding: 16px; }
.history-card { background: var(--color-card); border-radius: 10px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.history-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.history-segs { font-size: 12px; color: var(--color-text-secondary); line-height: 1.6; }
.hseg { white-space: nowrap; }
</style>
