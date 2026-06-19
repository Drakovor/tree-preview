import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "moba_quality_chunk.glb"
random.seed(20260619)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, roughness=0.9, alpha=1.0, emission=None, emission_strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        material.blend_method = "BLEND"
        material.use_screen_refraction = False
    if emission:
        bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return material


MATS = {}


def make_materials():
    MATS.update(
        {
            "grass": mat("painted_mossy_terrain", (0.28, 0.43, 0.24), 0.95),
            "grass_dark": mat("baked_canopy_shadow", (0.11, 0.19, 0.09), 0.98),
            "grass_light": mat("painted_grass_lit_edge", (0.44, 0.58, 0.28), 0.95, 0.58),
            "ground_shadow": mat("painted_contact_shadow_geometry", (0.035, 0.07, 0.035), 0.98, 0.34),
            "river_bank": mat("sculpted_muddy_river_bank", (0.23, 0.33, 0.20), 0.96),
            "lane": mat("painted_compacted_lane", (0.50, 0.37, 0.20), 0.94),
            "lane_light": mat("worn_lane_highlight", (0.72, 0.55, 0.27), 0.94, 0.5),
            "lane_dark": mat("worn_lane_edge_dark", (0.27, 0.23, 0.13), 0.96, 0.3),
            "river": mat("clear_shallow_water", (0.035, 0.34, 0.33), 0.55, 0.58, (0.02, 0.18, 0.18), 0.06),
            "water_ripple": mat("painted_water_ripple_geometry", (0.38, 0.82, 0.70), 0.58, 0.34, (0.08, 0.36, 0.28), 0.08),
            "rock": mat("sculpted_warm_cliff_rock", (0.30, 0.35, 0.29), 0.96),
            "rock_light": mat("painted_cliff_top_plane", (0.40, 0.45, 0.33), 0.96),
            "slab": mat("carved_lane_stone", (0.44, 0.39, 0.28), 0.92),
            "bark": mat("twisted_bark", (0.36, 0.22, 0.12), 0.94),
            "leaf": mat("sculpted_leaf_plate", (0.23, 0.43, 0.17), 0.94),
            "leaf_light": mat("leaf_high_plane", (0.40, 0.58, 0.22), 0.94),
            "brush": mat("gameplay_brush_blades", (0.30, 0.55, 0.20), 0.9),
            "glow": mat("objective_aqua_glow", (0.50, 0.95, 0.80), 0.46, 0.82, (0.18, 0.9, 0.75), 0.8),
            "orange_glow": mat("enemy_objective_warm_glow", (1.0, 0.55, 0.28), 0.48, 0.75, (1.0, 0.35, 0.12), 0.55),
        }
    )


def hash_noise(x, z):
    return math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1


def smooth_noise(x, z):
    ix = math.floor(x)
    iz = math.floor(z)
    fx = x - ix
    fz = z - iz
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    a = hash_noise(ix, iz)
    b = hash_noise(ix + 1, iz)
    c = hash_noise(ix, iz + 1)
    d = hash_noise(ix + 1, iz + 1)
    return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz


def smoothstep(a, b, v):
    t = max(0.0, min(1.0, (v - a) / max(0.0001, b - a)))
    return t * t * (3 - 2 * t)


def nearest_segment(px, pz, ax, az, bx, bz):
    abx = bx - ax
    abz = bz - az
    apx = px - ax
    apz = pz - az
    length = abx * abx + abz * abz
    t = max(0.0, min(1.0, (apx * abx + apz * abz) / length)) if length else 0
    x = ax + abx * t
    z = az + abz * t
    return math.hypot(px - x, pz - z), t, math.atan2(abz, abx), x, z


