<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  secondsUntil: number
  type?: 'arrival' | 'departure'
}>()

import { arrivalCountdown, departureCountdown } from '@/utils/countdown'

const info = computed(() => {
  if (props.type === 'departure') {
    return departureCountdown(props.secondsUntil)
  }
  return arrivalCountdown(props.secondsUntil)
})

const label = computed(() => info.value.label)
const status = computed(() => info.value.status)
</script>

<template>
  <span v-if="label" class="eta" :class="status">{{ label }}</span>
</template>

<style scoped>
.eta {
  font-size: 13px;
  font-weight: 500;
}
.normal {
  color: #2563EB;      /* 蓝 */
}
.warning {
  color: #F59E0B;      /* 橙 */
}
.urgent {
  color: #DC2626;      /* 红 */
  font-weight: 600;
  animation: pulse 1.5s ease-in-out infinite;
}
.arrived {
  color: #10B981;      /* 绿 */
  font-weight: 600;
}
.passed {
  color: #9CA3AF;      /* 灰 */
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
