# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

校园环线坐车 PWA —— 为国防科大校园师生提供校园环线公交车（环线1路、环线2路、环线3路、就餐专线）的发车时刻查询、到站时间预测、地图可视化、行程规划和乘车记录服务。

## 技术栈

- **框架**：Vue 3 + TypeScript + Vite
- **状态管理**：Pinia（setup 语法）
- **UI 组件**：Vant 4（van-tabs, van-radio-group, van-button 等）
- **地图**：静态卫星底图（ESRI World Imagery 瓦片拼接，JPEG ~6MB）+ SVG 路线/站点叠加层，零 API 调用
- **数据库**：Supabase（measurements 表，存储用户乘车记录）
- **部署**：GitHub Pages（`docs/` 目录），通过 `npm run deploy` 构建并复制
- **PWA**：vite-plugin-pwa，workbox generateSW 模式
- **坐标系**：GCJ-02 ↔ WGS-84 转换（卫星瓦片用 WGS-84，站点数据用 GCJ-02）

## 已实现的功能

### 首页（HomeView）
- 基于 GPS 定位自动推荐最近 3 个站点（200m 内）的到站车次
- 站点选择器：按使用频次排序，支持搜索
- 多起点搜索：选目的地后从最近 3 个站点搜索可乘线路，含步行时间
- 车次卡片可展开查看完整站点时间线（BusStopTimeline）
- 首页公告栏：提示"仅供参考、鼓励实测、自动记录不完善"
- 首页底部有「使用反馈」问卷链接（问卷星）
- 调试工具（时间覆写/定位覆写）默认隐藏（`showDebugTools = false`）

### 行程规划（ScheduleView）
- Tab 1：输入出发站、到达站、到达期限，查询可乘车次
- Tab 2：总时刻表，按线路/班次展示所有发车记录
- 默认出发站=研究生宿舍楼，到达站=系统楼
- 环线起终点同站问题已修复（destIdx 从 originIdx 之后搜索）

### 站点查询（StopQueryView）
- 选择站点查看经过该站的所有车次到站预测

### 地图（MapView）
- 静态卫星底图（ESRI 瓦片拼接 JPEG）+ SVG 路线折线和站点标记叠加层
- CSS transform 实现平移缩放（双指缩放以手指中心为基准，滚轮以光标为中心）
- 动态最小缩放比例：根据屏幕尺寸自适应，手机上可缩到看全图
- 实时公交车位置动画（基于发车时刻和站间秒数推算）
- 公交车图标带班次编号角标
- 点击站点弹出到站信息面板（StopInfoPanel）
- 从首页车次卡片可跳转聚焦到对应车辆
- 定位按钮（用户 GPS 位置蓝点）+ 回中按钮（地图拖丢时恢复）

### 记录上传（UploadView）
- Tab 1 手动记录：选线路、选上车站、逐站按计时按钮记录段耗时
- Tab 2 自动记录：GPS 自动检测到站（30m 内 3s）、离开检测（50m 外 10s）、自动提交
- Tab 3 我的记录：查看/撤销历史记录
- 数据上传至 Supabase measurements 表

### 关于页（AboutView）
- 项目介绍、数据说明、使用提示、注意事项

## 数据源

核心数据文件：
- `校园环线时刻表_秒级可校准版.xlsx` — 最终数据工作簿，包含 16 个工作表
- `public/data/` — 小程序运行时读取的 JSON 数据文件

### public/data/ JSON 文件

| 文件 | 用途 |
|---|---|
| `departures.json` | 所有发车记录（每条含 recordId, route, routeKey, departureTime, departureStation, isGaochaoDeparture, driver, vehicleNo 等） |
| `arrival_predictions.json` | 预计算的到站预测（每条含 departureId, stopName, stopSeq, arrivalTime, arrivalMinutes, isDepartureStop, isReturnStop 等） |
| `route_params.json` | 各路线站间秒数配置（含 finalSegmentSeconds, cumulativeSeconds） |
| `route_stops.json` | 各路线站点坐标（含 lat, lng） |
| `stations.json` | 所有站点字典（含 name, lat, lng, serviceRoutes） |
| `route_paths.json` | 各路线折线坐标（用于地图绘制和离开检测） |
| `satellite-bounds.json` | 卫星底图元数据（topLeftTile, zoom, tileSize, imageWidth, imageHeight, gcj02Bounds） |
| `campus-satellite.jpg` | 卫星底图 JPEG（5120×7424px，~6MB，ESRI 瓦片拼接） |

