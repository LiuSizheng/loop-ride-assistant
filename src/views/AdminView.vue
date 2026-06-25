<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const authed = ref(false)
const pinInput = ref('')
const pinError = ref(false)
const ADMIN_PIN = '20250615'

const loading = ref(true)
const chartType = ref<'bar' | 'line'>('bar')
const viewMode = ref<'day' | 'week' | 'month' | 'year'>('week')

interface BarItem { label: string; count: number }
const chartData = ref<BarItem[]>([])
const maxCount = computed(() => Math.max(1, ...chartData.value.map(d => d.count)))

// Stats
const stats = ref({ dau: 0, wau: 0, mau: 0, total: 0 })
const deviceStats = ref({ ios: 0, android: 0, desktop: 0 })

let refreshTimer: ReturnType<typeof setInterval> | null = null

function handleLogin() {
  if (pinInput.value === ADMIN_PIN) {
    authed.value = true; pinError.value = false; loadAll()
  } else { pinError.value = true }
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadStats(), loadChart(), loadDevices()])
  loading.value = false
}

async function loadStats() {
  const today = new Date().toISOString().slice(0, 10)
  const w = dateOffset(-6)
  const m = dateOffset(-29)

  const [dau, wau, mau] = await Promise.all([
    supabase.from('visits').select('visitor_id').eq('visited_at', today),
    supabase.from('visits').select('visitor_id').gte('visited_at', w),
    supabase.from('visits').select('visitor_id').gte('visited_at', m),
  ])

  const totalQ = await supabase.from('visits').select('visitor_id')
  const allIds = new Set((totalQ.data || []).map(r => r.visitor_id))

  stats.value = {
    dau: new Set((dau.data || []).map(r => r.visitor_id)).size,
    wau: new Set((wau.data || []).map(r => r.visitor_id)).size,
    mau: new Set((mau.data || []).map(r => r.visitor_id)).size,
    total: allIds.size,
  }
}

async function loadChart() {
  const { data } = await supabase.from('visits').select('visited_at, visitor_id, created_at')
    .gte('visited_at', rangeStart()).order('visited_at')

  const map = new Map<string, Set<string>>()
  const hours = new Map<string, Set<string>>()

  for (const r of (data || [])) {
    if (viewMode.value === 'day') {
      const h = new Date(r.created_at).getHours().toString().padStart(2, '0')
      if (!hours.has(h + ':00')) hours.set(h + ':00', new Set())
      hours.get(h + ':00')!.add(r.visitor_id)
    } else if (viewMode.value === 'year') {
      // 按月聚合
      const m = r.visited_at.slice(0, 7) // YYYY-MM
      if (!map.has(m)) map.set(m, new Set())
      map.get(m)!.add(r.visitor_id)
    } else {
      if (!map.has(r.visited_at)) map.set(r.visited_at, new Set())
      map.get(r.visited_at)!.add(r.visitor_id)
    }
  }

  if (viewMode.value === 'day') {
    const result: BarItem[] = []
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, '0') + ':00'
      result.push({ label: key, count: hours.get(key)?.size || 0 })
    }
    chartData.value = result
  } else if (viewMode.value === 'year') {
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    const result: BarItem[] = months.map((label, i) => {
      const key = `${new Date().getFullYear()}-${String(i+1).padStart(2,'0')}`
      return { label, count: map.get(key)?.size || 0 }
    })
    chartData.value = result
  } else {
    chartData.value = generateLabels().map(l => {
      const s = map.get(l.full)
      return { label: l.label, count: s ? s.size : 0 }
    })
  }
}

