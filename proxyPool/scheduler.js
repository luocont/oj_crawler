import cron from 'node-cron';
import config from './config.js';
import { fetchProxies } from './fetcher.js';
import { validateProxies } from './validator.js';
import { proxyPool } from './pool.js';
import { loadProxies, saveProxies } from './storage.js';

/**
 * 刷新代理池
 * @returns {Promise<Object>} 刷新结果
 */
export async function refreshProxyPool() {
  console.log('[Scheduler] 开始刷新代理池...');

  // 1. 获取新代理
  const fetched = await fetchProxies();

  if (fetched.length === 0) {
    console.log('[Scheduler] 未获取到任何代理');
    return { fetched: 0, validated: 0, added: 0 };
  }

  // 2. 验证代理
  const validated = await validateProxies(fetched);

  // 3. 合并到现有代理池（去重）
  const existingProxies = proxyPool.getAllProxies();
  const existingSet = new Set(existingProxies.map(p => `${p.ip}:${p.port}`));

  const newProxies = validated.filter(p => !existingSet.has(`${p.ip}:${p.port}`));

  // 4. 更新代理池
  const merged = [...existingProxies, ...newProxies];
  proxyPool.setProxies(merged);

  // 5. 持久化（处理 saveProxies 的返回值）
  const saveResult = await saveProxies(merged);
  if (!saveResult.success) {
    console.error('[Scheduler] 保存代理数据失败:', saveResult.error);
  }

  console.log(`[Scheduler] 刷新完成: 获取${fetched.length}, 验证${validated.length}, 新增${newProxies.length}`);

  return {
    fetched: fetched.length,
    validated: validated.length,
    added: newProxies.length
  };
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
      refreshProxyPool();
    }
  });

  // 定时刷新
  cron.schedule('*/30 * * * *', async () => {
    const stats = proxyPool.getStats();

    // 定时刷新（每30分钟检查一次）
    if (stats.active < config.refresh.minProxies) {
      console.log('[Scheduler] 可用代理数量低于阈值，触发刷新');
      await refreshProxyPool();
    }
  });

  // 每小时自动刷新
  cron.schedule('0 * * * *', () => {
    console.log('[Scheduler] 定时刷新触发');
    refreshProxyPool();
  });

  console.log('[Scheduler] 调度器已启动');
}