### 卫星底图工具

| 文件 | 用途 |
|---|---|
| `scripts/download_satellite.mjs` | 从 ESRI 下载卫星瓦片并拼接（锚点：北门北3km + 305教学楼南3km + 理学院西2km + 东门东2km） |
| `src/utils/map_project.ts` | GCJ-02 → WGS-84 → 底图像素坐标投影（用于 SVG 叠加层定位） |

### 静态卫星地图架构

**替代高德 API 的原因**：高德地图 JS API 按调用次数收费，校园范围固定不需要动态瓦片，改用 ESRI World Imagery 免费瓦片拼接静态图，实现零 API 调用。

**架构**：
```
MapView.vue
├── 图层容器 (CSS transform: translate + scale)
│   ├── <img> 卫星底图 (JPEG, 5120×7424px, ~6MB)
│   ├── <svg> 路线折线 (polyline, 5条路线)
│   ├── <svg> 站点标记 (g > circle + label, 54个站点)
│   ├── <div> 公交车标记 (img + 旋转 + 班次角标)
│   └── <div> 用户位置标记 (蓝点)
├── MapLegend (路线图例 + 标签开关)
└── StopInfoPanel (站点详情面板)
```

**卫星底图参数**：
- 尺寸：5120 × 7424 px（zoom 17，20×29 瓦片拼接）
- 锚点（GCJ-02）：北门 28.2688°N（北扩3km）、305教学楼 28.2540°S（南扩3km）、理学院 113.0424°W（西扩2km）、东门 113.0536°E（东扩2km）
- 瓦片参数：topLeftTile {x:106683, y:54786}，zoom 17，tileSize 256
- 压缩：JPEG quality 60，约 6MB
- PWA 缓存上限：`maximumFileSizeToCacheInBytes: 10MB`

**坐标投影（map_project.ts）**：
1. GCJ-02 → WGS-84（反转偏移算法）
2. WGS-84 → Web Mercator 瓦片坐标（zoom 17）
3. 减去图片左上角瓦片偏移 → 底图像素坐标
- 导出：`gcj02ToPixel(lng, lat)` 和 `gcj02ToWgs84(lng, lat)`

**交互行为**：
- 拖拽：pointer events 实现单指拖拽
- 双指缩放：以双指中心为基准（不是图片左上角），通过调整 panX/panY 保持中心点固定
- 滚轮缩放：以鼠标光标位置为中心
- 双击缩放：以点击位置为中心
- 动态最小缩放：`MIN_SCALE = Math.min(viewportW/IMG_W, viewportH/IMG_H, 0.15)`，手机上可缩到看全图
- 回中按钮：地图拖丢时（图片完全离开视口）自动出现，点击恢复适配屏幕大小

**定位功能**：使用浏览器原生 `navigator.geolocation`，**不调用任何第三方 API**。GPS 返回 WGS-84，经 `wgs84ToGcj02()` 转换后用于地图定位。

**已删除的文件**：
- `src/utils/amap.ts` — 高德 SDK 加载器（已无引用）

### Excel 中关键工作表

| 工作表 | 用途 |
|---|---|
| `结构化数据` | 发车时刻主数据，每行一条发车记录 |
| `秒级路线参数_可调整` | 各路线站间运行秒数配置，支持实测后手动校准 |
| `预测到站明细_秒级` | 每班车每站预计到站时间（hh:mm:ss） |
| `站点字典` | 所有站点汇总 |
| `小程序数据口径` | 路线站点序列和偏移 |
| `实测记录模板` | 实测记录模板，用于后续校准站间秒数 |

## 核心业务规则

### 线路与日期
- **环线1路**：仅工作日运行，周末/节假日不运行
- **环线2路**：工作日 + 周末/节假日均有
- **环线3路**：工作日 + 周末/节假日均有

