import { ref, onMounted } from 'vue'

/**
 * PWA 添加到桌面提示
 * - 已安装（standalone 模式）不弹
 * - 点了「不再提示」永久不弹
 * - 「知道了」后关闭但不记录，下次仍有可能弹出（直到真正添加或点不再提示）
 */
export function useInstallPrompt() {
  const showPrompt = ref(false)
  const isIOS = ref(false)
  const canNativeInstall = ref(false)
  const deferredPrompt = ref<any>(null)

  // 提前注册 beforeinstallprompt（在 onMounted 之前，事件触发很早）
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt.value = e
      canNativeInstall.value = true
    })
    // 如果事件已经触发过了，检查
    if ('BeforeInstallPromptEvent' in window) {
      canNativeInstall.value = true
    }
  }

  function dismiss() {
    showPrompt.value = false
  }

  function dismissForever() {
    showPrompt.value = false
    try { localStorage.setItem('pwa_prompt_dismissed', '1') } catch {}
  }

  async function handleInstall() {
    if (deferredPrompt.value) {
      deferredPrompt.value.prompt()
      const result = await deferredPrompt.value.userChoice
      deferredPrompt.value = null
      if (result.outcome === 'accepted') {
        dismissForever()
        return
      }
    }
    // 没有原生安装能力，仅关闭（不永久 dismiss，下次可能再提示）
    dismiss()
  }

  onMounted(() => {
    // 已安装为 PWA（从桌面打开），不弹
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // 已点过「不再提示」
    if (localStorage.getItem('pwa_prompt_dismissed')) return

    // 检测 iOS
    isIOS.value = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())

    // 延迟 3 秒
    setTimeout(() => {
      showPrompt.value = true
    }, 3000)
  })

  return { showPrompt, isIOS, canNativeInstall, dismiss, dismissForever, handleInstall }
}
