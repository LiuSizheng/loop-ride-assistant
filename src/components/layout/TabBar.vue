<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const tabs = [
  { name: 'home', label: '首页', icon: 'home-o', path: '/' },
  { name: 'schedule', label: '时刻表', icon: 'clock-o', path: '/schedule' },
  { name: 'upload', label: '记录', icon: 'todo-list-o', path: '/upload' },
  { name: 'map', label: '地图', icon: 'location-o', path: '/map' },
]

function active(name: string) {
  return (route.meta.tab as string) === name
}

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <van-tabbar
    :model-value="String(route.meta.tab || 'home')"
    @change="(name: string) => go(tabs.find(t => t.name === name)?.path || '/')"
    :fixed="true"
    :border="true"
    :safe-area-inset-bottom="true"
    active-color="var(--color-primary)"
  >
    <van-tabbar-item
      v-for="tab in tabs"
      :key="tab.name"
      :name="tab.name"
      :icon="tab.icon"
    >
      {{ tab.label }}
    </van-tabbar-item>
  </van-tabbar>
</template>
