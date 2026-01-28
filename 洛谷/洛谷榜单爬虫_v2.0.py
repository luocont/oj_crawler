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


class ContestScraper:
    """比赛榜单爬取功能"""

    @staticmethod
    def write_data(url_id, data):
        """将json数据以易读的形式储存"""
        with open(f'luogu_contest_{url_id}.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def get_data(url_id, cookie, contest_name, num):
        """请求数据"""
        all_results = []
        contest_problems = []  # 用于存储比赛题目顺序

        for i in range(1, num + 1):
            api_url = f'https://www.luogu.com.cn/fe/api/contest/scoreboard/{url_id}?page={i}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': 'https://www.luogu.com.cn/contest/list',
                'X-Requested-With': 'XMLHttpRequest'
            }
            response = requests.get(api_url, headers=headers, cookies=cookie, timeout=10)
            if response.status_code == 200:
                print(f'成功获取第 {i} 页数据！')
                data = response.json()
                # 将当前页的结果添加到总列表中
                all_results.extend(data['scoreboard']['result'])
                # 获取题目顺序（只在第一次请求时获取）
                if i == 1 and 'scoreboard' in data and 'problems' in data['scoreboard']:
                    contest_problems = [p['id'] for p in data['scoreboard']['problems']]
                    print(f'获取到题目顺序: {contest_problems}')
            else:
                print(f'第 {i} 页请求失败。状态码: {response.status_code}')
                print(f'响应内容: {response.text}')
                return False
        combined_data = {
            'scoreboard': {
                'result': all_results,
                'problems': contest_problems  # 保存题目顺序
            }
        }
        ContestScraper.show_contest_sig(combined_data, contest_name)
        return combined_data

    @staticmethod
    def show_contest_sig(data, contest_name):
        """绘制一个比赛的榜单"""
        new_data = data['scoreboard']['result']

        # 获取题目顺序 - 如果API中有题目顺序就用，否则按出题习惯排序
        if 'problems' in data['scoreboard'] and data['scoreboard']['problems']:
            # 使用API返回的题目顺序
            all_problems = data['scoreboard']['problems']
            print(f'使用API题目顺序: {all_problems}')
        else:
            # 如果API没有题目顺序，则按出题习惯排序（字母+数字）
            problem_set = set()
            for result in new_data:
                problem_set.update(result['details'].keys())

            # 自定义排序：先按字母，再按数字
            def problem_key(problem):
                match = re.match(r'([A-Z]+)(\d*)', problem)
                if match:
                    letters = match.group(1)
                    num = int(match.group(2)) if match.group(2) else 0
                    return (letters, num)
                return (problem, 0)

            all_problems = sorted(problem_set, key=problem_key)
            print(f'使用自定义排序: {all_problems}')

        df_data = []
        for idx, result in enumerate(new_data):
            row = {
                '排名': idx + 1,
                '用户名': result['user']['name'],
                '总分': result['score']
            }
            for problem in all_problems:
                if problem in result['details']:
                    row[f'题目 {problem}'] = result['details'][problem]['score']
                else:
                    row[f'题目 {problem}'] = 0
            df_data.append(row)

        df = pd.DataFrame(df_data)
        csv_filename = f'luogu_contest_{contest_name}.csv'
        df.to_csv(csv_filename, index=False, encoding='utf-8-sig')
        print(f'榜单数据已保存到 {csv_filename}，共 {len(df_data)} 条记录')


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

        # 生成CSV文件
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

            print(f"\n✅ 统计CSV文件已生成: {csv_filename}")

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
    def save_response_to_file(user_id: str, response_text: str) -> str:
        """将响应保存到文件（已禁用JSON保存）"""
        # 不再保存JSON文件
        pass

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
        self.contest_scraper = ContestScraper()
        self.user_profile_scraper = UserProfileScraper()
        self.cookie_manager = CookieManager()

        # 比赛配置
        self.contest_config = {
            'JYU每日一题': {
                'url_id': '287100',
                'pages': 3
            },
        }

    def show_main_menu(self):
        """显示主菜单"""
        print("\n" + "="*50)
        print("🎯 洛谷数据爬取工具 v2.0")
        print("="*50)
        print("[1] 爬取比赛榜单")
        print("[2] 访问用户练习页面")
        print("[3] 退出程序")
        print("="*50)

    def get_menu_choice(self, max_choice: int) -> int:
        """获取用户菜单选择"""
        while True:
            try:
                choice = input("\n请选择功能 (1-{}): ".format(max_choice))
                choice_num = int(choice)
                if 1 <= choice_num <= max_choice:
                    return choice_num
                else:
                    print(f"❌ 请输入 1 到 {max_choice} 之间的数字")
            except ValueError:
                print("❌ 请输入有效的数字")

    def scrape_contest_scoreboard(self):
        """爬取比赛榜单"""
        print("\n📋 开始爬取比赛榜单...")
        print("-"*50)

        # 显示可用的比赛
        print("可用的比赛:")
        for idx, (name, info) in enumerate(self.contest_config.items(), 1):
            print(f"  {idx}. {name} (URL ID: {info['url_id']}, {info['pages']} 页)")

        print("\n开始爬取...")
        for contest_name, info in self.contest_config.items():
            print(f"\n📊 正在爬取榜单: {contest_name} (共 {info['pages']} 页)")
            result = self.contest_scraper.get_data(
                url_id=info['url_id'],
                cookie=self.cookies,
                contest_name=contest_name,
                num=info['pages']
            )
            if result:
                print(f"✅ {contest_name} 爬取完成！")
            else:
                print(f"❌ {contest_name} 爬取失败！")

        print("\n✅ 所有比赛榜单爬取完成！")

    def access_user_practice(self):
        """访问用户练习页面"""
        print("\n👤 访问用户练习页面")
        print("-"*50)

        while True:
            user_id = input("\n请输入用户ID (例如: 1455204, 输入 'q' 返回): ").strip()

            if user_id.lower() == 'q':
                return

            if not user_id:
                print("❌ 用户ID不能为空")
                continue

            # 验证用户ID格式（应该是数字）
            if not user_id.isdigit():
                print("❌ 用户ID应该是数字")
                continue

            # 获取用户练习页面
            response = self.user_profile_scraper.get_user_practice(user_id, self.cookies)

            if response is None:
                print("❌ 请求失败，请重试")
                continue

            # 打印原始响应
            self.user_profile_scraper.print_raw_response(response)

            # 解析响应
            parsed_data = self.user_profile_scraper.parse_practice_response(response)

            # 显示解析后的数据
            self.user_profile_scraper.display_parsed_data(parsed_data)

            # 自动生成难度统计CSV文件
            print("\n📊 正在生成难度统计...")
            csv_file = self.user_profile_scraper.generate_difficulty_statistics(parsed_data, user_id)
            if csv_file:
                print(f"💡 提示: 可以使用 Excel 或其他工具打开 {csv_file} 查看详细统计")

            # 询问是否继续
            continue_choice = input("\n是否继续查看其他用户？(y/n): ").strip().lower()
            if continue_choice != 'y':
                break

    def run(self):
        """运行应用"""
        print("🚀 启动洛谷数据爬取工具...")

        # 获取 cookies
        self.cookies = self.cookie_manager.get_cookies_from_browser()

        if not self.cookies:
            print("\n❌ 无法获取必要的 cookies，程序退出")
            return

        print("\n✅ Cookie 获取成功！")

        # 主循环
        while True:
            self.show_main_menu()
            choice = self.get_menu_choice(3)

            if choice == 1:
                # 爬取比赛榜单
                self.scrape_contest_scoreboard()
            elif choice == 2:
                # 访问用户练习页面
                self.access_user_practice()
            elif choice == 3:
                # 退出程序
                print("\n👋 感谢使用，再见！")
                break

            # 完成操作后暂停
            if choice in [1, 2]:
                input("\n按 Enter 键返回主菜单...")


# 为了保持向后兼容，保留原有的函数作为简单函数的别名
def get_cookies_from_browser(url='https://www.luogu.com.cn', wait_time=40):
    """从浏览器获取 cookies（向后兼容函数）"""
    return CookieManager.get_cookies_from_browser(url, wait_time)


def write_data(url_id, data):
    """将json数据以易读的形式储存（向后兼容函数）"""
    ContestScraper.write_data(url_id, data)


def get_data(url_id, cookie, contest_name, num):
    """请求数据（向后兼容函数）"""
    return ContestScraper.get_data(url_id, cookie, contest_name, num)


def show_contest_sig(data, contest_name):
    """绘制一个比赛的榜单（向后兼容函数）"""
    ContestScraper.show_contest_sig(data, contest_name)


def main():
    """主函数"""
    app = LuoguScraperApp()
    app.run()


if __name__ == "__main__":
    main()
