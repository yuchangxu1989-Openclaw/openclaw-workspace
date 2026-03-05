#!/usr/bin/env python3
"""
智谱 AI Embedding 服务
使用 GLM Embedding-3 模型进行文本向量化
固定1024维
"""

import os
import sys
import json
import requests
from typing import List, Union

class ZhipuEmbedding:
    """智谱 AI Embedding 服务"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('ZHIPU_API_KEY', 'a474ebc9588a46498513e4d6867dd0ac.VFMTRb6hz89NN8JC')
        self.base_url = 'https://open.bigmodel.cn/api/coding/paas/v4'
        self.model = 'embedding-3'
        self.dimensions = 1024  # 固定使用1024维
    
    def embed(self, text: Union[str, List[str]], dimensions: int = None) -> dict:
        """
        文本向量化
        
        Args:
            text: 单个文本或文本列表
            dimensions: 输出维度 (固定1024)
            
        Returns:
            {
                'embeddings': [[...], ...],
                'dimensions': 1024,
                'model': 'embedding-3',
                'usage': {'prompt_tokens': 11, 'total_tokens': 11}
            }
        """
        if isinstance(text, str):
            text = [text]
        
        # 固定使用1024维
        dims = 1024
        
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': self.model,
            'input': text,
            'dimensions': dims
        }
        
        try:
            response = requests.post(
                f'{self.base_url}/embeddings',
                headers=headers,
                json=data,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                'embeddings': [item['embedding'] for item in result['data']],
                'dimensions': dims,
                'model': result['model'],
                'usage': result['usage']
            }
        except Exception as e:
            return {'error': str(e)}
    
    def similarity(self, text1: str, text2: str) -> float:
        """计算两个文本的相似度"""
        result = self.embed([text1, text2])
        if 'error' in result:
            return 0.0
        
        vec1 = result['embeddings'][0]
        vec2 = result['embeddings'][1]
        
        # 余弦相似度
        dot = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(a * a for a in vec2) ** 0.5
        
        return dot / (norm1 * norm2) if norm1 * norm2 > 0 else 0.0

def main():
    """测试"""
    print('=== 智谱 AI Embedding 服务 (1024维) ===\n')
    
    embedder = ZhipuEmbedding()
    
    # 测试1: 单文本向量化
    print('测试1: 单文本向量化 (1024维)')
    result = embedder.embed('测试智谱AI向量化API')
    if 'error' not in result:
        print(f'  ✓ 向量维度: {result["dimensions"]}')
        print(f'  ✓ 向量长度: {len(result["embeddings"][0])}')
        print(f'  ✓ Token使用: {result["usage"]["total_tokens"]}')
    else:
        print(f'  ✗ 错误: {result["error"]}')
    
    print()
    
    # 测试2: 相似度计算
    print('测试2: 相似度计算')
    sim = embedder.similarity(
        'OpenClaw是一个AI助手平台',
        'OpenClaw提供智能助手服务'
    )
    print(f'  ✓ 相似度: {sim:.4f}')
    
    print()
    
    # 测试3: 批量向量化
    print('测试3: 批量向量化 (1024维)')
    texts = [
        'CRAS认知进化伙伴',
        'ISC智能标准中心',
        'CARS意图洞察仪表盘'
    ]
    result = embedder.embed(texts)
    if 'error' not in result:
        print(f'  ✓ 批量处理: {len(result["embeddings"])} 个文本')
        print(f'  ✓ 每个维度: {len(result["embeddings"][0])}')
    
    print('\n=== 测试完成 ===')

if __name__ == '__main__':
    main()
