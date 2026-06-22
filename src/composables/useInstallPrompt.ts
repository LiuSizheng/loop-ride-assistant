import { ref, onMounted } from 'vue'

/**
 * PWA 添加到桌面提示
 * - 已安装（standalone 模式）不弹
 * - 点了「不再提示」永久不弹
 * - 仅告知用户如何手动添加，不尝试触发原生安装弹窗（兼容性问题太多）
 */
export function useInstallPrompt() {
  const showPrompt = ref(false)
  const isIOS = ref(false)

  function dismiss() {
    showPrompt.value = false
  }

  function dismissForever() {
    showPrompt.value = false
    try { localStorage.setItem('pwa_prompt_dismissed', '1') } catch {}
  }

  onMounted(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem('pwa_prompt_dismissed')) return

    isIOS.value = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())

    setTimeout(() => {
      showPrompt.value = true
    }, 3000)
  })

  return { showPrompt, isIOS, dismiss, dismissForever }
}
