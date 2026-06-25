<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const authed = ref(false)
const pinInput = ref('')
const pinError = ref(false)
const ADMIN_PIN = '250030'

const loading = ref(true)
const chartType = ref<'bar' | 'line'>('bar')
const viewMode = ref<'day' | 'week' | 'month' | 'year' | 'total'>('week')

interface BarItem { label: string; count: number }
interface VisitLog { date: string; time: string; vid: string; device: string; visits: number }
const chartData = ref<BarItem[]>([])
const logData = ref<VisitLog[]>([])
const maxCount = computed(() => Math.max(1, ...chartData.value.map(d => d.count)))

const stats = ref({ dau: 0, wau: 0, mau: 0, yau: 0, total: 0 })
const deviceStats = ref({ ios: 0, android: 0, desktop: 0 })

let refreshTimer: ReturnType<typeof setInterval> | null = null

function handleLogin() {
  if (pinInput.value === ADMIN_PIN) { authed.value = true; pinError.value = false; loadAll() }
  else { pinError.value = true }
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadStats(), loadChart(), loadDevices(), loadLog()])
  loading.value = false
}

async function loadStats() {
  const today = new Date().toISOString().slice(0, 10)
  const w = dateOffset(-6)
  const m = dateOffset(-29)
  const y = dateOffset(-364)

  const allQ = await supabase.from('visits').select('visitor_id, visited_at')
  const allData = (allQ.data || []) as Array<{ visitor_id: string; visited_at: string }>

  const allIds = new Set<string>()
  const dauIds = new Set<string>()
  const wauIds = new Set<string>()
  const mauIds = new Set<string>()
  const yauIds = new Set<string>()

  for (const r of allData) {
    allIds.add(r.visitor_id)
    if (r.visited_at >= today) dauIds.add(r.visitor_id)
    if (r.visited_at >= w) wauIds.add(r.visitor_id)
    if (r.visited_at >= m) mauIds.add(r.visitor_id)
    if (r.visited_at >= y) yauIds.add(r.visitor_id)
  }

  stats.value = {
    dau: dauIds.size, wau: wauIds.size, mau: mauIds.size,
    yau: yauIds.size, total: allIds.size,
  }
}

async function loadChart() {
  const { data } = await supabase.from('visits').select('visited_at, visitor_id, created_at')
    .gte('visited_at', rangeStart()).order('visited_at')

  const groups = new Map<string, Set<string>>()
  const hours = new Map<string, Set<string>>()

  for (const r of (data || [])) {
    if (viewMode.value === 'day') {
      const h = new Date(r.created_at).getHours().toString().padStart(2, '0')
      const key = h + ':00'
      if (!hours.has(key)) hours.set(key, new Set())
      hours.get(key)!.add(r.visitor_id)
    } else if (viewMode.value === 'year' || viewMode.value === 'total') {
      // 按月份聚合全部历史
      const mon = r.visited_at.slice(0, 7)
      if (!groups.has(mon)) groups.set(mon, new Set())
      groups.get(mon)!.add(r.visitor_id)
    } else {
      if (!groups.has(r.visited_at)) groups.set(r.visited_at, new Set())
      groups.get(r.visited_at)!.add(r.visitor_id)
    }
  }

  if (viewMode.value === 'day') {
    const result: BarItem[] = []
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, '0') + ':00'
      result.push({ label: key, count: hours.get(key)?.size || 0 })
    }
    chartData.value = result
  } else if (viewMode.value === 'total') {
    // 所有历史月份
    const months: string[] = []
    for (const k of groups.keys()) months.push(k)
    months.sort()
    chartData.value = months.map(m => {
      const [y, mo] = m.split('-')
      return { label: y.slice(2) + '/' + mo, count: groups.get(m)!.size }
    })
  } else {
    chartData.value = generateLabels().map(l => {
      return { label: l.label, count: groups.get(l.full)?.size || 0 }
    })
  }
}

