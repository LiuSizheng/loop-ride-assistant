import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Departure,
  RoutePattern,
  Station,
  ArrivalPrediction,
  RouteName,
  DateType,
  RouteKey,
} from '@/types'

type RoutePath = [number, number][]  // [[lng, lat], ...]

export const useScheduleStore = defineStore('schedule', () => {
  // Raw data
  const departures = ref<Departure[]>([])
  const routePatterns = ref<RoutePattern[]>([])
  const stations = ref<Station[]>([])
  const predictions = ref<ArrivalPrediction[]>([])
  const routePaths = ref<Record<string, RoutePath>>({})
  const routeStops = ref<Record<string, Array<{ name: string; lng: number; lat: number }>>>({})

  // Indexes
  const departuresByDateType = ref<Map<DateType, Departure[]>>(new Map())
  const predictionsByStop = ref<Map<string, ArrivalPrediction[]>>(new Map())
  const patternByKey = ref<Map<RouteKey, RoutePattern>>(new Map())

  // Load state
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dataVersion = ref('1.0.0')

  async function loadData() {
    if (loading.value) return
    loading.value = true
    error.value = null

    try {
      const base = import.meta.env.BASE_URL

      const [depsRes, rpRes, stRes, predRes] = await Promise.all([
        fetch(`${base}data/departures.json`),
        fetch(`${base}data/route_params.json`),
        fetch(`${base}data/stations.json`),
        fetch(`${base}data/arrival_predictions.json`),
      ])

      if (!depsRes.ok || !rpRes.ok || !stRes.ok || !predRes.ok) {
        throw new Error('数据加载失败')
      }

      departures.value = await depsRes.json()
      routePatterns.value = await rpRes.json()
      stations.value = await stRes.json()
      predictions.value = await predRes.json()

      // Load route paths (optional)
      try {
        const rpRes2 = await fetch(`${base}data/route_paths.json`)
        if (rpRes2.ok) {
          routePaths.value = await rpRes2.json()
        }
      } catch {
        // optional
      }

      // Load route stops (per-route station positions)
      try {
        const rsRes = await fetch(`${base}data/route_stops.json`)
        if (rsRes.ok) {
          routeStops.value = await rsRes.json()
        }
      } catch {
        // optional
      }

      buildIndexes()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '未知错误'
    } finally {
      loading.value = false
    }
  }

  function buildIndexes() {
    // departuresByDateType
    const dtMap = new Map<DateType, Departure[]>()
    dtMap.set('weekday', [])
    dtMap.set('weekend_holiday', [])
    for (const d of departures.value) {
      dtMap.get(d.dateType)?.push(d)
    }
    departuresByDateType.value = dtMap

    // predictionsByStop
    const psMap = new Map<string, ArrivalPrediction[]>()
    for (const p of predictions.value) {
      if (!psMap.has(p.stopName)) {
        psMap.set(p.stopName, [])
      }
      psMap.get(p.stopName)!.push(p)
    }
    predictionsByStop.value = psMap

    // patternByKey
    const pkMap = new Map<RouteKey, RoutePattern>()
    for (const rp of routePatterns.value) {
      pkMap.set(rp.routeKey, rp)
    }
    patternByKey.value = pkMap
  }

  // Get departures for a specific date type and optional route
  function getDepartures(dateType: DateType, route?: RouteName): Departure[] {
    let result = departuresByDateType.value.get(dateType) || []
    if (route) {
      result = result.filter((d) => d.route === route)
    }
    return result
  }

  // Get predictions for a specific stop and date type
  function getPredictionsForStop(stopName: string, dateType: DateType): ArrivalPrediction[] {
    const all = predictionsByStop.value.get(stopName) || []
    return all.filter((p) => p.dateType === dateType)
  }

  // Get route pattern
  function getPattern(routeKey: RouteKey): RoutePattern | undefined {
    return patternByKey.value.get(routeKey)
  }

  // Get stops for a route key (unique stop names in order)
  function getStopsForRoute(routeKey: RouteKey): string[] {
    const pattern = patternByKey.value.get(routeKey)
    if (!pattern) return []
    return pattern.stops.map((s) => s.currentStop)
  }

  const isDataLoaded = computed(() => departures.value.length > 0)

  return {
    departures,
    routePatterns,
    stations,
    predictions,
    routePaths,
    routeStops,
    loading,
    error,
    dataVersion,
    isDataLoaded,
    loadData,
    getDepartures,
    getPredictionsForStop,
    getPattern,
    getStopsForRoute,
  }
})
