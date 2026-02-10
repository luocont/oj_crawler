import { proxyGet, ProxyRequestError, ErrorCode } from '../proxyPool/middleware.js'
import * as cheerio from 'cheerio'

const MAX_PAGES = 50 // 最大页数限制，防止无限循环
const REQUEST_TIMEOUT = 20000 // 12秒超时
const PAGE_LOAD_TIMEOUT = 300000 // 整个页面加载的最大时间（5分钟）

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

const RANK_REQUEST_TIMEOUT = 12000 // 12秒超时
const RANK_PAGE_LOAD_TIMEOUT = 300000 // 整体爬取超时（5分钟）
const RANK_MAX_PAGES = 200 // 最大页数限制

/**
 * 爬取牛客网比赛排名数据
 * @param {string|number} contestId - 比赛ID
 * @returns {Promise<Object>} 返回比赛排名数据
 */
export async function crawlNowCoderContestRank(contestId) {
  // 参数校验
  if (!contestId) {
    throw new Error('请输入比赛ID')
  }

  if (isNaN(contestId)) {
    throw new Error('比赛ID必须是数字格式')
  }

  contestId = Number(contestId)

  let contestName = null
  let totalParticipants = 0
  const rankList = []
  const problems = []

  const startTime = Date.now()
  let page = 1
  let hasMoreData = true

  // 循环获取所有页的排名数据
  while (hasMoreData) {
    // 检查总超时时间
    if (Date.now() - startTime > RANK_PAGE_LOAD_TIMEOUT) {
      console.warn(`[NowCoder] 获取比赛排名超时（超过${RANK_PAGE_LOAD_TIMEOUT/1000}秒），已获取 ${rankList.length} 条记录`)
      break
    }

    // 检查最大页数限制
    if (page > RANK_MAX_PAGES) {
      console.warn(`[NowCoder] 达到最大页数限制(${RANK_MAX_PAGES})，停止分页`)
      break
    }

    let res
    try {
      // 使用牛客网实时排名API，支持分页
      res = await proxyGet(
        `https://ac.nowcoder.com/acm-heavy/acm/contest/real-time-rank-data`,
        {
          query: {
            token: '',
            id: contestId,
            page: page,
            limit: 0, // 0表示获取当前页全部数据
            _: Date.now()
          },
          timeout: RANK_REQUEST_TIMEOUT
        }
      )
    } catch (error) {
      if (error instanceof ProxyRequestError) {
        throw new Error(`获取比赛排名失败(第${page}页): ${error.message}`)
      }
      throw new Error(`获取比赛排名时发生网络错误(第${page}页): ${error.message}`)
    }

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('比赛不存在')
      }
      throw new Error(`服务器响应错误: ${res.status} ${res.statusText || ''}`)
    }

    let data
    try {
      data = JSON.parse(res.text)
    } catch (error) {
      throw new Error(`解析排名数据失败(第${page}页): ${error.message}`)
    }

    // 检查API响应
    if (!data || data.code !== 0 || !data.data) {
      if (data && (data.msg === '比赛不存在' || data.msg === 'contest not exist')) {
        throw new Error('比赛不存在')
      }
      throw new Error(`API返回错误: ${data?.msg || '未知错误'}`)
    }

    const rankData = data.data

    // 首次获取时，提取比赛名称
    if (contestName == null) {
      // 获取比赛名称（从比赛页面）
      try {
        const pageRes = await proxyGet(
          `https://ac.nowcoder.com/acm/contest/${contestId}`,
          { timeout: RANK_REQUEST_TIMEOUT }
        )
        if (pageRes.ok) {
          // 尝试从HTML中提取 competitionName_var
          const match = pageRes.text.match(/competitionName_var":"([^"]+)"/)
          if (match && match[1]) {
            contestName = match[1]
          } else {
            // 如果没有找到，尝试其他方式
            const $ = cheerio.load(pageRes.text)
            contestName = $('.contest-name').text().trim() ||
                          $('h1').first().text().trim() ||
                          $('title').text().trim() ||
                          `比赛${contestId}`
          }
        }
      } catch (e) {
        // 忽略获取比赛名称的错误
        console.warn(`[NowCoder] 获取比赛名称失败: ${e.message}`)
      }

      if (!contestName) {
        contestName = `比赛${contestId}`
      }

      // 提取题目信息
      if (rankData.problemData && Array.isArray(rankData.problemData)) {
        // 按照字母顺序排序（A, B, C...）
        const sortedProblems = [...rankData.problemData].sort((a, b) => {
          const nameA = (a.name || '').toUpperCase()
          const nameB = (b.name || '').toUpperCase()
          return nameA.localeCompare(nameB)
        })

        sortedProblems.forEach(problem => {
          problems.push({
            id: problem.name || problem.problemId || '',        // 题目字母 (A, B, C...)
            problemId: problem.problemId || '',                  // 题目数字ID
            title: problem.name || `题目${problem.problemId || ''}`,
            acceptCount: problem.acceptedCount || problem.acceptCount || 0,
            submitCount: problem.submitCount || 0
          })
        })
      }
    }

    // 提取排名数据
    if (rankData.rankData && Array.isArray(rankData.rankData)) {
      if (rankData.rankData.length === 0) {
        // 没有更多数据
        hasMoreData = false
        break
      }

      rankData.rankData.forEach((item, index) => {
        try {
          const ranking = {
            rank: item.ranking || ((page - 1) * 50 + index + 1),
            userId: item.uid?.toString() || '',
            username: item.userName || '',
            avatar: item.userAvatar || '',
            school: item.school || '',
            solved: item.acceptedCount || 0,
            score: item.fullScore || 0,
            timeCost: Math.floor((item.penaltyTime || 0) / 1000), // 转换为秒
            submitCount: 0,
            problemDetails: {} // ACM模式的详细信息
          }

          // 提取各题状态和ACM详细信息
          if (item.scoreList && Array.isArray(item.scoreList)) {
            let totalSubmissions = 0
            item.scoreList.forEach(scoreItem => {
              // 查找题目字母（A, B, C...）和题目ID
              const problemInfo = problems.find(p => p.problemId === scoreItem.problemId)
              const problemLetter = problemInfo?.id || scoreItem.problemId?.toString() || ''
              const problemIdNum = scoreItem.problemId || problemInfo?.problemId || ''

              // 基础得分（AC为100，否则为0）
              if (scoreItem.submit) {
                totalSubmissions++
              }

              // ACM模式的详细信息，同时包含题目字母和题目ID
              ranking.problemDetails[problemLetter] = {
                accepted: scoreItem.accepted || false,
                acceptedTime: scoreItem.acceptedTime || -1,
                failedCount: scoreItem.failedCount || 0,
                finishJudge: scoreItem.finishJudge || false,
                firstBlood: scoreItem.firstBlood || false,
                fullScore: scoreItem.fullScore || 0,
                problemId: problemIdNum,          // 题目数字ID
                problemLetter: problemLetter,      // 题目字母 (A, B, C...)
                score: scoreItem.score || 0,
                submissionId: scoreItem.submissionId || 0,
                submit: scoreItem.submit || false,
                timeConsumption: scoreItem.timeConsumption || 0,
                waitingJudgeCount: scoreItem.waitingJudgeCount || 0
              }
            })
            ranking.submitCount = totalSubmissions
          }

          rankList.push(ranking)
        } catch (e) {
          console.warn(`[NowCoder] 跳过异常记录: ${e.message}`)
        }
      })

      // 如果这一页的数据少于50条，说明已经是最后一页
      if (rankData.rankData.length < 50) {
        hasMoreData = false
      }
    } else {
      // 没有排名数据
      hasMoreData = false
    }

    page += 1
  }

  totalParticipants = rankList.length

  return {
    contestName,
    totalParticipants,
    rankList,
    problems
  }
}
