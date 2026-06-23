import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useMapStore } from '@/stores/map'
import { useUserStore } from '@/stores/user'
import { useGlobalLocation } from '@/stores/global-location'

export function useGeolocation() {
  const mapStore = useMapStore()
  const userStore = useUserStore()
  const locationStore = useGlobalLocation()
  const error = ref<string | null>(null)
  let watchId: number | null = null

  // 模拟位置激活时，直接写入 mapStore，切换坐标时自动同步
  watchEffect(() => {
    if (locationStore.isActive && locationStore.lat !== null && locationStore.lng !== null) {
      mapStore.setUserLocation(locationStore.lat, locationStore.lng)
      userStore.setGpsEnabled(true)
      userStore.locationPermissionDenied = false
      error.value = null
    }
  })

  function startWatching() {
    // 模拟位置激活时，不启动真实 GPS
    if (locationStore.isActive) return

    if (!navigator.geolocation) {
      error.value = '浏览器不支持定位'
      return
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        // 模拟位置激活期间，忽略真实 GPS 回调
        if (locationStore.isActive) return

        // 过滤极低精度定位（Wi-Fi 定位精度通常 20-200m，桌面 Chrome 约 100-400m）
        if (position.coords.accuracy > 500) return

        // 浏览器 GPS 返回 WGS-84，站点/路线数据均为 WGS-84，直接存储
        mapStore.setUserLocation(
          position.coords.latitude,
          position.coords.longitude
        )
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
