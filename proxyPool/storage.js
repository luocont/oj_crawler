import fs from 'fs/promises';
import path from 'path';
import config from './config.js';

/**
 * 加载代理数据
 * @returns {Promise<Array>} 代理列表
 */
export async function loadProxies() {
  try {
    const filePath = path.resolve(config.storage.filePath);
    const data = await fs.readFile(filePath, 'utf-8');
    const proxies = JSON.parse(data);
    console.log(`[ProxyStorage] 从文件加载了 ${proxies.length} 个代理`);
    return proxies;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[ProxyStorage] 加载文件时出错:', error.message);
    }
    return [];
  }
}

/**
 * 保存代理数据
 * @param {Array} proxies - 代理列表
 * @returns {Promise<{success: boolean, error?: string}>} 保存结果
 */
export async function saveProxies(proxies) {
  // 参数验证
  if (!Array.isArray(proxies)) {
    return {
      success: false,
      error: 'proxies must be an array'
    };
  }

  try {
    const filePath = path.resolve(config.storage.filePath);
    const dir = path.dirname(filePath);

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(proxies, null, 2));
    console.log(`[ProxyStorage] 保存了 ${proxies.length} 个代理到文件`);
    return { success: true };
  } catch (error) {
    console.error('[ProxyStorage] 保存文件时出错:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 更新代理统计数据并保存
 * 注意：虽然函数名为 updateProxyStats，但主要功能是根据配置条件保存代理数据
 * 这样命名是为了与实现计划保持一致，便于其他模块调用
 * @param {Array} proxies - 代理列表
 * @returns {Promise<{success: boolean, error?: string}>} 保存结果，如果未自动保存则返回成功
 */
export async function updateProxyStats(proxies) {
  // 参数验证
  if (!Array.isArray(proxies)) {
    return {
      success: false,
      error: 'proxies must be an array'
    };
  }

  if (!config.storage.autoSave) {
    return { success: true };
  }
  return await saveProxies(proxies);
}
