#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
牛客比赛榜单API客户端
负责与npm服务通信，获取比赛榜单数据
"""

import requests
from typing import Optional, Dict, Any


class NowCoderContestAPI:
    """牛客比赛榜单API客户端"""

    def __init__(self, base_url: str = "http://localhost:8080"):
        """
        初始化API客户端

        Args:
            base_url: npm服务基础URL
        """
        self.base_url = base_url.rstrip('/')

    def get_contest_ranking(self, contest_id: str) -> Optional[Dict[str, Any]]:
        """
        获取比赛榜单数据

        Args:
            contest_id: 比赛ID

        Returns:
            榜单JSON数据，失败返回None
        """
        url = f"{self.base_url}/api/nowcoder/contest/{contest_id}"
        try:
            response = requests.get(url, timeout=180)
            response.raise_for_status()
            data = response.json()

            if data.get("success"):
                return data

            print(f"API返回失败: {data.get('message', '未知错误')}")
            return None

        except requests.exceptions.ConnectionError:
            print(f"连接失败: 无法连接到 {self.base_url}")
            print("请确保npm服务已启动: npm start")
            return None
        except requests.exceptions.Timeout:
            print("请求超时: 服务器响应时间过长")
            return None
        except requests.exceptions.HTTPError as e:
            print(f"HTTP错误: {e}")
            return None
        except ValueError as e:
            print(f"JSON解析失败: {e}")
            return None
        except Exception as e:
            print(f"API请求失败: {e}")
            return None

    def extract_ranking_map(self, contest_data: Dict) -> Dict[str, Dict]:
        """
        从API数据中提取用户排名映射

        Args:
            contest_data: API返回的比赛数据

        Returns:
            {userId: {'username': xxx, 'solved': n, 'timeCost': n}, ...}
        """
        ranking_map = {}

        for user in contest_data.get("data", {}).get("rankList", []):
            ranking_map[user["userId"]] = {
                "username": user.get("username", ""),
                "solved": user.get("solved", 0),
                "timeCost": user.get("timeCost", 0)
            }

        return ranking_map

    def get_contest_info(self, contest_data: Dict) -> Dict[str, Any]:
        """
        获取比赛基本信息

        Args:
            contest_data: API返回的比赛数据

        Returns:
            比赛信息字典
        """
        data = contest_data.get("data", {})
        return {
            "contestId": contest_data.get("contestId", ""),
            "contestName": data.get("contestName", "未知比赛"),
            "totalParticipants": data.get("totalParticipants", 0)
        }
