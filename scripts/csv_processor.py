#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV处理模块
负责加载、修改、保存比赛成绩CSV文件
"""

import csv
import os
from typing import Optional, List, Dict, Any


class ContestCSVProcessor:
    """比赛成绩CSV处理器"""

    # 成绩列名前缀
    SCORE_COLUMN_PREFIX = "第"
    SCORE_COLUMN_SUFFIX = "场成绩"

    # 用户信息列的列名（在CSV中的表头）
    COL_NAME = "姓名"
    COL_STUDENT_ID = "学号"
    COL_NOWCODER_ID = "牛客ID"
    COL_NOWCODER_USERNAME = "牛客账号名"

    # 未参加标记
    NOT_PARTICIPATED_MARK = "未出题"

    def __init__(self, csv_path: str):
        """
        初始化CSV处理器

        Args:
            csv_path: CSV文件路径
        """
        self.csv_path = csv_path
        self.rows: List[List[str]] = []
        self.headers: List[str] = []
        self.col_mapping: Dict[str, int] = {}  # 列名 -> 列索引的映射

    def load_csv(self) -> bool:
        """
        加载CSV文件

        Returns:
            加载成功返回True，失败返回False
        """
        if not os.path.exists(self.csv_path):
            print(f"错误: CSV文件不存在: {self.csv_path}")
            return False

        try:
            with open(self.csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.reader(f)
                self.rows = list(reader)

            if not self.rows:
                print("错误: CSV文件为空")
                return False

            # 第一行是表头
            self.headers = self.rows[0]
            self._build_column_mapping()

            # 验证必需的列是否存在
            required_cols = [self.COL_NAME, self.COL_STUDENT_ID,
                           self.COL_NOWCODER_ID, self.COL_NOWCODER_USERNAME]
            missing_cols = [col for col in required_cols if col not in self.col_mapping]

            if missing_cols:
                print(f"错误: CSV缺少必需的列: {', '.join(missing_cols)}")
                return False

            print(f"CSV加载成功，共 {len(self.rows) - 1} 个用户")
            return True

        except Exception as e:
            print(f"加载CSV失败: {e}")
            return False

    def _build_column_mapping(self):
        """构建列名到列索引的映射"""
        self.col_mapping = {}
        for idx, header in enumerate(self.headers):
            self.col_mapping[header] = idx

    def find_user_row(self, user_id: str, username: str) -> Optional[int]:
        """
        根据牛客ID或用户名查找用户所在行

        Args:
            user_id: 牛客用户ID
            username: 牛客用户名

        Returns:
            找到返回行索引（从1开始，跳过表头），未找到返回None
        """
        # 优先用牛客ID匹配
        if user_id:
            id_col_idx = self.col_mapping.get(self.COL_NOWCODER_ID)
            if id_col_idx is not None:
                for row_idx, row in enumerate(self.rows[1:], start=1):
                    if row[id_col_idx] == user_id:
                        return row_idx

        # 备用：用用户名匹配
        if username:
            name_col_idx = self.col_mapping.get(self.COL_NOWCODER_USERNAME)
            if name_col_idx is not None:
                for row_idx, row in enumerate(self.rows[1:], start=1):
                    if row[name_col_idx] == username:
                        return row_idx

        return None

    def get_user_info(self, row_idx: int) -> Dict[str, str]:
        """
        获取指定行用户的基本信息

        Args:
            row_idx: 行索引（从1开始）

        Returns:
            用户信息字典
        """
        row = self.rows[row_idx]
        return {
            "name": row[self.col_mapping[self.COL_NAME]],
            "student_id": row[self.col_mapping[self.COL_STUDENT_ID]],
            "nowcoder_id": row[self.col_mapping[self.COL_NOWCODER_ID]],
            "username": row[self.col_mapping[self.COL_NOWCODER_USERNAME]],
        }

    def get_score_column_name(self, col_num: int) -> str:
        """
        获取成绩列名

        Args:
            col_num: 场次编号（从1开始）

        Returns:
            成绩列名，如"第一场成绩"
        """
        # 中文数字映射
        chinese_nums = ["零", "一", "二", "三", "四", "五", "六", "七",
                        "八", "九", "十", "十一", "十二", "十三", "十四", "十五"]

        if col_num <= len(chinese_nums):
            chinese_num = chinese_nums[col_num]
        else:
            chinese_num = str(col_num)

        return f"{self.SCORE_COLUMN_PREFIX}{chinese_num}{self.SCORE_COLUMN_SUFFIX}"

    def find_next_score_column(self, contest_name: str) -> Optional[int]:
        """
        找到下一个可用的成绩列编号，直接使用比赛名作为列名

        Args:
            contest_name: 比赛名称（将用作列名）

        Returns:
            成绩列的编号（从1开始），如果失败返回None
        """
        # 检查是否已经存在该比赛名称的列
        if contest_name in self.col_mapping:
            # 已存在，直接复用该列
            return self.col_mapping[contest_name]

        # 不存在，添加新列
        self.headers.append(contest_name)
        for row in self.rows[1:]:
            row.append("")
        self._build_column_mapping()

        # 返回新增列的编号（现有成绩列数 + 1）
        score_col_count = sum(1 for h in self.headers if h not in [
            self.COL_NAME, self.COL_STUDENT_ID, self.COL_NOWCODER_ID, self.COL_NOWCODER_USERNAME, "学院", "班级"
        ])
        return score_col_count

    def mark_all_users_as_not_participated(self, col_num: int):
        """
        将所有用户的成绩标记为"未参加"

        Args:
            col_num: 成绩列编号（从1开始，但这里直接用比赛名列）
        """
        # 直接使用比赛名作为列名获取列索引
        # col_num 实际上是成绩列的数量，我们需要找到对应的成绩列
        # 这里简化：直接使用最后一个添加的列（比赛名列）
        col_name = self.headers[-1]
        col_idx = self.col_mapping.get(col_name)

        if col_idx is None:
            return

        for row in self.rows[1:]:
            row[col_idx] = self.NOT_PARTICIPATED_MARK

    def update_score(self, row_idx: int, col_num: int, score: str):
        """
        更新指定用户的成绩

        Args:
            row_idx: 行索引（从1开始）
            col_num: 成绩列编号（从1开始，实际未使用，直接用比赛名列）
            score: 成绩字符串，格式为"过题数(罚时)"
        """
        # 直接使用最后一个列（比赛名列）
        col_name = self.headers[-1]
        col_idx = self.col_mapping.get(col_name)

        if col_idx is not None and 0 <= row_idx < len(self.rows):
            self.rows[row_idx][col_idx] = score

    def save_csv(self) -> bool:
        """
        保存CSV文件（直接覆盖原文件，不备份）

        Returns:
            保存成功返回True，失败返回False
        """
        try:
            # 直接保存文件（使用UTF-8 BOM编码，确保Excel能正确打开）
            with open(self.csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f)
                writer.writerows(self.rows)

            return True

        except PermissionError:
            print("错误: 文件被占用，请关闭Excel后重试")
            return False
        except Exception as e:
            print(f"保存失败: {e}")
            return False
