"""Create new, reviewable same-mode query artifacts without changing the fixture."""
from copy import deepcopy
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/assembly/fixtures/four-hole-modes.json"
DESTINATION = ROOT / "build/skill-forward-check/modes"
CLI = "skills/psop-simulate/scripts/psop_simulate.py"
EXPECTED_SOURCE_SHA = "890177b4e4c9a61e241c782d422c997106b50abeef255bdf3d2d305424b79b79"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def differences(left, right, path=""):
    if type(left) is not type(right):
        return [path]
    if isinstance(left, dict):
        result = []
        for key in sorted(left.keys() | right.keys()):
            child = path + "/" + key
            result.extend(differences(left[key], right[key], child) if key in left and key in right else [child])
        return result
    if isinstance(left, list):
        if len(left) != len(right):
            return [path]
        return [change for index, (a, b) in enumerate(zip(left, right)) for change in differences(a, b, path + "/" + str(index))]
    return [] if left == right else [path]


def counts(proposals, dimension):
    return dict(Counter(proposal["assessments"][dimension]["status"] for proposal in proposals))


def main():
    assert digest(SOURCE) == EXPECTED_SOURCE_SHA, "Original fixture differs from the forward trial input"
    original = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert original["basis"]["kind"] == "synthetic"
    interfaces = {item["id"]: item for item in original["interfaces"]}
    query = original["query"]
    modes_a = [mode["id"] for mode in interfaces[query["interface_a"]]["modes"]]
    modes_b = [mode["id"] for mode in interfaces[query["interface_b"]]["modes"]]
    assert modes_a == modes_b and len(modes_a) == 7
    assert not DESTINATION.exists(), "Comparison requires a new artifact directory"
    DESTINATION.mkdir(parents=True)
    sys.path.insert(0, str(ROOT / "packages/assembly"))
    from psop_assembly.validation import validate_named

    records = []
    for mode in modes_a:
        derived = deepcopy(original)
        derived["query"]["mode_a"] = mode
        derived["query"]["mode_b"] = mode
        changed_paths = differences(original, derived)
        assert set(changed_paths) <= {"/query/mode_a", "/query/mode_b"}
        assert derived["basis"] == original["basis"]
        definition_path = DESTINATION / (mode + ".definition.json")
        result_path = DESTINATION / (mode + ".query.json")
        save_json(definition_path, derived)
        arguments = ["-B", CLI, "query", "--definition", definition_path.relative_to(ROOT).as_posix(), "--output", result_path.relative_to(ROOT).as_posix()]
        command = [sys.executable, *arguments]
        executed = subprocess.run(command, cwd=ROOT, text=True, encoding="utf-8", capture_output=True, check=False)
        if executed.returncode:
            raise RuntimeError("CLI failed for " + mode + ": " + executed.stdout + executed.stderr)
        result = json.loads(result_path.read_text(encoding="utf-8"))
        assert result == json.loads(executed.stdout)
        assert result["ok"] is True and result["execution_performed"] is False
        assert result["definition"]["sha256"] == digest(definition_path)
        inner = result["result"]
        validate_named(inner, "query")
        proposals = inner["proposals"]
        record = {
            "mode_a": mode, "mode_b": mode,
            "source_fixture": SOURCE.relative_to(ROOT).as_posix(), "source_fixture_sha256": EXPECTED_SOURCE_SHA,
            "definition_path": definition_path.relative_to(ROOT).as_posix(), "definition_sha256": digest(definition_path),
            "semantic_changes_from_original": changed_paths,
            "basis_preserved": derived["basis"] == original["basis"],
            "query_path": result_path.relative_to(ROOT).as_posix(), "query_sha256": digest(result_path),
            "actual_command": command, "display_command": "python " + " ".join(arguments), "exit_code": executed.returncode,
            "stderr": executed.stderr, "schema_validation": "pass", "status": result["status"],
            "execution_performed": result["execution_performed"], "search": inner["search"],
            "query_limits": derived["query"]["limits"],
            "allowed_subset_counts": {side: len(selection["admissible_sets"]) for side, selection in inner["selections"].items()},
            "unknown_subset_counts": {side: len(selection["unknown_sets"]) for side, selection in inner["selections"].items()},
            "forbidden_subset_counts": {side: selection["forbidden_count"] for side, selection in inner["selections"].items()},
            "proposal_count": len(proposals),
            "assessment_counts": {dimension: counts(proposals, dimension) for dimension in ["geometry", "mode_eligibility", "mechanical", "engineering", "task", "completion", "occupancy"]},
            "pose_status_counts": dict(Counter(proposal["pose"]["status"] for proposal in proposals)),
        }
        records.append(record)
        print(json.dumps({"mode": mode, "exit_code": executed.returncode, "allowed": record["allowed_subset_counts"], "unknown": record["unknown_subset_counts"], "proposals": len(proposals), "search": inner["search"], "pose": record["pose_status_counts"]}, ensure_ascii=False))

    assert digest(SOURCE) == EXPECTED_SOURCE_SHA
    summary = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "source_fixture": SOURCE.relative_to(ROOT).as_posix(), "source_fixture_sha256": EXPECTED_SOURCE_SHA,
        "source_fixture_unchanged": True,
        "scope": "Seven synthetic declared queries, pairing each mode with the same mode on the other side. Not all 49 cross-mode pairs, and not all physical assembly methods.",
        "definition_edit_policy": "Only query.mode_a and query.mode_b may change semantically; all synthetic basis, warrants, geometry and context are preserved.",
        "records": records,
    }
    save_json(DESTINATION / "mode-comparison.json", summary)

    lines = [
        "# 七种声明模式查询比较", "",
        "原夹具：`packages/assembly/fixtures/four-hole-modes.json`，SHA-256：`" + EXPECTED_SOURCE_SHA + "`。原文件未修改。", "",
        "每个派生 definition 仅在语义上替换 `query.mode_a` 与 `query.mode_b`，左右使用同一种模式；所有 synthetic basis、warrant、孔几何、空 context 与搜索界限保持原值。默认模式的派生文件在语义上与原夹具相同。", "",
        "七次均通过真实 `psop_simulate.py query` CLI，退出码 0，内层 query schema 验证通过，`execution_performed=false`。完整命令、原始/派生输入哈希、语义差异及输出哈希保存在 [mode-comparison.json](mode-comparison.json)。各模式名链接至原始查询 JSON；同名 `.definition.json` 为派生输入。", "",
        "共同搜索范围：仅指定的左右接口/方式、`axis_relation=parallel`、位置容差 `1e-7 m`、角度容差 `1e-6 rad`；最多 8 个成员、50,000 个映射、256 个候选。表中子集数为左/右两侧，候选数包含保留的对称映射。", "",
        "| 模式（查询 JSON） | 允许子集 左/右 | 未知子集 左/右 | 候选数 | 已查映射数 | 映射搜索完成 / 选择集合完整 | 停止原因 | mechanical | engineering | task | completion |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    ]
    for record in records:
        mode = record["mode_a"]
        allowed, unknown, search = record["allowed_subset_counts"], record["unknown_subset_counts"], record["search"]
        dimensions = [", ".join(status + " × " + str(number) for status, number in record["assessment_counts"][dimension].items()) or "无候选" for dimension in ["mechanical", "engineering", "task", "completion"]]
        lines.append("| [" + mode + "](" + mode + ".query.json) | " + str(allowed["a"]) + "/" + str(allowed["b"]) + " | " + str(unknown["a"]) + "/" + str(unknown["b"]) + " | " + str(record["proposal_count"]) + " | " + str(search["mappings_examined"]) + " | " + str(search["complete"]).lower() + " / " + str(search["selection_complete"]).lower() + " | " + search["stop_reason"] + " | " + " | ".join(dimensions) + " |")
    lines.extend([
        "", "`open-two-examples` 仅声明 AB、CD 两个已知合法示例，其他非空子集仍为 unknown；映射搜索耗尽只针对这些已知允许选择，不能将未知子集当成被禁止。", "",
        "`single-hole` 的一个候选保持位姿欠定，geometry=unknown；其余模式的候选 geometry 均为 pass。候选和共同刚性配准只能回答所声明静态范围内的相容性。", "",
        "所有模式均未绑定实际 fastener，且未提供已接合路径证据。路径与弹性接合仍未验证，机械保持、工程和任务验收未完成；四维 unknown 不能改写为已组装完成。", "",
        "这七次查询只覆盖七个同模式配对，不覆盖全部 49 个跨模式配对，也不穷尽全部物理装法。全部依据均为 synthetic，不能作为任何真实设备的安装许可。", "",
    ])
    with (DESTINATION / "mode-comparison.md").open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("\n".join(lines))
    print(json.dumps({"comparison": str(DESTINATION / "mode-comparison.md"), "manifest": str(DESTINATION / "mode-comparison.json"), "source_fixture_unchanged": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