def distance_to_path(px, pz, points):
    best = (9999, 0, 0, points[0][0], points[0][1])
    for i in range(len(points) - 1):
        hit = nearest_segment(px, pz, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
        if hit[0] < best[0]:
            best = hit
    return best


def path_point(points, t):
    t = max(0.0, min(0.9999, t))
    scaled = t * (len(points) - 1)
    i = int(math.floor(scaled))
    local = scaled - i
    ax, az = points[i]
    bx, bz = points[i + 1]
    return (
        ax + (bx - ax) * local,
        az + (bz - az) * local,
        math.atan2(bz - az, bx - ax),
    )


LANE = [(-23, -9.2), (-15.8, -7.2), (-8.4, -4.6), (-1.2, -2.2), (6.7, 1.0), (15.2, 4.3), (23.2, 8.3)]
RIVER = [(-24.2, 5.6), (-16.4, 2.8), (-8.6, 0.4), (-0.8, -0.8), (7.8, -0.2), (16.2, 2.4), (24.0, 5.4)]
NORTH = [(-24.5, 10.8), (-17.0, 13.0), (-8.5, 12.2), (1.5, 10.8), (12.0, 12.2), (24.2, 10.2)]
SOUTH = [(-24.2, -15.0), (-14.0, -14.4), (-4.2, -13.2), (5.6, -12.2), (15.8, -11.1), (24.5, -12.6)]
WEST = [(-24.5, 10.8), (-25.2, 4.8), (-24.2, -1.8), (-25.0, -8.2), (-24.2, -15.0)]
EAST = [(24.2, 10.2), (25.0, 4.4), (24.4, -1.7), (25.2, -7.1), (24.5, -12.6)]
BRUSH_ZONES = [(-18.2, 9.1, 5.2, 2.3), (-4.8, 9.5, 6.4, 2.2), (14.8, 8.8, 6, 2.3), (-18.8, -12.2, 5.8, 2.2), (2, -11.3, 6.8, 2.1), (17.2, -8.8, 5.8, 2.4)]
FOOTPRINT = [
    (-27.5, 9.8),
    (-24.0, 15.2),
    (-12.5, 16.8),
    (1.5, 15.6),
    (14.2, 16.0),
    (27.2, 11.6),
    (28.4, 3.6),
    (27.4, -7.8),
    (22.5, -15.8),
    (8.0, -17.6),
    (-6.8, -17.4),
    (-20.8, -16.2),
    (-28.0, -10.2),
    (-29.0, -1.6),
]


def point_in_polygon(x, z, polygon):
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, zi = polygon[i]
        xj, zj = polygon[j]
        if (zi > z) != (zj > z):
            denom = (zj - zi) if abs(zj - zi) > 0.0001 else 0.0001
            if x < ((xj - xi) * (z - zi)) / denom + xi:
                inside = not inside
        j = i
    return inside


def terrain_masks(x, z):
    lane = distance_to_path(x, z, LANE)[0]
    river = distance_to_path(x, z, RIVER)[0]
    cliff = min(
        distance_to_path(x, z, NORTH)[0],
        distance_to_path(x, z, SOUTH)[0],
        distance_to_path(x, z, WEST)[0],
        distance_to_path(x, z, EAST)[0],
    )
    lane_mask = 1 - smoothstep(1.4, 4.0, lane)
    river_mask = 1 - smoothstep(1.2, 3.2, river)
    cliff_mask = 1 - smoothstep(0.8, 3.0, cliff)
    brush_mask = 0
    for cx, cz, rx, rz in BRUSH_ZONES:
        brush_mask = max(brush_mask, 1 - smoothstep(0.55, 1.18, math.hypot((x - cx) / rx, (z - cz) / rz)))
    return lane_mask, river_mask, cliff_mask, brush_mask


def terrain_height(x, z):
    lane_mask, river_mask, cliff_mask, brush_mask = terrain_masks(x, z)
    broad = (smooth_noise(x * 0.16, z * 0.16) - 0.5) * 0.34
    fine = (smooth_noise(x * 0.55 + 8, z * 0.55 - 4) - 0.5) * 0.07
    sculpt = math.sin(x * 0.16 - z * 0.08) * 0.045 + math.sin(z * 0.22 + 1.4) * 0.035
    return 0.02 + broad + fine + sculpt - river_mask * 0.44 - lane_mask * 0.07 + cliff_mask * 0.92 + brush_mask * 0.13


def create_mesh(name, verts, faces, material):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.material_index = 0
        poly.use_smooth = True
    return obj


def create_terrain():
    min_x, max_x, min_z, max_z = -27.5, 27.5, -17.5, 16.8
    nx, nz = 156, 102
    verts = []
    for iz in range(nz + 1):
        z = min_z + (max_z - min_z) * iz / nz
        for ix in range(nx + 1):
            x = min_x + (max_x - min_x) * ix / nx
            verts.append((x, z, terrain_height(x, z)))
    faces = []
    face_mats = []
    for iz in range(nz):
        for ix in range(nx):
            a = iz * (nx + 1) + ix
            cx = min_x + (max_x - min_x) * (ix + 0.5) / nx
            cz = min_z + (max_z - min_z) * (iz + 0.5) / nz
            if not point_in_polygon(cx, cz, FOOTPRINT):
                continue
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
            lane_mask, river_mask, cliff_mask, brush_mask = terrain_masks(cx, cz)
            if cliff_mask > 0.42:
                face_mats.append(2)
            elif brush_mask > 0.56:
                face_mats.append(1)
            else:
                face_mats.append(0)
    mesh = bpy.data.meshes.new("authored_sculpted_terrain_continuousMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("authored_sculpted_terrain_continuous", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATS["grass"])
    obj.data.materials.append(MATS["grass_dark"])
    obj.data.materials.append(MATS["rock_light"])
    for i, poly in enumerate(obj.data.polygons):
      poly.material_index = face_mats[i]
      poly.use_smooth = True
    return obj


def create_ribbon(name, points, width, material, y_offset=0.06, material_light=None, light_stride=0):
    left, right = [], []
    steps = 100
    for i in range(steps + 1):
        x, z, angle = path_point(points, i / steps)
        nx = -math.sin(angle)
        nz = math.cos(angle)
        w = width * (0.86 + hash_noise(i * 0.21, width) * 0.18)
        h = terrain_height(x, z) + y_offset
        left.append((x + nx * w, z + nz * w, h))
        right.append((x - nx * w, z - nz * w, h))
    verts = []
    faces = []
    mats = []
    for i in range(steps):
        base = len(verts)
        verts.extend([left[i], right[i], right[i + 1], left[i + 1]])
        faces.append((base, base + 1, base + 2, base + 3))
        mats.append(1 if material_light and light_stride and i % light_stride == 0 else 0)
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if material_light:
        obj.data.materials.append(material_light)
    for i, poly in enumerate(obj.data.polygons):
        poly.material_index = mats[i]
        poly.use_smooth = True
    return obj


def create_offset_ribbon(name, points, side_offset, width, material, y_offset=0.09, steps=96, wobble=0.14):
    left, right = [], []
    for i in range(steps + 1):
        x, z, angle = path_point(points, i / steps)
        nx = -math.sin(angle)
        nz = math.cos(angle)
        offset = side_offset + (smooth_noise(i * 0.21, side_offset + width) - 0.5) * wobble
        local_width = width * (0.82 + smooth_noise(i * 0.18 + 3.0, width) * 0.28)
        cx = x + nx * offset
        cz = z + nz * offset
        h = terrain_height(cx, cz) + y_offset
        left.append((cx + nx * local_width, cz + nz * local_width, h))
        right.append((cx - nx * local_width, cz - nz * local_width, h))
    verts = []
    faces = []
    for i in range(steps):
        base = len(verts)
        verts.extend([left[i], right[i], right[i + 1], left[i + 1]])
        faces.append((base, base + 1, base + 2, base + 3))
    return create_mesh(name, verts, faces, material)


def add_blob_decal(name, x, z, sx, sz, rotation, material, y_offset=0.105, segments=28, noise=0.18):
    verts = [(x, z, terrain_height(x, z) + y_offset)]
    for i in range(segments):
        t = i / segments * math.tau
        local_radius = 1.0 + (smooth_noise(math.cos(t) * 2.4 + x, math.sin(t) * 2.4 + z) - 0.5) * noise
        lx = math.cos(t) * sx * local_radius
        lz = math.sin(t) * sz * local_radius
        wx = x + math.cos(rotation) * lx - math.sin(rotation) * lz
        wz = z + math.sin(rotation) * lx + math.cos(rotation) * lz
        verts.append((wx, wz, terrain_height(wx, wz) + y_offset))
    faces = []
    for i in range(1, segments + 1):
        faces.append((0, i, 1 + (i % segments)))
    obj = create_mesh(name, verts, faces, material)
    return obj


def create_cliff_wall(name, points, side, material):
    steps = 72
    verts = []
    faces = []
    for i in range(steps + 1):
        x, z, angle = path_point(points, i / steps)
        nx = -math.sin(angle) * side
        nz = math.cos(angle) * side
        top = terrain_height(x + nx * 0.4, z + nz * 0.4) + 0.26
        foot = top - 1.35 - hash_noise(x * 0.2, z * 0.2) * 0.35
        width = 1.85 + hash_noise(x * 0.4, z * 0.4) * 0.85
        verts.extend([(x - nx * 0.1, z - nz * 0.1, top), (x + nx * width, z + nz * width, top + 0.08), (x + nx * (width + 0.42), z + nz * (width + 0.42), foot)])
    for i in range(steps):
        a = i * 3
        b = (i + 1) * 3
        faces.extend([(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)])
    return create_mesh(name, verts, faces, material)


def add_bevel(obj, amount=0.035, segments=1):
    bevel = obj.modifiers.new("controlled_asset_bevel", "BEVEL")
    bevel.width = amount
    bevel.segments = segments
    bevel.affect = "EDGES"
    obj.modifiers.new("weighted_asset_normals", "WEIGHTED_NORMAL")


def add_slab(name, x, z, angle, sx, sz, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, z, terrain_height(x, z) + 0.13), rotation=(0, 0, angle))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (sx, sz, 0.055)
    obj.data.materials.append(material)
    add_bevel(obj, 0.045, 1)
    return obj


def add_rock(name, x, z, sx, sy, sz, material):
    ring = 9
    local = random.Random(int((x * 91 + z * 137) * 1000))
    verts = [(0, 0, sy * 0.52)]
    for i in range(ring):
        t = i / ring * math.tau
        r = 0.72 + local.random() * 0.36
        verts.append((math.cos(t) * sx * r, math.sin(t) * sz * r, sy * (0.08 + local.random() * 0.18)))
    for i in range(ring):
        t = i / ring * math.tau
        r = 0.82 + local.random() * 0.28
        verts.append((math.cos(t) * sx * r, math.sin(t) * sz * r, -sy * (0.34 + local.random() * 0.14)))
    verts.append((0, 0, -sy * 0.42))
    bottom = len(verts) - 1
    faces = []
    for i in range(1, ring + 1):
        nxt = 1 + (i % ring)
        faces.append((0, i, nxt))
        lo = ring + i
        lo_next = ring + 1 + (i % ring)
        faces.append((i, lo, lo_next, nxt))
        faces.append((bottom, lo_next, lo))
    obj = create_mesh(name, verts, faces, material)
    obj.location = (x, z, terrain_height(x, z) + sy * 0.5)
    obj.rotation_euler = (local.uniform(-0.16, 0.16), local.uniform(-0.14, 0.14), local.uniform(0, math.tau))
    obj.modifiers.new("weighted_faceted_rock_normals", "WEIGHTED_NORMAL")
    return obj


def create_leaf_plate(name, x, z, y, sx, sz, rot, material):
    ring = 18
    verts = [(0, 0, 0.24)]
    for i in range(ring):
        t = i / ring * math.tau
        notch = 1 + math.sin(t * 3.0 + 0.3) * 0.06
        verts.append((math.cos(t) * notch, math.sin(t) * 0.58 * notch, math.sin(t * 2) * 0.02))
    faces = []
    for i in range(1, ring + 1):
        faces.append((0, i, 1 + (i % ring)))
    obj = create_mesh(name, verts, faces, material)
    obj.location = (x, z, y)
    obj.rotation_euler = (random.uniform(-0.08, 0.08), random.uniform(-0.06, 0.06), rot)
    obj.scale = (sx, sz, 0.7 + random.random() * 0.25)
    return obj


def add_tree_cluster(cx, cz, rx, rz, seed):
    local = random.Random(seed)
    add_blob_decal("authored_canopy_integrated_ground_shadow", cx, cz, rx * 0.74, rz * 0.72, local.uniform(-0.35, 0.35), MATS["ground_shadow"], 0.085, 32, 0.22)
    for tree in range(4):
        angle = local.random() * math.tau
        radius = math.sqrt(local.random())
        x = cx + math.cos(angle) * radius * rx * 0.64
        z = cz + math.sin(angle) * radius * rz * 0.64
        h = terrain_height(x, z)
        trunk_height = 1.15 + local.random() * 0.75
        bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=0.17 + local.random() * 0.06, depth=trunk_height, location=(x, z, h + trunk_height * 0.5), rotation=(local.uniform(-0.08, 0.08), local.uniform(-0.08, 0.08), local.uniform(0, math.tau)))
        trunk = bpy.context.object
        trunk.name = "authored_tree_twisted_trunk"
        trunk.scale.x *= 0.8 + local.random() * 0.3
        trunk.data.materials.append(MATS["bark"])
        add_bevel(trunk, 0.025, 1)
        for branch in range(3):
            spread = angle + branch * math.tau / 3 + local.uniform(-0.45, 0.45)
            length = 0.72 + local.random() * 0.65
            loc = (x + math.cos(spread) * length * 0.33, z + math.sin(spread) * length * 0.33, h + trunk_height * (0.72 + local.random() * 0.18))
            bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=0.055, depth=length, location=loc)
            br = bpy.context.object
            br.name = "authored_tree_designed_branch"
            br.rotation_euler = (0, math.pi / 2 - 0.34, spread)
            br.data.materials.append(MATS["bark"])
            add_bevel(br, 0.012, 1)
        for plate in range(5):
            tier = plate / 4
            px = x + local.uniform(-0.65, 0.65)
            pz = z + local.uniform(-0.42, 0.42)
            py = h + trunk_height * 0.88 + 0.2 + tier * 0.52
            create_leaf_plate(
                "authored_tree_sculpted_leaf_plate",
                px,
                pz,
                py,
                1.25 + local.random() * 1.1,
                0.85 + local.random() * 0.55,
                local.random() * math.tau,
                MATS["leaf_light"] if plate > 2 else MATS["leaf"],
            )


