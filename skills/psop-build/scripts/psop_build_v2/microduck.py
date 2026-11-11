"""Frozen source adapter for Microduck model references, not a physics solver."""
from __future__ import annotations
import csv, hashlib, io, math, os, re, tempfile, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET
from zipfile import ZipFile

COMMIT = "cb70b792312d559a4da09064d92009079671815f"
XML_URL = (
    "https://raw.githubusercontent.com/pollen-robotics/microduck_rl/"
    f"{COMMIT}/src/mjlab_microduck/robot/microduck/robot_walk.xml"
)
XML_SHA256 = "80fc4424ed71e430ec4919110dfdb5c714dc1c4e1138e1832a16865cf31eb8c8"
INDEX_NAME = "模型部件索引.csv"
GROUP_LABELS = {
    "head": "头部与颈部",
    "torso": "躯干",
    "left-leg": "左腿与足部",
    "right-leg": "右腿与足部",
    "other": "其他部件",
}
BODY_LABELS = {
    "trunk_base": "躯干基座",
    "yaw2roll": "左髋偏航结构",
    "hip_l": "左髋横滚结构",
    "upper_leg_left": "左大腿",
    "leg": "左腿连杆",
    "ankle_left": "左踝与足部",
    "neck": "颈部",
    "neck_pitch": "颈俯仰结构",
    "yaw_roll_motion": "头部偏航结构",
    "jaw_soft": "头部结构",
    "bearing_roll": "右髋偏航结构",
    "hip_l_2": "右髋横滚结构",
    "upper_leg_right": "右大腿",
    "leg_2": "右腿连杆",
    "ankle_right": "右踝与足部",
}
JOINT_LABELS = {
    "left_hip_yaw": "左髋偏航",
    "left_hip_roll": "左髋横滚",
    "left_hip_pitch": "左髋俯仰",
    "left_knee": "左膝",
    "left_ankle": "左踝",
    "neck_pitch": "颈俯仰",
    "head_pitch": "头部俯仰",
    "head_yaw": "头部偏航",
    "head_roll": "头部横滚",
    "right_hip_yaw": "右髋偏航",
    "right_hip_roll": "右髋横滚",
    "right_hip_pitch": "右髋俯仰",
    "right_knee": "右膝",
    "right_ankle": "右踝",
}


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def normalized_text(raw: bytes) -> str:
    return raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")


