import type { Departure, RoutePattern, BusPosition, Station } from '@/types'
import { getSecondsSinceMidnight } from './datetime'
import { computeBearing } from './geo'

/**
 * 根据当前时间插值计算公交车在路线上的位置
 * 返回正在运行的公交车位置数组
 */
export function computeActiveBusPositions(
  departures: Departure[],
  patterns: Map<string, RoutePattern>,
  stations: Station[],
  currentDate: Date = new Date()
): BusPosition[] {
  const secondsSinceMidnight = getSecondsSinceMidnight(currentDate)
  const stationCoords = new Map(stations.map((s) => [s.name, { lat: s.lat, lng: s.lng }]))
  const results: BusPosition[] = []

  // 考虑前 2 小时内发车的班次（可能还在路上）
  const lookbackSeconds = 7200

  for (const dep of departures) {
    const pattern = patterns.get(dep.routeKey)
    if (!pattern || pattern.stops.length < 2) continue

    let elapsedSeconds = secondsSinceMidnight - dep.departureMinutes * 60
    // 处理跨日
    if (elapsedSeconds < -lookbackSeconds) elapsedSeconds += 86400

    if (elapsedSeconds < 0) continue // 尚未发车
    if (elapsedSeconds > pattern.totalSeconds + 300) continue // 已到终点

    // 找到当前在哪两站之间
    for (let i = 1; i < pattern.stops.length; i++) {
      const prev = pattern.stops[i - 1]
      const curr = pattern.stops[i]
      if (elapsedSeconds < curr.cumulativeSeconds) {
        const segmentStart = prev.cumulativeSeconds
        const segmentDuration =
          curr.cumulativeSeconds - prev.cumulativeSeconds
        const progress =
          segmentDuration > 0
            ? (elapsedSeconds - segmentStart) / segmentDuration
            : 0

        const fromCoords = stationCoords.get(prev.currentStop)
        const toCoords = stationCoords.get(curr.currentStop)
        if (!fromCoords || !toCoords) break

        const lat =
          fromCoords.lat + (toCoords.lat - fromCoords.lat) * progress
        const lng =
          fromCoords.lng + (toCoords.lng - fromCoords.lng) * progress

        results.push({
          departureId: dep.recordId,
          route: dep.route,
          routeKey: dep.routeKey,
          shiftName: dep.shiftName,
          vehicleNo: dep.vehicleNo,
          lat,
          lng,
          fromStop: prev.currentStop,
          toStop: curr.currentStop,
          progress,
          heading: computeBearing(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng),
        })
        break
      }
    }
  }

  return results
}
