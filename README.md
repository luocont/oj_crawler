# 统一爬虫微服务

一个统一的在线判题平台用户数据爬取服务，支持洛谷、Codeforces 和牛客网三个主流编程竞赛平台。

## ✨ 特性

- 🔄 **智能代理池**：自动获取、验证和管理代理，提高爬虫稳定性
- 🎯 **多平台支持**：洛谷、Codeforces、牛客网三大平台
- 📊 **统计信息**：按难度统计题目通过情况
- 🚀 **高性能**：异步请求，支持并发
- 🛡️ **容错机制**：自动重试和降级策略
- ⏱️ **超时保护**：完善的超时处理机制，防止请求卡死
- 🚨 **错误分类**：详细的错误分类和处理，便于问题排查
- 🔄 **重试机制**：智能重试策略，提高请求成功率

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 1. 克隆项目

```bash
git clone <repository-url>
cd daliy_problem-data
```

### 2. 安装依赖

```bash
npm install
```

安装完成后，你会看到以下依赖：
- `express` - Web 服务框架
- `superagent` - HTTP 请求库
- `cheerio` - HTML 解析
- `node-cron` - 定时任务调度

### 3. 启动服务

```bash
# 生产模式
npm start

# 开发模式（支持热重载）
npm run dev
```

**启动成功后，你会看到：**
```
========================================
统一爬虫微服务已启动！
访问地址: http://localhost:8080
========================================
API 接口:
  洛谷:       http://localhost:8080/api/luogu/:username
  Codeforces: http://localhost:8080/api/codeforces/:uid
  牛客网:     http://localhost:8080/api/nowcoder/:uid
========================================
[Scheduler] 加载了 X 个历史代理
[Scheduler] 调度器已启动
```

> **注意**：首次启动时，代理池会自动获取免费代理。由于免费代理的稳定性，这个过程可能需要一些时间。如果代理获取失败，服务会自动降级到直连模式，不影响爬虫功能。

### 4. 验证服务

**检查服务状态：**
```bash
curl http://localhost:8080/health
```

**测试爬虫功能：**
```bash
# 洛谷用户数据
curl http://localhost:8080/api/luogu/kzn

# Codeforces 用户数据
curl http://localhost:8080/api/codeforces/tourist

# 牛客网用户数据（需要用户ID，纯数字）
curl http://localhost:8080/api/nowcoder/541780
```

**查看代理池状态：**
```bash
# 获取代理池状态
curl http://localhost:8080/api/proxy/status

# 手动刷新代理池
curl -X POST http://localhost:8080/api/proxy/refresh

# 查看代理列表
curl http://localhost:8080/api/proxy/list
```

### 5. （可选）运行测试脚本

```bash
# 基础功能测试
node test-proxy.js

# 完整测试（包含爬虫）
node test-proxy.js --test-crawlers
```

超过限制后，系统会自动停止并记录警告日志。

### 常见错误与解决方案

#### 错误：请求超时 (REQUEST_TIMEOUT)

**原因**：网络连接缓慢或目标服务器响应慢

**解决方案**：
1. 检查网络连接
2. 系统会自动重试最多3次
3. 如使用代理，可能代理响应慢，会自动切换代理

#### 错误：连接被拒绝 (CONNECTION_REFUSED)

**原因**：目标服务器拒绝连接或代理服务器不可用

**解决方案**：
1. 系统会自动尝试其他代理
2. 所有代理失败后会降级到直连
3. 检查目标网站是否可访问

#### 错误：DNS解析失败 (DNS_ERROR)

**原因**：域名解析失败

**解决方案**：
1. 检查DNS设置
2. 系统会自动重试
3. 尝试使用直连模式

#### 错误：用户不存在

**原因**：输入的用户名/ID不存在

**解决方案**：
1. 确认用户名/ID是否正确
2. 牛客网需要使用纯数字ID
3. Codeforces区分大小写

#### 错误：递归深度超过限制 / 达到最大页数限制

**原因**：用户数据量过大或分页逻辑异常

**解决方案**：
1. 这是正常保护机制，防止无限循环
2. 系统会返回已获取的数据
3. 可联系管理员调整限制

#### 错误：所有代理源均无法访问

**原因**：网络问题或代理源不可用

