# 统一爬虫微服务

一个统一的在线判题平台用户数据爬取服务，支持洛谷、Codeforces 和牛客网三个主流编程竞赛平台。

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

### 洛谷 (Luogu)

#### GET `/api/luogu/:username`

获取洛谷用户数据。

**参数：**
- `username`（路径参数）：洛谷用户名

**示例请求：**
```bash
curl http://localhost:8080/api/luogu/kkksc03
curl http://localhost:8080/api/codeforces/kkksc03
curl http://localhost:8080/api/nowcoders/kkksc03
```

## 项目结构

```
user_crawler/
├── crawlers/           # 爬虫实现模块
│   ├── luogu.js        # 洛谷爬虫
│   ├── codeforces.js   # Codeforces 爬虫
│   └── nowcoder.js     # 牛客网爬虫
├── index.js            # 主服务文件
├── package.json        # 项目配置
└── README.md           # 项目文档
```

## 📝 配置说明

### 端口配置

默认端口为 `8080`，可通过环境变量修改：

```bash
PORT=3000 npm start
```

### 爬虫实现

每个平台的爬虫实现位于 `crawlers/` 目录下：

- **luogu.js**：使用 HTML 解析方式爬取洛谷用户数据
- **codeforces.js**：调用 Codeforces 官方 API
- **nowcoder.js**：使用 HTML 解析方式爬取牛客网用户数据

