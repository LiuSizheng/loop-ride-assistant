/**
 * 下载卫星瓦片并拼接成校园底图
 *
 * 使用 ESRI World Imagery（免费无需 key）
 * 运行：node scripts/download_satellite.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'campus-satellite.png');

// 从 route_paths.json 计算校园边界并扩展 ~300m
const rp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'route_paths.json'), 'utf-8'));
let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const path_ of Object.values(rp)) {
  for (const [lng, lat] of path_) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
}
const PAD = 0.003;
const BOUNDS = { west: minLng - PAD, east: maxLng + PAD, north: maxLat + PAD, south: minLat - PAD };
console.log('区域边界:', BOUNDS);

// 瓦片计算
const TILE_SIZE = 256;
const ZOOM = 17;

function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * n),
  };
}

const topLeft = lngLatToTile(BOUNDS.west, BOUNDS.north, ZOOM);
const bottomRight = lngLatToTile(BOUNDS.east, BOUNDS.south, ZOOM);
const cols = bottomRight.x - topLeft.x + 1;
const rows = bottomRight.y - topLeft.y + 1;

console.log(`缩放: ${ZOOM}, 瓦片: ${cols}×${rows} = ${cols * rows} 张`);
console.log(`输出: ${cols * TILE_SIZE} × ${rows * TILE_SIZE} px`);

// ESRI World Imagery — 免费无需 key
async function downloadTile(z, x, y) {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'CampusBusApp/1.0' } });
  if (!resp.ok) throw new Error(`${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function main() {
  console.log('开始下载卫星瓦片...');
  const totalWidth = cols * TILE_SIZE;
  const totalHeight = rows * TILE_SIZE;
  const rowBuffers = [];

  for (let row = 0; row < rows; row++) {
    const tileBuffers = [];
    for (let col = 0; col < cols; col++) {
      const tx = topLeft.x + col;
      const ty = topLeft.y + row;
      try {
        tileBuffers.push(await downloadTile(ZOOM, tx, ty));
        process.stdout.write(`  行${row + 1}/${rows} 列${col + 1}/${cols} ✓\r`);
      } catch (e) {
        console.error(`\n  ❌ 行${row + 1}列${col + 1}: ${e.message}`);
        tileBuffers.push(await sharp({ create: { width: TILE_SIZE, height: TILE_SIZE, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer());
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const rowImg = await sharp({
      create: { width: totalWidth, height: TILE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(tileBuffers.map((buf, i) => ({ input: buf, left: i * TILE_SIZE, top: 0 }))).png().toBuffer();
    rowBuffers.push(rowImg);
    console.log(`  行 ${row + 1}/${rows} 完成`);
  }

  console.log('合并所有行...');
  await sharp({
    create: { width: totalWidth, height: totalHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(rowBuffers.map((buf, i) => ({ input: buf, left: 0, top: i * TILE_SIZE }))).png().toFile(OUTPUT);

  // 保存边界元数据
  const metaPath = path.join(path.dirname(OUTPUT), 'satellite-bounds.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    bounds: BOUNDS, zoom: ZOOM, tileSize: TILE_SIZE,
    grid: { cols, rows }, imageWidth: totalWidth, imageHeight: totalHeight,
    topLeftTile: topLeft, source: 'esri-world-imagery',
    note: 'ESRI uses WGS-84/Web Mercator, GCJ-02 coords have ~100m offset at this latitude',
  }, null, 2));

  console.log(`\n✅ 卫星底图: ${OUTPUT}`);
  console.log(`   元数据: ${metaPath}`);
  console.log(`   尺寸: ${totalWidth} × ${totalHeight} px`);
}

main().catch(console.error);
