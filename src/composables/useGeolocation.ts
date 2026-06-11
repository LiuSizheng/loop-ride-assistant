import { onMounted, onUnmounted, ref } from 'vue'
import { useMapStore } from '@/stores/map'
import { useUserStore } from '@/stores/user'
import { wgs84ToGcj02 } from '@/utils/geo'

export function useGeolocation() {
  const mapStore = useMapStore()
  const userStore = useUserStore()
  const error = ref<string | null>(null)
  let watchId: number | null = null

  function startWatching() {
    if (!navigator.geolocation) {
      error.value = '浏览器不支持定位'
      return
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        // 浏览器 GPS 返回 WGS-84，转为 GCJ-02 适配高德地图
        const [gcjLng, gcjLat] = wgs84ToGcj02(
          position.coords.longitude,
          position.coords.latitude
        )
        mapStore.setUserLocation(gcjLat, gcjLng)
        mapStore.userHeading = position.coords.heading ?? 0
        userStore.setGpsEnabled(true)
        userStore.locationPermissionDenied = false
        error.value = null
      },
      (err) => {
        userStore.setGpsEnabled(false)
        if (err.code === err.PERMISSION_DENIED) {
          userStore.locationPermissionDenied = true
          error.value = '定位权限被拒绝'
        } else {
          error.value = '定位不可用'
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    )
  }

  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
  }

  onMounted(() => {
    startWatching()
  })

  onUnmounted(() => {
    stopWatching()
  })

  return {
    error,
    startWatching,
    stopWatching,
  }
}
