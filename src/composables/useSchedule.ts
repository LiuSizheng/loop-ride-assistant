import { computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import type { RouteName } from '@/types'

export function useSchedule(route?: RouteName) {
  const store = useScheduleStore()

  const currentRoutePatterns = computed(() => {
    if (!route) return store.routePatterns
    return store.routePatterns.filter((rp) => rp.route === route)
  })

  return {
    store,
    currentRoutePatterns,
    isDataLoaded: store.isDataLoaded,
    loading: store.loading,
    error: store.error,
  }
}
