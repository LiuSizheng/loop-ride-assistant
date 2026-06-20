/**
 * 高德地图 JS API 2.0 动态加载器
 *
 * 使用前需要先获取 Key: https://console.amap.com/dev/key/app
 * 本文件使用占位 Key，部署前请替换为实际 Key。
 */

const AMAP_KEY = 'beb757969a119ae1677916f193cbc3fb'
const AMAP_SECURITY_KEY = '78bd15a1c3ff7f68678816a7f6f3566f'
const AMAP_VERSION = '2.0'

declare global {
  interface Window {
    _amapLoaded?: boolean
    _amapLoading?: boolean
    _AMapSecurityConfig?: {
      securityJsCode: string
    }
  }
}

/**
 * 动态加载高德地图 JS API
 */
export function loadAMap(): Promise<void> {
  if (window._amapLoaded) return Promise.resolve()
  if (window._amapLoading) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (window._amapLoaded) {
          clearInterval(check)
          resolve()
        }
      }, 100)
      setTimeout(() => {
        clearInterval(check)
        reject(new Error('高德地图加载超时'))
      }, 15000)
    })
  }

  window._amapLoading = true

  // 高德地图 JS API 2.0 要求在加载 SDK 之前设置安全密钥
  window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_KEY }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=${AMAP_VERSION}&key=${AMAP_KEY}`
    script.onload = () => {
      window._amapLoaded = true
      window._amapLoading = false
      resolve()
    }
    script.onerror = () => {
      window._amapLoading = false
      reject(new Error('高德地图 SDK 加载失败'))
    }
    document.head.appendChild(script)
  })
}

/**
 * 设置高德地图 Key（暂不支持运行时覆盖，需在源码中修改）
 */
export function setAMapKey(_key: string): void {
  // Key 在模块顶部常量中定义，加载后不可更改
}

export { AMAP_KEY }