### 5 条路线模式（routeKey）
| routeKey | 路线 | 发车点 | 站点序列 |
|---|---|---|---|
| HX1_NORMAL | 环线1路普通 | 研究生宿舍楼 | 研究生宿舍楼→东门→2号宿舍楼→军体活动中心→激光所→超算中心→北门→系统楼→理学院→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |
| HX1_DINING | 就餐专线 | 系统楼 | 系统楼→理学院→二食堂→一食堂→305教学楼→5号宿舍楼→二食堂北→系统楼 |
| HX2_NORMAL | 环线2路 | 研究生宿舍楼 | 研究生宿舍楼→一食堂→门诊部→1号宿舍楼→水上训练中心→军体活动中心→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |
| HX3_NORMAL | 环线3路普通 | 研究生宿舍楼 | 研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心→网球场→激光所→高超楼→系统楼→理学院→二食堂→图书馆→305教学楼→研究生宿舍楼 |
| HX3_GAOCHAO | 环线3路系统楼发车 | 系统楼 | 系统楼→理学院→二食堂→图书馆→305教学楼→研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心→网球场→激光所→系统楼 |

### 发车站点口径
- 图片中红色字体和打钩车次 = 系统工程学院发车 = **系统楼发车**
- 普通车次发车站为 **研究生宿舍楼**
- 系统楼和高超楼是两个相邻但不同的站点，系统楼是系统工程学院所在地

### 环线1路打钩车次 = 就餐专线
- 环线1路中标注【系统/高超楼】的车次不走普通环线1路，而是走**就餐专线**
- 就餐专线时间：11:30–12:30，16:30–18:00
- 涉及车次：11:30、11:50、12:10、12:30、16:30、16:50、17:10、17:30、17:50

### 推测数据（需标注"待确认"）
- 工作日环线2路第一班 17:10（推测）
- 工作日环线2路第二班 21:30（推测）
- 所有预测到站时间均为估算，实测校准前应展示为"预计到达"

## 数据可信度

- **确认数据**：图片中清楚的发车时间、用户明确修正的驾驶员姓名和日期类型
- **推测数据**：17:10、21:30、所有预测到站时间、所有站间运行秒数
- **原则**：不随意修改原始发车时刻，除非用户提供新的确认数据

## 数据模型

### 前端 Store 结构

- `scheduleStore`：加载 JSON 数据，提供 departures, predictions, stations, routePatterns, routeStops, routePaths
- `mapStore`：地图状态，visibleRoutes(Set), showLabels, userLat/userLng, busPositions
- `uploadStore`：手动/自动记录上传，nickname, recordedSegments, history
- `autoRecordStore`：自动记录状态机（idle→active→completed），GPS 到站检测、离开检测

### 关键类型（src/types/index.ts）

- `Departure`：发车记录（recordId, route, routeKey, departureTime, departureMinutes, isGaochaoDeparture 等）
- `ArrivalPrediction`：到站预测（departureId, stopName, stopSeq, arrivalMinutes, arrivalTime, isDepartureStop, isReturnStop 等）
- `RoutePattern`：路线模式（routeKey, stops: RouteStop[]）
- `Station`：站点（name, lat, lng）
- `BusPosition`：公交车实时位置（departureId, lat, lng, heading, progress 等）

### Supabase 表结构

`measurements` 表：id, user_id(昵称), route, shift, depart_time, date, segments(JSON: [{from, to, seconds}]), created_at

## 环线起终点同站的特殊处理

所有 5 条路线都是环线（起点=终点），因此：
- 研究生宿舍楼和高超楼作为起终点站时，同一 departureId 会有两条预测记录：`isDepartureStop`(stopSeq=1) 和 `isReturnStop`(stopSeq=N)
- 展示"到站预测"时必须同时过滤 `isDepartureStop` 和 `isReturnStop`
- 行程规划搜索时 destIdx 必须从 originIdx 之后搜索（`findIndex((p,i) => i > originIdx && ...)`）
- 多起点搜索需要用 `seenDepartureIds` Set 去重，防止同一车次重复展示

## 查询下一班车逻辑

1. 根据日期判断日期类型（工作日 / 周末节假日），结合国务院法定节假日和调休
2. 筛选对应日期类型可运行的线路
3. 从预测到站表中找当前站点在当前时间之后的到站记录
4. 按预计到站时间排序，返回最近若干班车
5. 注意：环线1路周末/节假日过滤；就餐专线仅展示就餐专线站点

