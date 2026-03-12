"""
skill-installer — SEEF第8子技能
封装ClawHub CLI，提供技能搜索/安装/更新能力
"""
import subprocess
import json


class SkillInstaller:
    """从ClawHub安装和管理技能"""
    
    def search(self, query):
        """搜索ClawHub技能市场"""
        try:
            result = subprocess.run(
                ['npx', 'clawhub', 'search', query],
                capture_output=True, text=True, timeout=30
            )
            return {'status': 'ok', 'output': result.stdout, 'error': result.stderr}
        except Exception as e:
            return {'status': 'error', 'error': str(e)}
    
    def install(self, skill_name):
        """从ClawHub安装技能"""
        try:
            result = subprocess.run(
                ['npx', 'clawhub', 'install', skill_name],
                capture_output=True, text=True, timeout=60
            )
            return {'status': 'ok', 'output': result.stdout, 'error': result.stderr}
        except Exception as e:
            return {'status': 'error', 'error': str(e)}
    
    def update(self, skill_name=None):
        """更新技能"""
        cmd = ['npx', 'clawhub', 'update']
        if skill_name:
            cmd.append(skill_name)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            return {'status': 'ok', 'output': result.stdout, 'error': result.stderr}
        except Exception as e:
            return {'status': 'error', 'error': str(e)}
    
    def run(self, context=None):
        """SEEF调度入口"""
        if not context:
            return {'status': 'ok', 'message': 'skill-installer ready', 'capabilities': ['search', 'install', 'update']}
        action = context.get('action', 'search')
        target = context.get('target', '')
        if action == 'search':
            return self.search(target)
        elif action == 'install':
            return self.install(target)
        elif action == 'update':
            return self.update(target)
        return {'status': 'error', 'error': f'Unknown action: {action}'}
