// 根据更新后的 route_params.json 重新生成 arrival_predictions.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const routeParams = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_params.json'), 'utf-8'));
const departures = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'departures.json'), 'utf-8'));

// 按 routeKey 索引 routeParams
const patternMap = new Map();
for (const rp of routeParams) {
  patternMap.set(rp.routeKey, rp);
}

// 按 departureId 索引 departures
const departureMap = new Map();
for (const d of departures) {
  departureMap.set(d.recordId, d);
}

console.log('📊 路线模式:');
for (const [key, rp] of patternMap) {
  console.log('  ' + key + ': ' + rp.stops.map(s => s.currentStop).join(' → '));
}

// 重新生成预测
const predictions = [];

for (const dep of departures) {
  const pattern = patternMap.get(dep.routeKey);
  if (!pattern) {
    console.log('⚠️ 未找到路线模式: ' + dep.routeKey + ' (departureId: ' + dep.recordId + ')');
    continue;
  }

  for (const stop of pattern.stops) {
    const arrivalMinutes = dep.departureMinutes + stop.cumulativeSeconds / 60;

    // 计算 arrivalTime (hh:mm:ss)
    const totalSec = Math.round(dep.departureMinutes * 60 + stop.cumulativeSeconds);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const arrivalTime = [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].join(':');

    predictions.push({
      departureId: dep.recordId,
      dateType: dep.dateType,
      route: dep.route,
      shiftName: dep.shiftName,
      tripSeq: dep.tripSeq,
      departureTime: dep.departureTime,
      departureMinutes: dep.departureMinutes,
      departureStation: dep.departureStation,
      routeKey: dep.routeKey,
      stopSeq: stop.stopSeq,
      stopName: stop.currentStop,
      cumulativeSeconds: stop.cumulativeSeconds,
      arrivalMinutes,
      arrivalTime,
      isDepartureStop: stop.isDepartureStop,
      isReturnStop: stop.isReturnStop,
      driver: dep.driver || '',
      vehicleNo: dep.vehicleNo || '',
      confidence: dep.confidence || 'confirmed',
      remark: dep.remark || '',
    });
  }
}

console.log('\n📊 生成预测记录数: ' + predictions.length);

// 验证
const hx3nPreds = predictions.filter(p => p.routeKey === 'HX3_NORMAL');
const hx3gPreds = predictions.filter(p => p.routeKey === 'HX3_GAOCHAO');
const sample = hx3nPreds.filter(p => p.departureId === departures.find(d => d.routeKey === 'HX3_NORMAL')?.recordId);
console.log('\nHX3_NORMAL 样本班次:');
sample.forEach(p => console.log('  seq=' + p.stopSeq + ' ' + p.stopName + ' at ' + p.arrivalTime));

const gSample = hx3gPreds.filter(p => p.departureId === departures.find(d => d.routeKey === 'HX3_GAOCHAO')?.recordId);
console.log('\nHX3_GAOCHAO 样本班次:');
gSample.forEach(p => console.log('  seq=' + p.stopSeq + ' ' + p.stopName + ' at ' + p.arrivalTime));

// 保存
fs.writeFileSync(
  path.join(DATA_DIR, 'arrival_predictions.json'),
  JSON.stringify(predictions, null, 2),
  'utf-8'
);

console.log('\n✅ 已保存 arrival_predictions.json（共 ' + predictions.length + ' 条预测）');
