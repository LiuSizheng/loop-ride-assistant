<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUploadStore } from '@/stores/upload'
import { useScheduleStore } from '@/stores/schedule'
import { formatDate } from '@/utils/datetime'
import { showConfirmDialog, showSuccessToast, showFailToast } from 'vant'

const uploadStore = useUploadStore()
const scheduleStore = useScheduleStore()

const tabActive = ref(0)
const nickInput = ref(uploadStore.nickname)

// 表单
const selectedRoute = ref('环线1路')
const selectedShift = ref('')
const selectedDepartTime = ref('')
const vehicleNo = ref('')
const dateStr = ref(new Date().toISOString().slice(0, 10))

// 该线路下可选的班次（去重）
const routeShifts = computed(() => {
  const deps = scheduleStore.departures.filter(d => d.route === selectedRoute.value)
  const shifts = [...new Set(deps.map(d => d.shiftName))]
  return shifts.sort()
})

// 该班次下的发车时间
const shiftTimes = computed(() => {
  if (!selectedShift.value) return []
  const deps = scheduleStore.departures.filter(
    d => d.route === selectedRoute.value && d.shiftName === selectedShift.value
  )
  return [...new Set(deps.map(d => d.departureTime))]
})

// 当前路线的站点序列
const routeStops = computed(() => {
  const rp = scheduleStore.routePatterns.find(
    p => p.route === selectedRoute.value && p.routeKey.includes('NORMAL')
  )
  if (!rp) return []
  // 去掉终点重复（归位到发车站）
  return rp.stops.filter(s => !s.isReturnStop).map(s => s.currentStop)
})

// 已记录的站数
const recordedCount = computed(() => uploadStore.recordedSegments.length)

// 是否可以提交
const canSubmit = computed(() =>
  !!uploadStore.nickname && recordedCount.value > 0 && !uploadStore.uploading
)

function saveNick() {
  uploadStore.saveNickname(nickInput.value)
}

function startRecord() {
  uploadStore.startRecording(selectedRoute.value)
  showSuccessToast('开始记录，发车！')
}

function tapStop(stopName: string) {
  if (!uploadStore.timingActive) return
  const idx = routeStops.value.indexOf(stopName)
  if (idx === 0) return // 发车站
  // 确保按顺序记录
  const nextIdx = uploadStore.recordedSegments.length
  if (idx !== nextIdx) {
    showFailToast('请按站点顺序依次记录')
    return
  }
  uploadStore.recordSegment(stopName)
}

function isStopRecorded(idx: number): boolean {
  return idx > 0 && idx <= uploadStore.recordedSegments.length
}