**解决方案**：
1. 检查网络连接
2. 系统会自动降级到直连模式
3. 爬虫功能仍可正常使用

### 日志说明

系统会输出详细的日志信息，帮助排查问题：

**正常日志示例：**
```
[ProxyMiddleware] 使用代理 1.2.3.4:8080 (尝试 1/3)
[ProxyValidator] 开始验证 50 个代理...
[ProxyValidator] 验证完成: 30/50 个代理可用 (耗时: 15432ms)
[Scheduler] 刷新完成: 获取50, 验证30, 新增20 (耗时: 25000ms)
```

**错误日志示例：**
```
[ProxyMiddleware] 请求失败 (尝试 1/3): [REQUEST_TIMEOUT] 请求超时: timeout
[ProxyMiddleware] 所有代理尝试失败，降级到直连
[ProxyMiddleware] 直连也失败: [CONNECTION_REFUSED] 连接被拒绝: ECONNREFUSED
[Scheduler] 刷新代理池失败 (耗时: 120500ms): 刷新代理池 超时（超过 120 秒）
```

### 常见问题

**Q: 启动后提示代理获取失败？**
A: 这是正常现象。免费代理源可能不稳定，系统会自动降级到直连模式，爬虫功能正常使用。

**Q: 如何修改服务端口？**
A: 使用环境变量 `PORT`：
```bash
PORT=3000 npm start
```

**Q: 如何禁用代理池？**
A: 编辑 `proxyPool/config.js`，将 `refresh.fetchOnStart` 设为 `false`。但建议保持启用，以提高爬虫稳定性。

**Q: 爬虫请求超时怎么办？**
A: 系统会自动重试最多3次，如果仍失败会返回详细错误信息。可以检查：
- 网络连接是否正常
- 目标网站是否可访问
- 代理池状态是否正常

**Q: 如何查看详细的错误信息？**
A: 所有API错误都会返回详细的错误消息，包含：
- 错误类型
- 失败原因
- 每次重试的详细日志
同时控制台也会输出完整的错误日志。

**Q: 如何调整超时时间？**
A: 编辑 `proxyPool/config.js` 或对应爬虫文件中的超时常量。建议保持默认值，以确保系统稳定性。

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