def add_ground_art_layers():
    create_offset_ribbon("authored_lane_left_mossy_shoulder", LANE, 2.45, 0.58, MATS["grass_light"], 0.102, 96, 0.32)
    create_offset_ribbon("authored_lane_right_mossy_shoulder", LANE, -2.45, 0.58, MATS["grass_light"], 0.102, 96, 0.32)
    create_offset_ribbon("authored_lane_left_dark_cut", LANE, 3.05, 0.22, MATS["lane_dark"], 0.104, 86, 0.28)
    create_offset_ribbon("authored_lane_right_dark_cut", LANE, -3.05, 0.22, MATS["lane_dark"], 0.104, 86, 0.28)
    create_offset_ribbon("authored_river_left_muddy_bank", RIVER, 1.75, 0.52, MATS["river_bank"], 0.112, 100, 0.28)
    create_offset_ribbon("authored_river_right_muddy_bank", RIVER, -1.75, 0.52, MATS["river_bank"], 0.112, 100, 0.28)
    create_offset_ribbon("authored_river_left_soft_highlight", RIVER, 1.05, 0.18, MATS["water_ripple"], 0.13, 72, 0.2)
    create_offset_ribbon("authored_river_right_soft_highlight", RIVER, -1.05, 0.18, MATS["water_ripple"], 0.13, 72, 0.2)
    for i in range(20):
        x, z, angle = path_point(RIVER, (i + random.random() * 0.6) / 20)
        nx = -math.sin(angle)
        nz = math.cos(angle)
        side = -1 if i % 2 else 1
        add_blob_decal(
            "authored_hand_painted_river_pool_detail",
            x + nx * side * random.uniform(0.2, 1.2),
            z + nz * side * random.uniform(0.2, 1.2),
            random.uniform(0.36, 0.9),
            random.uniform(0.08, 0.22),
            -angle + random.uniform(-0.35, 0.35),
            MATS["water_ripple"],
            0.138,
            20,
            0.28,
        )
    for i in range(24):
        zone = random.choice(BRUSH_ZONES)
        cx, cz, rx, rz = zone
        a = random.random() * math.tau
        r = math.sqrt(random.random())
        add_blob_decal(
            "authored_moss_paint_shape_not_texture",
            cx + math.cos(a) * r * rx,
            cz + math.sin(a) * r * rz,
            random.uniform(0.55, 1.5),
            random.uniform(0.18, 0.48),
            random.random() * math.tau,
            MATS["grass_light"],
            0.11,
            22,
            0.35,
        )