function getSegmentSeconds(idx: number): string {
  if (idx <= 0 || idx > uploadStore.segmentSeconds.length) return ''
  return `${uploadStore.segmentSeconds[idx - 1]}秒`
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
    shift: selectedShift.value,
    departTime: selectedDepartTime.value,
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

// 切换线路时重置
watch(selectedRoute, () => {
  selectedShift.value = ''
  selectedDepartTime.value = ''
  uploadStore.resetRecording()
})
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
              <van-radio name="环线1路">环1</van-radio>
              <van-radio name="环线2路">环2</van-radio>
              <van-radio name="环线3路">环3</van-radio>
            </van-radio-group>
          </div>

          <!-- 班次 + 发车时间 -->
          <div class="field-row">
            <span class="label">班次</span>
            <van-picker-group v-if="routeShifts.length" title="选择班次和发车时间">
              <van-picker
                :columns="routeShifts"
                @confirm="(v: any) => { selectedShift = v.selectedValues[0]; selectedDepartTime = '' }"
              />
              <van-picker
                v-if="selectedShift"
                :columns="shiftTimes"
                @confirm="(v: any) => selectedDepartTime = v.selectedValues[0]"
              />
            </van-picker-group>
            <span v-else class="hint">请先选择线路</span>
          </div>
          <div class="field-row" v-if="selectedShift && selectedDepartTime">
            <span class="label">已选</span>
            <span class="selected-info">{{ selectedRoute }} · {{ selectedShift }} · {{ selectedDepartTime }}</span>
          </div>

          <!-- 车号/日期 -->
          <div class="field-row">
            <span class="label">车号</span>
            <input v-model="vehicleNo" placeholder="选填" class="text-input" />
            <span class="label" style="margin-left:12px">日期</span>
            <input type="date" v-model="dateStr" class="text-input" />
          </div>

          <!-- 计时按钮 -->
          <div v-if="selectedShift && selectedDepartTime && routeStops.length" class="stops-section">
            <div class="stops-title">站点计时（点击按钮记录到站）</div>

            <div class="stop-actions">
              <van-button
                v-if="!uploadStore.timingActive"
                type="primary"
                block
                round
                @click="startRecord"
                :disabled="!uploadStore.nickname"
                style="margin-bottom:12px"
              >
                发车！开始计时
              </van-button>

              <div v-for="(stop, idx) in routeStops" :key="stop" class="stop-row">
                <span class="stop-dot" :class="{ done: isStopRecorded(idx) }">{{ idx === 0 ? '发' : idx }}</span>
                <span class="stop-name">{{ stop }}</span>
                <span v-if="isStopRecorded(idx)" class="seg-secs">{{ getSegmentSeconds(idx) }}</span>
                <van-button
                  v-if="uploadStore.timingActive && idx > 0 && !isStopRecorded(idx) && idx === uploadStore.recordedSegments.length"
                  size="small"
                  type="primary"
                  round
                  @click="tapStop(stop)"
                >计时</van-button>
              </div>
            </div>

            <!-- 提交 -->
            <div v-if="uploadStore.timingActive" style="margin-top:16px">
              <van-button
                type="success"
                block
                round
                :disabled="!canSubmit"
                :loading="uploadStore.uploading"
                @click="handleSubmit"
              >
                {{ recordedCount === routeStops.length - 1 ? '到达终点，提交记录' : `已记录 ${recordedCount} 段，提交` }}
              </van-button>
              <div v-if="!uploadStore.nickname" class="hint">请先输入昵称</div>
            </div>
          </div>
        </div>
      </van-tab>

      <!-- Tab 2: 我的记录 -->
      <van-tab title="我的记录">
        <div class="history-section">
          <div v-if="!uploadStore.nickname" class="hint">请先在「记录上传」中输入昵称</div>

          <van-loading v-if="uploadStore.loadingHistory" size="24" style="margin:40px auto;display:block" />

          <div v-if="uploadStore.history.length === 0 && !uploadStore.loadingHistory && uploadStore.nickname" class="hint">
            暂无记录
          </div>

          <div v-for="rec in uploadStore.history" :key="rec.id" class="history-card">
            <div class="history-header">
              <span>{{ rec.date }} {{ rec.route }} {{ rec.shift }} {{ rec.depart_time }}</span>
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
.selected-info { color: var(--color-primary); font-weight: 600; }
.text-input { border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 8px; font-size: 13px; width: 80px; outline: none; }
.text-input:focus { border-color: var(--color-primary); }
.hint { color: var(--color-text-secondary); font-size: 13px; }

.stops-section { margin-top: 16px; }
.stops-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; }

.stop-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
.stop-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; background: #E5E7EB; color: #6B7280; flex-shrink: 0; }
.stop-dot.done { background: #10B981; color: #fff; }
.stop-name { flex: 1; font-size: 14px; }
.seg-secs { font-size: 13px; color: #10B981; font-weight: 600; min-width: 40px; text-align: right; }

.history-section { padding: 16px; }
.history-card { background: var(--color-card); border-radius: 10px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.history-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.history-segs { font-size: 12px; color: var(--color-text-secondary); line-height: 1.6; }
.hseg { white-space: nowrap; }
</style>
