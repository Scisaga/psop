# 装配目录维护

`../microduck-assembly-interfaces.json` 是已经完成复核的显式研究输入，保存有限特征、接口、具体关系、证据和独立要求。`research/` 保留有价值的原几何与调查记录。它们不需要通过旧知识包重新推导。

校验当前输入及其实际源几何：

```powershell
python -B device-materials/assembly/author_microduck.py
```

原装状态的四项评估及全部未决跟进见[分项状态说明](../../docs/build/reference-connection-status.md)，冻结项目复核见 [reference-status-review.json](reference-status-review.json)。

维护工具默认使用保留的 `build/microduck/source-1.15/microduck-capabilities-9.dkp` 中的原始几何。它检查源 SHA、原三角、成员归属、具体路径和独立要求，默认不修改任何文件。输入 `provenance` 中的历史包路径、摘要仍是来源引用，不是工具的运行依赖。

审核一个新修订并向新文件导出完全相同的字节：

```powershell
python -B device-materials/assembly/author_microduck.py --input path/to/reviewed-revision.json --dkp path/to/current.dkp --output path/to/new-input.json
```

已有目标文件一律拒绝覆盖。新确认和纠正应写入明确修订及对应证据；该工具不自动寻找接口、不把已选孔组变成螺钉数量，也不恢复历史分析引擎。审核后的新输入仍通过 Build 的 prepare → finalize → validate → register 发布新知识版本。

常规维护只依赖当前 DKP。`complete_reference_uses.py` 是历史专项研究的重放脚本，需要用 `--base` 显式提供归档的 `capabilities.3` 基线；常规维护不调用它。

原装配安装接口的独立只读复核使用 `audit_original_installation.py`，原三角平面复算使用 `audit_reference_surfaces.py`。发现的四处功能接口漏登记已在 `.5` 补录，原有七项继续调查的具体结果、有限面见证与剩余缺口见[安装补录与复核结果](../../docs/installation-followup.md)。本轮冻结调查为 `installation-followup-review.json`，纳入独立要求并随包捕获。通过已有合同不表示全部实物安装结构已被穷尽。

专项回归：

新版接口支持与原装兼容核对使用 `skills/psop-build/scripts/review_interfaces.py --dkp <当前包> --output <包外报告>`；每条关系按接口及实际成员核对。构建器的 policy/2 同时将报告纳入冻结重放，具体范围、补回的承座与剩余约束缺口见[本轮记录](../../docs/build/interface-analysis-policy-2.md)。

```powershell
python -B -m unittest discover -s device-materials/assembly/tests -v
```
