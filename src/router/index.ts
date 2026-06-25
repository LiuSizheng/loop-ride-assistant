import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: '首页', tab: 'home' },
    },
    {
      path: '/schedule',
      name: 'schedule',
      component: () => import('@/views/ScheduleView.vue'),
      meta: { title: '行程', tab: 'schedule' },
    },
    {
      path: '/stop',
      name: 'stop',
      component: () => import('@/views/StopQueryView.vue'),
      meta: { title: '站点查询', tab: 'stop' },
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
      meta: { title: '地图', tab: 'map' },
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
      meta: { title: '记录', tab: 'upload' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
      meta: { title: '关于' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { title: '管理' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
