// 代理池配置
export default {
  // 代理源API列表
  proxySources: [
    'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
  ],

  // 获取配置
  fetch: {
    timeout: 10000  // 请求超时时间（毫秒）
  },

  // 验证配置
  validation: {
    testUrl: 'http://httpbin.org/ip',
    timeout: 5000,
    maxConcurrent: 10
  },

  // 刷新配置
  refresh: {
    interval: 3600000,       // 1小时
    minProxies: 20,          // 最少可用代理数
    fetchOnStart: true       // 启动时获取
  },

  // 智能选择配置
  selection: {
    highTierRatio: 0.8,
    midTierRatio: 0.15,
    lowTierRatio: 0.05,
    maxFailures: 3,
    cooldownTime: 300000     // 5分钟
  },

  // 重试配置
  retry: {
    maxAttempts: 3,
    fallbackToDirect: true
  },

  // 存储配置
  storage: {
    filePath: './data/proxies.json',
    autoSave: true,
    saveInterval: 60000      // 1分钟
  }
};