async function loadDevices() {
  const { data } = await supabase.from('visits').select('visitor_id, device_type')
    .gte('visited_at', dateOffset(-29))
  const seen = new Map<string, string>()
  for (const r of (data || [])) {
    if (!seen.has(r.visitor_id)) seen.set(r.visitor_id, r.device_type || 'desktop')
  }
  deviceStats.value = {
    ios: [...seen.values()].filter(v => v === 'ios').length,
    android: [...seen.values()].filter(v => v === 'android').length,
    desktop: [...seen.values()].filter(v => v === 'desktop').length,
  }
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function rangeStart(): string {
  if (viewMode.value === 'day') return dateOffset(-1)
  if (viewMode.value === 'week') return dateOffset(-6)
  if (viewMode.value === 'month') return dateOffset(-29)
  return `${new Date().getFullYear()}-01-01` // year
}

function generateLabels(): Array<{ label: string; full: string }> {
  const result: Array<{ label: string; full: string }> = []
  if (viewMode.value === 'week') {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      result.push({ label: days[d.getDay()], full: d.toISOString().slice(0, 10) })
    }
  } else if (viewMode.value === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      result.push({ label: String(d.getDate()), full: d.toISOString().slice(0, 10) })
    }
  } else if (viewMode.value === 'year') {
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    for (let i = 0; i < 12; i++) {
      const d = new Date(new Date().getFullYear(), i, 1)
      // aggregate all days in this month
      const y = d.getFullYear(), m = d.getMonth()
      const start = `${y}-${String(m+1).padStart(2,'0')}-01`
      const end = `${y}-${String(m+1).padStart(2,'0')}-31`
      result.push({ label: months[i], full: start })
    }
  }
  return result
}

function switchMode(mode: typeof viewMode.value) {
  viewMode.value = mode
  loadAll()
}

function logout() {
  authed.value = false; sessionStorage.removeItem('admin_authed')
  if (refreshTimer) clearInterval(refreshTimer)
}

onMounted(() => {
  if (sessionStorage.getItem('admin_authed') === ADMIN_PIN) {
    authed.value = true; loadAll()
    refreshTimer = setInterval(loadAll, 60000) // 每分钟刷新
  }
})

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div class="admin-page">
    <!-- 登录 -->
    <div v-if="!authed" class="login-box">
      <h2>📊 管理面板</h2>
      <input v-model="pinInput" type="password" placeholder="输入访问密码"
        class="pin-input" maxlength="8" @keyup.enter="handleLogin" />
      <button class="pin-btn" @click="handleLogin">进入</button>
      <p v-if="pinError" class="pin-error">密码错误</p>
    </div>

    <div v-else>
      <div class="admin-header">
        <h2>📊 用户统计</h2>
        <span class="logout-btn" @click="logout">退出</span>
      </div>

      <van-loading v-if="loading" size="24" style="margin:40px auto;display:block" />

      <template v-else>
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card" :class="{ active: viewMode === 'day' }" @click="switchMode('day')">
            <div class="stat-num">{{ stats.dau }}</div><div class="stat-label">今日活跃</div>
          </div>
          <div class="stat-card" :class="{ active: viewMode === 'week' }" @click="switchMode('week')">
            <div class="stat-num">{{ stats.wau }}</div><div class="stat-label">近7天活跃</div>
          </div>
          <div class="stat-card" :class="{ active: viewMode === 'month' }" @click="switchMode('month')">
            <div class="stat-num">{{ stats.mau }}</div><div class="stat-label">近30天活跃</div>
          </div>
          <div class="stat-card" :class="{ active: viewMode === 'year' }" @click="switchMode('year')">
            <div class="stat-num">{{ stats.total }}</div><div class="stat-label">历史总用户</div>
          </div>
        </div>

        <!-- 图表切换 -->
        <div class="chart-toolbar">
          <h3>
            {{ viewMode === 'day' ? '今日每小时' : viewMode === 'week' ? '近7天每日' : viewMode === 'month' ? '近30天每日' : '近12个月每月' }}
            活跃用户
          </h3>
          <div class="chart-toggle">
            <span :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">柱状</span>
            <span :class="{ active: chartType === 'line' }" @click="chartType = 'line'">折线</span>
          </div>
        </div>

        <!-- 图表 -->
        <div class="chart-area">
          <!-- 柱状图 -->
          <div v-if="chartType === 'bar'" class="bar-chart">
            <div v-for="d in chartData" :key="d.label" class="bar-col">
              <div class="bar" :style="{ height: (d.count / maxCount * 100) + '%' }">
                <span v-if="d.count > 0" class="bar-label">{{ d.count }}</span>
              </div>
              <div class="bar-date">{{ d.label }}</div>
            </div>
          </div>

          <!-- 折线图 -->
          <svg v-else class="line-chart" viewBox="0 0 600 160" preserveAspectRatio="none">
            <polyline
              :points="chartData.map((d, i) => {
                const x = (i / Math.max(1, chartData.length - 1)) * 580 + 10
                const y = 150 - (d.count / maxCount * 140)
                return x + ',' + y
              }).join(' ')"
              fill="none" stroke="#1A56DB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            />
            <template v-for="(d, i) in chartData" :key="'dot' + i">
              <circle
                v-if="d.count > 0"
                :cx="(i / Math.max(1, chartData.length - 1)) * 580 + 10"
                :cy="150 - (d.count / maxCount * 140)"
                r="3" fill="#1A56DB"
              />
            </template>
          </svg>
        </div>

        <!-- 设备分布 -->
        <div class="device-section">
          <h3>设备类型（近30天活跃用户）</h3>
          <div class="device-bar">
            <div class="device-seg ios" :style="{ flex: deviceStats.ios }">
              <span v-if="deviceStats.ios > 0">🍎 {{ deviceStats.ios }}</span>
            </div>
            <div class="device-seg android" :style="{ flex: deviceStats.android }">
              <span v-if="deviceStats.android > 0">🤖 {{ deviceStats.android }}</span>
            </div>
            <div class="device-seg desktop" :style="{ flex: deviceStats.desktop }">
              <span v-if="deviceStats.desktop > 0">💻 {{ deviceStats.desktop }}</span>
            </div>
          </div>
          <div class="device-legend">
            <span>🍎 iOS</span><span>🤖 Android</span><span>💻 桌面</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admin-page { padding: 16px; max-width: 640px; margin: 0 auto; min-height: 100vh; }
