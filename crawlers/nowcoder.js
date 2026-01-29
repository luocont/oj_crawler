import { proxyGet } from '../proxyPool/middleware.js'
import * as cheerio from 'cheerio'

/**
 * 爬取牛客网用户ACM提交数据
 * @param {string|number} username - 用户ID（必须是数字格式）
 * @returns {Promise<Object>} 返回包含解题数、提交数和已解决题目列表的对象
 */
export async function crawlNowCoder(username) {
  // 参数校验
  if (!username) {
    throw new Error('请输入用户ID')
  }

  if (isNaN(username)) {
    throw new Error('牛客网的输入必须是用户ID（数字格式）')
  }

  username = Number(username) + ''

  let solved = null
  let submissions = null
  const solvedList = new Set()

  let lastSubmissionId = Infinity
  let page = 1

  // 循环获取所有提交记录
  while (true) {
    const res = await proxyGet(
      `https://ac.nowcoder.com/acm/contest/profile/${username}/practice-coding`,
      {
        query: {
          pageSize: 200,
          statusTypeFilter: 5,        // 5表示AC状态
          languageCategoryFilter: -1, // -1表示所有语言
          orderType: 'DESC',
          page,
        }
      }
    )

    if (!res.ok) {
      throw new Error(`服务器响应错误: ${res.status}`)
    }

    const $ = cheerio.load(res.text)

    // 检查用户是否存在
    if ($('.null-tip').text().trim() === '用户不存在') {
      throw new Error('用户不存在')
    }

    // 首次获取时，提取用户统计信息
    if (solved == null) {
      solved = Number($('span:contains("题已通过")').prev().text())
      submissions = Number($('span:contains("次提交")').prev().text())
    }

    // 获取当前页第一条提交记录的ID
    const newSubmissionId = Number($($('a[href^="/acm/contest/view-submission"]')[0]).text())

    // 如果提交ID与上一页相同，说明已经循环，退出
    if (newSubmissionId === lastSubmissionId) {
      break
    }
    lastSubmissionId = newSubmissionId

    // 提取已解决的题目ID（从href中提取）
    const problemLinks = $('a[href^="/acm/problem/"]')
    const problemIds = problemLinks
      .map((i, elem) => $(elem).attr('href').slice(13))
      .get()
      .slice(1) // 第一项是 "list"，跳过

    problemIds.forEach(id => solvedList.add(id))

    page += 1
  }

  return {
    solved,
    submissions,
    solvedList: [...solvedList],
  }
}
