import express from 'express'
import cors from 'cors'
import { crawlLuoguUser } from './crawlers/luogu.js'
import { fetchCodeforcesData } from './crawlers/codeforces.js'
import { crawlNowCoder, crawlNowCoderContestRank } from './crawlers/nowcoder.js'
import { initScheduler, refreshProxyPool } from './proxyPool/scheduler.js'
import { proxyPool } from './proxyPool/pool.js'

const app = express()
const PORT = process.env.PORT || 8080

// ==================== 爬虫结果缓存 ====================
// 缓存配置
const CACHE_TTL = 12* 60 * 60 * 1000 // 1天
const crawlerCache = new Map()

/**
 * 获取缓存
 * @param {string} key - 缓存key
 * @returns {Object|null} 缓存的数据，如果不存在或已过期返回null
 */
function getCachedData(key) {
  const cached = crawlerCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache] 命中缓存: ${key}`)
    return cached.data
  }
  if (cached) {
    console.log(`[Cache] 缓存已过期: ${key}`)
    crawlerCache.delete(key)
  }
  return null
}

/**
 * 设置缓存
 * @param {string} key - 缓存key
 * @param {Object} data - 要缓存的数据
 */
function setCachedData(key, data) {
  crawlerCache.set(key, {
    data: data,
    timestamp: Date.now()
  })
  console.log(`[Cache] 已缓存: ${key} (当前缓存数: ${crawlerCache.size})`)
}

/**
 * 清空所有缓存
 */
function clearAllCache() {
  crawlerCache.clear()
  console.log('[Cache] 已清空所有爬虫缓存')
}

/**
 * 获取缓存统计
 * @returns {Object} 缓存统计信息
 */
function getCacheStatistics() {
  return {
    size: crawlerCache.size,
    keys: Array.from(crawlerCache.keys()),
    ttl: CACHE_TTL
  }
}

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
      nowcoder: '/api/nowcoder/:uid',
      nowcoderContest: '/api/nowcoder/contest/:contestId'
    },
    proxyPool: {
      status: '/api/proxy/status',
      refresh: '/api/proxy/refresh',
      list: '/api/proxy/list'
    },
    cache: {
      stats: '/api/cache/stats',
      clear: '/api/cache/clear'
    }
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'unified-crawler' })
})

// ==================== 洛谷爬虫路由 ====================
app.get('/api/luogu/:username', async (req, res) => {
  const username = req.params.username
  const forceRefresh = req.query.refresh === 'true'
  const cacheKey = `luogu:${username}`

  try {
    // 如果不是强制刷新，先检查缓存
    if (!forceRefresh) {
      const cachedData = getCachedData(cacheKey)
      if (cachedData) {
        return res.json({
          error: false,
          data: cachedData,
          cached: true
        })
      }
    }

    console.log(`[${new Date().toISOString()}] 正在爬取洛谷用户 "${username}" 的数据...`)
    const data = await crawlLuoguUser(username)
    console.log(`[${new Date().toISOString()}] 洛谷爬取完成！`)

    // 保存到缓存
    setCachedData(cacheKey, data)

    res.json({
      error: false,
      data: data,
      cached: false
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
  const forceRefresh = req.query.refresh === 'true'
  const cacheKey = `codeforces:${username}`

  try {
    // 如果不是强制刷新，先检查缓存
    if (!forceRefresh) {
      const cachedData = getCachedData(cacheKey)
      if (cachedData) {
        return res.json({
          success: true,
          username: username,
          data: cachedData,
          cached: true
        })
      }
    }

    console.log(`[${new Date().toISOString()}] 正在爬取 Codeforces 用户 "${username}" 的数据...`)
    const result = await fetchCodeforcesData(username)
    console.log(`[${new Date().toISOString()}] Codeforces 爬取完成！通过题目数: ${result.solved}`)

    // 保存到缓存
    setCachedData(cacheKey, result)

    res.json({
      success: true,
      username: username,
      data: result,
      cached: false
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
  const forceRefresh = req.query.refresh === 'true'
  const cacheKey = `nowcoder:${uid}`

  try {
    // 如果不是强制刷新，先检查缓存
    if (!forceRefresh) {
      const cachedData = getCachedData(cacheKey)
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        })
      }
    }

    console.log(`[${new Date().toISOString()}] 正在爬取牛客网用户 "${uid}" 的数据...`)
    const result = await crawlNowCoder(uid)
    console.log(`[${new Date().toISOString()}] 牛客网爬取完成！`)

    // 保存到缓存
    setCachedData(cacheKey, result)

    res.json({
      success: true,
      data: result,
      cached: false
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 牛客网爬取出错:`, error.message)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ==================== 牛客网比赛排名路由 ====================
app.get('/api/nowcoder/contest/:contestId', async (req, res) => {
  const contestId = req.params.contestId
  const forceRefresh = req.query.refresh === 'true'
  const cacheKey = `nowcoder:contest:${contestId}`

  try {
    // 如果不是强制刷新，先检查缓存
    if (!forceRefresh) {
      const cachedData = getCachedData(cacheKey)
      if (cachedData) {
        return res.json({
          success: true,
          contestId: contestId,
          data: cachedData,
          partial: false,
          error: null,
          cached: true
        })
      }
    }

    console.log(`[${new Date().toISOString()}] 正在爬取牛客网比赛 "${contestId}" 的排名数据...`)
    const result = await crawlNowCoderContestRank(contestId)
    console.log(`[${new Date().toISOString()}] 牛客网比赛排名爬取完成！共 ${result.rankList.length} 条记录`)

    // 保存到缓存
    setCachedData(cacheKey, result)

    res.json({
      success: true,
      contestId: contestId,
      data: result,
      partial: false,
      error: null,
      cached: false
    })
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 牛客网比赛排名爬取出错:`, error.message)
    res.status(500).json({
      success: false,
      contestId: contestId,
      data: null,
      error: error.message
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

// ==================== 缓存管理路由 ====================
// 获取缓存统计信息
app.get('/api/cache/stats', (_req, res) => {
  const stats = getCacheStatistics()
  res.json({
    success: true,
    data: stats
  })
})

// 清空缓存
app.post('/api/cache/clear', (_req, res) => {
  clearAllCache()
  res.json({
    success: true,
    message: '爬虫缓存已清空'
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
  console.log(`  洛谷:         http://localhost:${PORT}/api/luogu/:username`)
  console.log(`  Codeforces:   http://localhost:${PORT}/api/codeforces/:uid`)
  console.log(`  牛客网用户:   http://localhost:${PORT}/api/nowcoder/:uid`)
  console.log(`  牛客网比赛:   http://localhost:${PORT}/api/nowcoder/contest/:contestId`)
  console.log(`========================================`)
  console.log(`提示: 添加 ?refresh=true 参数可强制刷新缓存`)
})

export default app