.login-box { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 16px; }
.login-box h2 { font-size: 22px; }
.pin-input { border: 1px solid var(--color-border); border-radius: 10px; padding: 10px 16px; font-size: 18px; text-align: center; width: 200px; outline: none; }
.pin-input:focus { border-color: var(--color-primary); }
.pin-btn { background: var(--color-primary); color: #fff; border: none; border-radius: 10px; padding: 10px 40px; font-size: 16px; cursor: pointer; }
.pin-error { color: #DC2626; font-size: 13px; }
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.admin-header h2 { font-size: 20px; }
.logout-btn { font-size: 14px; color: var(--color-text-secondary); cursor: pointer; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.stat-card { background: var(--color-card); border-radius: 12px; padding: 14px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer; transition: all 0.2s; border: 2px solid transparent; }
.stat-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.stat-card.active { border-color: var(--color-primary); background: #EFF6FF; }
.stat-num { font-size: 28px; font-weight: 700; color: var(--color-primary); }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.chart-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.chart-toolbar h3 { font-size: 15px; }
.chart-toggle { display: flex; gap: 0; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.chart-toggle span { padding: 4px 12px; font-size: 13px; cursor: pointer; background: var(--color-card); color: var(--color-text-secondary); }
.chart-toggle span.active { background: var(--color-primary); color: #fff; }
.chart-area { background: var(--color-card); border-radius: 12px; padding: 16px 8px 0; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); height: 200px; overflow: hidden; }
.bar-chart { display: flex; align-items: flex-end; gap: 1px; height: 180px; }
.bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.bar { width: 100%; max-width: 28px; background: var(--color-primary); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; transition: height 0.3s; }
.bar-label { position: absolute; top: -15px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--color-text-secondary); white-space: nowrap; }
.bar-date { font-size: 8px; color: #9CA3AF; margin-top: 2px; }
.line-chart { width: 100%; height: 180px; }
.device-section { background: var(--color-card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.device-section h3 { font-size: 15px; margin-bottom: 12px; }
.device-bar { display: flex; height: 32px; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.device-seg { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; min-width: 0; }
.device-seg.ios { background: #636366; }
.device-seg.android { background: #34A853; }
.device-seg.desktop { background: #4285F4; }
.device-legend { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-secondary); }
</style>
