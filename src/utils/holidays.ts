/**
 * 中国法定节假日数据
 *
 * 策略：
 * 1. 运行时从 GitHub 拉取最新节假日数据（NateScarlet/holiday-cn）
 * 2. 缓存到 localStorage，下次启动直接读取
 * 3. 网络失败时使用内置推算数据兜底
 */

// ─── 推算数据（兜底） ───
const FALLBACK_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-17': '春节', '2026-02-18': '春节', '2026-02-19': '春节',
  '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节',
  '2026-02-23': '春节',
  '2026-04-05': '清明', '2026-04-06': '清明', '2026-04-07': '清明',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
  '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午', '2026-06-20': '端午', '2026-06-21': '端午',
  '2026-09-25': '中秋', '2026-09-26': '中秋', '2026-09-27': '中秋',
  '2026-10-01': '国庆', '2026-10-02': '国庆', '2026-10-03': '国庆',
  '2026-10-04': '国庆', '2026-10-05': '国庆', '2026-10-06': '国庆',
  '2026-10-07': '国庆',
}

const FALLBACK_WORKDAYS: Set<string> = new Set([
  '2026-02-14', '2026-02-15', '2026-02-28',
  '2026-04-04',
  '2026-04-26',
  '2026-09-20', '2026-10-10',
])

import { getNow } from './time'
let holidays: Record<string, string> = { ...FALLBACK_HOLIDAYS }
let workdaysOnWeekend: Set<string> = new Set(FALLBACK_WORKDAYS)
let loadedYears: Set<string> = new Set()

const DATA_URL = 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master'
const CACHE_KEY = 'holiday_data'
const CACHE_YEAR_KEY = 'holiday_years'

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── 从 GitHub 拉取节假日数据 ───
// NateScarlet/holiday-cn 数据格式:
// { "days": [{ "date": "2026-01-01", "isOffDay": true, "name": "元旦" }, ...] }

async function fetchYearData(year: number): Promise<boolean> {
  try {
    const resp = await fetch(`${DATA_URL}/${year}.json`)
    if (!resp.ok) return false
    const data = await resp.json()
    if (!data.days) return false

    for (const day of data.days) {
      if (day.isOffDay && day.name) {
        holidays[day.date] = day.name
      } else if (!day.isOffDay) {
        // 调休工作日
        const d = new Date(day.date + 'T00:00:00+08:00')
        if (d.getDay() === 0 || d.getDay() === 6) {
          workdaysOnWeekend.add(day.date)
        }
      }
    }
    loadedYears.add(String(year))
    return true
  } catch {
    return false
  }
}

// ─── 持久化缓存 ───
function saveCache() {
  try {
    const cache = {
      holidays,
      workdays: Array.from(workdaysOnWeekend),
      years: Array.from(loadedYears),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* quota exceeded, ignore */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const cache = JSON.parse(raw)
    if (cache.holidays) {
      holidays = { ...FALLBACK_HOLIDAYS, ...cache.holidays }
    }
    if (cache.workdays) {
      workdaysOnWeekend = new Set(cache.workdays)
    }
    if (cache.years) {
      loadedYears = new Set(cache.years)
    }
  } catch { /* ignore corrupt cache */ }
}

// ─── 初始化 ───
let initPromise: Promise<void> | null = null

export function initHolidays(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    loadCache()
    const currentYear = getNow().getFullYear()
    const yearsToFetch = [currentYear]
    if (currentYear < 2027) yearsToFetch.push(currentYear + 1)

    for (const year of yearsToFetch) {
      if (loadedYears.has(String(year))) continue
      const ok = await fetchYearData(year)
      if (ok) {
        loadedYears.add(String(year))
        saveCache()
      }
    }
  })()

  return initPromise
}

/**
 * 获取日期标签（节日名 > 工作日/周末）
 */
export function getDateLabel(date?: Date): string {
  const d = date ?? getNow()
  const key = dateKey(d)
  if (holidays[key]) return holidays[key]
  if (workdaysOnWeekend.has(key)) return '工作日'
  const day = d.getDay()
  if (day === 0 || day === 6) return '周末'
  return '工作日'
}

/**
 * 判断是否为环线1路可运行日（非节假日非周末的真实工作日）
 */
export function isHX1Available(date?: Date): boolean {
  return getDateLabel(date) === '工作日'
}