## 已过班车移除窗口

- 已通过/已发车的班次在列表中保留 **5 分钟**（`secondsAway < -300`）后移除
- 涉及文件：`src/composables/useNextBus.ts`、`src/utils/countdown.ts`、`src/views/HomeView.vue`
- 之前为 1 分钟（-60），改为 5 分钟以避免用户看到班车突然消失

## 自动记录功能

### 到站检测
- GPS 距离目标站 ≤30m，持续 ≥3秒 → 记录到站
- 1秒 tick 定时器检查（不仅依赖 GPS 更新事件）

### 离开检测
- `computeMinDistanceToPath()` 计算 GPS 点到路线折线的最短距离
- 距离 >50m 持续 ≥10秒 → 自动结束记录

### 错站恢复
- 切后台期间可能跳过站点，GPS 恢复后检测是否在后续某站 30m 内
- 跳过中间站，桥接段不记录（skipNextArrival）
- 排除终点站（stops.length-2），避免环线首尾同站误触发

### 其他
- `navigator.wakeLock` 保持屏幕常亮
- `visibilitychange` 事件：切后台释放 wakeLock，切回前台重新获取
- 不暂停会话，GPS 恢复后继续检测

## 部署流程

```bash
npm run deploy    # vite build → dist/，然后复制 dist/ → docs/
git add -A
git commit -m "deploy: ..."
git push          # 推到 dev-time-sim
git checkout master
git merge dev-time-sim --no-edit
git push          # 推到 master，GitHub Pages 自动部署
git checkout dev-time-sim
```

注意：`npm run build` 只输出到 `dist/`，GitHub Pages 读取的是 `docs/`，必须用 `npm run deploy`。

## PWA 缓存注意事项

- **iOS PWA 缓存顽固**：service worker 缓存的旧版本不会自动更新，用户需要手动删除 PWA（长按图标 → 移除 App）再重新添加主屏幕
- **satellite image 更新后必须清缓存**：因为卫星底图是单个大文件（~6MB），workbox 会缓存它，更新后需要用户清除
- 当前 `registerType: 'autoUpdate'`，理论上新 service worker 会自动激活，但 iOS PWA 行为不一致
- workbox `globPatterns` 包含 `jpg`/`jpeg` 以缓存卫星底图
- `maximumFileSizeToCacheInBytes: 10MB` 以容纳 6MB 的卫星 JPEG

## 实测校准建议

用户实际乘车时可记录每站到站时间，计算站间实际秒数，填入 Excel 的 `秒级路线参数_可调整` 的"手动采用秒"列。自动记录功能已实现 GPS 自动采集段耗时并上传至 Supabase，可用于后续校准。

## 数据来源历史

### 图片识别过程

项目数据来源于 3 张时刻表图片的 OCR 识别和人工确认：

1. **第一张图**：环线1路工作日发车时刻表
   - 识别出 5 个班次（第一班到第五班夜2）
   - 手写打钩的车次 = 系统工程学院发车
   - 后续修正：第四班括号是"夜1"不是"校1"，第五班是"夜2"不是"校2"

2. **第二张图**：工作日环线2路、环线3路发车时刻表
   - 环线2路：2 个班次，19+19 趟车
   - 环线3路：4 个班次，含驾驶员和车号信息
   - 红字车次 = 系统工程学院发车

3. **第三张图**：周末/节假日环线2路、环线3路发车时刻表
   - 环线2路：2 个班次（第一班 13 趟，第二班 4 趟）
   - 环线3路：2 个班次，含驾驶员和车号

### 驾驶员信息（已确认）

| 线路 | 班次 | 驾驶员 | 车号 |
|------|------|--------|------|
| 环线2路（工作日） | 第一班 | 刘晓燕 | 1号车 |
| 环线2路（工作日） | 第二班 | 孙五星 | 2号车 |
| 环线3路（工作日） | 第一班 | 刘虎 | 3号车 |
| 环线3路（工作日） | 第二班 | 郭海燕 | 5号车 |
| 环线3路（工作日） | 第三班 | 刘晓燕 | 4号车 |
| 环线3路（工作日） | 第四班 | 孙五星 | 3号车 |
| 环线3路（周末） | 第一班 | 孙五星 | 3号车 |
| 环线3路（周末） | 第二班 | 夏文新 | 4号车 |

