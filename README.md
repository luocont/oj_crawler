# 统一爬虫微服务

一个统一的在线判题平台用户数据爬取服务，支持洛谷、Codeforces 和牛客网三个主流编程竞赛平台。

## ✨ 特性

- 🔄 **智能代理池**：自动获取、验证和管理代理，提高爬虫稳定性
- 🎯 **多平台支持**：洛谷、Codeforces、牛客网三大平台
- 📊 **统计信息**：按难度统计题目通过情况
- 🚀 **高性能**：异步请求，支持并发
- 🛡️ **容错机制**：自动重试和降级策略

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
# 生产模式
npm start

# 开发模式（支持热重载）
npm run dev
```

服务将在 `http://localhost:8080` 启动。

### 测试代理池功能

```bash
# 基础测试
node test-proxy.js

# 完整测试（包含爬虫）
node test-proxy.js --test-crawlers
```

## 📡 API 接口

### 健康检查

#### GET `/`

获取服务基本信息和可用接口列表。

**响应示例：**
```json
{
  "name": "统一爬虫微服务",
  "version": "1.0.0",
  "services": ["洛谷", "Codeforces", "牛客网"],
  "endpoints": {
    "luogu": "/api/luogu/:username",
    "codeforces": "/api/codeforces/:uid",
    "nowcoder": "/api/nowcoder/:uid"
  },
  "proxyPool": {
    "status": "/api/proxy/status",
    "refresh": "/api/proxy/refresh",
    "list": "/api/proxy/list"
  }
}
```

#### GET `/health`

检查服务健康状态。

**响应示例：**
```json
{
  "status": "ok",
  "service": "unified-crawler"
}
```

### 爬虫接口

#### GET `/api/luogu/:username`

获取洛谷用户数据。

**示例请求：**
```bash
curl http://localhost:8080/api/luogu/kzn
```

**响应示例：**
```json
{
  "error": false,
  "data": {
    "name": "用户昵称",
    "username": "kzn",
    "uid": 12345,
    "difficultyStats": [
      {
        "difficultyName": "普及-",
        "count": 100,
        "pids": ["P1001", "P1002"]
      }
    ]
  }
}
```

#### GET `/api/codeforces/:uid`

获取 Codeforces 用户数据。

**示例请求：**
```bash
curl http://localhost:8080/api/codeforces/tourist
```

**响应示例：**
```json
{
  "success": true,
  "username": "tourist",
  "data": {
    "solved": 1000,
    "submissions": 5000,
    "solvedList": ["1A", "1B"]
  }
}
```

#### GET `/api/nowcoder/:uid`

获取牛客网用户数据。

**示例请求：**
```bash
curl http://localhost:8080/api/nowcoder/12345
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "solved": 500,
    "submissions": 2000,
    "solvedList": ["1", "2", "3"]
  }
}
```

### 代理池管理接口

#### GET `/api/proxy/status`

获取代理池状态信息。

**响应示例：**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "active": 80,
    "cooldown": 20,
    "averageScore": 0.75
  }
}
```

#### POST `/api/proxy/refresh`

手动刷新代理池。

**响应示例：**
```json
{
  "success": true,
  "message": "代理池刷新成功",
  "data": {
    "fetched": 50,
    "validated": 30,
    "added": 20
  }
}
```

#### GET `/api/proxy/list`

获取所有代理列表。

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "ip": "1.2.3.4",
      "port": 8080,
      "protocol": "http",
      "status": "active",
      "successCount": 10,
      "failCount": 2,
      "avgResponseTime": 500
    }
  ]
}
```

## 🏗️ 项目结构

```
user_crawler/
├── crawlers/           # 爬虫实现模块
│   ├── luogu.js        # 洛谷爬虫
│   ├── codeforces.js   # Codeforces 爬虫
│   └── nowcoder.js     # 牛客网爬虫
├── proxyPool/          # 代理池模块
│   ├── config.js       # 代理池配置
│   ├── pool.js         # 代理池管理器
│   ├── fetcher.js      # 代理获取器
│   ├── validator.js    # 代理验证器
│   ├── scheduler.js    # 定时调度器
│   ├── storage.js      # 持久化存储
│   └── middleware.js   # 请求中间件
├── data/               # 数据存储目录
│   └── proxies.json    # 代理数据缓存
├── index.js            # 主服务文件
├── test-proxy.js       # 代理池测试脚本
├── package.json        # 项目配置
└── README.md           # 项目文档
```

## 🔧 配置说明

### 端口配置

默认端口为 `8080`，可通过环境变量修改：

```bash
PORT=3000 npm start
```

### 代理池配置

代理池配置位于 `proxyPool/config.js`：

```javascript
{
  proxySources: [...],        // 代理源API列表
  validation: {
    testUrl: 'http://httpbin.org/ip',
    timeout: 5000,
    maxConcurrent: 10
  },
  refresh: {
    interval: 3600000,        // 1小时刷新一次
    minProxies: 20,           // 最少可用代理数
    fetchOnStart: true        // 启动时获取
  },
  selection: {
    highTierRatio: 0.8,       // 高质量代理使用比例
    maxFailures: 3,           // 最大失败次数
    cooldownTime: 300000      // 冷却时间（5分钟）
  }
}
```

### 爬虫实现

每个平台的爬虫实现位于 `crawlers/` 目录下：

- **luogu.js**：使用 HTML 解析方式爬取洛谷用户数据
- **codeforces.js**：调用 Codeforces 官方 API
- **nowcoder.js**：使用 HTML 解析方式爬取牛客网用户数据

所有爬虫均已集成代理池中间件，自动使用代理进行请求。

## 🛠️ 技术栈

- **Node.js** + **Express**：Web 服务框架
- **Superagent**：HTTP 请求库
- **Cheerio**：HTML 解析
- **node-cron**：定时任务调度
- **代理池**：自研智能代理池系统

## 📝 代理池功能说明

### 核心特性

1. **自动获取**：从免费代理源自动获取代理
2. **智能验证**：多线程并发验证代理可用性
3. **智能选择**：根据成功率和响应时间评分，智能选择代理
4. **自动重试**：失败自动重试，支持降级到直连
5. **持久化**：代理数据自动保存到本地
6. **定时刷新**：定时刷新代理池，保持代理新鲜度

### 代理评分机制

代理评分基于：
- 成功率（权重 60%）
- 响应时间（权重 40%）

代理层级：
- **High tier**：评分 > 0.7
- **Mid tier**：评分 >= 0.4
- **Low tier**：评分 < 0.4

选择策略：80% 高质量 + 15% 中质量 + 5% 低质量

## 🔍 测试

运行测试脚本验证功能：

```bash
# 基础功能测试
node test-proxy.js

# 完整测试（包含爬虫）
node test-proxy.js --test-crawlers
```

测试覆盖：
- ✓ 代理池状态获取
- ✓ 代理池刷新
- ✓ 使用代理发送请求
- ✓ 洛谷爬虫测试
- ✓ Codeforces 爬虫测试
- ✓ 代理列表获取

## 📄 许可证

MIT License
