import request from 'superagent';
import config from './config.js';

/**
 * 验证单个代理的可用性
 * @param {Object} proxy - 代理对象 { ip, port, protocol }
 * @returns {Promise<Object>} 验证结果对象，包含 isValid 字段
 */
export async function validateProxy(proxy) {
  // 参数验证
  if (!proxy || !proxy.ip || !proxy.port || !proxy.protocol) {
    console.error('[ProxyValidator] 无效的代理参数:', proxy);
    return {
      ...proxy,
      isValid: false,
      error: 'Invalid proxy parameters: missing ip, port, or protocol',
      lastChecked: Date.now()
    };
  }

  const proxyUrl = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;

  try {
    const startTime = Date.now();
    const res = await request
      .get(config.validation.testUrl)
      .proxy(proxyUrl)
      .timeout(config.validation.timeout);

    const responseTime = Date.now() - startTime;

    if (res.ok) {
      return {
        ...proxy,
        isValid: true,
        responseTime,
        lastChecked: Date.now()
      };
    }
  } catch (error) {
    // 记录验证失败的错误信息
    console.error(`[ProxyValidator] 代理验证失败 ${proxyUrl}:`, error.message);
    return {
      ...proxy,
      isValid: false,
      error: error.message,
      lastChecked: Date.now()
    };
  }

  // 响应不成功
  return {
    ...proxy,
    isValid: false,
    error: 'Response not ok',
    lastChecked: Date.now()
  };
}

/**
 * 并发验证多个代理
 * @param {Array} proxies - 代理列表
 * @returns {Promise<Array>} 验证通过的代理列表
 */
export async function validateProxies(proxies) {
  // 空数组检查
  if (!proxies || proxies.length === 0) {
    console.log('[ProxyValidator] 代理列表为空，无需验证');
    return [];
  }

  console.log(`[ProxyValidator] 开始验证 ${proxies.length} 个代理...`);

  const results = [];
  const chunks = [];

  // 分块处理，控制并发数
  for (let i = 0; i < proxies.length; i += config.validation.maxConcurrent) {
    chunks.push(proxies.slice(i, i + config.validation.maxConcurrent));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(p => validateProxy(p));
    const chunkResults = await Promise.allSettled(promises);

    for (const result of chunkResults) {
      if (result.status === 'fulfilled' && result.value && result.value.isValid) {
        results.push(result.value);
      }
    }
  }

  console.log(`[ProxyValidator] 验证完成: ${results.length}/${proxies.length} 个代理可用`);
  return results;
}