**注意**：驾驶员姓名经过人工修正（刘旭→刘虎，谭海燕→郭海燕，夏文斌→夏文新）

## 完整发车时刻表

### 环线1路（仅工作日）

| 班次 | 发车时间 |
|------|----------|
| 第一班 | 7:30, 8:00, 8:30, 9:00, 9:36, 10:15, 11:15, 11:30【系统】, 11:50【系统】, 12:10【系统】, 12:30【系统】 |
| 第二班 | 7:40, 8:10, 8:40, 9:12, 9:48, 10:30, 11:00, 11:40, 12:10, 12:40, 14:12, 14:48, 15:40, 17:00, 17:30 |
| 第三班 | 7:50, 8:20, 8:50, 9:24, 10:00, 10:45, 11:30, 11:50, 12:25, 14:00, 14:36, 15:20, 16:30, 17:15, 18:00 |
| 第四班（夜1） | 14:24, 15:00, 16:00, 16:45, 17:45, 18:15, 18:45, 19:15, 19:45, 20:15, 20:45, 21:15, 21:45, 22:15 |
| 第五班（夜2） | 16:15, 16:30【系统】, 16:50【系统】, 17:10【系统】, 17:30【系统】, 17:50【系统】, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00, 21:30, 22:00, 22:30 |

【系统】= 高超楼发车，走就餐专线

### 环线2路（工作日 + 周末）

**工作日**：
- 第一班：7:35, 7:50, 8:05, 8:20, 8:35, 8:50, 9:10, 9:40, 10:10, 10:40, 11:15, 11:40, 12:00, 12:15, 12:30, 14:10, 16:20, 16:50, **17:10**（推测）
- 第二班：14:25, 14:40, 15:00, 15:20, 15:40, 16:00, 16:35, 17:05, 17:35, 18:10, 18:25, 18:45, 19:15, 19:30, 19:50, 20:10, 20:40, 21:05, **21:30**（推测）

**周末/节假日**：
- 第一班：8:20, 8:40, 9:00, 9:20, 9:40, 11:30, 12:00, 12:30, 14:30, 15:00, 17:00, 17:30, 18:00
- 第二班：20:40, 21:00, 21:25, 21:50

### 环线3路（工作日 + 周末）

**工作日**：
- 第一班：7:35, 8:05, 8:35, 9:05, 10:50【系统】, 11:20, 12:05, 14:10, 14:40, 15:10, 16:00, 16:35, 17:00
- 第二班：7:45, 8:15, 8:45, 9:20, 9:50, 10:30, 11:00, 11:45, 12:30, 15:25, 16:20, 16:50【系统】, 17:25
- 第三班：7:55, 8:25, 8:55, 9:35, 10:10, 10:45【系统】, 11:35, 12:20, 14:25, 15:00, 15:45, 17:10, 17:40
- 第四班：17:55, 18:20, 18:50, 19:20, 19:50, 20:20, 20:50, 21:20, 21:50

**周末/节假日**：
- 第一班：8:15, 8:40, 9:05, 9:30, 9:55, 10:20
- 第二班：11:25【系统】, 11:55【系统】, 12:25【系统】, 14:20, 14:45, 15:10, 16:50【系统】, 17:20【系统】, 17:50【系统】, 21:00【系统】, 21:25【系统】, 21:50【系统】

【系统】= 高超楼发车（HX3_GAOCHAO 路线）

## 距离和限速信息

用户提供的关键距离信息：
- 东门到北门：约 1.9 公里
- 理学院到二食堂：约 1 公里
- 305教学楼→图书馆→2号宿舍楼→军体活动中心→水上训练中心→二食堂→5号宿舍楼→305教学楼：约 2 公里
- **校园限速：约 25 km/h**

站间秒数基于这些距离信息和限速估算，后续可通过实测校准。

## 数据库表结构设计建议

### routes（线路表）
- route_id, route_name, description, is_loop, default_start_station, status

### stations（站点表）
- station_id, station_name, alias, remark, lat, lng
- 注意：高超楼可设置 alias "系统工程学院旁"

