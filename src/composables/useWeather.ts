import { ref, onMounted } from 'vue'

interface WeatherInfo {
  icon: string
  desc: string
  tempNow: number
  tempMax: number
  tempMin: number
}

const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)

// WMO Weather codes → emoji + description
function weatherCodeToInfo(code: number): { icon: string; desc: string } {
  const map: Record<number, [string, string]> = {
    0: ['☀️', '晴'],
    1: ['🌤️', '大部晴'],
    2: ['⛅', '多云'],
    3: ['☁️', '阴'],
    45: ['🌫️', '雾'],
    48: ['🌫️', '雾凇'],
    51: ['🌦️', '小毛毛雨'],
    53: ['🌦️', '毛毛雨'],
    55: ['🌦️', '大毛毛雨'],
    56: ['🌧️', '冻毛毛雨'],
    57: ['🌧️', '大冻毛毛雨'],
    61: ['🌧️', '小雨'],
    63: ['🌧️', '中雨'],
    65: ['🌧️', '大雨'],
    66: ['🌨️', '冻雨'],
    67: ['🌨️', '大冻雨'],
    71: ['🌨️', '小雪'],
    73: ['🌨️', '中雪'],
    75: ['❄️', '大雪'],
    77: ['🌨️', '雪粒'],
    80: ['🌧️', '阵雨'],
    81: ['🌧️', '中阵雨'],
    82: ['⛈️', '大阵雨'],
    85: ['🌨️', '小阵雪'],
    86: ['🌨️', '大阵雪'],
    95: ['⛈️', '雷暴'],
    96: ['⛈️', '雷暴+小冰雹'],
    99: ['⛈️', '雷暴+大冰雹'],
  }
  const [icon, desc] = map[code] || ['🌤️', '未知']
  return { icon, desc }
}

export function useWeather() {
  async function fetchWeather() {
    if (loading.value) return
    loading.value = true
    try {
      // 研究生宿舍楼坐标
      const lat = 28.258
      const lng = 113.046
      // current_weather: 当前温度和即时天气 | daily: 全天最高最低温
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1`
      const resp = await fetch(url)
      if (!resp.ok) return
      const data = await resp.json()
      const cur = data.current_weather
      const tmax = data.daily?.temperature_2m_max?.[0]
      const tmin = data.daily?.temperature_2m_min?.[0]
      if (!cur || tmax === undefined || tmin === undefined) return

      weather.value = {
        ...weatherCodeToInfo(cur.weathercode),
        tempNow: Math.round(cur.temperature),
        tempMax: Math.round(tmax),
        tempMin: Math.round(tmin),
      }
    } catch {
      // silently fail
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchWeather()
  })

  return { weather, loading }
}
