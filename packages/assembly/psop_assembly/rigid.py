"""One proper rigid transform for an entire mapping; no per-hole fitting."""
import math


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def length(v):
    return math.sqrt(dot(v, v))


def unit(v):
    if len(v) != 3 or not all(math.isfinite(x) for x in v) or length(v) < 1e-12:
        raise ValueError("Expected a finite nonzero 3-vector")
    magnitude = length(v)
    return [x / magnitude for x in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def apply(rotation, vector):
    return [dot(row, vector) for row in rotation]


def determinant(matrix):
    return dot(matrix[0], cross(matrix[1], matrix[2]))


def _basis(first, second):
    x = unit(first)
    y = unit([second[i] - dot(second, x) * x[i] for i in range(3)])
    z = cross(x, y)
    return [[x[i], y[i], z[i]] for i in range(3)]


def fit_mapping(holes_a, holes_b, axis_relation, position_tolerance, angle_tolerance, unoriented_sign=1.):
    """Return zero/one determinate pose or an explicitly underdetermined family.

    Centers and directed axes are all expressed in each side's single common
    rigid frame. A pose maps frame B into frame A with determinant +1.
    """
    if len(holes_a) != len(holes_b) or not holes_a:
        return {"status": "fail", "reason": "The mapping is not a nonempty bijection"}
    if axis_relation not in {"parallel", "opposed", "unoriented"}:
        raise ValueError("Unknown directed-axis relation")
    for i in range(len(holes_a)):
        for j in range(i):
            da = length(sub(holes_a[i]["center_m"], holes_a[j]["center_m"]))
            db = length(sub(holes_b[i]["center_m"], holes_b[j]["center_m"]))
            if abs(da - db) > 2 * position_tolerance:
                return {"status": "fail", "reason": "Hole distances cannot share one rigid transform"}
    centers = [(sub(a["center_m"], holes_a[0]["center_m"]), sub(b["center_m"], holes_b[0]["center_m"]))
               for a, b in zip(holes_a[1:], holes_b[1:])]
    sign = -1. if axis_relation == "opposed" else unoriented_sign if axis_relation == "unoriented" else 1.
    vectors = centers + [([sign * x for x in unit(a["axis"])], unit(b["axis"])) for a, b in zip(holes_a, holes_b)]
    independent = None
    for a1, b1 in vectors:
        if length(a1) < 1e-12 or length(b1) < 1e-12:
            continue
        for a2, b2 in vectors:
            if length(a2) < 1e-12 or length(b2) < 1e-12:
                continue
            if length(cross(unit(a1), unit(a2))) > 1e-8 and length(cross(unit(b1), unit(b2))) > 1e-8:
                independent = (a1, b1, a2, b2)
                break
        if independent:
            break
    if independent is None:
        return {"status": "underdetermined", "transform": None,
                "reason": "The selected point/axis constraints leave a continuous twist or pose family"}
    a1, b1, a2, b2 = independent
    basis_a, basis_b = _basis(a1, a2), _basis(b1, b2)
    rotation = [[sum(basis_a[i][k] * basis_b[j][k] for k in range(3)) for j in range(3)] for i in range(3)]
    translation = sub(holes_a[0]["center_m"], apply(rotation, holes_b[0]["center_m"]))
    position_error, angle_error = 0., 0.
    for a, b in zip(holes_a, holes_b):
        transformed = [x + y for x, y in zip(apply(rotation, b["center_m"]), translation)]
        position_error = max(position_error, length(sub(a["center_m"], transformed)))
        cosine = dot(unit(a["axis"]), unit(apply(rotation, b["axis"])))
        cosine = abs(cosine) if axis_relation == "unoriented" else sign * cosine
        angle_error = max(angle_error, math.acos(max(-1., min(1., cosine))))
    if position_error > position_tolerance or angle_error > angle_tolerance or abs(determinant(rotation) - 1) > 1e-8:
        return {"status": "fail", "reason": "One proper rigid transform does not satisfy every center and axis",
                "max_position_residual_m": position_error, "max_axis_residual_rad": angle_error}
    return {"status": "determined", "transform": {"rotation": rotation, "translation_m": translation,
            "maps_frame_b_to_a": [holes_b[0]["frame_ref"], holes_a[0]["frame_ref"]], "determinant": determinant(rotation)},
            "max_position_residual_m": position_error, "max_axis_residual_rad": angle_error}

