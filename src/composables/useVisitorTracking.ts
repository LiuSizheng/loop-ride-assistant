import { onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

/**
 * 匿名用户访问统计
 * - 首次访问：localStorage 生成随机 UUID（visit_id）
 * - 每设备每天仅记录一次
 * - 静默运行，不影响任何现有功能
 */

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

async function recordVisit(visitorId: string) {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const lastVisit = localStorage.getItem('last_visit_date')

  // 今天已经记录过，跳过
  if (lastVisit === today) return

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    await supabase.from('visits').insert({
      visitor_id: visitorId,
      visited_at: today,
    })
    localStorage.setItem('last_visit_date', today)
  } catch {
    // 静默失败，不影响 App 正常使用
  }
}

export function useVisitorTracking() {
  onMounted(() => {
    const vid = getVisitorId()
    recordVisit(vid)
  })
}
