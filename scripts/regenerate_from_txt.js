// 按照 txt 文件重新生成 route_stops.json 和 route_paths.json
// 每条路线独立处理，不混用同名站点坐标

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const TXT_FILE = path.join(__dirname, '..', '站点经纬度信息路径细化.txt');

// WGS-84 → GCJ-02 坐标转换
function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0;
  const ee = 0.006693421622965943;

  function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 320.0 * Math.sin(x * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  const dlat = transformLat(lng - 105.0, lat - 35.0);
  const dlng = transformLng(lng - 105.0, lat - 35.0);
  const radlat = lat / 180.0 * Math.PI;
  const magic = Math.sin(radlat);
  const magic2 = 1 - ee * magic * magic;
  const sqrtmagic = Math.sqrt(magic2);
  const dlat2 = (dlat * 180.0) / ((a * (1 - ee)) / (magic2 * sqrtmagic) * Math.PI);
  const dlng2 = (dlng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI);
  return [lng + dlng2, lat + dlat2];
}

// 路线键映射
const ROUTE_KEY_MAP = {
  '环线1路途径站点': 'HX1_NORMAL',
  '环线2路途径站点': 'HX2_NORMAL',
  '环线3路途径站点': 'HX3_NORMAL',
  '就餐专线途径站点': 'HX1_DINING',
};

// 路线站点序列（从 txt 文件中的站名顺序）
const ROUTE_STOP_SEQUENCES = {
  'HX1_NORMAL': ['研究生宿舍楼', '东门', '2号宿舍楼', '军体活动中心', '激光所', '超算中心', '北门', '系统楼', '理学院', '二食堂', '5号宿舍楼', '305教学楼', '研究生宿舍楼'],
  'HX2_NORMAL': ['研究生宿舍楼', '一食堂', '门诊部', '1号宿舍楼', '军体活动中心', '水上训练中心', '二食堂', '5号宿舍楼', '305教学楼', '研究生宿舍楼'],
  'HX3_NORMAL': ['研究生宿舍楼', '一食堂', '2号宿舍楼', '军体活动中心', '网球场', '激光所', '高超楼', '系统楼', '理学院', '二食堂', '图书馆', '305教学楼', '研究生宿舍楼'],
  'HX1_DINING': ['系统楼', '理学院', '二食堂', '一食堂', '305教学楼', '5号宿舍楼', '二食堂北', '理学院', '系统楼'],
};

console.log('📖 读取 txt 文件...\n');
const txtContent = fs.readFileSync(TXT_FILE, 'utf-8');
const lines = txtContent.split('\n');

const routeStops = {};
const routePaths = {};
let currentRouteKey = null;
let currentPath = [];
let currentStopIndex = 0;
let currentStopSeq = 1;

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // 检测路线标题
  if (ROUTE_KEY_MAP[trimmed]) {
    currentRouteKey = ROUTE_KEY_MAP[trimmed];
    currentPath = [];
    currentStopIndex = 0;
    currentStopSeq = 1;
    routeStops[currentRouteKey] = [];
    routePaths[currentRouteKey] = [];
    console.log('🚌 处理 ' + currentRouteKey + '...');
    continue;
  }

  if (!currentRouteKey) continue;

  // 解析坐标行
  const coordMatch = trimmed.match(/(\d+\.\d+),\s*(\d+\.\d+)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);

    // 转换为 GCJ-02
    const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
    routePaths[currentRouteKey].push([gcjLng, gcjLat]);

    // 检查是否是站点行（不以 > 开头）
    if (!trimmed.startsWith('>')) {
      // 所有可能的站名列表（按长度排序，优先匹配长名称）
      const allStationNames = [
        '研究生宿舍楼', '水上训练中心', '军体活动中心', '305教学楼', '5号宿舍楼',
        '2号宿舍楼', '1号宿舍楼', '二食堂北', '二食堂', '一食堂', '高超楼',
        '系统楼', '理学院', '激光所', '超算中心', '门诊部', '网球场', '图书馆',
        '东门', '北门', '教勤连'
      ];

      for (const stationName of allStationNames) {
        if (trimmed.startsWith(stationName)) {
          const expectedStops = ROUTE_STOP_SEQUENCES[currentRouteKey];

          if (expectedStops && currentStopIndex < expectedStops.length) {
            if (stationName === expectedStops[currentStopIndex]) {
              routeStops[currentRouteKey].push({
                name: stationName,
                lat: gcjLat,
                lng: gcjLng,
                stopSeq: currentStopSeq,
              });
              console.log('  ✅ 找到站点: ' + stationName + ' (seq=' + currentStopSeq + ')');
              currentStopSeq++;
              currentStopIndex++;
            } else {
              console.log('  ⚠️  站点 ' + stationName + ' 期望 ' + expectedStops[currentStopIndex]);
            }
          }
          break;
        }
      }
    }
  }
}

// 验证结果
console.log('\n📊 验证结果：\n');
for (const [routeKey, stops] of Object.entries(routeStops)) {
  const expected = ROUTE_STOP_SEQUENCES[routeKey];
  const actual = stops.map(s => s.name);

  console.log(routeKey + ':');
  console.log('  预期站点数: ' + expected.length + ', 实际: ' + actual.length);

  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    console.log('  ✅ 站点序列正确');
  } else {
    console.log('  ❌ 站点序列不匹配');
    console.log('     预期: ' + expected.join(' → '));
    console.log('     实际: ' + actual.join(' → '));
  }
  console.log('');
}

// 保存 route_stops.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_stops.json'),
  JSON.stringify(routeStops, null, 2),
  'utf-8'
);
console.log('✅ 已保存 route_stops.json');

// 保存 route_paths.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_paths.json'),
  JSON.stringify(routePaths, null, 2),
  'utf-8'
);
console.log('✅ 已保存 route_paths.json');

// 更新 stations.json（汇总所有站点，取第一个出现的坐标）
const stationsDict = {};
for (const [routeKey, stops] of Object.entries(routeStops)) {
  for (const stop of stops) {
    if (!stationsDict[stop.name]) {
      stationsDict[stop.name] = {
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        serviceRoutes: routeKey,
      };
    } else {
      stationsDict[stop.name].serviceRoutes += ', ' + routeKey;
    }
  }
}

const stations = Object.values(stationsDict);
fs.writeFileSync(
  path.join(DATA_DIR, 'stations.json'),
  JSON.stringify(stations, null, 2),
  'utf-8'
);
console.log('✅ 已更新 stations.json（共 ' + stations.length + ' 个站点）');
