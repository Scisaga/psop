"""Publish the same finite interface substitution analysis consumed by Simulate.

Historical packages without this optional index retain their frozen bytes and
semantics. The derived index never promotes substitutions to source relations.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess


def analyze(scene, root, catalog):
    scripts = Path(__file__).resolve().parents[1]
    repo = scripts.parents[2]
    node = os.environ.get('PSOP_NODE_PATH') or shutil.which('node')
    bundled = repo/'apps/workbench/.runtime/node-v22.23.4-win-x64/node.exe'
    if node is None and bundled.is_file():
        node = str(bundled)
    if node is None:
        raise ValueError('Finite interface adaptation analysis requires Node.js 22 or newer')
    result = subprocess.run([node, str(scripts/'interface_adaptations_worker.mjs')],
        input=json.dumps({'scene': scene, 'root': str(root.resolve()), 'catalog': catalog}, ensure_ascii=False),
        capture_output=True, text=True, encoding='utf-8', timeout=120,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise ValueError('Finite interface adaptation analysis failed: '+result.stderr[-2000:])
    return json.loads(result.stdout)
