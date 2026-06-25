import { onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function getVisitorId(): string {
  const key = 'visit_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id!)
  }
  return id!
}

function detectDeviceType(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android|harmonyos|huawei|honor|oppo|vivo|xiaomi|redmi|oneplus|samsung/.test(ua)) return 'android'
  // 微信内置浏览器也属移动端
  if (/micromessenger/.test(ua)) return 'android' // 微信基本只在手机上用
  // 触摸屏 + 小屏幕 = 移动端
  if ('ontouchstart' in window && window.innerWidth < 1024) return 'android'
  return 'desktop'
}

async function recordVisit(visitorId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const lastVisit = localStorage.getItem('last_visit_date')
  if (lastVisit === today) return

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error } = await supabase.from('visits').insert({
      visitor_id: visitorId,
      visited_at: today,
      device_type: detectDeviceType(),
    })
    if (!error) localStorage.setItem('last_visit_date', today)
  } catch { /* 静默 */ }
}

export function useVisitorTracking() {
  onMounted(() => {
    const vid = getVisitorId()
    recordVisit(vid)
  })
}
