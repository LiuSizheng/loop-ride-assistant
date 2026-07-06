<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
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
const viewMode = ref<'day' | 'week' | 'month' | 'year' | 'total'>('day')

interface BarItem { label: string; count: number }
interface VisitLog { date: string; time: string; vid: string; device: string; visits: number }
const chartData = ref<BarItem[]>([])
const logData = ref<VisitLog[]>([])
const logDate = ref(new Date().toISOString().slice(0, 10))  // 默认今天
const maxCount = computed(() => Math.max(1, ...chartData.value.map(d => d.count)))

// 管理面板上线日期（此前无埋点数据）
const LAUNCH_DATE = new Date('2026-06-25')

// 日均/月均活跃
// - 日视图：不显示
// - 周视图：7天总和 / 7
// - 月视图：30天总和 / 实际上线天数（排除上线前为0的天）
// - 年视图：各月独立用户之和 / 月数（月均）
// - 全部历史：不显示
const avgLabel = computed(() => {
  if (viewMode.value === 'year') return '月均'
  if (viewMode.value === 'total') return ''
  if (viewMode.value === 'day') return ''
  return '日均'
})
const avgValue = computed(() => {
  if (chartData.value.length === 0) return 0
  const today = new Date()
  const daysSinceLaunch = Math.max(1, Math.ceil((today.getTime() - LAUNCH_DATE.getTime()) / 86400000))

  if (viewMode.value === 'day' || viewMode.value === 'total') return 0

  if (viewMode.value === 'week') {
    const total = chartData.value.reduce((sum, d) => sum + d.count, 0)
    return Math.round(total / 7)
  }

  if (viewMode.value === 'month') {
    const total = chartData.value.reduce((sum, d) => sum + d.count, 0)
    const effectiveDays = Math.min(30, daysSinceLaunch)
    return Math.round(total / effectiveDays)
  }

  if (viewMode.value === 'year') {
    // 月均 = 各月独立用户之和 / 月数
    const total = chartData.value.reduce((sum, d) => sum + d.count, 0)
    return Math.round(total / chartData.value.length)
  }

  return 0
})

const chartScrollRef = ref<HTMLDivElement>()
const BAR_WIDTH = 32  // 每根柱子/数据点的最小像素宽

// 图表最小宽度，保证柱子不挤在一起
const chartMinWidth = computed(() => {
  const n = chartData.value.length
  if (n === 0) return 300
  return Math.max(300, n * BAR_WIDTH + 16)
})

// SVG viewBox 动态宽度
const svgW = computed(() => chartMinWidth.value)
const svgViewBox = computed(() => `0 0 ${svgW.value} 160`)
const plotW = computed(() => svgW.value - 20)  // 左右各 10px padding

// 默认滚动位置：日视图→7:00，月/年/总→最右侧（最新），其他→最左
function scrollChartToDefault() {
  nextTick(() => {
    if (!chartScrollRef.value) return
    if (viewMode.value === 'day') {
      chartScrollRef.value.scrollLeft = 7 * BAR_WIDTH
    } else if (viewMode.value === 'month' || viewMode.value === 'year' || viewMode.value === 'total') {
      chartScrollRef.value.scrollLeft = chartScrollRef.value.scrollWidth
    } else {
      chartScrollRef.value.scrollLeft = 0
    }
  })
}

const stats = ref({ dau: 0, wau: 0, mau: 0, yau: 0, total: 0 })
const deviceStats = ref({ ios: 0, android: 0, desktop: 0 })

// 每个用户的首次到访日期
const firstSeen = new Map<string, string>()

let refreshTimer: ReturnType<typeof setInterval> | null = null

