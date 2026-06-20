<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGlobalTime } from '@/stores/global-time'

const store = useGlobalTime()
const open = ref(false)

// 日期输入值
const dateInput = ref('')
const timeInput = ref('')

// 实时模拟时间显示（直接 ref，每秒覆写）
const timeDisplay = ref('')
let tickTimer: ReturnType<typeof setInterval> | null = null

function updateDisplay() {
  if (!store.isActive) { timeDisplay.value = ''; return }
  const d = store.getNow()
  timeDisplay.value =
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

onMounted(() => {
  updateDisplay()
  tickTimer = setInterval(updateDisplay, 1000)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})

function apply() {
  if (dateInput.value && timeInput.value) {
    store.setSimulated(`${dateInput.value}T${timeInput.value}`)
    open.value = false
  }
}

function preset(dayOffset: number, hour: number, minute: number) {
  const d = new Date() // real today for base
  d.setDate(d.getDate() + dayOffset)
  store.setDateTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), hour, minute)
  open.value = false
}

function resetAll() {
  store.reset()
  dateInput.value = ''
  timeInput.value = ''
  open.value = false
}

// 当前模拟时间显示
function simDisplay(): string {
  const d = store.getNow()
  const day = d.getDay()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 周${weekDays[day]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
</script>

<template>
  <div class="time-override-root">
    <!-- 浮动触发按钮 -->
    <div
      class="torch-btn"
      :class="{ active: store.isActive }"
      @click="open = !open"
    >
      <span v-if="store.isActive" class="torch-time-text">{{ timeDisplay }}</span>
      <span v-else>⏱</span>
    </div>

    <!-- 面板 -->
    <div v-if="open" class="torch-panel">
      <div class="torch-title">⏱ 时间覆写</div>

      <!-- 当前状态 -->
      <div class="torch-status" :class="{ sim: store.isActive }">
        {{ store.isActive ? '模拟中：' + simDisplay() : '使用真实时间' }}
      </div>

      <!-- 快捷预设 -->
      <div class="torch-presets">
        <button @click="preset(0, 7, 30)">今天 07:30</button>
        <button @click="preset(0, 8, 0)">今天 08:00</button>
        <button @click="preset(0, 11, 30)">今天 11:30</button>
        <button @click="preset(0, 14, 0)">今天 14:00</button>
        <button @click="preset(0, 17, 0)">今天 17:00</button>
        <button @click="preset(2, 8, 0)">下周一 08:00</button>
        <button @click="preset(3, 8, 0)">下周二 08:00</button>
      </div>

      <!-- 自定义 -->
      <div class="torch-row">
        <label>日期</label>
        <input v-model="dateInput" type="date" />
      </div>
      <div class="torch-row">
        <label>时间</label>
        <input v-model="timeInput" type="time" step="1" />
      </div>

      <div class="torch-actions">
        <button class="torch-apply" @click="apply">应用</button>
        <button class="torch-reset" @click="resetAll">恢复真实时间</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-override-root {
  position: fixed;
  bottom: 90px;
  right: 12px;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.torch-btn {
  height: 40px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  user-select: none;
  border: 2px solid transparent;
  transition: border 0.2s, padding 0.2s;
  padding: 0 12px;
}
.torch-time-text {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}
.torch-btn.active {
  border-color: #F59E0B;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
}
.torch-panel {
  position: absolute;
  bottom: 48px;
  right: 0;
  width: 260px;
  background: rgba(30, 30, 30, 0.95);
  color: #e0e0e0;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-size: 13px;
}
.torch-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #fff;
}
.torch-status {
  padding: 4px 8px;
  border-radius: 6px;
  background: #333;
  font-size: 11px;
  margin-bottom: 10px;
  word-break: break-all;
}
.torch-status.sim {
  background: #4a3000;
  color: #F59E0B;
}
.torch-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.torch-presets button {
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid #555;
  background: #2a2a2a;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
}
.torch-presets button:active {
  background: #444;
}
.torch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.torch-row label {
  width: 32px;
  font-size: 12px;
  color: #999;
}
.torch-row input {
  flex: 1;
  background: #2a2a2a;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 8px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}
.torch-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.torch-apply, .torch-reset {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.torch-apply {
  background: #F59E0B;
  color: #000;
}
.torch-reset {
  background: #444;
  color: #ccc;
}
</style>
