from selenium import webdriver
import requests
import pandas as pd
import time
import os
import json
import re
import csv
import urllib3
from collections import defaultdict
from typing import Dict, Optional, Any, List

# 禁用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
pd.set_option('max_colwidth', 100)


class CookieManager:
    """管理 Cookie 获取和验证"""

    @staticmethod
    def get_cookies_from_browser(url='https://www.luogu.com.cn', wait_time=40) -> Optional[Dict[str, str]]:
        """从浏览器获取 cookies 并提取需要的值"""
        print("正在打开浏览器...")
        driver = webdriver.Edge()
        driver.get(url)
        print(f"请在 {wait_time} 秒内完成登录或其他操作...")
        time.sleep(wait_time)
        cookies_list = driver.get_cookies()
        needed_cookies = {}
        found_cookies = []
        for cookie in cookies_list:
            found_cookies.append(cookie['name'])
            if cookie['name'] == '__client_id':
                needed_cookies['__client_id'] = cookie['value']
            elif cookie['name'] == '_uid':
                needed_cookies['_uid'] = cookie['value']
            elif cookie['name'] == 'C3VK':
                needed_cookies['C3VK'] = cookie['value']
        driver.quit()
        print(f"\n找到的 cookies: {found_cookies}")
        print(f"\n提取的所需 cookies:")
        for key, value in needed_cookies.items():
            print(f"- {key}: {value[:50]}..." if len(str(value)) > 50 else f"- {key}: {value}")
        required_cookies = ['__client_id', '_uid', 'C3VK']
        missing = [c for c in required_cookies if c not in needed_cookies]

        if missing:
            print(f"\n警告：未找到以下 cookies: {missing}")
            print("可能需要登录或进行更多操作才能获取这些 cookies")
            return None
        return needed_cookies


