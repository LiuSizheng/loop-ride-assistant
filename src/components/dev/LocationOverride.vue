<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGlobalLocation } from '@/stores/global-location'
import { useScheduleStore } from '@/stores/schedule'

const store = useGlobalLocation()
const scheduleStore = useScheduleStore()
const open = ref(false)

const latInput = ref('')
const lngInput = ref('')

function apply() {
  const lat = parseFloat(latInput.value)
  const lng = parseFloat(lngInput.value)
  if (!isNaN(lat) && !isNaN(lng)) {
    store.setLocation(lat, lng)
    open.value = false
  }
}

function setPreset(lat: number, lng: number) {
  store.setLocation(lat, lng)
  open.value = false
}

function resetAll() {
  store.reset()
  open.value = false
}

// 从 scheduleStore 动态读取所有站点
const presets = computed(() =>
  scheduleStore.stations.map((s) => ({
    name: s.name,
    lat: s.lat,
    lng: s.lng,
  }))
)
</script>

<template>
  <div class="loc-root">
    <!-- 浮动按钮 -->
    <div
      class="loc-btn"
      :class="{ active: store.isActive }"
      @click="open = !open"
    >
      <span v-if="store.isActive" class="loc-btn-text">📍</span>
      <span v-else>📍</span>
    </div>

    <!-- 面板 -->
    <div v-if="open" class="loc-panel">
      <div class="loc-title">📍 位置覆写</div>

      <div class="loc-status" :class="{ sim: store.isActive }">
        <template v-if="store.isActive">
          模拟位置：{{ store.lat?.toFixed(6) }}, {{ store.lng?.toFixed(6) }}
        </template>
        <template v-else>使用真实 GPS</template>
      </div>

      <!-- 站点预设（从数据动态加载） -->
      <div class="loc-presets">
        <button
          v-for="p in presets"
          :key="p.name"
          @click="setPreset(p.lat, p.lng)"
        >{{ p.name }}</button>
      </div>

      <!-- 自定义坐标 -->
      <div class="loc-row">
        <label>纬度</label>
        <input v-model="latInput" type="number" step="any" placeholder="28.2547" />
      </div>
      <div class="loc-row">
        <label>经度</label>
        <input v-model="lngInput" type="number" step="any" placeholder="113.0515" />
      </div>

      <div class="loc-actions">
        <button class="loc-apply" @click="apply">应用</button>
        <button class="loc-reset" @click="resetAll">恢复真实 GPS</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loc-root {
  position: fixed;
  bottom: 90px;
  left: 12px;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.loc-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
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
  transition: border 0.2s;
}
.loc-btn.active {
  border-color: #10B981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}
.loc-btn-text { line-height: 1; }
.loc-panel {
  position: absolute;
  bottom: 48px;
  left: 0;
  width: 260px;
  background: rgba(30, 30, 30, 0.95);
  color: #e0e0e0;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-size: 13px;
}
.loc-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #fff;
}
.loc-status {
  padding: 4px 8px;
  border-radius: 6px;
  background: #333;
  font-size: 11px;
  margin-bottom: 10px;
  word-break: break-all;
}
.loc-status.sim {
  background: #0a3622;
  color: #10B981;
}
.loc-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.loc-presets button {
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid #555;
  background: #2a2a2a;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
}
.loc-presets button:active {
  background: #444;
}
.loc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.loc-row label {
  width: 32px;
  font-size: 12px;
  color: #999;
}
.loc-row input {
  flex: 1;
  background: #2a2a2a;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 8px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}
.loc-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.loc-apply, .loc-reset {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.loc-apply {
  background: #10B981;
  color: #000;
}
.loc-reset {
  background: #444;
  color: #ccc;
}
</style>
