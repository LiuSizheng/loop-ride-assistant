/**
 * GCJ-02 坐标 → 卫星底图像素坐标
 * 用于静态地图的 SVG 叠加层定位
 */

// 卫星底图参数（从 download_satellite.mjs 生成，固定不变）
const TOP_LEFT_TILE_X = 106690
const TOP_LEFT_TILE_Y = 54796
const ZOOM = 17
const TILE_SIZE = 256
const N = 2 ** ZOOM

// ─── GCJ-02 → WGS-84 反转 ───
export function gcj02ToWgs84(lng: number, lat: number): { lat: number; lng: number } {
  const a = 6378245.0
  const ee = 0.006693421622965943

  function transformLat(x: number, y: number): number {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
    r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3
    r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3
    return r
  }

  function transformLng(x: number, y: number): number {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3
    return r
  }

  const dlat = transformLat(lng - 105, lat - 35)
  const dlng = transformLng(lng - 105, lat - 35)
  const radlat = lat / 180 * Math.PI
  const magic = Math.sin(radlat)
  const m2 = 1 - ee * magic * magic
  const sq = Math.sqrt(m2)

  return {
    lat: lat - (dlat * 180) / ((a * (1 - ee)) / (m2 * sq) * Math.PI),
    lng: lng - (dlng * 180) / (a / sq * Math.cos(radlat) * Math.PI),
  }
}

// ─── GCJ-02 → 底图像素坐标 ───
export function gcj02ToPixel(lng: number, lat: number): { x: number; y: number } {
  const wgs = gcj02ToWgs84(lng, lat)
  const tileX = ((wgs.lng + 180) / 360) * N
  const tileY = ((1 - Math.log(Math.tan(wgs.lat * Math.PI / 180) + 1 / Math.cos(wgs.lat * Math.PI / 180)) / Math.PI) / 2) * N
  return {
    x: (tileX - TOP_LEFT_TILE_X) * TILE_SIZE,
    y: (tileY - TOP_LEFT_TILE_Y) * TILE_SIZE,
  }
}
