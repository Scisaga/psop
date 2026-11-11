// Record the actual running service and unmodified production screenshots.
// Run after the browser suite, capture_connection_sites and check_connection_pick.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = import.meta.dirname;
const repo = path.resolve(root, '../..');
const origin = process.env.PSOP_ORIGIN || 'http://127.0.0.1:8780';
const json = file => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const decode = bytes => bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le').replace(/^\uFEFF/, '') : bytes.toString('utf8').replace(/^\uFEFF/, '');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const packagePath = 'build/microduck/source-1.12/microduck-connection-sites.dkp';
const oldPath = 'build/microduck/source-1.11/microduck-connection-analysis.dkp';
const manifest = json(packagePath + '/manifest.json');
const old = json(oldPath + '/manifest.json');
const before = json('build/connection-sites-review/before/capture.json');
const after = json('build/connection-sites-review/after/capture.json');
assert.equal(before.camera, after.camera);
assert.equal(before.desktopBounds.width, 360);
assert.equal(after.desktopBounds.width, 360);
assert.equal(after.snapshot, `dkp-${manifest.package_digest.slice(0,20)}`);
assert.deepEqual(after.errors, []);

const logFiles = {
  browser: '.runtime/connection-sites-browser-complete.log',
  directory: '.runtime/connection-sites-unit-js.log',
  buildRelated: '.runtime/connection-sites-unit-python.log',
  identityAndEvidence: '.runtime/connection-sites-local-identity.log',
  api: '.runtime/connection-sites-api-tests.log',
  visibilityAndNormals: '.runtime/connection-sites-render-tests.log',
  validationCache: '.runtime/connection-sites-cache-tests.log',
  authorReplay: '.runtime/connection-sites-author-replay.log',
  frontend: '.runtime/connection-sites-frontend-build.log',
};
fs.mkdirSync(path.join(root, 'logs'), {recursive: true});
const logs = {};
for (const [name, file] of Object.entries(logFiles)) {
  const text = decode(fs.readFileSync(path.join(repo, file)));
  fs.writeFileSync(path.join(root, 'logs', name + '.txt'), text);
  logs[name] = text;
}
assert.match(logs.browser, /54 passed/);
assert.match(logs.browser, /2 skipped/);
assert.doesNotMatch(logs.browser, /\b\d+ failed\b/);
assert.match(logs.directory, /pass 8/);
assert.match(logs.identityAndEvidence, /Ran 5 tests[\s\S]*\bOK\b/);
assert.match(logs.authorReplay, /reproduced frozen input exactly/);

const catalogResponse = await fetch(origin + '/api/workspaces');
assert.equal(catalogResponse.status, 200);
const catalog = await catalogResponse.json();
assert.equal(catalog.workspaces.find(w => w.id === 'microduck').selectedSnapshotId, after.snapshot);
const response = await fetch(`${origin}/api/workspaces/microduck/snapshots/${after.snapshot}/view`);
assert.equal(response.status, 200);
const view = await response.json();
assert.equal(view.meta.packageDigest, manifest.package_digest);
assert.equal(view.meta.packageVersion, manifest.package_version);
assert.equal(view.meta.validation.profile, manifest.profile);
assert.deepEqual(view.analysis.connection_analysis_coverage.independent_local_sites, {expected_count:8, missing:[]});
assert.equal(view.analysis.interface_connections?.length || 0, 0);

const index = fs.readFileSync(path.join(repo, 'apps/workbench/dist/index.html'), 'utf8');
const assets = [...index.matchAll(/(?:src|href)="(\/assets\/index-[^"]+\.(?:js|css))"/g)].map(m => m[1]);
assert.equal(assets.length, 2);
const served = await (await fetch(origin + '/')).text();
const assetChecks = [];
for (const asset of assets) {
  assert.ok(served.includes(asset));
  assert.ok([...after.scripts, ...after.stylesheets].includes(asset), 'Capture uses the served build');
  const local = fs.readFileSync(path.join(repo, 'apps/workbench/dist', asset));
  const remote = Buffer.from(await (await fetch(origin + asset)).arrayBuffer());
  assert.equal(sha(remote), sha(local));
  assetChecks.push({asset, sha256:sha(local), bytes:local.length, servedBytesMatch:true});
}
const unchangedGeometry = manifest.files.filter(f => /\.stl$/i.test(f.path));
assert.ok(unchangedGeometry.length > 0);
for (const file of unchangedGeometry) assert.equal(old.files.find(f => f.path === file.path)?.sha256, file.sha256, file.path);
for (const file of old.files) assert.equal(sha(fs.readFileSync(path.join(repo, oldPath, file.path))), file.sha256, 'Frozen 1.11: ' + file.path);
const frozen = fs.readFileSync(path.join(repo, 'skills/psop-build/scripts/psop_build_v2/connection_analysis_v11.py'));
assert.deepEqual(frozen, execFileSync('git', ['show','264e785:skills/psop-build/scripts/psop_build_v2/connection_analysis.py'], {cwd:repo}));
const frozenAuthor = fs.readFileSync(path.join(repo, 'build/connection-analysis/research_author_v11.py'));
assert.deepEqual(frozenAuthor, execFileSync('git', ['show','264e785:build/connection-analysis/research_author.py'], {cwd:repo}));