function handleLogin() {
  if (pinInput.value === ADMIN_PIN) { authed.value = true; pinError.value = false; loadAll().then(scrollChartToDefault) }
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

  const allQ = await supabase.from('visits').select('visitor_id, visited_at').order('visited_at')
  const allData = (allQ.data || []) as Array<{ visitor_id: string; visited_at: string }>

  const allIds = new Set<string>()
  const dauIds = new Set<string>()
  const wauIds = new Set<string>()
  const mauIds = new Set<string>()
  const yauIds = new Set<string>()

  firstSeen.clear()
  for (const r of allData) {
    if (!firstSeen.has(r.visitor_id)) firstSeen.set(r.visitor_id, r.visited_at)
  }

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

  const groups = new Map<string, Set<string>>()       // 天/月 → Set<visitor_id>（去重）
  const hours = new Map<string, number>()              // 小时 → 访问次数（不去重）

  for (const r of (data || [])) {
    if (viewMode.value === 'day') {
      // 日视图：统计每小时的访问次数（不去重，同一人多次访问都算）
      const h = new Date(r.created_at).getHours().toString().padStart(2, '0')
      const key = h + ':00'
      hours.set(key, (hours.get(key) || 0) + 1)
    } else if (viewMode.value === 'year' || viewMode.value === 'total') {
      // 年/总视图：统计每月的独立用户数（去重）
      const mon = r.visited_at.slice(0, 7)
      if (!groups.has(mon)) groups.set(mon, new Set())
      groups.get(mon)!.add(r.visitor_id)
    } else {
      // 周/月视图：统计每天的独立用户数（去重）
      if (!groups.has(r.visited_at)) groups.set(r.visited_at, new Set())
      groups.get(r.visited_at)!.add(r.visitor_id)
    }
  }

  if (viewMode.value === 'day') {
    const result: BarItem[] = []
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, '0') + ':00'
      result.push({ label: key, count: hours.get(key) || 0 })
    }
    chartData.value = result
  } else if (viewMode.value === 'year' || viewMode.value === 'total') {
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
    .eq('visited_at', logDate.value)
    .order('created_at', { ascending: false })

  // 同时查询该用户的总访问次数
  const allVisits = await supabase.from('visits')
    .select('visitor_id')
  const userVisits = new Map<string, number>()
  for (const r of (allVisits.data || [])) {
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
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const label = (d.getMonth() + 1) + '/' + d.getDate()  // "7/1", "7/2"
      result.push({ label, full: d.toISOString().slice(0, 10) })
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

function switchMode(mode: typeof viewMode.value) { viewMode.value = mode; loadAll().then(scrollChartToDefault) }

function logout() {
  authed.value = false; localStorage.removeItem('admin_authed')
  if (refreshTimer) clearInterval(refreshTimer)
}

const deviceTypeLabel: Record<string, string> = { ios: '🍎', android: '🤖', desktop: '💻' }

onMounted(() => {
  if (sessionStorage.getItem('admin_authed') === ADMIN_PIN) {
    authed.value = true; loadAll().then(scrollChartToDefault)
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
          <div>
            <h3>{{ viewMode === 'day' ? '今日每小时 访问次数' : viewMode === 'week' ? '近7天每日 活跃用户' : viewMode === 'month' ? '近30天每日 活跃用户' : viewMode === 'year' ? '近12个月每月 活跃用户' : '全部历史每月 活跃用户' }}</h3>
            <span v-if="avgValue > 0" class="daily-avg">{{ avgLabel }} {{ avgValue }} 人</span>
          </div>
          <div class="chart-toggle">
            <span :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">柱状</span>
            <span :class="{ active: chartType === 'line' }" @click="chartType = 'line'">折线</span>
          </div>
        </div>

        <div class="chart-area">
          <!-- 纵轴（在滚动区外，永不移动） -->
          <div class="y-axis">
            <span>{{ maxCount }}</span>
            <span>{{ Math.ceil(maxCount / 2) }}</span>
            <span>0</span>
          </div>

          <!-- 可横向滚动的图表区域 -->
          <div class="chart-scroll" ref="chartScrollRef">
            <!-- 柱状图 -->
            <div v-if="chartType === 'bar'" class="bar-chart" :style="{ minWidth: chartMinWidth + 'px' }">
              <div v-for="d in chartData" :key="d.label" class="bar-col">
                <div class="bar" :style="{ height: d.count > 0 ? (d.count / maxCount * 100) + '%' : '0' }">
                  <span v-if="d.count > 0" class="bar-label">{{ d.count }}</span>
                </div>
                <div class="bar-date">{{ d.label }}</div>
              </div>
            </div>

            <!-- 折线图 -->
            <svg v-else class="line-chart" :viewBox="svgViewBox" :style="{ minWidth: chartMinWidth + 'px' }">
              <!-- 水平网格线 -->
              <line :x1="10" y1="10" :x2="plotW + 10" y2="10" stroke="#E5E7EB" stroke-dasharray="4 2" />
              <line :x1="10" y1="80" :x2="plotW + 10" y2="80" stroke="#E5E7EB" stroke-dasharray="4 2" />
              <!-- 折线 -->
              <polyline :points="chartData.map((d, i) => {
                const n = Math.max(1, chartData.length - 1)
                const x = (i / n) * plotW + 10
                const y = 150 - (d.count / maxCount * 140)
                return x + ',' + y
              }).join(' ')" fill="none" stroke="#1A56DB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <template v-for="(d, i) in chartData" :key="'d' + i">
                <circle v-if="d.count > 0" :cx="(i / Math.max(1, chartData.length - 1)) * plotW + 10" :cy="150 - (d.count / maxCount * 140)" r="3" fill="#1A56DB" />
                <text v-if="d.count > 0" :x="(i / Math.max(1, chartData.length - 1)) * plotW + 10" :y="150 - (d.count / maxCount * 140) - 8" text-anchor="middle" font-size="10" fill="#374151" font-weight="600">{{ d.count }}</text>
              </template>
            </svg>
          </div>
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
          <div class="log-header-row">
            <h3>访问日志</h3>
            <div class="log-date-picker">
              <button class="log-date-btn" @click="logDate = dateOffset(0); loadLog()">今天</button>
              <button class="log-date-btn" @click="logDate = dateOffset(-1); loadLog()">昨天</button>
              <input type="date" v-model="logDate" @change="loadLog" class="log-date-input" />
            </div>
          </div>
          <div class="log-table">
            <div class="log-header">
              <span>日期</span><span>时间</span><span>设备ID</span><span>设备</span><span>总次数</span>
            </div>
            <div v-if="logData.length === 0" class="log-empty">当天暂无访问记录</div>
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

.chart-toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.chart-toolbar h3 { font-size: 15px; }
.daily-avg { font-size: 12px; color: var(--color-primary); font-weight: 600; display: block; margin-top: 2px; }
.chart-toggle { display: flex; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.chart-toggle span { padding: 4px 12px; font-size: 13px; cursor: pointer; background: var(--color-card); color: var(--color-text-secondary); }
.chart-toggle span.active { background: var(--color-primary); color: #fff; }

.chart-area { background: var(--color-card); border-radius: 12px; padding: 16px 12px 0 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; gap: 6px; align-items: stretch; }
.y-axis { display: flex; flex-direction: column; justify-content: space-between; height: 180px; padding-bottom: 20px; font-size: 10px; color: #9CA3AF; text-align: right; min-width: 22px; flex-shrink: 0; line-height: 1; }
.chart-scroll { flex: 1; overflow-x: auto; overflow-y: visible; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
.bar-chart { display: flex; align-items: flex-end; gap: 2px; height: 180px; padding-top: 18px; padding-right: 12px; }
.bar-col { flex: 1; min-width: 28px; max-width: 48px; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.bar { width: 100%; max-width: 32px; background: var(--color-primary); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; transition: height 0.3s; }
.bar-label { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--color-text-secondary); white-space: nowrap; font-weight: 600; }
.bar-date { font-size: 9px; color: #9CA3AF; margin-top: 4px; white-space: nowrap; }
.line-chart { height: 180px; padding-top: 18px; padding-right: 12px; }

.device-section { background: var(--color-card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
.device-section h3 { font-size: 15px; margin-bottom: 12px; }
.device-bar { display: flex; height: 32px; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.device-seg { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; min-width: 0; }
.device-seg.ios { background: #636366; }
.device-seg.android { background: #34A853; }
.device-seg.desktop { background: #4285F4; }
.device-legend { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-secondary); }

.log-section { background: var(--color-card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.log-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.log-header-row h3 { font-size: 15px; }
.log-date-picker { display: flex; align-items: center; gap: 6px; }
.log-date-btn { padding: 4px 10px; font-size: 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-card); color: var(--color-text-secondary); cursor: pointer; }
.log-date-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.log-date-input { padding: 3px 6px; font-size: 12px; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); background: var(--color-card); outline: none; width: 130px; }
.log-date-input:focus { border-color: var(--color-primary); }
.log-section h3 { font-size: 15px; margin-bottom: 12px; }
.log-table { font-size: 12px; }
.log-header { display: grid; grid-template-columns: 1fr 1fr 1fr 0.6fr 0.6fr; gap: 4px; font-weight: 600; color: var(--color-text); padding-bottom: 8px; border-bottom: 1px solid var(--color-border); margin-bottom: 4px; }
.log-row { display: grid; grid-template-columns: 1fr 1fr 1fr 0.6fr 0.6fr; gap: 4px; padding: 4px 0; color: var(--color-text-secondary); border-bottom: 1px solid #F3F4F6; }
.log-row .vid { font-family: monospace; font-size: 10px; }
.log-row .vc { text-align: center; font-weight: 600; color: var(--color-primary); }
.log-empty { text-align: center; padding: 24px; font-size: 13px; color: var(--color-text-secondary); }
</style>
