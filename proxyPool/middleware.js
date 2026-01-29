import request from 'superagent';
import config from './config.js';
import { proxyPool } from './pool.js';
import { updateProxyStats } from './storage.js';

/**
 * 使用代理发起请求
 * @param {string} method - HTTP方法
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<Response>} 响应对象
 */
export async function proxyRequest(method, url, options = {}) {
  let lastError = null;
  let attempt = 0;

  while (attempt < config.retry.maxAttempts) {
    attempt++;

    // 选择代理
    const proxy = proxyPool.selectProxy();

    try {
      const startTime = Date.now();
      let req = request[method](url);

      if (proxy) {
        const proxyUrl = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
        req = req.proxy(proxyUrl);
        console.log(`[ProxyMiddleware] 使用代理 ${proxy.ip}:${proxy.port} (尝试 ${attempt}/${config.retry.maxAttempts})`);
      } else {
        console.log(`[ProxyMiddleware] 无可用代理，使用直连 (尝试 ${attempt}/${config.retry.maxAttempts})`);
      }

      // 添加选项
      if (options.query) req = req.query(options.query);
      if (options.data) req = req.send(options.data);
      if (options.headers) req = req.set(options.headers);
      if (options.timeout) req = req.timeout(options.timeout);

      const res = await req;
      const responseTime = Date.now() - startTime;

      // 记录成功
      if (proxy) {
        proxyPool.recordSuccess(proxy, responseTime);
        const saveResult = await updateProxyStats(proxyPool.getAllProxies());
        if (!saveResult.success) {
          console.warn('[ProxyMiddleware] 保存代理统计失败:', saveResult.error);
        }
      }

      return res;

    } catch (error) {
      lastError = error;

      // 记录失败
      if (proxy) {
        proxyPool.recordFailure(proxy);
        const saveResult = await updateProxyStats(proxyPool.getAllProxies());
        if (!saveResult.success) {
          console.warn('[ProxyMiddleware] 保存代理统计失败:', saveResult.error);
        }
      }

      console.warn(`[ProxyMiddleware] 请求失败: ${error.message}`);

      // 最后一次尝试且启用降级
      if (attempt >= config.retry.maxAttempts && config.retry.fallbackToDirect && proxy) {
        console.log('[ProxyMiddleware] 所有代理尝试失败，降级到直连');
        try {
          const res = await request[method](url);
          return res;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }
    }
  }

  throw lastError;
}

/**
 * GET请求快捷方法
 */
export async function proxyGet(url, options = {}) {
  return proxyRequest('get', url, options);
}

/**
 * POST请求快捷方法
 */
export async function proxyPost(url, options = {}) {
  return proxyRequest('post', url, options);
}
