import { ref, onMounted } from 'vue'

/**
 * PWA 添加到桌面提示
 * - 已安装（standalone 模式）不弹
 * - 已关闭过不弹
 * - 首次使用延迟 3 秒弹出引导
 */
export function useInstallPrompt() {
  const showPrompt = ref(false)
  const isIOS = ref(false)
  const deferredPrompt = ref<any>(null)

  function dismiss() {
    showPrompt.value = false
    try { localStorage.setItem('pwa_prompt_dismissed', '1') } catch {}
  }

  async function handleInstall() {
    if (deferredPrompt.value) {
      deferredPrompt.value.prompt()
      const result = await deferredPrompt.value.userChoice
      if (result.outcome === 'accepted') {
        dismiss()
      }
      deferredPrompt.value = null
    } else {
      // iOS 等不支持 beforeinstallprompt 的浏览器，关闭弹窗即可
      dismiss()
    }
  }

  onMounted(() => {
    // 已安装为 PWA（从桌面打开），不弹
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // 已关闭过
    if (localStorage.getItem('pwa_prompt_dismissed')) return

    // 检测 iOS
    isIOS.value = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())

    // 延迟 3 秒
    setTimeout(() => {
      showPrompt.value = true
    }, 3000)

    // 监听原生安装事件（Chrome/Edge Android）
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt.value = e
    })
  })

  return { showPrompt, isIOS, dismiss, handleInstall }
}
