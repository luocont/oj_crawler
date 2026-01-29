# IP代理池设计方案

## 项目概述

为统一爬虫微服务添加免费的IP代理池功能，支持洛谷、Codeforces和牛客网三个平台的爬虫请求，提高请求成功率和匿名性。

## 设计目标

1. 使用公开的免费代理API获取代理IP
2. 实现智能选择算法，优先使用性能好的代理
3. 自动验证和剔除失效代理
4. 支持持久化存储和定时刷新
5. 提供降级机制保证服务可用性

## 核心模块

### 1. ProxyFetcher（代理获取器）

从多个公开的免费代理API获取代理列表，统一格式化处理。

**主要功能：**
- 支持配置多个代理源
- 统一代理格式：`{ ip, port, protocol, source }`
- 处理API返回数据的格式差异

### 2. ProxyValidator（代理验证器）

验证代理的可用性和性能。

**主要功能：**
- 发送测试请求验证代理可用性
- 测量响应时间
- 初始化代理统计数据：`{ successCount, failCount, lastCheck, avgResponseTime }`

### 3. ProxyPool（代理池管理器）

管理代理的存储、检索和选择。

**主要功能：**
- 维护代理列表及其状态
- 实现智能选择算法
- 处理代理的失效移除和冷却恢复

### 4. ProxyStorage（持久化存储）

将代理数据持久化到本地文件。

**主要功能：**
- 保存验证通过的代理到JSON文件
- 服务启动时加载历史数据
- 定期自动保存

### 5. ProxyRefreshScheduler（刷新调度器）

管理代理池的更新策略。

**主要功能：**
- 定时刷新（默认1小时）
- 按需刷新（低于阈值时触发）
- 提供手动刷新API

### 6. ProxyMiddleware（代理中间件）

集成到爬虫模块，透明地使用代理。

**主要功能：**
- 为请求自动分配最优代理
- 实现重试和降级逻辑
- 更新代理统计数据

## 智能选择算法

### 评分机制

每个代理维护以下统计数据：
- `successCount`: 成功次数
- `failCount`: 失败次数
- `avgResponseTime`: 平均响应时间

**评分公式：**
```
score = (success_rate * 0.6) + (speed_score * 0.4)

其中：
success_rate = successCount / (successCount + failCount)
speed_score = max(0, 1 - (avgResponseTime / 5000))  // 5秒为基准
```

### 分层选择

- **高分代理**（score > 0.7）：使用80%的请求
- **中等代理**（0.4 <= score <= 0.7）：使用15%的请求
- **低分代理**（score < 0.4）：使用5%的请求（保持测试）

### 失败处理

1. 单次请求失败后，立即切换到下一个最佳代理
2. 最多重试3次，每次使用不同的代理
3. 连续失败3次的代理进入"冷却"状态（5分钟）
4. 全部代理失败后降级到直连模式

## 项目结构

```
user_crawler/
├── crawlers/              # 现有爬虫模块
│   ├── luogu.js
│   ├── codeforces.js
│   └── nowcoder.js
├── proxyPool/             # 新增：代理池模块
│   ├── fetcher.js         # 代理获取器
│   ├── validator.js       # 代理验证器
│   ├── pool.js           # 代理池管理器
│   ├── storage.js        # 持久化存储
│   ├── scheduler.js      # 刷新调度器
│   ├── middleware.js     # 代理中间件
│   └── config.js         # 代理池配置
├── data/                  # 新增：数据存储目录
│   └── proxies.json      # 代理数据缓存文件
├── index.js              # 主服务文件（需修改）
└── package.json          # 需添加新依赖
```

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `refresh.interval` | 3600000 | 定时刷新间隔（1小时） |
| `refresh.minProxies` | 20 | 最少可用代理数阈值 |
| `validation.timeout` | 5000 | 验证超时时间（毫秒） |
| `validation.maxConcurrent` | 10 | 并发验证数量 |
| `selection.maxFailures` | 3 | 最大连续失败次数 |
| `selection.cooldownTime` | 300000 | 冷却时间（5分钟） |
| `retry.maxAttempts` | 3 | 最大重试次数 |
| `storage.filePath` | ./data/proxies.json | 代理数据存储路径 |

## API接口

### GET `/api/proxy/status`

获取代理池当前状态。

**响应示例：**
```json
{
  "total": 150,
  "active": 120,
  "cooldown": 20,
  "averageScore": 0.75,
  "lastRefresh": "2024-01-29T12:00:00Z"
}
```

### POST `/api/proxy/refresh`

手动触发代理池刷新。

**响应示例：**
```json
{
  "message": "代理池刷新完成",
  "fetched": 50,
  "validated": 30,
  "added": 25
}
```

### GET `/api/proxy/list`

获取代理列表。

**查询参数：**
- `status`: active | cooldown | all（默认：active）

## 数据流

### 启动流程
```
服务启动 → 从文件加载历史代理 → 初始化代理池 → 开始定时刷新
```

### 请求流程
```
爬虫请求 → 代理中间件 → 智能选择代理 → 发起请求
                                              ↓
                    成功 ← 更新统计 ← 返回数据  失败
                                              ↓
                                          重试（换代理）
                                              ↓
                                    仍失败 → 降级直连
```

### 刷新流程
```
触发刷新 → 获取代理 → 并发验证 → 过滤无效 → 更新池 → 持久化
```

## 集成方式

修改现有爬虫模块，将HTTP请求函数替换为使用代理的版本：

```javascript
// 原代码
const response = await axios.get(url);

// 修改后
const { proxyFetch } = require('../proxyPool/middleware');
const response = await proxyFetch(url);
```

## 依赖项

需添加到 `package.json`：

```json
{
  "axios": "^1.6.0",
  "node-cron": "^3.0.3"
}
```

## 注意事项

1. 免费代理稳定性较差，需要频繁验证和更新
2. 部分代理可能不支持HTTPS，需要根据目标网站选择
3. 避免对单个代理源过于频繁的请求，防止被封禁
4. 降级到直连模式时，注意处理可能的IP封禁风险