async function loadDevices() {
  const { data } = await supabase.from('visits').select('visitor_id, device_type')
  const seen = new Map<string, string>()
  for (const r of (data || [])) {
    const dt = r.device_type || 'desktop'
    if (!seen.has(r.visitor_id)) seen.set(r.visitor_id, dt)
    else {
      // 优先保留非 desktop 的类型（因为桌面可能是误判）
      if (seen.get(r.visitor_id) === 'desktop' && dt !== 'desktop') {
        seen.set(r.visitor_id, dt)
      }
    }
  }
  deviceStats.value = {
    ios: [...seen.values()].filter(v => v === 'ios').length,
    android: [...seen.values()].filter(v => v === 'android').length,
    desktop: [...seen.values()].filter(v => v === 'desktop').length,
  }
}

async function loadLog() {
  const { data } = await supabase.from('visits')
    .select('visitor_id, visited_at, created_at, device_type')
    .order('created_at', { ascending: false }).limit(200)

  // Group by visitor_id to count visits
  const userVisits = new Map<string, number>()
  for (const r of (data || [])) {
    userVisits.set(r.visitor_id, (userVisits.get(r.visitor_id) || 0) + 1)
  }

  logData.value = (data || []).map(r => ({
    date: r.visited_at,
    time: new Date(r.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    vid: r.visitor_id.slice(0, 8),
    device: r.device_type || 'desktop',
    visits: userVisits.get(r.visitor_id) || 1,
  }))
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function rangeStart(): string {
  if (viewMode.value === 'day') return dateOffset(-1)
  if (viewMode.value === 'week') return dateOffset(-6)
  if (viewMode.value === 'month') return dateOffset(-29)
  if (viewMode.value === 'year') return dateOffset(-364)
  return '2000-01-01' // total: all time
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
      const label = (d.getMonth() + 1) + '/' + d.getDate() // "6/25"
      result.push({ label, full: d.toISOString().slice(0, 10) })
    }
  }
  return result
}

function switchMode(mode: typeof viewMode.value) { viewMode.value = mode; loadAll() }

function logout() {
  authed.value = false; localStorage.removeItem('admin_authed')
  if (refreshTimer) clearInterval(refreshTimer)
}

const deviceTypeLabel: Record<string, string> = { ios: '🍎', android: '🤖', desktop: '💻' }

