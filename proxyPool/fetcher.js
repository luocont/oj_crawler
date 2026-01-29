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
 * 从ProxyScrape API获取免费代理列表
 * @returns {Promise<Array>} 代理列表 [{ ip, port, protocol, source }]
 */
export async function fetchProxies() {
  const results = [];

  for (const source of config.proxySources) {
    try {
      console.log(`[ProxyFetcher] 正在从 ${source} 获取代理...`);
      const res = await request.get(source).timeout(config.fetch.timeout);

      if (!res.ok) {
        console.warn(`[ProxyFetcher] 获取失败: ${res.status}`);
        continue;
      }

      // ProxyScrape返回格式: "IP:PORT\nIP:PORT\n..."
      const lines = res.text.trim().split('\n');
      const proxies = lines
        .filter(line => line.includes(':'))
        .map(line => {
          const [ip, port] = line.split(':');
          const parsedPort = parseInt(port.trim(), 10);
          return {
            ip: ip.trim(),
            port: parsedPort,
            protocol: 'http',
            source: 'proxyscrape'
          };
        })
        .filter(p => isValidIPv4(p.ip) && isValidPort(p.port));

      console.log(`[ProxyFetcher] 从 ${source} 获取到 ${proxies.length} 个代理`);
      results.push(...proxies);

    } catch (error) {
      console.error(`[ProxyFetcher] 从 ${source} 获取代理时出错:`, error.message);
    }
  }

  console.log(`[ProxyFetcher] 总共获取到 ${results.length} 个代理`);
  return results;
}
