import request from 'superagent';
import config from './config.js';
import { proxyPool } from './pool.js';
import { updateProxyStats } from './storage.js';

/**
 * 自定义错误类
 */
export class ProxyRequestError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'ProxyRequestError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * 错误代码枚举
 */
export const ErrorCode = {
  TIMEOUT: 'REQUEST_TIMEOUT',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_ERROR: 'DNS_ERROR',
  PROXY_ERROR: 'PROXY_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
  ALL_ATTEMPTS_FAILED: 'ALL_ATTEMPTS_FAILED'
};

/**
 * 判断错误类型并返回相应的错误代码和消息
 * @param {Error} error - 原始错误对象
 * @returns {Object} { code, message }
 */
function classifyError(error) {
  const errMsg = error.message || '';

  // 超时错误
  if (error.timeout || errMsg.includes('timeout') || errMsg.includes('timed out') || error.code === 'ETIMEDOUT') {
    return {
      code: ErrorCode.TIMEOUT,
      message: `请求超时: ${errMsg}`
    };
  }

  // 连接被拒绝
  if (error.code === 'ECONNREFUSED' || errMsg.includes('ECONNREFUSED')) {
    return {
      code: ErrorCode.CONNECTION_REFUSED,
      message: `连接被拒绝: ${errMsg}`
    };
  }

  // DNS解析错误
  if (error.code === 'ENOTFOUND' || errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
    return {
      code: ErrorCode.DNS_ERROR,
      message: `DNS解析失败: ${errMsg}`
    };
  }

  // 代理相关错误
  if (errMsg.includes('proxy') || errMsg.includes('Proxy') || error.code === 'ECONNRESET') {
    return {
      code: ErrorCode.PROXY_ERROR,
      message: `代理错误: ${errMsg}`
    };
  }

  // 网络错误
  if (error.code === 'ECONNRESET' || errMsg.includes('socket') || errMsg.includes('network')) {
    return {
      code: ErrorCode.NETWORK_ERROR,
      message: `网络错误: ${errMsg}`
    };
  }

  // HTTP错误
  if (error.status) {
    return {
      code: ErrorCode.HTTP_ERROR,
      message: `HTTP错误: ${error.status} ${errMsg}`
    };
  }

  // 默认错误
  return {
    code: ErrorCode.NETWORK_ERROR,
    message: `未知错误: ${errMsg}`
  };
}

/**
 * 使用代理发起请求
 * @param {string} method - HTTP方法
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<Response>} 响应对象
 */
export async function proxyRequest(method, url, options = {}) {
  // 参数验证
  if (!method || typeof method !== 'string') {
    throw new ProxyRequestError('HTTP方法不能为空', ErrorCode.INVALID_RESPONSE);
  }
  if (!url || typeof url !== 'string') {
    throw new ProxyRequestError('URL不能为空', ErrorCode.INVALID_RESPONSE);
  }

  let lastError = null;
  let attempt = 0;
  const errors = []; // 记录所有尝试的错误

  // 默认超时时间
  const defaultTimeout = options.timeout || config.fetch?.timeout || 10000;

  // 如果代理未启用，直接使用直连
  if (!config.enabled) {
    console.log('[ProxyMiddleware] 代理已禁用，使用直连模式');
    try {
      let req = request(method.toLowerCase(), url);
      if (options.query) req = req.query(options.query);
      if (options.data) req = req.send(options.data);
      if (options.headers) req = req.set(options.headers);
      req = req.timeout(defaultTimeout);

      const res = await req;
      return res;
    } catch (error) {
      const { code, message } = classifyError(error);
      throw new ProxyRequestError(message, code, error);
    }
  }

  while (attempt < config.retry.maxAttempts) {
    attempt++;

    // 选择代理
    const proxy = proxyPool.selectProxy();

    try {
      const startTime = Date.now();
      let req = request(method.toLowerCase(), url);

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

      // 设置超时（使用配置的超时时间）
      req = req.timeout(defaultTimeout);

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

      // 分类错误
      const { code, message } = classifyError(error);
      errors.push({ attempt, code, message, proxy: proxy ? `${proxy.ip}:${proxy.port}` : 'direct' });

      // 记录失败
      if (proxy) {
        proxyPool.recordFailure(proxy);
        const saveResult = await updateProxyStats(proxyPool.getAllProxies());
        if (!saveResult.success) {
          console.warn('[ProxyMiddleware] 保存代理统计失败:', saveResult.error);
        }
      }

      console.warn(`[ProxyMiddleware] 请求失败 (尝试 ${attempt}/${config.retry.maxAttempts}): [${code}] ${message}`);

      // 最后一次尝试且启用降级
      if (attempt >= config.retry.maxAttempts && config.retry.fallbackToDirect && proxy) {
        console.log('[ProxyMiddleware] 所有代理尝试失败，降级到直连');
        try {
          const fallbackReq = request(method.toLowerCase(), url).timeout(defaultTimeout);
          if (options.query) fallbackReq.query(options.query);
          if (options.data) fallbackReq.send(options.data);
          if (options.headers) fallbackReq.set(options.headers);

          const res = await fallbackReq;
          console.log('[ProxyMiddleware] 直连成功');
          return res;
        } catch (fallbackError) {
          const { code: fbCode, message: fbMessage } = classifyError(fallbackError);
          console.error(`[ProxyMiddleware] 直连也失败: [${fbCode}] ${fbMessage}`);
          lastError = fallbackError;
        }
      }
    }
  }

  // 所有尝试都失败，抛出详细的错误信息
  const errorSummary = errors.map(e =>
    `尝试${e.attempt}[${e.proxy}]: ${e.code} - ${e.message}`
  ).join('\n  ');

  const finalError = lastError ? classifyError(lastError) : { code: ErrorCode.ALL_ATTEMPTS_FAILED, message: '所有请求尝试均失败' };

  throw new ProxyRequestError(
    `所有请求尝试均失败 (${config.retry.maxAttempts}次):\n  ${errorSummary}`,
    finalError.code,
    lastError
  );
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
