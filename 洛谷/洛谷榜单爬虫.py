from selenium import webdriver
import requests
import pandas as pd
import time
import os
import json
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
pd.set_option('max_colwidth', 100)
def get_cookies_from_browser(url='https://www.luogu.com.cn', wait_time=30):
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
def write_data(url_id, data):
    """将json数据以易读的形式储存"""
    with open(f'luogu_contest_{url_id}.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
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
    show_contest_sig(combined_data, contest_name)
    return combined_data
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
            import re
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


def main():
    """主函数"""
    cookies = get_cookies_from_browser()

    if not cookies:
        print("\n无法获取必要的 cookies，程序退出")
        return

    inf = {
        '提高组周赛4': {
            'url_id': '292131',
            'pages': 1  # 指定要爬取的前page页
        },
        '提高组周赛2': {
            'url_id': '290059',
            'pages': 1
        },
        '提高组周赛3': {
            'url_id': '291482',
            'pages': 1
        },
        '提高组周赛1': {
            'url_id': '288335',
            'pages': 1
        },
    }

    print("\n===== 开始爬取比赛数据 =====")
    for contest_name, info in inf.items():
        print(f"\n正在爬取榜单 {contest_name} 内容，共 {info['pages']} 页！")
        get_data(url_id=info['url_id'], cookie=cookies, contest_name=contest_name, num=info['pages'])

    print("\n===== 所有任务完成 =====")


if __name__ == "__main__":
    main()