/**
 * 代理池测试脚本
 * 用于验证代理池功能的正确性
 */

import { proxyGet } from './proxyPool/middleware.js';
import { proxyPool } from './proxyPool/pool.js';
import { refreshProxyPool } from './proxyPool/scheduler.js';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * 打印带颜色的消息
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 等待指定时间
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 测试1: 获取代理池状态
 */
async function test1_ProxyPoolStatus() {
  log('\n========== 测试1: 获取代理池状态 ==========', 'cyan');
  try {
    const stats = proxyPool.getStats();
    log(`✓ 代理总数: ${stats.total}`, 'green');
    log(`✓ 活跃代理: ${stats.active}`, 'green');
    log(`✓ 冷却代理: ${stats.cooldown}`, 'green');
    log(`✓ 平均评分: ${stats.averageScore.toFixed(2)}`, 'green');
    return true;
  } catch (error) {
    log(`✗ 获取状态失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 测试2: 刷新代理池
 */
async function test2_RefreshProxyPool() {
  log('\n========== 测试2: 刷新代理池 ==========', 'cyan');
  try {
    log('正在刷新代理池...', 'yellow');
    const result = await refreshProxyPool();
    log(`✓ 获取代理数: ${result.fetched}`, 'green');
    log(`✓ 验证通过数: ${result.validated}`, 'green');
    log(`✓ 新增代理数: ${result.added}`, 'green');
    return true;
  } catch (error) {
    log(`✗ 刷新失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 测试3: 使用代理发送GET请求
 */
async function test3_ProxyRequest() {
  log('\n========== 测试3: 使用代理发送请求 ==========', 'cyan');
  try {
    log('正在使用代理访问 httpbin.org...', 'yellow');
    const startTime = Date.now();
    const res = await proxyGet('http://httpbin.org/ip');
    const responseTime = Date.now() - startTime;

    if (res.ok) {
      const data = JSON.parse(res.text);
      log(`✓ 请求成功，响应时间: ${responseTime}ms`, 'green');
      log(`✓ 响应数据: ${JSON.stringify(data)}`, 'green');
      return true;
    } else {
      log(`✗ 请求失败，状态码: ${res.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ 请求异常: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 测试4: 测试洛谷爬虫（使用代理）
 */
async function test4_LuoguCrawler() {
  log('\n========== 测试4: 洛谷爬虫（使用代理）==========', 'cyan');
  try {
    const { crawlLuoguUser } = await import('./crawlers/luogu.js');
    log('正在爬取洛谷用户 "kzn" 的数据...', 'yellow');
    const startTime = Date.now();

    const data = await crawlLuoguUser('kzn');
    const responseTime = Date.now() - startTime;

    log(`✓ 爬取成功，响应时间: ${responseTime}ms`, 'green');
    log(`✓ 用户名: ${data.username}`, 'green');
    log(`✓ UID: ${data.uid}`, 'green');
    log(`✓ 总通过数: ${data.difficultyStats.reduce((sum, d) => sum + d.count, 0)}`, 'green');
    return true;
  } catch (error) {
    log(`✗ 爬取失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 测试5: 测试Codeforces爬虫（使用代理）
 */
async function test5_CodeforcesCrawler() {
  log('\n========== 测试5: Codeforces爬虫（使用代理）==========', 'cyan');
  try {
    const { fetchCodeforcesData } = await import('./crawlers/codeforces.js');
    log('正在爬取Codeforces用户 "tourist" 的数据...', 'yellow');
    const startTime = Date.now();

    const data = await fetchCodeforcesData('tourist');
    const responseTime = Date.now() - startTime;

    log(`✓ 爬取成功，响应时间: ${responseTime}ms`, 'green');
    log(`✓ 通过题目数: ${data.solved}`, 'green');
    log(`✓ 提交次数: ${data.submissions}`, 'green');
    return true;
  } catch (error) {
    log(`✗ 爬取失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 测试6: 获取代理列表
 */
async function test6_ProxyList() {
  log('\n========== 测试6: 获取代理列表 ==========', 'cyan');
  try {
    const proxies = proxyPool.getAllProxies();
    log(`✓ 总代理数: ${proxies.length}`, 'green');

    if (proxies.length > 0) {
      log('\n前5个代理详情:', 'blue');
      proxies.slice(0, 5).forEach((p, i) => {
        log(`  ${i + 1}. ${p.ip}:${p.port} (${p.protocol}) - ${p.status}`, 'cyan');
        log(`     成功: ${p.successCount || 0}, 失败: ${p.failCount || 0}`, 'cyan');
      });
    }

    return true;
  } catch (error) {
    log(`✗ 获取列表失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log('\n╔════════════════════════════════════════╗', 'cyan');
  log('║     代理池功能测试套件 v1.0.0        ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');

  const results = [];

  // 依次执行测试
  results.push(await test1_ProxyPoolStatus());
  await sleep(1000);

  results.push(await test2_RefreshProxyPool());
  await sleep(2000);

  results.push(await test3_ProxyRequest());
  await sleep(1000);

  results.push(await test6_ProxyList());
  await sleep(1000);

  // 可选：测试爬虫（需要网络环境）
  const testCrawlers = process.argv.includes('--test-crawlers');
  if (testCrawlers) {
    results.push(await test4_LuoguCrawler());
    await sleep(2000);
    results.push(await test5_CodeforcesCrawler());
  } else {
    log('\n========== 跳过爬虫测试 ==========', 'yellow');
    log('提示: 使用 --test-crawlers 参数来测试爬虫功能', 'yellow');
  }

  // 汇总结果
  log('\n╔════════════════════════════════════════╗', 'cyan');
  log('║            测试结果汇总               ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');

  const passed = results.filter(r => r).length;
  const total = results.length;

  log(`通过: ${passed}/${total}`, passed === total ? 'green' : 'yellow');
  log(`失败: ${total - passed}/${total}`, total - passed > 0 ? 'red' : 'green');

  if (passed === total) {
    log('\n✓ 所有测试通过！', 'green');
    process.exit(0);
  } else {
    log('\n✗ 部分测试失败，请检查日志', 'red');
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(error => {
  log(`\n✗ 测试运行出错: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