def add_brush_clumps():
    local = random.Random(61841)
    for idx, (cx, cz, rx, rz) in enumerate(BRUSH_ZONES):
        for clump in range(10):
            a = local.random() * math.tau
            r = math.sqrt(local.random())
            x = cx + math.cos(a) * r * rx
            z = cz + math.sin(a) * r * rz
            h = terrain_height(x, z)
            create_leaf_plate(
                "authored_low_brush_sculpted_leaf_clump",
                x,
                z,
                h + 0.34 + local.random() * 0.22,
                0.45 + local.random() * 0.7,
                0.28 + local.random() * 0.32,
                local.random() * math.tau,
                MATS["brush"] if clump % 3 else MATS["leaf"],
            )


def add_objective():
    x, z = 3.2, -0.4
    h = terrain_height(x, z)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=2.4, depth=0.34, location=(x, z, h + 0.17), rotation=(0, 0, 0.22))
    base = bpy.context.object
    base.name = "authored_central_objective_carved_base"
    base.data.materials.append(MATS["slab"])
    add_bevel(base, 0.06, 2)
    for i in range(6):
        a = i / 6 * math.tau + 0.18
        add_slab("authored_objective_radial_carved_slab", x + math.cos(a) * 2.05, z + math.sin(a) * 2.05, -a, 0.52, 0.18, MATS["rock_light"])
    for i in range(4):
        a = i / 4 * math.tau + 0.45
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.28, radius2=0.18, depth=1.5, location=(x + math.cos(a) * 1.55, z + math.sin(a) * 1.55, h + 1.08), rotation=(0.08, 0, -a))
        pillar = bpy.context.object
        pillar.name = "authored_objective_tapered_guardian_pillar"
        pillar.data.materials.append(MATS["rock"])
        add_bevel(pillar, 0.035, 1)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.72, location=(x, z, h + 1.95))
    crystal = bpy.context.object
    crystal.name = "authored_objective_faceted_crystal"
    crystal.scale = (0.72, 0.72, 1.42)
    crystal.data.materials.append(MATS["glow"])


