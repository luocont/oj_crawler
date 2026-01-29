import { proxyGet, ProxyRequestError, ErrorCode } from '../proxyPool/middleware.js'

const MAX_PAGE_SIZE = 10000
const MAX_PAGES = 100 // 最大页数限制，防止无限递归
const REQUEST_TIMEOUT = 12000 // 12秒超时

/**
 * 递归查询用户提交记录
 * @param {string} username - 用户名
 * @param {number} pageCount - 当前页码（从1开始）
 * @param {Set<string>} acSet - AC题目集合（会被修改）
 * @param {number} depth - 当前递归深度
 * @returns {Promise<number>} - 返回该页的提交数量
 */
async function queryForNumber(username, pageCount, acSet, depth = 1) {
  // 防止无限递归
  if (depth > MAX_PAGES) {
    throw new Error(`递归深度超过限制(${MAX_PAGES}页)，可能存在异常数据`)
  }

  // 构造查询参数
  const queryObject = {
    handle: username,
    from: (pageCount - 1) * MAX_PAGE_SIZE + 1,
    count: MAX_PAGE_SIZE,
  }

  let res = null
  try {
    res = await proxyGet(
      'http://codeforces.com/api/user.status',
      {
        query: queryObject,
        timeout: REQUEST_TIMEOUT
      }
    )
  } catch (error) {
    // 网络请求错误处理
    if (error instanceof ProxyRequestError) {
      throw new Error(`获取Codeforces数据失败: ${error.message}`);
    }

    // 原有的API错误处理逻辑
    if (error.response && error.response.body && error.response.body.status) {
      const comment = error.response.body.comment
      if (/handle: User with handle .* not found/.test(comment)) {
        throw new Error('用户不存在')
      } else {
        throw new Error(`API错误: ${comment}`)
      }
    } else {
      throw new Error(`网络请求失败: ${error.message}`)
    }
  }

  // 验证响应格式
  if (!res.body || !res.body.result) {
    throw new Error('Codeforces API返回数据格式异常')
  }

  // 处理结果
  const problemArray = res.body.result

  if (problemArray.length === 0) {
    return 0
  }

  // 提取AC的题目
  problemArray.forEach(function (element) {
    if (element.verdict === 'OK') {
      const problem = element.problem
      const title = problem.contestId + problem.index
      acSet.add(title)
    }
  })

  const total = problemArray.length

  // 递归处理（返回结果或再发起请求）
  if (total < MAX_PAGE_SIZE) {
    // 已经读完
    return total
  } else {
    const ret = await queryForNumber(username, pageCount + 1, acSet, depth + 1)
    return ret + total
  }
}

/**
 * Codeforces 用户数据爬虫
 * @param {string} username - Codeforces 用户名
 */
export async function fetchCodeforcesData(username) {
  if (!username) {
    throw new Error('请输入用户名')
  }

  if (typeof username !== 'string') {
    throw new Error('用户名必须是字符串')
  }

  const acSet = new Set()

  let submissions;
  try {
    submissions = await queryForNumber(username, 1, acSet)
  } catch (error) {
    // 重新抛出已经处理过的错误
    throw error;
  }

  return {
    solved: acSet.size,
    submissions: submissions,
    solvedList: [...acSet],
  }
}
