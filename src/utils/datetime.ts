import { getDateLabel, isHX1Available } from './holidays'

export type DateType = 'weekday' | 'weekend_holiday'

/**
 * 判断日期类型：工作日 / 周末节假日
 * 结合国务院法定节假日和调休
 */
export function getDateType(date: Date = new Date()): DateType {
  return isHX1Available(date) ? 'weekday' : 'weekend_holiday'
}

/**
 * 获取日期标签（节日名 > 工作日/周末）
 */
export function getDateTypeLabel(dateType?: DateType, date?: Date): string {
  if (date) return getDateLabel(date)
  return dateType === 'weekday' ? '工作日' : '周末/节假日'
}

/**
 * 获取当前时间距离 00:00 的秒数
 */
export function getSecondsSinceMidnight(date: Date = new Date()): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()
}

/**
 * 将分钟数转换为 HH:MM 字符串
 */
export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = Math.floor(normalized % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 格式化当前日期显示
 */
export function formatDate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const w = weekDays[date.getDay()]
  return `${y}年${m}月${d}日 星期${w}`
}