def save_bytes(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == raw:
        return
    # Each writer owns a distinct temporary file.  On Windows a reader such as
    # Vite can briefly prevent replacement, so retry without truncating the
    # existing file or falling back to a non-atomic overwrite.
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
        for attempt in range(8):
            try:
                os.replace(temporary, path)
                break
            except PermissionError as error:
                if attempt == 7:
                    raise PermissionError(
                        f"无法原子更新生成文件 {path}。请停止正在运行的预览或开发服务后重试；"
                        "本次没有覆盖原文件。"
                    ) from error
                time.sleep(min(0.02 * 2**attempt, 0.25))
    finally:
        temporary.unlink(missing_ok=True)


def vec(value: str | None, length: int, default: list[float]) -> list[float]:
    result = [float(x) for x in value.split()] if value else list(default)
    if len(result) != length or not all(math.isfinite(x) for x in result):
        raise ValueError(f"Invalid vector: {value!r}")
    return result


def quat(value: str | None) -> list[float]:
    w, x, y, z = vec(value, 4, [1, 0, 0, 0])
    norm = math.sqrt(w * w + x * x + y * y + z * z)
    if norm < 1e-10:
        raise ValueError("Zero quaternion")
    return [x / norm, y / norm, z / norm, w / norm]


def mul(a: list[float], b: list[float]) -> list[float]:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def rotate(q: list[float], p: list[float]) -> list[float]:
    r = mul(mul(q, [*p, 0]), [-q[0], -q[1], -q[2], q[3]])
    return r[:3]


def compose(
    parent_p: list[float], parent_q: list[float], p: list[float], q: list[float]
) -> tuple[list[float], list[float]]:
    translated = rotate(parent_q, p)
    return [a + b for a, b in zip(parent_p, translated)], mul(parent_q, q)


def source_scope(path: str) -> str:
    if len(PurePosixPath(path).parts) == 2 and PurePosixPath(path).name == "README.md":
        return "package"
    if "/03-" in path:
        return "model"
    if "/04-" in path:
        return "hat"
    if path.lower().endswith((".jpg", ".mp4")):
        return "media"
    return "alpha"


def kind_of(mesh: str) -> str:
    """Presentation grouping from source filenames; no engineering inference."""
    if mesh == "xl330":
        return "actuator"
    if mesh.startswith("seeed_bearing"):
        return "bearing"
    # A support's name can mention its payload (pcb/lens) without being that
    # electronic device. Keep the source's exact device names distinct.
    if mesh in {"pcb__raspberry_pi_zero_2_w", "elec_rpi_robot_hat_pcb", "np_f970", "lens", "speaker"}:
        return "electronics"
    if any(key in mesh for key in ("shell", "jaw", "mouth", "face", "noenoeil")):
        return "shell"
    return "structure"


def project(archive: Path, public: Path, ontology_path: Path, *, xml_path: Path | None = None, device_id: str = "microduck", title: str = "Microduck") -> dict:
    ASSETS = public / "sources"
    archive = archive.resolve(strict=True)
    archive_bytes = archive.read_bytes()
    sources: list[dict] = []
    raw_members: dict[str, bytes] = {}
    member_sources: dict[str, dict] = {}
    with ZipFile(io.BytesIO(archive_bytes)) as zipped:
        members = sorted((m for m in zipped.infolist() if not m.is_dir()), key=lambda m: m.filename)
        if len(members) > 1000 or sum(m.file_size for m in members) > 512 * 1024 * 1024:
            raise ValueError("Input ZIP is outside the bounded source-model adapter scope")
        for index, member in enumerate(members, 1):
            rel = PurePosixPath(member.filename)
            if rel.is_absolute() or ".." in rel.parts or "\\" in member.filename:
                raise ValueError(f"Unsafe ZIP member: {member.filename}")
            if ((member.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError(f"Symlink ZIP member: {member.filename}")
            raw = zipped.read(member)
            suffix = rel.suffix.lower()
            source_id = "SRC-MD-INDEX" if rel.name == INDEX_NAME else f"SRC-{index:06d}"
            output = ASSETS / (source_id + suffix)
            save_bytes(output, raw)
            record = {
                "id": source_id,
                "title": rel.name,
                "path": member.filename,
                "format": suffix[1:].upper(),
                "bytes": len(raw),
                "digest": sha256(raw),
                "scope": source_scope(member.filename),
                "url": f"sources/{output.name}",
            }
            if suffix in (".md", ".csv", ".txt", ".json"):
                record["text"] = normalized_text(raw)
            sources.append(record)
            raw_members[member.filename] = raw
            member_sources[member.filename] = record

    index_paths = [p for p in raw_members if PurePosixPath(p).name == INDEX_NAME]
    if len(index_paths) != 1:
        raise ValueError("Exactly one explicit model-index CSV is required")
    index_text = normalized_text(raw_members[index_paths[0]])
    reader = csv.DictReader(io.StringIO(index_text))
    mesh_rows: dict[str, dict] = {}
    for record_row, row in enumerate(reader, 1):
        original = row["STL原文件名"]
        actual = row["当前文件名"]
        matches = [p for p in raw_members if PurePosixPath(p).name == actual]
        if len(matches) != 1:
            raise ValueError(f"Explicit CSV mesh mapping is not unique: {actual}")
        source = member_sources[matches[0]]
        source["externalUrl"] = row["官方原文件来源"]
        mesh_rows[PurePosixPath(original).stem] = {
            "row": row,
            "source": source,
            "recordRow": record_row + 1,
            "physicalLine": reader.line_num,
        }

    captured_xml = ASSETS / "SRC-MD-MJCF.xml"
    if xml_path is not None:
        xml_bytes = xml_path.read_bytes()
        save_bytes(captured_xml, xml_bytes)
    elif not captured_xml.exists():
        request = urllib.request.Request(XML_URL, headers={"User-Agent": "PSOP-Build/3.0.0-draft.1"})
        with urllib.request.urlopen(request, timeout=45) as response:
            xml_bytes = response.read(8 * 1024 * 1024 + 1)
        if len(xml_bytes) > 8 * 1024 * 1024:
            raise ValueError("Official XML exceeds the expected bounded scope")
        save_bytes(captured_xml, xml_bytes)
    else:
        xml_bytes = captured_xml.read_bytes()
    if sha256(xml_bytes) != XML_SHA256:
        raise ValueError("The supplemental XML bytes do not match the pinned official snapshot")
    xml_text = normalized_text(xml_bytes)
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise ValueError("DTD/entity XML is outside the source-model adapter contract")
    root = ET.fromstring(xml_text)
    compiler = root.find("compiler")
    if compiler is None or compiler.get("angle") != "radian":
        raise ValueError("Unsupported source angle convention")
    sources.append({
        "id": "SRC-MD-MJCF", "title": "robot_walk.xml", "path": "supplemental/robot_walk.xml",
        "format": "XML", "bytes": len(xml_bytes), "digest": sha256(xml_bytes), "scope": "model",
        "url": "sources/SRC-MD-MJCF.xml", "text": xml_text,
        "externalUrl": XML_URL, "supplemented": True,
    })
    ontology_raw = ontology_path.read_bytes()
    save_bytes(ASSETS / "SRC-PSOP-ONTOLOGY.md", ontology_raw)
    sources.append({
        "id": "SRC-PSOP-ONTOLOGY", "title": "PSOP 硬件本体定义 · draft.4",
        "path": "docs/architecture/hardware-ontology.md", "format": "MD", "bytes": len(ontology_raw),
        "digest": sha256(ontology_raw), "scope": "ontology",
        "url": "sources/SRC-PSOP-ONTOLOGY.md", "text": normalized_text(ontology_raw),
    })

    meshes = {m.get("name", PurePosixPath(m.attrib["file"]).stem): m for m in root.findall("./asset/mesh")}
    materials = {m.attrib["name"]: vec(m.get("rgba"), 4, [0.7, 0.7, 0.7, 1])
                 for m in root.findall("./asset/material")}
    visuals = [g for g in root.findall("./worldbody//geom") if g.get("class") == "visual"]
    visual_lines = [(n, line) for n, line in enumerate(xml_text.splitlines(), 1)
                    if re.search(r'<geom\b[^>]*\bclass="visual"', line)]
    if len(visuals) != len(visual_lines):
        raise ValueError("Could not create an exact source-line locator for every visual")
    line_by_geom = dict(zip(visuals, visual_lines))
    parts, bodies, joints, evidence = [], [], [], []
    def walk(body: ET.Element, parent_p: list[float], parent_q: list[float], parent_name: str | None,
             parent_path: str, inherited_group: str = "torso") -> None:
        name = body.attrib["name"]
        path = parent_path + f"/body[@name='{name}']"
        p, q = compose(parent_p, parent_q, vec(body.get("pos"), 3, [0, 0, 0]), quat(body.get("quat")))
        group = inherited_group
        body_joints = body.findall("joint")
        if name == "neck":
            group = "head"
        elif body_joints and body_joints[0].get("name", "").startswith("left_"):
            group = "left-leg"
        elif body_joints and body_joints[0].get("name", "").startswith("right_"):
            group = "right-leg"
        item = {"id": f"model-body:{device_id}:{sha256(path.encode())[:16]}", "name": name,
                "label": BODY_LABELS.get(name, name), "parent": parent_name,
                "position": p, "quaternion": q, "group": group, "partIds": []}
        bodies.append(item)
        for joint in body_joints:
            joint_name = joint.attrib["name"]
            joints.append({
                "id": f"model-joint:{device_id}:{sha256((path + joint_name).encode())[:16]}", "name": joint_name,
                "label": JOINT_LABELS.get(joint_name, joint_name), "body": name,
                "parent": parent_name or "world", "type": joint.get("type", "hinge"),
                "axis": vec(joint.get("axis"), 3, [0, 0, 1]),
                "range": vec(joint.get("range"), 2, [0, 0]), "sourceId": "SRC-MD-MJCF",
                "locator": path + f"/joint[@name='{joint_name}']",
            })
        for local_index, geom in enumerate(body.findall("geom"), 1):
            if geom.get("class") != "visual":
                continue
            mesh_key = geom.attrib["mesh"]
            asset = meshes[mesh_key]
            original_key = PurePosixPath(asset.attrib["file"]).stem
            explicit = mesh_rows[original_key]
            row, source = explicit["row"], explicit["source"]
            geometry_p, geometry_q = compose(p, q, vec(geom.get("pos"), 3, [0, 0, 0]), quat(geom.get("quat")))
            locator = path + f"/geom[{local_index}][@class='visual']"
            part_id = f"part:{device_id}:{sha256(locator.encode())[:16]}"
            xml_line, xml_excerpt = line_by_geom[geom]
            ids = [f"evidence:{sha256(locator.encode())[:16]}:xml", f"evidence:{sha256(locator.encode())[:16]}:csv", f"evidence:{sha256(locator.encode())[:16]}:stl"]
            evidence.extend([
                {"id": ids[0], "sourceId": "SRC-MD-MJCF", "title": "参考装配中的可视实例",
                 "kind": "xml-node", "excerpt": xml_excerpt.strip(), "lineStart": xml_line,
                 "lineEnd": xml_line, "partId": part_id},
                {"id": ids[1], "sourceId": "SRC-MD-INDEX", "title": "中文名称与原网格映射",
                 "kind": "csv-row", "excerpt": "\n".join(f"{key}：{value}" for key, value in row.items()),
                 "row": explicit["recordRow"], "lineStart": explicit["physicalLine"],
                 "lineEnd": explicit["physicalLine"], "partId": part_id},
                {"id": ids[2], "sourceId": source["id"], "title": "STL 原始文件",
                 "kind": "source-file", "excerpt": f"来源文件：{source['path']}\nSHA-256：{source['digest']}\n文件大小：{source['bytes']} bytes\n仅为来源登记，不是制造或物理验证。",
                 "partId": part_id},
            ])
            part_name = row["中文识别名称（整理）"].replace("（文件名标识）", "")
            if mesh_key == "xl330":
                part_name = "XL330 舵机"
            parts.append({
                "id": part_id, "name": part_name, "meshKey": mesh_key, "body": name,
                "group": group, "groupLabel": GROUP_LABELS[group], "kind": kind_of(mesh_key),
                "geometryUrl": source["url"], "position": geometry_p, "quaternion": geometry_q,
                "scale": vec(asset.get("scale"), 3, [1, 1, 1]),
                "rgba": vec(geom.get("rgba"), 4, materials.get(geom.get("material", ""), [0.7, 0.7, 0.7, 1])),
                "sourceIds": ["SRC-MD-MJCF", "SRC-MD-INDEX", source["id"]],
                "evidenceIds": ids, "locator": locator,
            })
            item["partIds"].append(part_id)
        for child in body.findall("body"):
            walk(child, p, q, name, path, group)

    for body in root.findall("./worldbody/body"):
        walk(body, [0, 0, 0], [0, 0, 0, 1], None, "/mujoco/worldbody")
    counts = {"sources": len(sources), "geometries": len(meshes), "parts": len(parts),
              "bodies": len(bodies), "joints": len(joints), "evidence": len(evidence)}
    if (counts["geometries"], counts["parts"], counts["bodies"], counts["joints"]) != (38, 70, 15, 14):
        raise ValueError(f"Frozen model no longer matches the expected source: {counts}")
    if len(mesh_rows) != 38 or set(meshes) != set(mesh_rows):
        raise ValueError("The explicit 38-file mesh inventory is not closed")
    source_ids = {s["id"] for s in sources}
    for part in parts:
        if not set(part["sourceIds"]) <= source_ids:
            raise ValueError("Dangling source binding")
        if abs(sum(x*x for x in part["quaternion"]) - 1) > 1e-8:
            raise ValueError("Non-unit composed quaternion")
    return {"meta": {"title": title, "ontologyVersion": "psop.hardware/2.0-draft.4", "scope": "官方模型参考 · qpos0；不等同 alpha 实机配置或工程验收", "sourceCommit": COMMIT, "counts": counts}, "parts": parts, "bodies": bodies, "joints": joints, "sources": sources, "evidence": evidence}
