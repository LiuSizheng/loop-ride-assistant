import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BusPosition } from '@/types'

export const useMapStore = defineStore('map', () => {
  const userLat = ref<number | null>(null)
  const userLng = ref<number | null>(null)
  const userHeading = ref(0)
  const activeBusPositions = ref<BusPosition[]>([])
  const selectedStop = ref<string | null>(null)
  const mapCenter = ref<[number, number]>([112.99, 28.221])
  const mapZoom = ref(15)
  const visibleRoutes = ref<Set<string>>(new Set(['HX1_NORMAL', 'HX1_DINING', 'HX2_NORMAL', 'HX3_NORMAL']))
  const showLabels = ref(true)
  const simulatedMinutes = ref<number | null>(null)
  function getSimulatedDate(): Date {
    if (simulatedMinutes.value === null) return new Date()
    const d = new Date()
    const h = Math.floor(simulatedMinutes.value / 60)
    const m = Math.floor(simulatedMinutes.value % 60)
    d.setHours(h, m, d.getSeconds(), d.getMilliseconds())
    return d
  }

  function setUserLocation(lat: number, lng: number) {
    userLat.value = lat
    userLng.value = lng
  }

  function setBusPositions(positions: BusPosition[]) {
    activeBusPositions.value = positions
  }

  function selectStop(stopName: string | null) {
    selectedStop.value = stopName
  }

  function toggleRoute(routeKey: string) {
    if (visibleRoutes.value.has(routeKey)) {
      visibleRoutes.value.delete(routeKey)
    } else {
      visibleRoutes.value.add(routeKey)
    }
  }

  function toggleRouteOnly(routeKey: string) {
    visibleRoutes.value = new Set([routeKey])
  }

  function toggleLabels() {
    showLabels.value = !showLabels.value
  }

  function setAllRoutesVisible() {
    visibleRoutes.value = new Set(['HX1_NORMAL', 'HX1_DINING', 'HX2_NORMAL', 'HX3_NORMAL'])
  }

  function clearAllRoutes() {
    visibleRoutes.value = new Set<string>()
  }

  function setSimulatedTime(minutes: number | null) {
    simulatedMinutes.value = minutes
  }

  function recenterOnUser() {
    if (userLat.value !== null && userLng.value !== null) {
      mapCenter.value = [userLng.value, userLat.value]
      mapZoom.value = 16
    }
  }

  return {
    userLat,
    userLng,
    userHeading,
    activeBusPositions,
    selectedStop,
    mapCenter,
    mapZoom,
    visibleRoutes,
    showLabels,
    simulatedMinutes,
    getSimulatedDate,
    setUserLocation,
    setBusPositions,
    selectStop,
    toggleRoute,
    toggleRouteOnly,
    toggleLabels,
    setAllRoutesVisible,
    clearAllRoutes,
    setSimulatedTime,
    recenterOnUser,
  }
})
