<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const authed = ref(false)
const pinInput = ref('')
const pinError = ref(false)
const ADMIN_PIN = '20250615' // 可自行修改

// ---- 统计数据 ----
const stats = ref({ dau: 0, wau: 0, mau: 0, total: 0 })
const dailyData = ref<Array<{ date: string; count: number }>>([])
const loading = ref(true)

function handleLogin() {
  if (pinInput.value === ADMIN_PIN) {
    authed.value = true
    pinError.value = false
    loadData()
  } else {
    pinError.value = true
  }
}

async function loadData() {
  loading.value = true
  try {
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

    // DAU
    const { count: dau } = await supabase
      .from('visits').select('*', { count: 'exact', head: true })
      .eq('visited_at', today)

    // WAU
    const { count: wau } = await supabase
      .from('visits').select('*', { count: 'exact', head: true })
      .gte('visited_at', weekAgo)

    // MAU
    const { count: mau } = await supabase
      .from('visits').select('*', { count: 'exact', head: true })
      .gte('visited_at', monthAgo)

    // Total unique visitors
    const { data: totalData, error: totalErr } = await supabase
      .rpc('count_unique_visitors', {})

    let totalVisitors = 0
    if (!totalErr && totalData) {
      totalVisitors = totalData
    } else {
      // Fallback: count distinct visitor_ids
      const { data: distinct } = await supabase
        .from('visits').select('visitor_id')
      const ids = new Set((distinct || []).map(r => r.visitor_id))
      totalVisitors = ids.size
    }

    stats.value = {
      dau: dau || 0,
      wau: wau || 0,
      mau: mau || 0,
      total: totalVisitors,
    }

    // Daily trend: last 30 days
    const { data: daily } = await supabase
      .from('visits')
      .select('visited_at, visitor_id')
      .gte('visited_at', monthAgo)
      .order('visited_at')

    const dayMap = new Map<string, Set<string>>()
    for (const r of (daily || [])) {
      if (!dayMap.has(r.visited_at)) dayMap.set(r.visited_at, new Set())
      dayMap.get(r.visited_at)!.add(r.visitor_id)
    }

    // Fill in all 30 days
    const result: Array<{ date: string; count: number }> = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      const s = dayMap.get(d)
      result.push({ date: d.slice(5), count: s ? s.size : 0 })
    }
    dailyData.value = result

  } catch (e) {
    console.error('Failed to load admin data:', e)
  } finally {
    loading.value = false
  }
}

const maxDaily = computed(() => Math.max(1, ...dailyData.value.map(d => d.count)))

onMounted(() => {
  const saved = sessionStorage.getItem('admin_authed')
  if (saved === ADMIN_PIN) {
    authed.value = true
    loadData()
  }
})

function logout() {
  authed.value = false
  sessionStorage.removeItem('admin_authed')
}
</script>

<template>
  <div class="admin-page">
    <!-- 登录 -->
    <div v-if="!authed" class="login-box">
      <h2>管理面板</h2>
      <input
        v-model="pinInput"
        type="password"
        placeholder="输入访问密码"
        class="pin-input"
        maxlength="8"
        @keyup.enter="handleLogin"
      />
      <button class="pin-btn" @click="handleLogin">进入</button>
      <p v-if="pinError" class="pin-error">密码错误</p>
    </div>

    <!-- 面板 -->
    <div v-else>
      <div class="admin-header">
        <h2>用户统计</h2>
        <span class="logout-btn" @click="logout">退出</span>
      </div>

      <van-loading v-if="loading" size="24" style="margin:40px auto;display:block" />

      <template v-else>
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-num">{{ stats.dau }}</div>
            <div class="stat-label">今日活跃</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">{{ stats.wau }}</div>
            <div class="stat-label">近7天活跃</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">{{ stats.mau }}</div>
            <div class="stat-label">近30天活跃</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">{{ stats.total }}</div>
            <div class="stat-label">历史总用户</div>
          </div>
        </div>

        <!-- 趋势图 -->
        <div class="chart-section">
          <h3>近30天日活趋势</h3>
          <div class="bar-chart">
            <div v-for="d in dailyData" :key="d.date" class="bar-col">
              <div
                class="bar"
                :style="{ height: (d.count / maxDaily * 100) + '%' }"
                :title="d.date + ': ' + d.count + '人'"
              >
                <span v-if="d.count > 0" class="bar-label">{{ d.count }}</span>
              </div>
              <div class="bar-date">{{ d.date }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 16px;
  max-width: 640px;
  margin: 0 auto;
  min-height: 100vh;
}

.login-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
}
.login-box h2 { font-size: 22px; }
.pin-input {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 18px;
  text-align: center;
  width: 200px;
  outline: none;
}
.pin-input:focus { border-color: var(--color-primary); }
.pin-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 10px 40px;
  font-size: 16px;
  cursor: pointer;
}
.pin-error { color: #DC2626; font-size: 13px; }

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.admin-header h2 { font-size: 20px; }
.logout-btn {
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}
.stat-card {
  background: var(--color-card);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
}
.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.chart-section h3 {
  font-size: 16px;
  margin-bottom: 12px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 140px;
  padding: 8px 0;
  overflow-x: auto;
}
.bar-col {
  flex: 1;
  min-width: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}
.bar {
  width: 100%;
  max-width: 20px;
  background: var(--color-primary);
  border-radius: 3px 3px 0 0;
  min-height: 2px;
  position: relative;
  transition: height 0.3s;
}
.bar-label {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.bar-date {
  font-size: 8px;
  color: #9CA3AF;
  margin-top: 3px;
  transform: rotate(-45deg);
  transform-origin: top left;
  white-space: nowrap;
}
</style>
