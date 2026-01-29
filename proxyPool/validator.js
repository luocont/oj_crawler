import request from 'superagent';
import config from './config.js';

/**
 * 验证超时时间（单个代理）
 */
const VALIDATION_TIMEOUT = config.validation.timeout || 5000;

/**
 * 批量验证总超时时间（防止整个验证过程时间过长）
 */
const BATCH_VALIDATION_TIMEOUT = 60000; // 60秒

/**
 * 分类验证错误类型
 * @param {Error} error - 错误对象
 * @returns {string} 错误类型
 */
function classifyValidationError(error) {
  const errMsg = error.message || '';

  if (error.timeout || errMsg.includes('timeout') || error.code === 'ETIMEDOUT') {
    return 'TIMEOUT';
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
    return 'CONNECTION_ERROR';
  }
  if (error.code === 'ENOTFOUND') {
    return 'DNS_ERROR';
  }
  if (error.code === 'EPROXY') {
    return 'PROXY_ERROR';
  }
  if (errMsg.includes('tunneling socket')) {
    return 'TUNNEL_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

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
      errorType: 'INVALID_PARAMS',
      lastChecked: Date.now()
    };
  }

  const proxyUrl = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;

  try {
    const startTime = Date.now();
    const res = await request
      .get(config.validation.testUrl)
      .proxy(proxyUrl)
      .timeout(VALIDATION_TIMEOUT)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      .retry(0); // 禁用自动重试，避免延长验证时间

    const responseTime = Date.now() - startTime;

    if (res.ok) {
      return {
        ...proxy,
        isValid: true,
        responseTime,
        lastChecked: Date.now()
      };
    }

    // 响应不成功
    return {
      ...proxy,
      isValid: false,
      error: `HTTP ${res.status}`,
      errorType: 'HTTP_ERROR',
      lastChecked: Date.now()
    };
  } catch (error) {
    // 记录验证失败的错误信息
    const errorType = classifyValidationError(error);
    console.error(`[ProxyValidator] 代理验证失败 ${proxyUrl} [${errorType}]: ${error.message}`);

    return {
      ...proxy,
      isValid: false,
      error: error.message,
      errorType: errorType,
      lastChecked: Date.now()
    };
  }
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
  const errors = [];
  const startTime = Date.now();

  // 分块处理，控制并发数
  const chunks = [];
  for (let i = 0; i < proxies.length; i += config.validation.maxConcurrent) {
    chunks.push(proxies.slice(i, i + config.validation.maxConcurrent));
  }

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    // 检查总超时时间
    if (Date.now() - startTime > BATCH_VALIDATION_TIMEOUT) {
      console.warn(`[ProxyValidator] 批量验证超时（${BATCH_VALIDATION_TIMEOUT}ms），停止验证剩余代理`);
      break;
    }

    const chunk = chunks[chunkIndex];
    console.log(`[ProxyValidator] 正在验证第 ${chunkIndex + 1}/${chunks.length} 批 (${chunk.length} 个代理)...`);

    const promises = chunk.map(p => validateProxy(p));

    // 使用Promise.allSettled确保所有验证都完成，即使部分失败
    const chunkResults = await Promise.allSettled(promises);

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        if (result.value && result.value.isValid) {
          results.push(result.value);
        } else if (result.value && result.value.errorType) {
          // 记录但不是致命错误
          errors.push({
            proxy: `${result.value.ip}:${result.value.port}`,
            error: result.value.error,
            type: result.value.errorType
          });
        }
      } else {
        // Promise被reject的情况
        errors.push({
          error: result.reason?.message || '未知验证错误',
          type: 'PROMISE_REJECTED'
        });
      }
    }
  }

  const totalTime = Date.now() - startTime;
  const validCount = results.length;
  const invalidCount = proxies.length - validCount;

  console.log(`[ProxyValidator] 验证完成: ${validCount}/${proxies.length} 个代理可用 (耗时: ${totalTime}ms)`);

  // 输出错误统计
  if (errors.length > 0) {
    const errorStats = {};
    errors.forEach(err => {
      const type = err.type || 'UNKNOWN';
      errorStats[type] = (errorStats[type] || 0) + 1;
    });
    console.log(`[ProxyValidator] 错误统计:`, errorStats);
  }

  return results;
}