class UserProfileScraper:
    """用户练习页面访问功能"""

    @staticmethod
    def generate_difficulty_statistics(parsed_data: Dict[str, Any], user_id: str) -> str:
        """
        生成难度统计CSV文件

        Args:
            parsed_data: 解析后的用户数据
            user_id: 用户ID

        Returns:
            生成的CSV文件路径
        """
        passed_problems = parsed_data.get('passed_problems', [])
        if not passed_problems:
            print("⚠️  没有已通过的题目，跳过统计")
            return None

        # 提取用户名,如果有的话
        username = parsed_data.get('username', '')

        # 难度映射表
        difficulty_names = {
            1: '入门',
            2: '普及-',
            3: '普及/提高-',
            4: '普及+/提高',
            5: '提高+/省选-',
            6: '省选/NOI-',
            7: 'NOI/NOI+/CTSC'
        }

        # 按难度分组
        difficulty_map = defaultdict(list)
        for problem in passed_problems:
            difficulty = problem.get('difficulty', 0)
            pid = problem.get('pid', '')
            if pid:
                difficulty_map[difficulty].append(pid)

        # 生成CSV文件 - 优先使用用户名,如果没有则使用用户ID
        if username:
            csv_filename = f'luogu_statistics_{username}.csv'
        else:
            csv_filename = f'luogu_statistics_{user_id}.csv'
        try:
            with open(csv_filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['难度', '过题数', '题目ID'])

                total = 0
                for difficulty in range(1, 8):
                    problems = difficulty_map.get(difficulty, [])
                    count = len(problems)
                    total += count
                    difficulty_name = difficulty_names.get(difficulty, f'难度{difficulty}')
                    problem_list = '; '.join(problems) if problems else '无'
                    writer.writerow([difficulty_name, count, problem_list])

                writer.writerow(['总计', total, f'全部 {total} 道题目'])

            # 提示使用的文件名来源
            name_source = f"用户名: {username}" if username else f"用户ID: {user_id}"
            print(f"\n✅ 统计CSV文件已生成: {csv_filename}")
            print(f"   (使用{name_source}命名)")

            # 显示统计信息
            print(f"\n📊 难度分布统计:")
            print("-" * 50)
            for difficulty in range(1, 8):
                count = len(difficulty_map.get(difficulty, []))
                percentage = (count / total * 100) if total > 0 else 0
                difficulty_name = difficulty_names.get(difficulty, f'难度{difficulty}')
                print(f"  {difficulty_name}: {count:3d} 道 ({percentage:5.1f}%)")
            print("-" * 50)
            print(f"  总计: {total} 道")
            print("-" * 50)

            return csv_filename

        except Exception as e:
            print(f"❌ 生成统计CSV文件失败: {e}")
            return None

    @staticmethod
    def get_headers():
        """获取请求头"""
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': 'https://www.luogu.com.cn/',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }

    @staticmethod
    def get_user_practice(user_id: str, cookies: Dict[str, str]) -> Optional[requests.Response]:
        """获取用户练习页面数据"""
        url = f'https://www.luogu.com.cn/user/{user_id}/practice'
        headers = UserProfileScraper.get_headers()

        print(f"\n正在访问用户练习页面: {url}")
        print(f"用户ID: {user_id}")

        try:
            # 禁用 SSL 验证以避免证书问题
            response = requests.get(url, headers=headers, cookies=cookies, timeout=10, verify=False)
            return response
        except requests.exceptions.Timeout:
            print("❌ 请求超时，请检查网络连接")
            return None
        except requests.exceptions.RequestException as e:
            print(f"❌ 请求发生错误: {e}")
            return None

    @staticmethod
    def print_raw_response(response: requests.Response):
        """打印原始响应"""
        print("\n" + "="*60)
        print("📄 原始响应信息")
        print("="*60)
        print(f"状态码: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'Unknown')}")

        content_type = response.headers.get('Content-Type', '')

        print("\n" + "-"*60)
        print("响应内容预览 (前 500 字符):")
        print("-"*60)
        print(response.text[:500])

        if len(response.text) > 500:
            print(f"\n... (总共 {len(response.text)} 字符)")

        print("="*60)

    @staticmethod
    def parse_practice_response(response: requests.Response) -> Dict[str, Any]:
        """解析练习页面响应"""
        content_type = response.headers.get('Content-Type', '')
        result = {
            'user_id': '',
            'username': '',
            'statistics': {},
            'passed_problems': [],
            'submitted_problems': [],
            'raw_data': response.text,
            'status_code': response.status_code
        }

        # 尝试解析 JSON
        if 'application/json' in content_type:
            try:
                data = response.json()
                result['parsed_json'] = data
                print("\n✅ 检测到 JSON 响应，解析中...")

                # 根据实际的洛谷 API 响应结构来解析
                if isinstance(data, dict):
                    # 尝试提取用户信息
                    if 'user' in data:
                        user_data = data['user']
                        result['username'] = user_data.get('name', user_data.get('username', ''))
                        result['user_id'] = user_data.get('id', user_data.get('uid', ''))

                    # 尝试提取统计信息
                    if 'statistics' in data:
                        result['statistics'] = data['statistics']
                    elif 'passedProblems' in data:
                        result['statistics']['passed'] = data['passedProblems']
                    elif 'solved' in data:
                        result['statistics']['solved'] = data['solved']

                    # 尝试提取最近提交
                    if 'submissions' in data:
                        result['recent_submissions'] = data['submissions']
                    elif 'records' in data:
                        result['recent_submissions'] = data['records']

                return result
            except json.JSONDecodeError as e:
                print(f"⚠️  JSON 解析失败: {e}")
                print("将显示原始内容")
        elif 'text/html' in content_type:
            print("\n⚠️  检测到 HTML 响应")
            print("正在尝试从 HTML 中提取 JSON 数据...")

            # 尝试从 HTML 中提取 lentille-context 的 JSON 数据
            json_match = re.search(r'<script id="lentille-context" type="application/json">(.*?)</script>', response.text, re.DOTALL)
            if json_match:
                try:
                    json_str = json_match.group(1)
                    data = json.loads(json_str)
                    result['parsed_json'] = data
                    print("✅ 成功从 HTML 中提取 JSON 数据！")

                    # 提取用户信息
                    if 'data' in data and 'user' in data['data']:
                        user_data = data['data']['user']
                        result['user_id'] = user_data.get('uid', '')
                        result['username'] = user_data.get('name', '')
                        result['statistics'] = {
                            'passed_count': user_data.get('passedProblemCount', 0),
                            'submitted_count': user_data.get('submittedProblemCount', 0),
                            'ranking': user_data.get('ranking', 0),
                            'ccf_level': user_data.get('ccfLevel', 0),
                            'color': user_data.get('color', ''),
                        }

                    # 提取已通过的题目
                    if 'data' in data and 'passed' in data['data']:
                        result['passed_problems'] = data['data']['passed']
                        print(f"📊 已通过 {len(result['passed_problems'])} 道题目")

                    # 提试提交但未通过的题目
                    if 'data' in data and 'submitted' in data['data']:
                        result['submitted_problems'] = data['data']['submitted']
                        print(f"📝 提交但未通过 {len(result['submitted_problems'])} 道题目")

                except json.JSONDecodeError as e:
                    print(f"⚠️  从 HTML 提取 JSON 解析失败: {e}")

            # 尝试从 HTML 中提取一些基本信息
            if '<title>' in response.text:
                title_match = re.search(r'<title>(.*?)</title>', response.text)
                if title_match:
                    result['page_title'] = title_match.group(1).strip()

        return result

    @staticmethod
    def display_parsed_data(parsed_data: Dict[str, Any]):
        """展示解析后的数据"""
        print("\n" + "="*60)
        print("📊 解析后的数据")
        print("="*60)

        # 难度映射表
        difficulty_names = {
            1: '入门',
            2: '普及-',
            3: '普及/提高-',
            4: '普及+/提高',
            5: '提高+/省选-',
            6: '省选/NOI-',
            7: 'NOI/NOI+/CTSC'
        }

        def get_difficulty_name(difficulty):
            """获取难度名称"""
            return difficulty_names.get(difficulty, f'未知难度({difficulty})')

        # 显示用户信息
        if parsed_data.get('username'):
            print(f"\n👤 用户名: {parsed_data['username']}")
        if parsed_data.get('user_id'):
            print(f"🆔 用户ID: {parsed_data['user_id']}")
        if parsed_data.get('page_title'):
            print(f"📋 页面标题: {parsed_data['page_title']}")

        # 显示统计信息
        if parsed_data.get('statistics'):
            print(f"\n📈 统计信息:")
            stats = parsed_data['statistics']
            if 'passed_count' in stats:
                print(f"   ✅ 已通过题目: {stats['passed_count']} 道")
            if 'submitted_count' in stats:
                print(f"   📝 提交题目数: {stats['submitted_count']} 道")
            if 'ranking' in stats:
                print(f"   🏆 排名: #{stats['ranking']}")
            if 'color' in stats:
                print(f"   🎨 等级: {stats['color']}")

        # 显示已通过的题目（前10道）
        if parsed_data.get('passed_problems'):
            passed = parsed_data['passed_problems']
            print(f"\n✅ 已通过题目 (共 {len(passed)} 道，显示前 10 道):")
            for i, problem in enumerate(passed[:10], 1):
                pid = problem.get('pid', '')
                title = problem.get('title', '')
                difficulty = problem.get('difficulty', 0)
                difficulty_name = get_difficulty_name(difficulty)
                print(f"   {i}. {pid} - {title} ({difficulty_name})")
            if len(passed) > 10:
                print(f"   ... 还有 {len(passed) - 10} 道题目")

        # 显示提交但未通过的题目（前5道）
        if parsed_data.get('submitted_problems'):
            submitted = parsed_data['submitted_problems']
            print(f"\n📝 提交但未通过题目 (共 {len(submitted)} 道，显示前 5 道):")
            for i, problem in enumerate(submitted[:5], 1):
                pid = problem.get('pid', '')
                title = problem.get('title', '')
                difficulty = problem.get('difficulty', 0)
                difficulty_name = get_difficulty_name(difficulty)
                print(f"   {i}. {pid} - {title} ({difficulty_name})")
            if len(submitted) > 5:
                print(f"   ... 还有 {len(submitted) - 5} 道题目")

        print("="*60)


