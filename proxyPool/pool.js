import config from './config.js';

/**
 * 计算代理评分
 * @param {Object} proxy - 代理对象
 * @returns {number} 评分 (0-1)
 */
function calculateScore(proxy) {
  const total = proxy.successCount + proxy.failCount;
  if (total === 0) return 0.5;

  const successRate = proxy.successCount / total;
  const speedScore = Math.max(0, 1 - (proxy.avgResponseTime || 1000) / 5000);

  return (successRate * 0.6) + (speedScore * 0.4);
}

/**
 * 获取代理层级
 * @param {number} score - 代理评分
 * @returns {string} 层级 (high/mid/low)
 */
function getTier(score) {
  if (score > 0.7) return 'high';
  if (score >= 0.4) return 'mid';
  return 'low';
}

/**
 * 代理池管理器类
 */
export class ProxyPool {
  constructor() {
    this.proxies = [];
  }

  /**
   * 设置代理列表
   * @param {Array} proxies - 代理列表
   */
  setProxies(proxies) {
    this.proxies = proxies;
  }

  /**
   * 智能选择一个代理
   * @returns {Object|null} 选中的代理
   */
  selectProxy() {
    const now = Date.now();
    const activeProxies = this.proxies.filter(p => {
      if (p.status === 'cooldown') {
        return now - p.lastChecked > config.selection.cooldownTime;
      }
      return p.status === 'active';
    });

    if (activeProxies.length === 0) {
      return null;
    }

    // 按评分分组
    const scored = activeProxies.map(p => {
      const score = calculateScore(p);
      return {
        ...p,
        score,
        tier: getTier(score)
      };
    });

    // 根据配置比例选择
    const rand = Math.random();
    let targetTier;

    if (rand < config.selection.highTierRatio) {
      targetTier = 'high';
    } else if (rand < config.selection.highTierRatio + config.selection.midTierRatio) {
      targetTier = 'mid';
    } else {
      targetTier = 'low';
    }

    const tierProxies = scored.filter(p => p.tier === targetTier);
    if (tierProxies.length === 0) {
      // 回退到任意可用代理
      return scored[Math.floor(Math.random() * scored.length)];
    }

    return tierProxies[Math.floor(Math.random() * tierProxies.length)];
  }

  /**
   * 更新代理统计（成功）
   * @param {Object} proxy - 代理对象
   * @param {number} responseTime - 响应时间
   */
  recordSuccess(proxy, responseTime) {
    // 参数验证
    if (!proxy || typeof proxy.ip !== 'string' || typeof proxy.port !== 'number') {
      throw new Error('无效的代理对象');
    }
    if (typeof responseTime !== 'number' || responseTime < 0 || !Number.isFinite(responseTime)) {
      throw new Error('responseTime 必须是有效的非负数');
    }

    const p = this.proxies.find(p => p.ip === proxy.ip && p.port === proxy.port);
    if (p) {
      p.successCount = (p.successCount || 0) + 1;
      p.consecutiveFailures = 0;
      p.lastChecked = Date.now();

      // 更新平均响应时间
      if (p.avgResponseTime) {
        p.avgResponseTime = (p.avgResponseTime * 0.8) + (responseTime * 0.2);
      } else {
        p.avgResponseTime = responseTime;
      }
    }
  }

  /**
   * 更新代理统计（失败）
   * @param {Object} proxy - 代理对象
   */
  recordFailure(proxy) {
    // 参数验证
    if (!proxy || typeof proxy.ip !== 'string' || typeof proxy.port !== 'number') {
      throw new Error('无效的代理对象');
    }

    const p = this.proxies.find(p => p.ip === proxy.ip && p.port === proxy.port);
    if (p) {
      p.failCount = (p.failCount || 0) + 1;
      p.consecutiveFailures = (p.consecutiveFailures || 0) + 1;
      p.lastChecked = Date.now();

      // 连续失败次数过多，标记为冷却
      if (p.consecutiveFailures >= config.selection.maxFailures) {
        p.status = 'cooldown';
        console.warn(`[ProxyPool] 代理 ${p.ip}:${p.port} 进入冷却状态`);
      }
    }
  }

  /**
   * 获取代理池统计信息
   */
  getStats() {
    const active = this.proxies.filter(p => p.status === 'active').length;
    const cooldown = this.proxies.filter(p => p.status === 'cooldown').length;

    const avgScore = this.proxies.length > 0
      ? this.proxies.reduce((sum, p) => sum + calculateScore(p), 0) / this.proxies.length
      : 0;

    return {
      total: this.proxies.length,
      active,
      cooldown,
      averageScore: avgScore
    };
  }

  /**
   * 获取所有代理
   */
  getAllProxies() {
    return this.proxies;
  }
}

// 单例实例
export const proxyPool = new ProxyPool();
