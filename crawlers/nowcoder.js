import { proxyGet, ProxyRequestError, ErrorCode } from '../proxyPool/middleware.js'
import * as cheerio from 'cheerio'

const MAX_PAGES = 50 // 最大页数限制，防止无限循环
const REQUEST_TIMEOUT = 12000 // 12秒超时
const PAGE_LOAD_TIMEOUT = 60000 // 整个页面加载的最大时间（60秒）

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
  const startTime = Date.now()

  // 循环获取所有提交记录
  while (true) {
    // 检查总超时时间
    if (Date.now() - startTime > PAGE_LOAD_TIMEOUT) {
      throw new Error(`获取牛客网数据超时（超过${PAGE_LOAD_TIMEOUT/1000}秒），可能数据量过大`)
    }

    // 检查最大页数限制
    if (page > MAX_PAGES) {
      console.warn(`[NowCoder] 达到最大页数限制(${MAX_PAGES})，停止分页`);
      break;
    }

    let res;
    try {
      res = await proxyGet(
        `https://ac.nowcoder.com/acm/contest/profile/${username}/practice-coding`,
        {
          query: {
            pageSize: 200,
            statusTypeFilter: 5,        // 5表示AC状态
            languageCategoryFilter: -1, // -1表示所有语言
            orderType: 'DESC',
            page,
          },
          timeout: REQUEST_TIMEOUT
        }
      )
    } catch (error) {
      // 网络请求错误处理
      if (error instanceof ProxyRequestError) {
        throw new Error(`获取牛客网数据失败(第${page}页): ${error.message}`);
      }
      throw new Error(`获取牛客网数据时发生网络错误(第${page}页): ${error.message}`);
    }

    if (!res.ok) {
      throw new Error(`服务器响应错误: ${res.status} ${res.statusText || ''}`)
    }

    let $;
    try {
      $ = cheerio.load(res.text)
    } catch (error) {
      throw new Error(`解析牛客网页面数据失败(第${page}页): ${error.message}`)
    }

    // 检查用户是否存在
    const nullTipText = $('.null-tip').text().trim()
    if (nullTipText === '用户不存在' || nullTipText.includes('不存在')) {
      throw new Error('用户不存在')
    }

    // 首次获取时，提取用户统计信息
    if (solved == null) {
      const solvedText = $('span:contains("题已通过")').prev().text().trim()
      const submissionsText = $('span:contains("次提交")').prev().text().trim()

      // 验证数据格式
      if (!solvedText || !submissionsText) {
        throw new Error('无法解析用户统计数据，页面格式可能已改变')
      }

      solved = Number(solvedText)
      submissions = Number(submissionsText)

      // 验证数字有效性
      if (isNaN(solved) || isNaN(submissions)) {
        throw new Error('用户统计数据格式异常')
      }
    }

    // 获取当前页第一条提交记录的ID
    const submissionLinks = $('a[href^="/acm/contest/view-submission"]')
    if (submissionLinks.length === 0) {
      // 没有更多提交记录
      break
    }

    const newSubmissionId = Number($(submissionLinks[0]).text())

    // 如果提交ID与上一页相同，说明已经循环，退出
    if (newSubmissionId === lastSubmissionId) {
      break
    }
    lastSubmissionId = newSubmissionId

    // 提取已解决的题目ID（从href中提取）
    const problemLinks = $('a[href^="/acm/problem/"]')
    const problemIds = problemLinks
      .map((i, elem) => {
        try {
          return $(elem).attr('href').slice(13)
        } catch (e) {
          return null
        }
      })
      .get()
      .filter(id => id != null && id !== 'list') // 过滤掉null和"list"

    problemIds.forEach(id => solvedList.add(id))

    page += 1
  }

  return {
    solved,
    submissions,
    solvedList: [...solvedList],
  }
}