class LuoguScraperApp:
    """洛谷爬虫应用主类"""

    def __init__(self):
        self.cookies = None
        self.user_profile_scraper = UserProfileScraper()
        self.cookie_manager = CookieManager()

    def read_user_ids_from_file(self, file_path: str) -> List[str]:
        """从txt文件读取用户ID列表"""
        user_ids = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    # 跳过空行和注释行（以#开头）
                    if line and not line.startswith('#'):
                        user_ids.append(line)
            print(f"✅ 从文件中读取到 {len(user_ids)} 个用户ID")
            return user_ids
        except FileNotFoundError:
            print(f"❌ 文件不存在: {file_path}")
            return []
        except Exception as e:
            print(f"❌ 读取文件失败: {e}")
            return []

    def scrape_single_user(self, user_id: str, verbose: bool = True) -> bool:
        """爬取单个用户数据"""
        if verbose:
            print(f"\n{'='*60}")
            print(f"📊 正在爬取用户: {user_id}")
            print(f"{'='*60}")

        # 获取用户练习页面
        response = self.user_profile_scraper.get_user_practice(user_id, self.cookies)

        if response is None:
            print(f"❌ 用户 {user_id} 请求失败")
            return False

        # 解析响应
        parsed_data = self.user_profile_scraper.parse_practice_response(response)

        # 显示解析后的数据（可选）
        if verbose:
            self.user_profile_scraper.display_parsed_data(parsed_data)

        # 生成难度统计CSV文件
        if verbose:
            print("\n📊 正在生成难度统计...")
        csv_file = self.user_profile_scraper.generate_difficulty_statistics(parsed_data, user_id)
        if csv_file and verbose:
            print(f"💡 提示: 可以使用 Excel 或其他工具打开 {csv_file} 查看详细统计")

        return True

    def batch_scrape_users(self, user_ids: List[str], delay: float = 1.0):
        """批量爬取用户数据"""
        print(f"\n🚀 开始批量爬取 {len(user_ids)} 个用户数据")
        print(f"⏱️  请求间隔: {delay} 秒")
        print("="*60)

        success_count = 0
        failed_users = []

        for idx, user_id in enumerate(user_ids, 1):
            print(f"\n📈 进度: [{idx}/{len(user_ids)}]")

            if not user_id.isdigit():
                print(f"⚠️  跳过无效的用户ID: {user_id}")
                failed_users.append((user_id, "无效的用户ID格式"))
                continue

            success = self.scrape_single_user(user_id, verbose=True)
            if success:
                success_count += 1
            else:
                failed_users.append((user_id, "请求失败"))

            # 如果不是最后一个用户，添加延迟
            if idx < len(user_ids):
                print(f"\n⏳ 等待 {delay} 秒后继续...")
                time.sleep(delay)

        # 打印总结
        print("\n" + "="*60)
        print("📊 批量爬取完成！")
        print("="*60)
        print(f"✅ 成功: {success_count} 个用户")
        print(f"❌ 失败: {len(failed_users)} 个用户")

        if failed_users:
            print(f"\n失败的用户列表:")
            for user_id, reason in failed_users:
                print(f"  - {user_id}: {reason}")

        print("="*60)

    def batch_scrape_from_file(self, file_path: str = './user_ids.txt', delay: float = 1.0):
        """从txt文件批量爬取用户数据"""
        # 读取用户ID列表
        user_ids = self.read_user_ids_from_file(file_path)

        if not user_ids:
            print(f"❌ 未从 {file_path} 读取到有效的用户ID")
            return

        # 开始批量爬取
        self.batch_scrape_users(user_ids, delay=delay)

    def run(self):
        """运行应用"""
        print("🚀 启动洛谷用户数据爬取工具...")

        # 获取 cookies
        self.cookies = self.cookie_manager.get_cookies_from_browser()

        if not self.cookies:
            print("\n❌ 无法获取必要的 cookies，程序退出")
            return

        print("\n✅ Cookie 获取成功！")

        # 直接从user_ids.txt读取并批量爬取
        print("\n📂 正在读取 user_ids.txt...")
        self.batch_scrape_from_file('user_ids.txt', delay=1.0)

        print("\n👋 感谢使用，再见！")


def main():
    """主函数"""
    app = LuoguScraperApp()
    app.run()


if __name__ == "__main__":
    main()
