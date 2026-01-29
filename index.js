import express from 'express'
import cors from 'cors'
import { crawlLuoguUser } from './crawlers/luogu.js'
import { fetchCodeforcesData } from './crawlers/codeforces.js'
import { crawlNowCoder } from './crawlers/nowcoder.js'
import { initScheduler, refreshProxyPool } from './proxyPool/scheduler.js'
import { proxyPool } from './proxyPool/pool.js'

const app = express()
const PORT = process.env.PORT || 8080

// 初始化代理池调度器
initScheduler()

// 中间件
app.use(cors())
app.use(express.json())

// ==================== 健康检查 ====================
app.get('/', (req, res) => {
  res.json({
    name: '统一爬虫微服务',
    version: '1.0.0',
    services: ['洛谷', 'Codeforces', '牛客网'],
    endpoints: {
      luogu: '/api/luogu/:username',
      codeforces: '/api/codeforces/:uid',
      nowcoder: '/api/nowcoder/:uid'
    },
    proxyPool: {
      status: '/api/proxy/status',
      refresh: '/api/proxy/refresh',
      list: '/api/proxy/list'
    }
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'unified-crawler' })
})

// ==================== 洛谷爬虫路由 ====================
app.get('/api/luogu/:username', async (req, res) => {
  const username = req.params.username

  try {
    console.log(`[${new Date().toISOString()}] 正在爬取洛谷用户 "${username}" 的数据...`)
    const data = await crawlLuoguUser(username)
    console.log(`[${new Date().toISOString()}] 洛谷爬取完成！`)

    res.json({
      error: false,
      data: data
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 洛谷爬取出错:`, error.message)
    res.status(500).json({
      error: true,
      message: error.message
    })
  }
})

// ==================== Codeforces 爬虫路由 ====================
app.get('/api/codeforces/:uid', async (req, res) => {
  const username = req.params.uid

  try {
    console.log(`[${new Date().toISOString()}] 正在爬取 Codeforces 用户 "${username}" 的数据...`)
    const result = await fetchCodeforcesData(username)
    console.log(`[${new Date().toISOString()}] Codeforces 爬取完成！通过题目数: ${result.solved}`)

    res.json({
      success: true,
      username: username,
      data: result
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Codeforces 爬取出错:`, error.message)
    res.status(500).json({
      success: false,
      username: username,
      error: error.message
    })
  }
})

// ==================== 牛客网爬虫路由 ====================
app.get('/api/nowcoder/:uid', async (req, res) => {
  const uid = req.params.uid

  try {
    console.log(`[${new Date().toISOString()}] 正在爬取牛客网用户 "${uid}" 的数据...`)
    const result = await crawlNowCoder(uid)
    console.log(`[${new Date().toISOString()}] 牛客网爬取完成！`)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 牛客网爬取出错:`, error.message)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// ==================== 代理池管理路由 ====================
// 获取代理池状态
app.get('/api/proxy/status', (req, res) => {
  const stats = proxyPool.getStats()
  res.json({
    success: true,
    data: stats
  })
})

// 手动刷新代理池
app.post('/api/proxy/refresh', async (req, res) => {
  try {
    const result = await refreshProxyPool()
    res.json({
      success: true,
      message: '代理池刷新成功',
      data: result
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

// 获取所有代理列表
app.get('/api/proxy/list', (req, res) => {
  const proxies = proxyPool.getAllProxies()
  res.json({
    success: true,
    data: proxies.map(p => ({
      ip: p.ip,
      port: p.port,
      protocol: p.protocol,
      status: p.status,
      successCount: p.successCount || 0,
      failCount: p.failCount || 0,
      avgResponseTime: p.avgResponseTime || 0
    }))
  })
})

// ==================== 错误处理中间件 ====================
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message)
  res.status(err.status || 500).json({
    error: true,
    message: err.message
  })
})

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
  console.log(`========================================`)
  console.log(`统一爬虫微服务已启动！`)
  console.log(`访问地址: http://localhost:${PORT}`)
  console.log(`========================================`)
  console.log(`API 接口:`)
  console.log(`  洛谷:       http://localhost:${PORT}/api/luogu/:username`)
  console.log(`  Codeforces: http://localhost:${PORT}/api/codeforces/:uid`)
  console.log(`  牛客网:     http://localhost:${PORT}/api/nowcoder/:uid`)
  console.log(`========================================`)
})

export default app
