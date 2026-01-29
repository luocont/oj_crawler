import request from 'superagent';
import config from './config.js';

/**
 * 验证IPv4地址格式
 * @param {string} ip - IP地址
 * @returns {boolean} 是否为有效的IPv4格式
 */
function isValidIPv4(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return false;
  }
  // 检查每个段是否在0-255范围内
  const segments = ip.split('.');
  return segments.every(seg => {
    const num = parseInt(seg, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * 验证端口号是否有效
 * @param {number} port - 端口号
 * @returns {boolean} 是否为有效端口
 */
function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 分类错误类型
 * @param {Error} error - 错误对象
 * @returns {Object} { type, message }
 */
function classifyFetchError(error) {
  const errMsg = error.message || '';

  // 超时错误
  if (error.timeout || errMsg.includes('timeout') || errMsg.includes('timed out') || error.code === 'ETIMEDOUT') {
    return {
      type: 'TIMEOUT',
      message: '请求超时'
    };
  }

  // 连接错误
  if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
    return {
      type: 'CONNECTION_ERROR',
      message: `连接错误: ${error.code}`
    };
  }

  // DNS解析错误
  if (error.code === 'ENOTFOUND' || errMsg.includes('ENOTFOUND')) {
    return {
      type: 'DNS_ERROR',
      message: 'DNS解析失败'
    };
  }

  // HTTP错误
  if (error.status) {
    return {
      type: 'HTTP_ERROR',
      message: `HTTP错误: ${error.status}`
    };
  }

  // 默认错误
  return {
    type: 'UNKNOWN_ERROR',
    message: errMsg || '未知错误'
  };
}

/**
 * 从单个源获取代理
 * @param {string} source - 代理源URL
 * @returns {Promise<Array>} 代理列表
 */
async function fetchFromSource(source) {
  try {
    console.log(`[ProxyFetcher] 正在从 ${source} 获取代理...`);

    const res = await request
      .get(source)
      .timeout(config.fetch.timeout)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    if (!res.ok) {
      console.warn(`[ProxyFetcher] 获取失败: HTTP ${res.status} ${res.statusText || ''}`);
      return [];
    }

    // 验证响应内容
    if (!res.text || typeof res.text !== 'string') {
      console.warn(`[ProxyFetcher] 响应内容格式异常`);
      return [];
    }

    // ProxyScrape返回格式: "IP:PORT\nIP:PORT\n..."
    const lines = res.text.trim().split('\n');

    const proxies = lines
      .filter(line => line.includes(':'))
      .map(line => {
        try {
          const parts = line.split(':');
          if (parts.length < 2) return null;

          const ip = parts[0].trim();
          const port = parseInt(parts[1].trim(), 10);

          if (!isValidIPv4(ip) || !isValidPort(port)) {
            return null;
          }

          return {
            ip: ip,
            port: port,
            protocol: 'http',
            source: 'proxyscrape'
          };
        } catch (e) {
          console.warn(`[ProxyFetcher] 解析代理行失败: ${line}`, e.message);
          return null;
        }
      })
      .filter(p => p !== null);

    console.log(`[ProxyFetcher] 从 ${source} 获取到 ${proxies.length} 个有效代理`);
    return proxies;

  } catch (error) {
    const { type, message } = classifyFetchError(error);
    console.error(`[ProxyFetcher] 从 ${source} 获取代理时出错 [${type}]: ${message}`);
    return [];
  }
}

/**
 * 从ProxyScrape API获取免费代理列表
 * @returns {Promise<Array>} 代理列表 [{ ip, port, protocol, source }]
 */
export async function fetchProxies() {
  // 参数验证
  if (!config.proxySources || !Array.isArray(config.proxySources) || config.proxySources.length === 0) {
    console.error('[ProxyFetcher] 代理源配置为空');
    return [];
  }

  const results = [];
  const errors = [];

  // 使用Promise.allSettled并行获取所有源的代理，提高效率
  const fetchPromises = config.proxySources.map(async (source) => {
    return await fetchFromSource(source);
  });

  const settledResults = await Promise.allSettled(fetchPromises);

  settledResults.forEach((result, index) => {
    const source = config.proxySources[index];
    if (result.status === 'fulfilled') {
      results.push(...result.value);
    } else {
      errors.push({
        source: source,
        error: result.reason?.message || '未知错误'
      });
    }
  });

  if (errors.length > 0) {
    console.warn(`[ProxyFetcher] ${errors.length} 个代理源获取失败:`);
    errors.forEach(err => {
      console.warn(`  - ${err.source}: ${err.error}`);
    });
  }

  console.log(`[ProxyFetcher] 总共获取到 ${results.length} 个代理`);

  // 如果所有源都失败且没有获取到任何代理，抛出错误
  if (results.length === 0 && errors.length === config.proxySources.length) {
    throw new Error('所有代理源均无法访问，请检查网络连接或代理源配置');
  }

  return results;
}
