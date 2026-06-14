<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { initHolidays } from '@/utils/holidays'
import TabBar from '@/components/layout/TabBar.vue'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import TimeOverride from '@/components/dev/TimeOverride.vue'

const route = useRoute()
const scheduleStore = useScheduleStore()
const { isOnline } = useOnlineStatus()

const showTabBar = computed(() => {
  const tabRoutes = ['home', 'schedule', 'stop', 'upload', 'map']
  return tabRoutes.includes((route.meta.tab as string) || '')
})

onMounted(() => {
  scheduleStore.loadData()
  initHolidays()
})
</script>

<template>
  <OfflineBanner v-if="!isOnline" />
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
  <TabBar v-if="showTabBar" />
  <!-- 时间覆写悬浮窗（调试用）：改为 true 即可重新显示 -->
  <TimeOverride v-if="false" />
</template>

<style>
:root {
  --color-primary: #1A56DB;
  --color-primary-light: #3B82F6;
  --color-hx1: #2563EB;
  --color-hx1-dining: #F59E0B;
  --color-hx2: #10B981;
  --color-hx3: #8B5CF6;
  --color-bg: #F3F4F6;
  --color-card: #FFFFFF;
  --color-text: #1F2937;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-container {
  flex: 1;
  padding-bottom: 60px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
