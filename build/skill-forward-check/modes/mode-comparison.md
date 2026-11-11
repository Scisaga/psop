# 七种声明模式查询比较

原夹具：`packages/assembly/fixtures/four-hole-modes.json`，SHA-256：`890177b4e4c9a61e241c782d422c997106b50abeef255bdf3d2d305424b79b79`。原文件未修改。

每个派生 definition 仅在语义上替换 `query.mode_a` 与 `query.mode_b`，左右使用同一种模式；所有 synthetic basis、warrant、孔几何、空 context 与搜索界限保持原值。默认模式的派生文件在语义上与原夹具相同。

七次均通过真实 `psop_simulate.py query` CLI，退出码 0，内层 query schema 验证通过，`execution_performed=false`。完整命令、原始/派生输入哈希、语义差异及输出哈希保存在 [mode-comparison.json](mode-comparison.json)。各模式名链接至原始查询 JSON；同名 `.definition.json` 为派生输入。

共同搜索范围：仅指定的左右接口/方式、`axis_relation=parallel`、位置容差 `1e-7 m`、角度容差 `1e-6 rad`；最多 8 个成员、50,000 个映射、256 个候选。表中子集数为左/右两侧，候选数包含保留的对称映射。

| 模式（查询 JSON） | 允许子集 左/右 | 未知子集 左/右 | 候选数 | 已查映射数 | 映射搜索完成 / 选择集合完整 | 停止原因 | mechanical | engineering | task | completion |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| [exact-four-examples](exact-four-examples.query.json) | 4/4 | 0/0 | 13 | 38 | true / true | exhausted | unknown × 13 | unknown × 13 | unknown × 13 | unknown × 13 |
| [open-two-examples](open-two-examples.query.json) | 2/2 | 13/13 | 8 | 8 | true / false | exhausted | unknown × 8 | unknown × 8 | unknown × 8 | unknown × 8 |
| [cardinality-2-to-4](cardinality-2-to-4.query.json) | 11/11 | 0/0 | 60 | 192 | true / true | exhausted | unknown × 60 | unknown × 60 | unknown × 60 | unknown × 60 |
| [contains-anchor-pair](contains-anchor-pair.query.json) | 7/7 | 0/0 | 28 | 128 | true / true | exhausted | unknown × 28 | unknown × 28 | unknown × 28 | unknown × 28 |
| [paired-dependencies](paired-dependencies.query.json) | 3/3 | 0/0 | 12 | 32 | true / true | exhausted | unknown × 12 | unknown × 12 | unknown × 12 | unknown × 12 |
| [full-pattern](full-pattern.query.json) | 1/1 | 0/0 | 4 | 24 | true / true | exhausted | unknown × 4 | unknown × 4 | unknown × 4 | unknown × 4 |
| [single-hole](single-hole.query.json) | 1/1 | 0/0 | 1 | 1 | true / true | exhausted | unknown × 1 | unknown × 1 | unknown × 1 | unknown × 1 |

`open-two-examples` 仅声明 AB、CD 两个已知合法示例，其他非空子集仍为 unknown；映射搜索耗尽只针对这些已知允许选择，不能将未知子集当成被禁止。

`single-hole` 的一个候选保持位姿欠定，geometry=unknown；其余模式的候选 geometry 均为 pass。候选和共同刚性配准只能回答所声明静态范围内的相容性。

所有模式均未绑定实际 fastener，且未提供已接合路径证据。路径与弹性接合仍未验证，机械保持、工程和任务验收未完成；四维 unknown 不能改写为已组装完成。

这七次查询只覆盖七个同模式配对，不覆盖全部 49 个跨模式配对，也不穷尽全部物理装法。全部依据均为 synthetic，不能作为任何真实设备的安装许可。