onMounted(() => {
  if (sessionStorage.getItem('admin_authed') === ADMIN_PIN) {
    authed.value = true; loadAll()
    refreshTimer = setInterval(loadAll, 60000)
  }
})
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div class="admin-page">
    <div v-if="!authed" class="login-box">
      <h2>📊 管理面板</h2>
      <input v-model="pinInput" type="password" placeholder="输入访问密码" class="pin-input" maxlength="8" @keyup.enter="handleLogin" />
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
        <!-- 5卡片 -->
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
            <div class="stat-num">{{ stats.yau }}</div><div class="stat-label">近1年活跃</div>
          </div>
        </div>
        <div class="stats-grid" style="grid-template-columns:1fr"><div class="stat-card" :class="{ active: viewMode === 'total' }" @click="switchMode('total')">
          <div class="stat-num">{{ stats.total }}</div><div class="stat-label">历史总用户</div>
        </div></div>

        <!-- 图表 -->
        <div class="chart-toolbar">
          <h3>{{ viewMode === 'day' ? '今日每小时' : viewMode === 'week' ? '近7天每日' : viewMode === 'month' ? '近30天每日' : viewMode === 'year' ? '近12个月每月' : '全部历史每月' }} 活跃用户</h3>
          <div class="chart-toggle">
            <span :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">柱状</span>
            <span :class="{ active: chartType === 'line' }" @click="chartType = 'line'">折线</span>
          </div>
        </div>

        <div class="chart-area">
          <div v-if="chartType === 'bar'" class="bar-chart">
            <div v-for="d in chartData" :key="d.label" class="bar-col">
              <div class="bar" :style="{ height: (d.count / maxCount * 100) + '%' }">
                <span v-if="d.count > 0" class="bar-label">{{ d.count }}</span>
              </div>
              <div class="bar-date">{{ d.label }}</div>
            </div>
          </div>
          <svg v-else class="line-chart" viewBox="0 0 600 160" preserveAspectRatio="none">
            <polyline :points="chartData.map((d, i) => {
              const x = (i / Math.max(1, chartData.length - 1)) * 580 + 10
              const y = 150 - (d.count / maxCount * 140)
              return x + ',' + y
            }).join(' ')" fill="none" stroke="#1A56DB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <template v-for="(d, i) in chartData" :key="'d' + i">
              <circle v-if="d.count > 0" :cx="(i / Math.max(1, chartData.length - 1)) * 580 + 10" :cy="150 - (d.count / maxCount * 140)" r="3" fill="#1A56DB" />
            </template>
          </svg>
        </div>

        <!-- 设备分布 -->
        <div class="device-section">
          <h3>设备类型（全部历史）</h3>
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
          <div class="device-legend"><span>🍎 iOS</span><span>🤖 Android</span><span>💻 桌面</span></div>
        </div>

        <!-- 访问日志 -->
        <div class="log-section">
          <h3>访问日志（最近200条）</h3>
          <div class="log-table">
            <div class="log-header">
              <span>日期</span><span>时间</span><span>设备ID</span><span>设备</span><span>总次数</span>
            </div>
            <div v-for="(l, i) in logData" :key="i" class="log-row">
              <span>{{ l.date }}</span><span>{{ l.time }}</span><span class="vid">{{ l.vid }}</span>
              <span>{{ deviceTypeLabel[l.device] || '💻' }}</span><span class="vc">{{ l.visits }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admin-page { padding: 16px; max-width: 640px; margin: 0 auto; min-height: 100vh; padding-bottom: 40px; }
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
.chart-toggle { display: flex; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.chart-toggle span { padding: 4px 12px; font-size: 13px; cursor: pointer; background: var(--color-card); color: var(--color-text-secondary); }
.chart-toggle span.active { background: var(--color-primary); color: #fff; }

.chart-area { background: var(--color-card); border-radius: 12px; padding: 16px 8px 0; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); height: 200px; overflow: hidden; }
.bar-chart { display: flex; align-items: flex-end; gap: 1px; height: 180px; }
.bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.bar { width: 100%; max-width: 28px; background: var(--color-primary); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; transition: height 0.3s; }
.bar-label { position: absolute; top: -15px; left: 50%; transform: translateX(-50%); font-size: 8px; color: var(--color-text-secondary); white-space: nowrap; }
.bar-date { font-size: 8px; color: #9CA3AF; margin-top: 2px; }
.line-chart { width: 100%; height: 180px; }

.device-section { background: var(--color-card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
.device-section h3 { font-size: 15px; margin-bottom: 12px; }
.device-bar { display: flex; height: 32px; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.device-seg { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; min-width: 0; }
.device-seg.ios { background: #636366; }
.device-seg.android { background: #34A853; }
.device-seg.desktop { background: #4285F4; }
.device-legend { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-secondary); }

.log-section { background: var(--color-card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.log-section h3 { font-size: 15px; margin-bottom: 12px; }
.log-table { font-size: 12px; }
.log-header { display: grid; grid-template-columns: 1fr 1fr 1fr 0.6fr 0.6fr; gap: 4px; font-weight: 600; color: var(--color-text); padding-bottom: 8px; border-bottom: 1px solid var(--color-border); margin-bottom: 4px; }
.log-row { display: grid; grid-template-columns: 1fr 1fr 1fr 0.6fr 0.6fr; gap: 4px; padding: 4px 0; color: var(--color-text-secondary); border-bottom: 1px solid #F3F4F6; }
.log-row .vid { font-family: monospace; font-size: 10px; }
.log-row .vc { text-align: center; font-weight: 600; color: var(--color-primary); }
</style>
