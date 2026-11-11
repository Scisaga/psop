"""Offline pinned solid-Boolean worker shared by repeated source-local poses."""
import atexit
import json
import os
from pathlib import Path
import shutil
import subprocess
import hashlib
import tempfile
from uuid import uuid4

_worker=None
_algorithm=None


def _close():
    global _worker
    if _worker is not None:
        _worker.stdin.close()
        try:_worker.wait(timeout=5)
        except subprocess.TimeoutExpired:_worker.kill();_worker.wait()
        _worker=None


atexit.register(_close)


def _request(request):
    global _worker
    if _worker is None or _worker.poll() is not None:
        repo=Path(__file__).resolve().parents[4]
        node=os.environ.get('PSOP_NODE_PATH') or shutil.which('node')
        bundled=repo/'apps/workbench/.runtime/node-v22.23.4-win-x64/node.exe'
        if node is None and bundled.is_file():node=str(bundled)
        if node is None:raise ValueError('Whole-source interference screening requires Node.js 22 or newer (PSOP_NODE_PATH)')
        _worker=subprocess.Popen([node,str(Path(__file__).resolve().parents[1]/'solid_interference_worker.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    _worker.stdin.write(json.dumps(request,separators=(',',':'))+'\n');_worker.stdin.flush()
    line=_worker.stdout.readline()
    if not line:raise ValueError('Solid interference worker stopped: '+_worker.stderr.read()[-2000:])
    result=json.loads(line)
    if result.get('error'):raise ValueError('Solid interference check failed: '+result['error'])
    return result


def evaluate(a,b,r,t,*,diagnostics=False):
    global _algorithm
    scripts=Path(__file__).resolve().parents[1]
    if _algorithm is None:
        vendor=scripts/'vendor/manifold-3d'
        lock=json.loads((vendor/'SOURCE.json').read_bytes())
        for name,expected in lock['files'].items():
            if hashlib.sha256((vendor/name).read_bytes()).hexdigest()!=expected:raise ValueError('Pinned solid engine changed: '+name)
        records=[hashlib.sha256((scripts/name).read_bytes()).hexdigest() for name in ('solid_interference_worker.mjs','solid-contact-diagnostics.mjs','vendor/manifold-3d/SOURCE.json')]
        _algorithm=hashlib.sha256(json.dumps(records).encode()).hexdigest()
    identity=[a['sha256'],b['sha256'],[[round(v,12) for v in row] for row in r],[round(v,12) for v in t],diagnostics,_algorithm]
    key=hashlib.sha256(json.dumps(identity,separators=(',',':')).encode()).hexdigest()
    directory=Path(os.environ.get('PSOP_SOLID_OBSERVATION_CACHE',str(Path(tempfile.gettempdir())/'psop-solid-observation-cache-v1')))
    file=directory/(key+'.json')
    def encoded(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    try:
        cached=json.loads(file.read_bytes())
        if cached['identity']==key and hashlib.sha256(encoded(cached['observation'])).hexdigest()==cached['observation_sha256']:
            return cached['observation']
    except (OSError,ValueError,KeyError,TypeError):pass
    result=_request({'a':a,'b':b,'r':r,'t':t,**({'diagnostics':True} if diagnostics else {})})
    if result.get('status') in {'clear','interference'}:
        temporary=directory/(key+'.'+uuid4().hex+'.tmp')
        try:
            directory.mkdir(parents=True,exist_ok=True)
            temporary.write_bytes(encoded({'identity':key,'observation':result,'observation_sha256':hashlib.sha256(encoded(result)).hexdigest()}))
            temporary.replace(file)
        except OSError:pass
        finally:temporary.unlink(missing_ok=True)
    return result


def assess(observation,policy,mechanism):
    return _request({'operation':'assess','input':{'observation':observation,'policy':policy,'mechanism':mechanism,'expected_contact':True}})
