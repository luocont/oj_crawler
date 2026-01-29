import cron from 'node-cron';
import config from './config.js';
import { fetchProxies } from './fetcher.js';
import { validateProxies } from './validator.js';
import { proxyPool } from './pool.js';
import { loadProxies, saveProxies } from './storage.js';

/**
 * 任务超时时间（毫秒）
 */
const TASK_TIMEOUT = 120000; // 2分钟

/**
 * 最大重试次数
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * 重试延迟时间（毫秒）
 */
const RETRY_DELAY = 5000; // 5秒

/**
 * 带超时保护的Promise包装器
 * @param {Promise} promise - 要执行的Promise
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @param {string} taskName - 任务名称
 * @returns {Promise} 带超时保护的Promise
 */
function withTimeout(promise, timeoutMs, taskName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        reject(new Error(`${taskName} 超时（超过 ${timeoutMs/1000} 秒）`));
      }, timeoutMs)
    )
  ]);
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 刷新代理池（带重试机制）
 * @param {number} retryAttempt - 当前重试次数
 * @returns {Promise<Object>} 刷新结果
 */
export async function refreshProxyPool(retryAttempt = 0) {
  const startTime = Date.now();
  console.log(`[Scheduler] 开始刷新代理池... ${retryAttempt > 0 ? `(重试 ${retryAttempt}/${MAX_RETRY_ATTEMPTS})` : ''}`);

  try {
    // 使用超时保护
    const result = await withTimeout(
      (async () => {
        // 1. 获取新代理
        console.log('[Scheduler] 步骤 1/5: 获取新代理...');
        const fetched = await fetchProxies();

        if (fetched.length === 0) {
          console.log('[Scheduler] 未获取到任何代理');
          return { fetched: 0, validated: 0, added: 0 };
        }

        // 2. 验证代理
        console.log('[Scheduler] 步骤 2/5: 验证代理...');
        const validated = await validateProxies(fetched);

        // 3. 合并到现有代理池（去重）
        console.log('[Scheduler] 步骤 3/5: 合并到代理池...');
        const existingProxies = proxyPool.getAllProxies();
        const existingSet = new Set(existingProxies.map(p => `${p.ip}:${p.port}`));

        const newProxies = validated.filter(p => !existingSet.has(`${p.ip}:${p.port}`));

        // 4. 更新代理池
        console.log('[Scheduler] 步骤 4/5: 更新代理池...');
        const merged = [...existingProxies, ...newProxies];
        proxyPool.setProxies(merged);

        // 5. 持久化
        console.log('[Scheduler] 步骤 5/5: 保存代理数据...');
        const saveResult = await saveProxies(merged);
        if (!saveResult.success) {
          console.error('[Scheduler] 保存代理数据失败:', saveResult.error);
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Scheduler] 刷新完成: 获取${fetched.length}, 验证${validated.length}, 新增${newProxies.length} (耗时: ${totalTime}ms)`);

        return {
          fetched: fetched.length,
          validated: validated.length,
          added: newProxies.length,
          success: true
        };
      })(),
      TASK_TIMEOUT,
      '刷新代理池'
    );

    return result;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[Scheduler] 刷新代理池失败 (耗时: ${totalTime}ms):`, error.message);

    // 重试逻辑
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      console.log(`[Scheduler] ${RETRY_DELAY/1000}秒后进行第 ${retryAttempt + 1} 次重试...`);
      await delay(RETRY_DELAY);
      return await refreshProxyPool(retryAttempt + 1);
    }

    // 达到最大重试次数
    console.error(`[Scheduler] 已达到最大重试次数 (${MAX_RETRY_ATTEMPTS})，停止刷新`);

    return {
      fetched: 0,
      validated: 0,
      added: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * 安全执行定时任务（带错误处理）
 * @param {string} taskName - 任务名称
 * @param {Function} taskFn - 要执行的任务函数
 */
async function safeExecuteTask(taskName, taskFn) {
  const startTime = Date.now();
  try {
    console.log(`[Scheduler] ${taskName} 开始执行`);
    const result = await withTimeout(taskFn(), TASK_TIMEOUT, taskName);
    const totalTime = Date.now() - startTime;
    console.log(`[Scheduler] ${taskName} 执行成功 (耗时: ${totalTime}ms)`);
    return result;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[Scheduler] ${taskName} 执行失败 (耗时: ${totalTime}ms):`, error.message);
    return null;
  }
}

/**
 * 初始化调度器
 */
export function initScheduler() {
  // 启动时加载历史代理
  loadProxies().then(proxies => {
    if (proxies.length > 0) {
      proxyPool.setProxies(proxies);
      console.log(`[Scheduler] 加载了 ${proxies.length} 个历史代理`);
    }

    // 启动时获取代理
    if (config.refresh.fetchOnStart) {
      safeExecuteTask('启动时刷新代理池', () => refreshProxyPool());
    }
  }).catch(error => {
    console.error('[Scheduler] 加载历史代理失败:', error.message);
  });

  // 每30分钟检查一次代理数量并刷新
  cron.schedule('*/30 * * * *', async () => {
    await safeExecuteTask('定时检查代理数量', async () => {
      const stats = proxyPool.getStats();

      // 如果可用代理数量低于阈值，触发刷新
      if (stats.active < config.refresh.minProxies) {
        console.log(`[Scheduler] 可用代理数量(${stats.active})低于阈值(${config.refresh.minProxies})，触发刷新`);
        return await refreshProxyPool();
      } else {
        console.log(`[Scheduler] 可用代理数量(${stats.active})充足，无需刷新`);
        return { skipped: true };
      }
    });
  });

  // 每小时自动刷新
  cron.schedule('0 * * * *', async () => {
    await safeExecuteTask('每小时定时刷新', () => refreshProxyPool());
  });

  console.log('[Scheduler] 调度器已启动');
  console.log(`[Scheduler] 配置: 最小代理数=${config.refresh.minProxies}, 超时=${TASK_TIMEOUT/1000}s, 最大重试=${MAX_RETRY_ATTEMPTS}`);
}
