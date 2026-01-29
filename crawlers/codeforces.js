import { proxyGet } from '../proxyPool/middleware.js'

const MAX_PAGE_SIZE = 10000

/**
 * 递归查询用户提交记录
 * @param {string} username - 用户名
 * @param {number} pageCount - 当前页码（从1开始）
 * @param {Set<string>} acSet - AC题目集合（会被修改）
 * @returns {Promise<number>} - 返回该页的提交数量
 */
async function queryForNumber(username, pageCount, acSet) {
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
      { query: queryObject }
    )
  } catch (e) {
    if (e.response && e.response.body && e.response.body.status) {
      const comment = e.response.body.comment
      if (/handle: User with handle .* not found/.test(comment)) {
        throw new Error('用户不存在')
      } else {
        throw new Error(comment)
      }
    } else {
      throw e
    }
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
    const ret = await queryForNumber(username, pageCount + 1, acSet)
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

  const acSet = new Set()
  const submissions = await queryForNumber(username, 1, acSet)

  return {
    solved: acSet.size,
    submissions: submissions,
    solvedList: [...acSet],
  }
}
