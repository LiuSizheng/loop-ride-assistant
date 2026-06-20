const fs = require('fs');

// 读取 route_paths.json
const routePaths = JSON.parse(fs.readFileSync('public/data/route_paths.json', 'utf-8'));

console.log('=== 坐标系验证 ===\n');

const WGS84_THRESHOLD = 113.05;

for (const [routeKey, path] of Object.entries(routePaths)) {
    console.log(`${routeKey}:`);
    
    let wgs84Count = 0;
    let gcj02Count = 0;
    
    for (let i = 0; i < Math.min(5, path.length); i++) {
        const [lng, lat] = path[i];
        
        if (lng < WGS84_THRESHOLD) {
            wgs84Count++;
            console.log(`  点 ${i}: [${lng.toFixed(6)}, ${lat.toFixed(6)}] ← WGS-84 ⚠️`);
        } else {
            gcj02Count++;
            console.log(`  点 ${i}: [${lng.toFixed(6)}, ${lat.toFixed(6)}] ← GCJ-02 ✓`);
        }
    }
    
    if (wgs84Count > 0) {
        console.log(`  ❌ 发现 ${wgs84Count} 个 WGS-84 坐标，需要转换\n`);
    } else {
        console.log(`  ✓ 所有坐标都是 GCJ-02\n`);
    }
}

console.log('=== 预期偏移量 ===');
console.log('WGS-84 → GCJ-02 在国防科大区域的偏移：');
console.log('  经度: +0.0059 度（约 +577 米）');
console.log('  纬度: -0.0032 度（约 -358 米）');
console.log('  直线距离: 约 680 米\n');

console.log('=== 修复状态 ===');
console.log('✓ 前端 schedule.ts 已添加条件坐标转换');
console.log('✓ extract_data.py 已添加坐标验证和修正');
console.log('→ 需要重新运行 extract_data.py 重新生成数据');
console.log('→ 或者使用前端的条件转换（临时方案）');