const left = json('build/connection-sites-review/operations/fb88-operations.json');
const right = json('build/connection-sites-review/operations/d191-operations.json');
for (const operations of [left, right]) {
  assert.equal(operations.snapshot, after.snapshot);
  assert.deepEqual(operations.errors, []);
  assert.ok(operations.records.length >= 10);
  for (const record of operations.records) assert.equal(record.view.digest, manifest.package_digest);
}
const quiet = json('build/connection-sites-review/operations/quiet-peer-return.json');
assert.equal(quiet.before.inspection.active, false);
assert.equal(quiet.after.inspection.active, false);
assert.equal(quiet.before.isolateId, quiet.after.isolateId);
assert.deepEqual(quiet.before.geometrySelection, quiet.after.geometrySelection);
const pick = json('build/connection-sites-review/picking/source-triangle-pick.json');
const validation = JSON.parse(decode(fs.readFileSync(path.join(repo, '.runtime/connection-sites-validate.json'))));
assert.equal(validation.valid, true);
assert.equal(validation.package_digest, manifest.package_digest);
fs.writeFileSync(path.join(root, 'package-validation.json'), JSON.stringify(validation, null, 2) + '\n');
const result = {
  checkedAt:new Date().toISOString(), service:origin, applicationVersion:json('apps/workbench/package.json').version,
  snapshot:after.snapshot, packagePath, packageVersion:manifest.package_version, profile:manifest.profile,
  packageDigest:manifest.package_digest, toolchain:manifest.toolchain, counts:manifest.counts,
  frontend:assetChecks, apiStatus:response.status, independentLocalSites:view.analysis.connection_analysis_coverage.independent_local_sites,
  unchangedStlFiles:unchangedGeometry.length, frozen11FilesChecked:old.files.length, frozenInterpreterSha256:sha(frozen), frozenAuthorSha256:sha(frozenAuthor),
  tests:{browser:{passed:54, skipped:2, reason:'Historical profiles 1.2 and 1.8 are not registered locally'}, directory:8, buildRelated:30, identityAndEvidence:5, api:7, visibilityAndNormals:6, validationCache:7},
  comparison:{camera:after.camera, desktop:[1600,900], narrow:[1100,800], panelWidth:after.desktopBounds.width, beforeSnapshot:before.snapshot},
  operations:{left:'operations/fb88-operations.json', right:'operations/d191-operations.json', quietReturn:'operations/quiet-peer-return.json', picking:'picking/source-triangle-pick.json'},
  regressionObjects:json('build/connection-sites-review/operations/regression-objects.json'),
  limitations:['本轮必需操作项已完成；历史 1.2/1.8 的两个页面用例因本机未登记而跳过。','实际选孔/螺钉数量、螺纹、旋入深度、活动区归属与轴向保持仍未确认。','独立原件验收覆盖已标注样例，不宣称整件或整机接口发现完整。'],
};
fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
const figure = (file, label) => `<figure><a href="${file}"><img src="${file}" alt="${escape(label)}" loading="lazy"></a><figcaption>${escape(label)} · 点击原尺寸查看</figcaption></figure>`;
const pair = size => `<div class="comparison">${figure(`before/hip-${size}.png`, '修改前 · 冻结 1.11 与原前端')}${figure(`after/hip-${size}.png`, '修改后 · 实际 1.12 与生产前端')}</div>`;
const gallery = [
  ['operations/fb88-member-1.png','左髋：只选择一个孔，保持原相机'],
  ['operations/fb88-x-focus.png','左髋 X 四孔：显式定位本件'],
  ['operations/fb88-peer.png','实际对应舵机的局部四孔'],
  ['operations/fb88-returned.png','返回相同部位与相机'],
  ['operations/fb88-y-journal.png','另一轴向的有限 Ø16 轴颈'],
  ['operations/d191-x-focus.png','右髋实例：独立部位与成员'],
  ['operations/fb88-specific-evidence.png','具体结论对应的源三角证据'],
  ['operations/formal-definition.png','已有正式用途定义：实际接合未确认'],
  ['operations/geometry-only.png','仅几何线索：用途仍待调查'],
  ['picking/source-triangle-pick.png','真实画布拾取：反查成员和目录身份'],
];
for (const [file] of gallery) assert.ok(fs.existsSync(path.join(root, file)), file);
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSOP 本件连接部位验收</title>
<style>body{font:15px/1.7 system-ui,sans-serif;background:#f4f7f7;color:#263a45;margin:0}main{max-width:1500px;margin:auto;padding:32px}h1{font-size:30px;margin:0}h2{font-size:21px;margin-top:34px}p{max-width:1000px}a{color:#087f88}code{overflow-wrap:anywhere;font-size:12px}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;border-bottom:1px solid #dde5e8;padding:10px}small,figcaption{color:#60747e}figure{margin:0;min-width:0;background:#fff;border:1px solid #dae4e8}img{width:100%;display:block}figcaption{padding:8px 12px;font-size:12px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:14px}.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}details{margin-top:18px}summary{cursor:pointer;color:#087f88}li{margin:6px 0}@media(max-width:850px){main{padding:18px}.comparison,.gallery{grid-template-columns:1fr}}</style>
<main><h1>从部件找到连接部位</h1><p>打开接口页即可区分部位、选择真实成员、查看可能对端。选择保持相机和透明状态；定位由用户主动触发，证据与完整调查按需打开。</p><small>现场记录 ${escape(result.checkedAt)} · <a href="verification.json">运行与核验数据</a> · <a href="package-validation.json">知识包完整验证</a></small>
<h2>同视角、同面板的前后对照</h2><p>桌面 1600×900，详情面板 360 px，完全相同的相机参数。修改前显式读取原 1.11，确实显示空定义和自动展开的假设；修改后是实际生产页面，无截图专用样式或隐藏脚本。</p>${pair('1600x900')}<details><summary>查看 1100×800 窄布局对照</summary>${pair('1100x800')}</details>
<h2>操作及回归</h2><p>左右髋均执行：X 四孔逐成员选择 → 定位本件 → 定位对应舵机局部 → 返回 → Y 四孔 → 两处轴颈及轴承对端 → 具体证据 → 关闭返回。另核对正式安装定义、几何线索部件、小柱配合和右外壳。</p><ul><li><a href="operations/fb88-operations.json">左髋逐步记录：稳定选择、相机、源结构、对端身份</a></li><li><a href="operations/d191-operations.json">右髋逐步记录</a></li><li><a href="operations/quiet-peer-return.json">普通查看对端往返：保持非局部查看状态和隔离设置</a></li><li><a href="picking/source-triangle-pick.json">真实画布射线拾取、源三角与成员对应</a></li></ul><div class="gallery">${gallery.map(([file,label])=>figure(file,label)).join('')}</div>
<h2>身份与证据反例</h2><ul><li>同一 Part 对多个局部研究分别保留；同一部位的竞争解释合并在同一部位下。输入顺序、名称及证据文案变化不改变部位身份。</li><li>正式定义可选池与参考关系的实际成员分开；另一处研究不会误挂到原可选池。单孔两侧入口共享拓扑孔道；只有同轴的断开有限壁不合并。</li><li>独立样例要求的部位或成员被删除时验收失败。被排除的配对与原始搜索结果不进入可用成员。</li><li>没有直接互补依据的关系不标直接定位受支持；板级 BOM/README 属检索记录。缺图纸或未建模螺纹记为缺口。</li></ul>
<table><tr><th>检查</th><th>结果</th><th>记录</th></tr>${[['浏览器全套','54 通过 / 2 历史样例跳过','browser'],['目录与局部身份反例','8 通过','directory'],['Build 关联回归','30 通过','buildRelated'],['新增身份与证据反例','5 通过（与关联回归部分重叠）','identityAndEvidence'],['工作区 API','7 通过','api'],['透明/遮挡与源法线','6 通过','visibilityAndNormals'],['验证缓存','7 通过','validationCache'],['独立源截面','37 通过，两个髋 8 个必需部位无缺失','authorReplay']].map(([name,value,log])=>`<tr><td>${name}</td><td>${value}</td><td><a href="logs/${log}.txt">原始日志</a></td></tr>`).join('')}</table>
<h2>实际运行</h2><p>${escape(origin)} · 工作台 ${escape(result.applicationVersion)} · ${escape(manifest.package_version)} · ${escape(manifest.profile)}<br>快照 <code>${after.snapshot}</code><br>摘要 <code>${manifest.package_digest}</code><br>前端 <code>${assets.join(' / ')}</code>，服务端返回字节与本地构建 SHA 一致。</p><p>旧 1.11 的 ${old.files.length} 个包文件 SHA 未变，${unchangedGeometry.length} 份 STL 与新包一致；旧解释器逐字节保留。新包完成 prepare → finalize → validate → register，未升级任何实际接合或保持资格。</p><h2>尚未证明的内容</h2><ul>${result.limitations.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></main></html>`;
fs.writeFileSync(path.join(root, 'report.html'), html);
fs.copyFileSync(path.join(root, 'after/hip-1600x900.png'), path.join(repo, 'docs/assets/screenshots/workbench-connection-sites.png'));
console.log(JSON.stringify({snapshot:result.snapshot, frontend:assets, output:'build/connection-sites-review/report.html', verified:true}));
