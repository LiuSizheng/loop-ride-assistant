import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DateType } from '@/types'

export const useUserStore = defineStore('user', () => {
  const dateTypeOverride = ref<DateType | null>(null)
  const gpsEnabled = ref(false)
  const locationPermissionDenied = ref(false)

  function setGpsEnabled(enabled: boolean) {
    gpsEnabled.value = enabled
  }

  return {
    dateTypeOverride,
    gpsEnabled,
    locationPermissionDenied,
    setGpsEnabled,
  }
})