**错误响应示例：**
```json
{
  "error": true,
  "message": "获取洛谷用户数据失败: 所有请求尝试均失败 (3次):\n  尝试1[1.2.3.4:8080]: REQUEST_TIMEOUT - 请求超时: timeout\n  尝试2[5.6.7.8:8080]: CONNECTION_REFUSED - 连接被拒绝: ECONNREFUSED\n  尝试3[direct]: PROXY_ERROR - 代理错误: ..."
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

**错误响应示例：**
```json
{
  "error": true,
  "message": "用户不存在"
}
```

或

```json
{
  "error": true,
  "message": "递归深度超过限制(100页)，可能存在异常数据"
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

**错误响应示例：**
```json
{
  "error": true,
  "message": "用户不存在"
}
```

或

```json
{
  "error": true,
  "message": "获取牛客网数据超时（超过60秒），可能数据量过大"
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

**错误响应示例（重试失败）：**
```json
{
  "success": false,
  "error": "刷新代理池失败: 刷新代理池 超时（超过 120 秒）",
  "data": {
    "fetched": 0,
    "validated": 0,
    "added": 0
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
7. **超时保护**：完善的超时机制，防止代理验证卡死
8. **错误分类**：详细的错误类型分类和统计

### 代理评分机制

代理评分基于：
- 成功率（权重 60%）
- 响应时间（权重 40%）

代理层级：
- **High tier**：评分 > 0.7
- **Mid tier**：评分 >= 0.4
- **Low tier**：评分 < 0.4

选择策略：80% 高质量 + 15% 中质量 + 5% 低质量

## ⚠️ 错误处理与超时机制

### 全面的错误处理体系

项目实现了完善的错误处理和超时保护机制，确保在各种异常情况下都能优雅降级并提供清晰的错误信息。

### 错误处理层级

#### 1. 网络请求层（middleware.js）

- **错误分类**：自动识别超时、连接拒绝、DNS错误、代理错误、网络错误、HTTP错误等类型
- **重试机制**：默认最多重试3次，每次失败后记录详细错误
- **降级策略**：所有代理尝试失败后，自动降级到直连模式
- **详细日志**：记录每次尝试的代理、错误类型和错误消息

**错误代码枚举：**
```javascript
ErrorCode = {
  TIMEOUT: 'REQUEST_TIMEOUT',           // 请求超时
  CONNECTION_REFUSED: 'CONNECTION_REFUSED', // 连接被拒绝
  DNS_ERROR: 'DNS_ERROR',               // DNS解析失败
  PROXY_ERROR: 'PROXY_ERROR',           // 代理错误
  NETWORK_ERROR: 'NETWORK_ERROR',       // 网络错误
  HTTP_ERROR: 'HTTP_ERROR',             // HTTP错误
  INVALID_RESPONSE: 'INVALID_RESPONSE', // 响应格式异常
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR', // JSON解析错误
  ALL_ATTEMPTS_FAILED: 'ALL_ATTEMPTS_FAILED' // 所有尝试失败
}
```

#### 2. 爬虫层

**洛谷爬虫 (luogu.js)**
- ✅ 搜索接口超时：10秒
- ✅ 用户页面超时：15秒
- ✅ JSON解析错误处理
- ✅ 数据结构验证
- ✅ 用户存在性检查

**Codeforces爬虫 (codeforces.js)**
- ✅ API请求超时：12秒
- ✅ 递归深度保护：最大100页
- ✅ 响应格式验证
- ✅ API错误处理（用户不存在等）
- ✅ 参数类型验证

**牛客网爬虫 (nowcoder.js)**
- ✅ 单页请求超时：12秒
- ✅ 总页面加载超时：60秒
- ✅ 最大页数限制：50页
- ✅ HTML解析错误处理
- ✅ 用户统计数据验证
- ✅ 循环检测机制

#### 3. 代理池管理层

**代理获取器 (fetcher.js)**
- ✅ 请求超时保护
- ✅ 错误分类统计
- ✅ 并行获取支持（Promise.allSettled）
- ✅ 响应格式验证
- ✅ 代理解析容错处理

**代理验证器 (validator.js)**
- ✅ 单个代理验证超时：5秒
- ✅ 批量验证总超时：60秒
- ✅ 并发控制：最多10个并发
- ✅ 错误统计功能
- ✅ 禁用自动重试（避免延长验证时间）

**调度器 (scheduler.js)**
- ✅ 任务执行超时：120秒
- ✅ 重试机制：最多3次，间隔5秒
- ✅ 定时任务错误隔离
- ✅ 分步骤日志记录
- ✅ 错误恢复策略

### 超时配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 单个请求超时 | 10秒 | 代理请求的最大等待时间 |
| 代理验证超时 | 5秒 | 单个代理验证的超时时间 |
| 批量验证总超时 | 60秒 | 批量验证代理的最大总时长 |
| 任务执行超时 | 120秒 | 刷新代理池任务的最大执行时间 |
| 洛谷API超时 | 10秒 | 洛谷搜索接口超时 |
| 洛谷页面超时 | 15秒 | 洛谷用户页面超时 |
| Codeforces超时 | 12秒 | Codeforces API请求超时 |
| 牛客网请求超时 | 12秒 | 牛客网单页请求超时 |
| 牛客网总超时 | 60秒 | 牛客网所有分页总超时 |

### 重试策略

| 场景 | 最大重试次数 | 重试间隔 |
|------|-------------|---------|
| 代理请求失败 | 3次 | 自动 |
| 代理池刷新失败 | 3次 | 5秒 |
| 代理验证失败 | 不重试 | - |

### 错误类型说明

系统会自动识别以下错误类型：

- **TIMEOUT** - 请求超时
- **CONNECTION_REFUSED** - 连接被拒绝
- **DNS_ERROR** - DNS解析失败
- **PROXY_ERROR** - 代理连接错误
- **NETWORK_ERROR** - 网络连接错误
- **HTTP_ERROR** - HTTP状态码错误
- **INVALID_RESPONSE** - 响应格式异常
- **ALL_ATTEMPTS_FAILED** - 所有重试尝试均失败

### 递归保护

为防止无限递归或分页循环，系统设置了以下限制：

- **Codeforces**：最大递归深度 100 页
- **牛客网**：最大分页数 50 页

超过限制后，系统会自动停止并记录警告日志。

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
