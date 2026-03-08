import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path('skills/seef/subskills').resolve()))
from creator import SkillCreator  # noqa: E402

workspace = Path('.').resolve()
skills_dir = workspace / 'skills'
local_name = 'zz-auto-classify-local'
public_name = 'zz-auto-classify-public'

for name in [local_name, public_name]:
    p = skills_dir / name
    if p.exists():
        shutil.rmtree(p)

creator = SkillCreator()
local_result = creator.run(requests=[{
    'request_id': 'VERIFY_LOCAL',
    'skill_name': local_name,
    'template_type': 'standard',
    'description': 'uses /root/ path to force local'
}])
(skills_dir / local_name / 'index.js').write_text('const p = "/root/.openclaw/data";\n', encoding='utf-8')
creator._apply_distribution_to_skill_md(skills_dir / local_name, 'local')

public_result = creator.run(requests=[{
    'request_id': 'VERIFY_PUBLIC',
    'skill_name': public_name,
    'template_type': 'standard',
    'description': 'clean public skill'
}])

local_skill_md = (skills_dir / local_name / 'SKILL.md').read_text(encoding='utf-8')
public_skill_md = (skills_dir / public_name / 'SKILL.md').read_text(encoding='utf-8')

payload = {
    'local_created_distribution': local_result['created_skills'][0]['distribution'],
    'public_created_distribution': public_result['created_skills'][0]['distribution'],
    'local_skill_md_has_distribution': 'distribution: local' in local_skill_md,
    'public_skill_md_has_distribution': 'distribution: public' in public_skill_md,
}
print(json.dumps(payload, ensure_ascii=False))

for name in [local_name, public_name]:
    p = skills_dir / name
    if p.exists():
        shutil.rmtree(p)