def add_lane_props():
    for i in range(38):
        x, z, angle = path_point(LANE, (i + random.random() * 0.7) / 38)
        nx = -math.sin(angle)
        nz = math.cos(angle)
        side = random.uniform(-1.4, 1.4)
        add_slab("authored_lane_designed_embedded_stone", x + nx * side, z + nz * side, -angle + random.uniform(-0.4, 0.4), random.uniform(0.34, 0.95), random.uniform(0.12, 0.34), MATS["slab"])
    rock_count = 86
    for i in range(rock_count):
        path = random.choice([NORTH, SOUTH, WEST, EAST])
        x, z, angle = path_point(path, (i + random.random() * 0.8) / rock_count)
        nx = -math.sin(angle)
        nz = math.cos(angle)
        side = 1 if path in [NORTH, EAST] else -1
        add_rock("authored_cliff_placed_shoulder_rock", x + nx * side * random.uniform(0.7, 2.2), z + nz * side * random.uniform(0.7, 2.2), random.uniform(0.35, 0.9), random.uniform(0.22, 0.62), random.uniform(0.28, 0.75), MATS["rock"])


def main():
    clear_scene()
    make_materials()
    create_terrain()
    create_ribbon("authored_lane_worn_designed_ribbon", LANE, 2.05, MATS["lane"], 0.075, MATS["lane_light"], 9)
    create_ribbon("authored_river_shallow_transparent_ribbon", RIVER, 1.55, MATS["river"], 0.115)
    add_ground_art_layers()
    create_cliff_wall("authored_north_sculpted_cliff_wall", NORTH, 1, MATS["rock"])
    create_cliff_wall("authored_south_sculpted_cliff_wall", SOUTH, -1, MATS["rock"])
    create_cliff_wall("authored_west_sculpted_cliff_wall", WEST, -1, MATS["rock"])
    create_cliff_wall("authored_east_sculpted_cliff_wall", EAST, 1, MATS["rock"])
    for idx, (cx, cz, rx, rz) in enumerate(BRUSH_ZONES[:6]):
        add_tree_cluster(cx, cz, rx, rz, 700 + idx)
    add_brush_clumps()
    add_lane_props()
    add_objective()
    bpy.ops.object.select_all(action="SELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )


if __name__ == "__main__":
    main()
