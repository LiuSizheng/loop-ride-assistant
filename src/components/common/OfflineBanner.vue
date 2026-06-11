<script setup lang="ts">
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()
</script>

<template>
  <div v-if="!isOnline" class="offline-banner">
    <span>离线模式 - 地图功能暂不可用</span>
  </div>
</template>

<style scoped>
.offline-banner {
  background: #FEF3C7;
  color: #92400E;
  text-align: center;
  padding: 6px 16px;
  font-size: 13px;
  position: sticky;
  top: 0;
  z-index: 100;
}
</style>
