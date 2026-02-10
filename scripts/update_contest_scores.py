#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
牛客比赛成绩更新脚本
功能：获取比赛榜单数据，匹配CSV用户，更新成绩列
"""

import sys
import os

# 添加当前目录到路径，以便导入本地模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_client import NowCoderContestAPI
from csv_processor import ContestCSVProcessor


def calculate_penalty(time_cost_seconds: int) -> int:
    """
    计算罚时（分钟，四舍五入）

    Args:
        time_cost_seconds: API返回的罚时（秒）

    Returns:
        罚时（分钟）
    """
    if time_cost_seconds <= 0:
        return 0
    return round(time_cost_seconds / 60)


def format_score(solved: int, penalty: int) -> str:
    """
    格式化成绩为 "过题数(罚时)" 格式

    Args:
        solved: 过题数
        penalty: 罚时（分钟）

    Returns:
        格式化后的成绩字符串
    """
    return f"{solved}({penalty})"


def print_header():
    """打印程序头部"""
    print("=" * 60)
    print("牛客比赛成绩更新脚本")
    print("=" * 60)


def print_footer():
    """打印程序尾部"""
    print("=" * 60)


def process_contest(contest_id: str) -> bool:
    """
    处理单个比赛

    Args:
        contest_id: 比赛ID

    Returns:
        处理是否成功
    """
    # 1. 初始化API客户端并获取数据
    print(f"\n正在获取比赛 {contest_id} 的榜单数据...")
    api = NowCoderContestAPI()
    contest_data = api.get_contest_ranking(contest_id)

    if not contest_data:
        print("\n错误: 获取比赛数据失败，请检查:")
        print("  1. npm服务是否已启动 (http://localhost:8080)")
        print("  2. 比赛ID是否正确")
        print("\n可以先运行以下命令启动服务:")
        print("  npm start")
        return False

    # 显示比赛信息
    contest_info = api.get_contest_info(contest_data)
    print(f"\n✓ 成功获取: {contest_info['contestName']}")
    print(f"✓ 参赛人数: {contest_info['totalParticipants']}")

    # 2. 提取排名映射
    ranking_map = api.extract_ranking_map(contest_data)
    print(f"✓ 获取到 {len(ranking_map)} 个参赛用户的排名数据")

    if not ranking_map:
        print("\n警告: 没有获取到任何用户数据")
        return False

    # 3. 加载CSV
    csv_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "2026牛客寒假算法基础集训营缴费名单.csv"
    )

    print(f"\n正在加载CSV文件:")
    print(f"  {csv_path}")

    processor = ContestCSVProcessor(csv_path)

    if not processor.load_csv():
        print("\n错误: 加载CSV失败，请检查文件路径")
        return False

    # 4. 找到下一个成绩列
    contest_name = contest_info['contestName']
    next_score_col = processor.find_next_score_column(contest_name)
    if next_score_col is None:
        print("\n错误: 无法确定成绩列位置")
        return False

    score_column_name = processor.get_score_column_name(next_score_col)
    print(f"✓ 将更新列: {score_column_name}")

    # 5. 先将所有用户标记为"未参加"
    processor.mark_all_users_as_not_participated(next_score_col)
    print(f"✓ 已将所有用户初始化为'未参加'")

    # 6. 匹配用户并更新成绩
    matched_count = 0
    unmatched_users = []
    skipped_count = 0

    print("\n开始匹配用户并更新成绩...")
    print("-" * 60)

    for user_id, user_data in ranking_map.items():
        row_idx = processor.find_user_row(user_id, user_data["username"])

        if row_idx is not None:
            # 计算成绩
            solved = user_data.get("solved", 0)
            time_cost = user_data.get("timeCost", 0)
            penalty = calculate_penalty(time_cost)
            score_str = format_score(solved, penalty)

            # 获取用户信息用于显示
            user_info = processor.get_user_info(row_idx)
            name = user_info.get("name", "")
            student_id = user_info.get("student_id", "")

            # 更新成绩
            processor.update_score(row_idx, next_score_col, score_str)
            matched_count += 1

            # 显示进度
            print(f"✓ {name}({student_id}): {score_str}")
        else:
            unmatched_users.append(f"{user_data['username']}({user_id})")

    # 检查CSV中有用户但榜单中找不到的（已自动标记为"未参加"）
    csv_user_count = len(processor.rows) - 1
    not_participated_count = csv_user_count - matched_count

    # 7. 显示统计信息
    print("\n" + "-" * 60)
    print(f"✓ 匹配成功: {matched_count} 人")
    if not_participated_count > 0:
        print(f"  - 未参加: {not_participated_count} 人（已自动标记为'未参加'）")
    print(f"✗ 榜单未匹配: {len(unmatched_users)} 人（榜单中有但CSV中找不到）")

    if unmatched_users:
        print("\n未匹配用户列表 (榜单中有但CSV中找不到):")
        display_count = min(10, len(unmatched_users))
        for user in unmatched_users[:display_count]:
            print(f"  - {user}")
        if len(unmatched_users) > display_count:
            print(f"  ... 还有 {len(unmatched_users) - display_count} 人")

    # 8. 直接保存CSV
    print("\n" + "-" * 60)
    print("正在保存到CSV文件...")
    if processor.save_csv():
        print(f"\n✓ 成功保存到: {csv_path}")
        print(f"✓ 已更新列: {score_column_name}")
        print(f"✓ 更新了 {matched_count} 个用户的成绩")
        if not_participated_count > 0:
            print(f"✓ 标记了 {not_participated_count} 个用户为'未参加'")
        return True
    else:
        print("\n✗ 保存失败，请检查文件是否被其他程序占用")
        return False


def main():
    """主流程"""
    print_header()
    print("输入比赛ID进行爬取，输入 'exit' 退出程序")

    csv_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "2026牛客寒假算法基础集训营缴费名单.csv"
    )
    print(f"\n当前使用的CSV文件: {csv_path}")

    contest_count = 0

    while True:
        print("\n" + "=" * 60)
        contest_id = input("请输入比赛ID (输入 'exit' 退出): ").strip()

        # 检查是否退出
        if contest_id.lower() == "exit":
            print("\n退出程序...")
            break

        if not contest_id:
            print("错误: 比赛ID不能为空")
            continue

        # 处理比赛
        if process_contest(contest_id):
            contest_count += 1
            print(f"\n✓ 第 {contest_count} 个比赛处理完成!")

    print_footer()
    print(f"\n总计处理了 {contest_count} 个比赛")
    print("再见!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n用户中断操作")
        sys.exit(0)
    except Exception as e:
        print(f"\n发生错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
