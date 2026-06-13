import { computed, ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import { findNearestStop } from '@/utils/geo'
import { arrivalCountdown, departureCountdown } from '@/utils/countdown'
import { getNow } from '@/utils/time'
import type { NextBusResult, DateType, RouteName } from '@/types'

export function useNextBus() {
  const scheduleStore = useScheduleStore()
  const mapStore = useMapStore()
  const routeFilter = ref<RouteName | undefined>(undefined)
  const currentTime = ref(getNow())

  const dateType = computed<DateType>(() => getDateType(currentTime.value))
  const secondsNow = computed(() => getSecondsSinceMidnight(currentTime.value))

  /** 当天即将到站的车次（10 分钟内） */
  const upcomingBuses = computed<NextBusResult[]>(() => {
    const predictions = scheduleStore.predictions
    if (predictions.length === 0) return []

    const results: NextBusResult[] = []

    for (const pred of predictions) {
      if (pred.dateType !== dateType.value) continue
      if (routeFilter.value && pred.route !== routeFilter.value) continue

      const secondsAway = Math.round((pred.arrivalMinutes * 60) - secondsNow.value)
      if (secondsAway < -720) continue  // 半天前
      if (secondsAway > 600) continue   // 超过 10 分钟不显示
      if (secondsAway < -60) continue   // 已过站超 1 分钟移除

      // 跳过发车站：始发站的正点发车和环线归位已在「即将发车」中体现
      if (pred.isDepartureStop) continue
      if (pred.isReturnStop) continue

      const { label, status } = arrivalCountdown(secondsAway)
      const departure = scheduleStore.departures.find(d => d.recordId === pred.departureId)
      if (!departure) continue

      results.push({
        departure,
        stopName: pred.stopName,
        arrivalTime: pred.arrivalTime,
        minutesUntilArrival: Math.max(0, Math.floor(secondsAway / 60)),
        secondsUntilArrival: secondsAway,
        etaDisplay: label,
        isImminent: status === 'urgent' || status === 'arrived',
      } as NextBusResult)
    }

    results.sort((a, b) => a.secondsUntilArrival - b.secondsUntilArrival)
    return results.slice(0, 10)
  })

  /** 用户附近站点的到站车次 */
  const nearbyBuses = computed<NextBusResult[]>(() => {
    if (mapStore.userLat === null || mapStore.userLng === null) {
      return upcomingBuses.value.slice(0, 6)
    }
    const result = findNearestStop(mapStore.userLat, mapStore.userLng, scheduleStore.stations)
    if (!result) return upcomingBuses.value.slice(0, 6)
    return upcomingBuses.value.filter(b => b.stopName === result.station.name).slice(0, 6)
  })

  /** 即将发车的车次（30 分钟内） */
  const departingSoon = computed(() => {
    const deps = scheduleStore.getDepartures(dateType.value, routeFilter.value)
    const results: Array<{
      departure: (typeof deps)[0]
      secondsUntil: number
      label: string
      isUrgent: boolean
    }> = []

    for (const dep of deps) {
      const secondsAway = Math.round((dep.departureMinutes * 60) - secondsNow.value)
      if (secondsAway < -720) continue
      if (secondsAway > 3600) continue   // 超过 60 分钟不显示
      if (secondsAway < -60) continue    // 已发车超 1 分钟移除

      const { label, status } = departureCountdown(secondsAway)
      results.push({
        departure: dep,
        secondsUntil: secondsAway,
        label,
        isUrgent: status === 'urgent' || status === 'arrived',
      })
    }

    results.sort((a, b) => a.secondsUntil - b.secondsUntil)
    return results
  })

  function refresh() {
    currentTime.value = getNow()
  }

  function setRouteFilter(route?: RouteName) {
    routeFilter.value = route
  }

  return {
    dateType,
    upcomingBuses,
    nearbyBuses,
    departingSoon,
    refresh,
    setRouteFilter,
  }
}
