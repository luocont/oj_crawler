import { proxyGet, ProxyRequestError, ErrorCode } from '../proxyPool/middleware.js'

// 难度映射
const DIFFICULTY_MAP = {
  1: '入门',
  2: '普及-',
  3: '普及/提高-',
  4: '普及+/提高',
  5: '提高+/省选-',
  6: '省选/NOI-',
  7: 'NOI/NOI+/CTSC'
}

/**
 * 获取洛谷用户信息
 */
async function getUserInfo(keyword) {
  let searchRes;
  try {
    searchRes = await proxyGet(
      'https://www.luogu.com.cn/api/user/search',
      {
        query: { keyword: keyword },
        timeout: 10000 // 10秒超时
      }
    )
  } catch (error) {
    // 网络请求错误处理
    if (error instanceof ProxyRequestError) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
    throw new Error(`获取用户信息时发生网络错误: ${error.message}`);
  }

  if (!searchRes.ok) {
    throw new Error(`服务器响应错误: ${searchRes.status} ${searchRes.statusText || ''}`)
  }

  let searchJSON;
  try {
    searchJSON = JSON.parse(searchRes.text)
  } catch (error) {
    throw new Error(`解析用户搜索数据失败: ${error.message}`)
  }

  if (!searchJSON.users || searchJSON.users.length === 0) {
    throw new Error('用户不存在')
  }

  if (searchJSON.users[0] == null) {
    throw new Error('用户不存在')
  }

  return {
    uid: searchJSON.users[0].uid,
    name: searchJSON.users[0].name,
    username: searchJSON.users[0].username
  }
}

/**
 * 从页面中解析JSON数据
 */
function getUserJson(text) {
  try {
    // 尝试新的页面格式（lentille-context）
    const newFormatMatch = text.match(/<script id="lentille-context"[^>]*>(.*?)<\/script>/is)
    if (newFormatMatch) {
      const jsonData = JSON.parse(newFormatMatch[1])
      return jsonData
    }

    // 尝试旧的页面格式（decodeURIComponent）
    const oldFormatMatch = text.match(/decodeURIComponent\("(.*?)"\)/i)
    if (oldFormatMatch) {
      return JSON.parse(decodeURIComponent(oldFormatMatch[1]))
    }

    throw new Error('Unknown page format')
  } catch (e) {
    throw new Error('Error while parsing: ' + e.message)
  }
}

/**
 * 爬取洛谷用户数据
 * @param {string} input - 洛谷用户名或UID
 * @returns {Promise<Object>} 用户数据
 */
export async function crawlLuoguUser(input) {
  if (!input) {
    throw new Error('请输入用户名')
  }

  // 1. 先通过搜索接口获取用户信息(包含name)
  let userInfo;
  try {
    userInfo = await getUserInfo(input)
  } catch (error) {
    throw error; // 重新抛出已经处理过的错误
  }

  // 2. 访问用户练习页面获取数据
  let res;
  try {
    res = await proxyGet(
      'https://www.luogu.com.cn/user/' + userInfo.uid + '/practice',
      { timeout: 15000 } // 15秒超时
    )
  } catch (error) {
    // 网络请求错误处理
    if (error instanceof ProxyRequestError) {
      throw new Error(`获取用户练习数据失败: ${error.message}`);
    }
    throw new Error(`获取用户练习数据时发生网络错误: ${error.message}`);
  }

  if (!res.ok) {
    throw new Error(`服务器响应错误: ${res.status} ${res.statusText || ''}`)
  }

  let userJson;
  try {
    userJson = getUserJson(res.text)
  } catch (error) {
    throw new Error(`解析用户练习数据失败: ${error.message}`)
  }

  // 验证数据结构
  if (!userJson || !userJson.data) {
    throw new Error('用户练习数据格式异常')
  }

  // 获取通过的题目列表
  const passedProblems = userJson.data?.passed || []

  // 按难度统计
  const difficultyStats = {}

  passedProblems.forEach(problem => {
    const difficulty = problem.difficulty

    if (!difficultyStats[difficulty]) {
      difficultyStats[difficulty] = {
        count: 0,
        pids: []
      }
    }

    difficultyStats[difficulty].count++
    difficultyStats[difficulty].pids.push(problem.pid)
  })

  // 转换为数组格式并排序
  const sortedStats = Object.entries(difficultyStats)
    .map(([difficulty, data]) => ({
      difficultyName: DIFFICULTY_MAP[difficulty] || `难度${difficulty}`,
      count: data.count,
      pids: data.pids
    }))
    .sort((a, b) => {
      const order = Object.values(DIFFICULTY_MAP)
      return order.indexOf(a.difficultyName) - order.indexOf(b.difficultyName)
    })

  return {
    name: userInfo.name,
    username: userInfo.username,
    uid: userInfo.uid,
    difficultyStats: sortedStats
  }
}
