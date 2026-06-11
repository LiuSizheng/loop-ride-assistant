<script setup lang="ts">
defineProps<{
  route: string
  dining?: boolean
}>()
</script>

<template>
  <span
    class="route-badge"
    :class="{
      'route-hx1': route === '环线1路' && !dining,
      'route-hx1-dining': route === '环线1路' && dining,
      'route-hx2': route === '环线2路',
      'route-hx3': route === '环线3路',
    }"
  >
    {{ dining ? '环1·就餐' : route }}
  </span>
</template>

<style scoped>
.route-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.route-hx1 { background: var(--color-hx1); }
.route-hx1-dining { background: var(--color-hx1-dining); color: #7C2D12; }
.route-hx2 { background: var(--color-hx2); }
.route-hx3 { background: var(--color-hx3); }
</style>
