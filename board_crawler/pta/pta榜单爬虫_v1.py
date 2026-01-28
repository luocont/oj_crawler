
# -*- coding: utf-8 -*-
"""
PTA榜单爬虫完整版 - 手动登录获取cookies并爬取榜单数据
整合了:
1. 手动登录获取cookies功能(cookies保存为变量,不写入JSON文件)
2. 榜单数据爬取功能
3. 直接保存为CSV文件
"""

import requests
import pandas as pd
import json
import time
import os
from datetime import datetime
from collections import defaultdict
from selenium import webdriver
import csv

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
pd.set_option('max_colwidth', 100)


class PTArankingscraper:
    """PTA榜单爬虫类"""

    def __init__(self, cookies=None):
        self.cookies = cookies
        self.problem_set_id = None
        self.limit_per_page = 50
        self.max_pages = None

    def get_cookies_from_pintia(self, url='https://pintia.cn/problem-sets/dashboard', wait_time=30):
        """从浏览器获取 pintia.cn 的 cookies"""
        print("正在打开浏览器...")
        driver = webdriver.Edge()

        try:
            driver.get(url)
            print(f"请在 {wait_time} 秒内完成登录或其他操作...")
            print("提示:请确保登录成功后再等待")
            time.sleep(wait_time)

            cookies_list = driver.get_cookies()
            all_cookies = {}
            for cookie in cookies_list:
                all_cookies[cookie['name']] = cookie['value']

            print(f"\n找到的所有 cookies: {list(all_cookies.keys())}")
            print(f"\n成功获取 {len(all_cookies)} 个 cookies")
            important_cookies = ['JSESSIONID', 'SESSION', 'token', 'csrf_token', 'auth_token', 'pintia-session']
            print("\n重要 cookies 状态:")
            for cookie_name in important_cookies:
                if cookie_name in all_cookies:
                    value = all_cookies[cookie_name]
                    print(f"- {cookie_name}: {value[:20]}..." if len(str(value)) > 20 else f"- {cookie_name}: {value}")

            self.cookies = all_cookies
            return all_cookies

        except Exception as e:
            print(f"获取 cookies 时出错: {e}")
            return None
        finally:
            driver.quit()

    def set_cookies(self, cookies):
        """设置 cookies"""
        if cookies:
            print(f"成功设置 cookies,包含 {len(cookies)} 个字段")
            print(f"cookies 字段: {list(cookies.keys())}")
            self.cookies = cookies
            return True
        else:
            print("错误: cookies 为空")
            return False

    def test_cookies(self):
        """测试cookies是否有效"""
        if not self.cookies:
            return False

        test_url = 'https://pintia.cn/api/status'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': 'https://pintia.cn/',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }

        try:
            response = requests.get(test_url, headers=headers, cookies=self.cookies, timeout=10)
            if response.status_code == 200:
                print("✓ Cookies 有效性验证成功!")
                return True
            else:
                print(f"✗ Cookies 可能已失效,状态码: {response.status_code}")
                return False
        except Exception as e:
            print(f"✗ 测试 cookies 时出错: {e}")
            return False

    def get_rankings(self):
        """获取PTA榜单数据"""
        if not self.cookies:
            print("错误:没有有效的 cookies")
            return None

        all_results = []
        page = 0
        problem_list = []
        raw_responses = []

        print(f"开始获取PTA榜单数据...")
        print(f"问题集ID: {self.problem_set_id}")
        print(f"每页限制: {self.limit_per_page}")

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': f'https://pintia.cn/problem-sets/{self.problem_set_id}',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'X-Requested-With': 'XMLHttpRequest'
        }

        while True:
            api_url = f'https://pintia.cn/api/problem-sets/{self.problem_set_id}/common-rankings?page={page}&limit={self.limit_per_page}'

            print(f"\n正在请求第 {page + 1} 页...")
            print(f"URL: {api_url}")

            try:
                response = requests.get(api_url, headers=headers, cookies=self.cookies, timeout=10)
                raw_response_data = {
                    'page': page,
                    'url': api_url,
                    'status_code': response.status_code,
                    'headers': dict(response.headers),
                    'cookies': dict(response.cookies),
                    'timestamp': datetime.now().isoformat()
                }

                if response.status_code == 200:
                    print(f'✓ 成功获取第 {page + 1} 页数据!')

                    # 尝试解析JSON
                    try:
                        data = response.json()
                        raw_response_data['json_data'] = data
                        raw_response_data['text'] = response.text
                    except json.JSONDecodeError as e:
                        print(f'JSON解析错误: {e}')
                        raw_response_data['text'] = response.text
                        raw_response_data['parse_error'] = str(e)
                    if 'commonRankings' not in data:
                        print(f"错误:响应中没有找到 commonRankings 字段")
                        print(f"响应内容: {json.dumps(data, ensure_ascii=False, indent=2)[:500]}...")
                        raw_responses.append(raw_response_data)
                        break

                    current_rankings = data.get('commonRankings', [])
                    if page == 0 and 'problemSet' in data and 'problems' in data['problemSet']:
                        problem_list = [p['id'] for p in data['problemSet']['problems']]
                        print(f'获取到题目列表: {problem_list}')

                    if not current_rankings:
                        print(f"第 {page + 1} 页没有数据,停止获取")
                        raw_responses.append(raw_response_data)
                        break

                    print(f"本页获取到 {len(current_rankings)} 条记录")
                    all_results.extend(current_rankings)

                    raw_responses.append(raw_response_data)
                    if self.max_pages and (page + 1) >= self.max_pages:
                        print(f"已达到最大页数 {self.max_pages},停止获取")
                        break
                    if len(current_rankings) < self.limit_per_page:
                        print("已获取所有数据")
                        break

                    page += 1
                    time.sleep(0.5)

                else:
                    print(f'✗ 第 {page + 1} 页请求失败')
                    print(f'状态码: {response.status_code}')
                    print(f'响应内容: {response.text[:500]}...')
                    raw_response_data['text'] = response.text
                    raw_responses.append(raw_response_data)
                    break

            except requests.exceptions.RequestException as e:
                print(f'请求异常: {e}')
                raw_response_data['error'] = str(e)
                raw_responses.append(raw_response_data)
                break

        print(f"\n总共获取到 {len(all_results)} 条记录")

        # 整合数据 - 即使没有获取到有效数据也要返回包含原始响应的数据
        combined_data = {
            'problemSetId': self.problem_set_id,
            'totalRecords': len(all_results),
            'problemList': problem_list,
            'commonRankings': all_results,
            'timestamp': datetime.now().isoformat(),
            'raw_responses': raw_responses
        }

        return combined_data

    def convert_to_csv(self, data, csv_filename=None):
        """将JSON数据转换为CSV文件"""
        if not data:
            print("错误:没有数据可转换")
            return None
        user_info = {}
        if 'raw_responses' in data:
            for raw_response in data['raw_responses']:
                raw_data = raw_response.get('json_data', {})
                page_user_info = raw_data.get('userById', {})
                user_info.update(page_user_info)
            print(f"成功合并 {len(user_info)} 个用户的昵称信息(来自 {len(data['raw_responses'])} 页数据)")

        # 收集所有题目ID
        all_problem_ids = set()
        rankings_data = []

        # 从commonRankings中收集排名数据
        for ranking in data.get('commonRankings', []):
            user_id = ranking['user']['userId']
            problem_scores = ranking.get('problemScoreByProblemSetProblemId', {})
            all_problem_ids.update(problem_scores.keys())
            rankings_data.append({
                'user_id': user_id,
                'rank': ranking.get('rank', 0),
                'total_score': ranking.get('totalScore', 0),
                'problem_scores': problem_scores
            })

        sorted_problem_ids = sorted(all_problem_ids, key=lambda x: int(x) if x.isdigit() else x)
        if not csv_filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            csv_filename = f'pta_rankings_{self.problem_set_id}_{timestamp}.csv'
        with open(csv_filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
            fieldnames = ['排名', '用户ID', '昵称', '总分'] + [f'题目{pid}' for pid in sorted_problem_ids]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            rankings_data.sort(key=lambda x: x['rank'])
            for ranking in rankings_data:
                user_id = ranking['user_id']
                user_name = user_info.get(user_id, {}).get('nickname', f'用户{user_id}')

                row = {
                    '排名': ranking['rank'],
                    '用户ID': user_id,
                    '昵称': user_name,
                    '总分': ranking['total_score']
                }

                for problem_id in sorted_problem_ids:
                    score = ranking['problem_scores'].get(problem_id, {}).get('score', 0)
                    row[f'题目{problem_id}'] = score

                writer.writerow(row)

        print(f"成功转换!共处理 {len(rankings_data)} 条记录,{len(sorted_problem_ids)} 道题目")
        print(f"CSV文件已保存至: {csv_filename}")

        if rankings_data:
            print("\n统计信息:")
            print(f"- 总人数: {len(rankings_data)}")
            print(f"- 题目数量: {len(sorted_problem_ids)}")
            print(f"- 最高分: {max(r['total_score'] for r in rankings_data)}")
            print(f"- 平均分: {sum(r['total_score'] for r in rankings_data) / len(rankings_data):.2f}")

        return csv_filename


    def run(self, problem_set_id, limit_per_page=50, max_pages=None, auto_login=False, wait_time=30):
        """运行爬虫

        Args:
            problem_set_id: PTA问题集ID
            limit_per_page: 每页记录数
            max_pages: 最大页数(None表示获取所有页)
            auto_login: 是否自动打开浏览器登录
            wait_time: 等待登录时间(秒)
        """
        self.problem_set_id = problem_set_id
        self.limit_per_page = limit_per_page
        self.max_pages = max_pages

        print("===== PTA榜单爬虫 - 完整版 =====\n")

        if auto_login or not self.cookies:
            if auto_login:
                print("选择手动登录获取cookies...")
            else:
                print("未提供cookies,需要手动登录获取...")

            self.get_cookies_from_pintia(wait_time=wait_time)
        else:
            print("使用已提供的cookies...")

            if not self.test_cookies():
                print("Cookies可能已失效,需要重新登录")
                choice = input("是否重新登录获取cookies?(y/n): ").lower()
                if choice == 'y':
                    self.get_cookies_from_pintia(wait_time=wait_time)
                else:
                    print("使用旧cookies继续...")

        if not self.cookies:
            print("错误:没有有效的cookies,程序退出")
            return

        # 2. 获取榜单数据
        print("\n===== 开始获取榜单数据 =====")
        rankings_data = self.get_rankings()

        if rankings_data:
            # 3. 转换为CSV
            print("\n===== 转换为CSV =====")
            csv_file = self.convert_to_csv(rankings_data)

            print("\n===== 任务完成 =====")
            print(f"✓ CSV表格文件: {csv_file}")
            print(f"✓ 总记录数: {rankings_data.get('totalRecords', 0)}")
        else:
            print("\n===== 获取数据失败 =====")


def main():
    """主函数"""
    global_cookies = None

    # 配置参数字典 - 可以配置多个榜单
    inf = {
        '练习1': {
            'problem_set_id': '1954541032373747712',
            'limit_per_page': 50,#每页爬取的人数
            'max_pages': None,  # None表示获取所有页
            'auto_login': True,  # 第一个任务自动登录获取cookies
            'wait_time': 30  # 登录等待时间(秒)
        },
        # '其他榜单': {
        #     'problem_set_id': '123456789',
        #     'limit_per_page': 50,
        #     'max_pages': 5,
        #     'auto_login': False,  # 后续任务复用cookies
        #     'wait_time': 30
        # },
    }

    print("===== PTA榜单爬虫 - 完整版 =====\n")
    print(f"配置了 {len(inf)} 个榜单任务\n")

    first_task = True
    for contest_name, config in inf.items():
        print(f"\n{'='*50}")
        print(f"开始爬取榜单: {contest_name}")
        print(f"问题集ID: {config['problem_set_id']}")
        print(f"每页记录数: {config['limit_per_page']}")
        print(f"最大页数: {config['max_pages'] if config['max_pages'] else '全部'}")
        print(f"{'='*50}\n")

        # 创建爬虫实例,传入全局cookies(如果已有)
        scraper = PTArankingscraper(cookies=global_cookies)

        # 运行爬虫
        scraper.run(
            problem_set_id=config['problem_set_id'],
            limit_per_page=config['limit_per_page'],
            max_pages=config['max_pages'],
            auto_login=config['auto_login'] if first_task else False,  # 只在第一个任务时可能需要登录
            wait_time=config['wait_time']
        )

        # 保存cookies供后续任务使用
        if scraper.cookies:
            global_cookies = scraper.cookies

        first_task = False
        print(f"\n榜单 '{contest_name}' 爬取完成!\n")

    print("\n===== 所有任务完成 =====")


if __name__ == "__main__":
    main()