### route_patterns（路线模式表）
- pattern_id, route_id, pattern_name, date_type, start_station, description
- 示例：R1_NORMAL, R1_MEAL, R2_NORMAL, R3_NORMAL, R3_GAOCHAO

### route_pattern_stops（路线站点顺序表）
- pattern_id, stop_sequence, station_id, station_name, cumulative_seconds, segment_seconds_from_previous

### departures（发车表）
- departure_id, route_id, pattern_id, date_type, shift_name, departure_time, start_station, is_gaochao_departure, driver, vehicle_no, source_type, confidence, remark

### arrival_predictions（预测到站表）
- departure_id, station_id, station_name, stop_sequence, predicted_arrival_time, cumulative_seconds, source_version

## 实测校准详细方法

### 用户实测时建议记录内容

```
日期：
日期类型：工作日 / 周末节假日
线路：
班次：
发车时间：
车号：
驾驶员：
实际发车站：
实际发车时间：
每站到达时间：
是否等红灯/上下客较多/临时停车：
备注：
```

### 如何更新 Excel

1. 打开 `实测记录模板`
2. 填写每段站间的实际到达时间
3. 查看自动计算出的实测站间秒
4. 对同一站间段多次实测后，取一个合理值（建议中位数）
5. 把合理值填入 `秒级路线参数_可调整` 的"手动采用秒"
6. 检查 `预测到站明细_秒级` 和 `运转校验_秒级` 是否更新合理

### 实测值取值建议

- 可取中位数，减少偶然停车或上下客导致的极端值影响
- 可分时段统计（早餐、午餐、晚餐、晚间）
- 如数据充足，可建立不同的路线参数版本

## Excel 版本演进历史

1. **整理版** → 基础时刻数据
2. **系统标识更新** → 环线1路打钩车次标注为系统工程学院发车
3. **线路日期更新** → 统一线路名，环线1路仅工作日
4. **含预测到站** → 新增路线站点、预测到站、运转校验
5. **含就餐专线路径** → 环线1路打钩车次改走就餐专线
6. **无表格修复版** → 移除导致 Excel 修复提示的表格对象
7. **秒级可校准版**（当前）→ 精确到秒，支持实测校准

## 开发交互日志摘要

项目经过 15 轮关键对话完成：

1. 识别环线1路图片
2. 修正夜班名称，识别环线2路/3路
3. 补入推测时间，识别周末时刻
4. 生成第一版完整 Excel
5. 环线1路打钩车次标注为系统发车
6. 统一线路名和日期口径
7. 生成含预测到站的 Excel
8. 环线1路打钩车次改走就餐专线
9. 修复 Excel 表格对象问题
10. 生成秒级可校准版
11. 生成本 Markdown 日志
12. 开发 Vue 3 PWA 小程序（首页、地图、记录上传）
13. 实现自动记录功能（GPS 到站检测、离开检测、自动提交）
14. 静态卫星地图替换高德 API（ESRI 瓦片拼接 + SVG 叠加层，零 API 调用）
15. 扩大卫星底图范围（北3km+南3km+西2km+东2km），优化缩放交互

关键决策：
- 系统工程学院发车统一按高超楼处理
- 环线1路打钩车次走就餐专线
- 使用秒级精度而非分钟级
- 环线起终点同站需要特殊处理（过滤 isDepartureStop 和 isReturnStop）
- 部署使用 GitHub Pages（docs/ 目录）
- 地图改用静态卫星底图，彻底移除高德 API 依赖

## 关键注意事项

1. 不要随意修改原始发车时刻
2. 系统工程学院发车统一按高超楼发车处理
3. 环线1路打钩车次走就餐专线，不走普通环线1路
4. 环线1路仅工作日运行
5. 工作日环线2路 17:10 和 21:30 是推测待确认
6. 预测到站时间是估算结果
7. 所有路线都是环线，起终点同站需要特殊处理（见上文）
8. 卫星底图使用 WGS-84 坐标系，站点数据使用 GCJ-02 坐标系，需要互相转换
9. 导出 Excel 时不要使用内置表格对象，避免 `/xl/tables/table*.xml` 修复提示
10. `TimeOverride` 时间覆写悬浮窗已隐藏（`v-if="false"`），调试时改为 `true` 即可恢复
