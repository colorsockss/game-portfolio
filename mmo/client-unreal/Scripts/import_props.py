# 맵의 것(/Game/Environment/<메시의 키>와 그 변형), 흩는 풀과 덤불(/Game/Environment/Foliage/<이름>. 102), 움직이지 않는 개체
# (/Game/Props/<이름>: 채집물, 바닥 아이템)의 스태틱 메시를 mmo/art/의 FBX에서 가져온다(backlog 91). 원본은 두 엔진이 함께 읽도록 저장소의 mmo/art/에 둔다(출처는 docs/art.md). 다시 돌리면 같은 에셋을 새로 만든다.
#   - 크기: 종류마다 키나 너비(m, 가로와 세로 가운데 긴 쪽)를 맞춘다. 원점을 바닥의 가운데로 옮긴다(맵 액터와 개체 액터가 그 자리에 놓음).
#   - 방향: 발자국이 길쭉한 맵의 것은 긴 변이 발자국의 긴 변(가로 = Y)을 따르게 90° 돈다(MapObjectKinds의 가로·세로).
#   - 머티리얼: 맵의 것은 가져오기가 만드는 불투명한 원본의 머티리얼이고, 개체와 카메라를 막는 맵의 것(건물, 테두리의 산. Map.tsv의 kind 줄)은
#     M_EntityProp의 인스턴스(원본의 색. 개체는 서서히 나타나고 사라지고, 맵의 것은 내 캐릭터를 가리면 반투명. 97)다. 마스크는 그리기가 더 비싸
#     나머지 맵의 것은 불투명하게 둔다. 나무·풀·꽃·덤불은 M_Foliage(create_content.py)의 인스턴스로 바람에 흔들린다(103. Wind = 꼭대기가
#     흔들리는 cm / 높이(m)²).
#     FBX마다 머티리얼 이름이 겹쳐(Green 등) 종류마다 하위 폴더에 가져오고 메시만 위로 옮긴다.
# 그 뒤 MmoBuildMap이 맵 액터에 진짜 메시를 입히고, MmoCreateCharacterAssets가 표현 표에 채집물과 바닥 아이템의 줄을 둔다.
# M_EntityProp은 먼저 create_entity_materials.py로, M_Foliage는 create_content.py로 만든다.
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/import_props.py" -unattended -nosplash -nullrhi
import math
import os

import unreal

ART = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art"))
MAP_LIST = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../shared/data/files/Map.tsv"))
ENTITY_PROP = "/Game/Materials/M_EntityProp"
FOLIAGE = "/Game/Materials/M_Foliage"

# (메시의 키 또는 변형, 맞출 것, m, 발자국(가로 Y, 세로 X. 길쭉한 것만), 바람에 흔들리는 cm(없으면 None)). 키와 발자국은
# mmo/data/MapObjectKinds.xlsx와 같고, <키>_<무엇>은 MmoBuildMap이 칸마다 고르는 같은 종류의 변형이다(102. MmoMapDecoration.cpp의 표).
ENVIRONMENT = [
    ("house_small", "width", 6.0, (6, 4), None),
    ("house_large", "width", 10.0, (10, 6), None),
    ("fence", "width", 4.0, (4, 1), None),
    ("tree", "height", 6.0, None, 18),
    ("tree_2", "height", 6.0, None, 18),
    ("tree_3", "height", 6.5, None, 18),
    ("tree_4", "height", 5.5, None, 18),
    ("tree_5", "height", 6.0, None, 18),
    ("tree_pine_1", "height", 6.5, None, 12),
    ("tree_pine_2", "height", 7.5, None, 12),
    ("tree_pine_3", "height", 7.0, None, 12),
    ("tree_birch_1", "height", 7.0, None, 18),
    ("tree_birch_2", "height", 7.5, None, 18),
    ("tree_dead_1", "height", 5.0, None, 6),
    ("tree_dead_2", "height", 5.5, None, 6),
    ("tree_dead_3", "height", 5.0, None, 6),
    ("mountain", "width", 10.0, None, None),
    ("mountain_2", "width", 10.0, None, None),
    ("mountain_3", "width", 10.0, None, None),
    ("grass", "height", 0.6, None, 6),
    ("grass_2", "height", 0.7, None, 6),
    ("grass_3", "height", 0.35, None, 4),
    ("rock", "height", 1.4, None, None),
    ("rock_2", "height", 1.2, None, None),
    ("rock_3", "height", 1.2, None, None),
    ("rock_4", "height", 1.3, None, None),
    ("rock_5", "height", 1.1, None, None),
    ("rock_large", "width", 4.0, (4, 3), None),
    ("rock_large_2", "width", 4.0, (4, 3), None),
    ("rock_large_3", "width", 4.0, (4, 3), None),
    ("rock_large_4", "width", 4.0, (4, 3), None),
    ("flower", "height", 0.6, None, 6),
    ("flower_2", "height", 0.7, None, 6),
    # 마을의 소품(102).
    ("well", "width", 2.0, None, None),
    ("market_stand", "width", 3.0, (3, 2), None),
    ("market_stall", "width", 3.0, (3, 1), None),
    ("barrel", "height", 1.1, None, None),
    ("crate", "width", 0.9, None, None),
    ("cart", "width", 3.0, (2, 3), None),
    ("bench", "width", 2.0, (2, 1), None),
    ("hay", "height", 1.4, None, None),
    ("bags", "width", 0.9, None, None),
    ("cauldron", "width", 0.9, None, None),
    ("bonfire", "width", 1.8, None, None),
    ("bell_tower", "width", 3.0, None, None),
]
# 흩는 풀과 덤불(102. MmoBuildMap이 인스턴스 메시로 흩음): (이름, 맞출 것, m, 바람에 흔들리는 cm). 모두 M_Foliage의 인스턴스다
# (흔들리지 않는 것도 인스턴스 메시에 쓰는 머티리얼을 하나로).
FOLIAGE_MESHES = [
    ("bush_1", "height", 1.2, 4),
    ("bush_2", "height", 1.1, 4),
    ("berries", "height", 1.2, 4),
    ("plant_1", "width", 1.0, 5),
    ("plant_3", "height", 0.8, 5),
    ("plant_4", "width", 1.4, 5),
    ("stump", "width", 1.1, 0),
    ("log", "width", 2.4, 0),
    ("pebble", "width", 0.5, 0),
    ("twig", "height", 0.9, 3),
    ("wheat", "height", 1.0, 8),
]
# (이름, 맞출 것, m, 색조). 색조는 같은 바위를 광석으로 쓸 때 원본의 색에 곱한다.
PROPS = [
    ("gather_pine", "height", 6.0, None),
    ("gather_oak", "height", 5.5, None),
    ("gather_copper", "width", 1.6, (1.0, 0.55, 0.3)),
    ("gather_iron", "width", 1.6, (0.5, 0.5, 0.56)),
    ("gather_mugwort", "height", 0.8, None),
    ("gather_ginseng", "width", 0.9, None),
    ("ground_item", "width", 0.6, None),
]

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

if unreal.load_asset(ENTITY_PROP) is None:
    raise RuntimeError(f"{ENTITY_PROP} is missing. Run create_entity_materials.py first.")
if unreal.load_asset(FOLIAGE) is None:
    raise RuntimeError(f"{FOLIAGE} is missing. Run create_content.py first.")


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


def camera_blocking_keys():
    """Map.tsv의 kind 줄(kind, 번호, 가로, 세로, 막는지, 카메라를 막는지, 메시의 키)에서 카메라를 막는 종류의 메시의 키."""
    with open(MAP_LIST, encoding="utf-8") as lines:
        rows = [line.rstrip("\n").split("\t") for line in lines if line.startswith("kind\t")]
    keys = {row[6] for row in rows if row[5] == "1"}
    if not keys:
        raise RuntimeError(f"{MAP_LIST} has no camera-blocking kind")
    return keys


def import_mesh(path, folder, entity, base, scale=1.0, yaw=0.0, translation=(0.0, 0.0, 0.0)):
    if not os.path.isfile(path):
        raise RuntimeError(f"{path} is missing")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", False)
    options.set_editor_property("import_animations", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("import_materials", True)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
    data = options.get_editor_property("static_mesh_import_data")
    data.set_editor_property("combine_meshes", True)
    # 맵의 것은 카메라를 막는 선 검사에 걸리도록 충돌을 만든다. 개체는 충돌이 필요 없다.
    data.set_editor_property("auto_generate_collision", not entity)
    data.set_editor_property("import_uniform_scale", scale)
    data.set_editor_property("import_rotation", unreal.Rotator(roll=0.0, pitch=0.0, yaw=yaw))
    data.set_editor_property("import_translation", unreal.Vector(*translation))
    if base:
        # 칸마다 원본의 색을 Color에 둔 base의 인스턴스를 만든다.
        texture_data = options.get_editor_property("texture_import_data")
        texture_data.set_editor_property("base_material_name", unreal.SoftObjectPath(f"{base}.{base.rsplit('/', 1)[1]}"))
        texture_data.set_editor_property("base_color_name", "Color")
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", path)
    task.set_editor_property("destination_path", folder)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    task.set_editor_property("options", options)
    tools.import_asset_tasks([task])
    meshes = [p for p in task.get_editor_property("imported_object_paths") if isinstance(unreal.load_asset(p), unreal.StaticMesh)]
    if len(meshes) != 1:
        raise RuntimeError(f"{path} did not import as one static mesh: {meshes}")
    return unreal.load_asset(meshes[0])


def bring(path, root, name, fit, meters, footprint, entity, base):
    """두 번 가져온다: 크기를 재고, 크기 배수·회전·원점을 넣어 다시. 메시는 <root>/<name>, 머티리얼은 <root>/<name>/에 둔다."""
    folder = f"{root}/{name}"
    target = f"{root}/{name}"
    for old in (target, folder):
        if assets.does_asset_exist(old):
            assets.delete_asset(old)
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)
    first = import_mesh(path, folder, entity, base)
    bounds = first.get_bounds()
    extent = bounds.box_extent
    origin = bounds.origin
    size = extent.z * 2.0 if fit == "height" else max(extent.x, extent.y) * 2.0
    scale = meters * 100.0 / size
    # 발자국의 긴 변(가로 = Y)과 모델의 긴 변이 다르면 90° 돈다.
    yaw = 90.0 if footprint and (footprint[0] > footprint[1]) != (extent.y > extent.x) else 0.0
    # 바닥의 가운데를 원점으로: 크기 배수를 곱하고 돈 뒤의 자리를 뺀다(가져오기는 v' = R(s v) + T).
    cx, cy, bottom = origin.x * scale, origin.y * scale, (origin.z - extent.z) * scale
    radians = math.radians(yaw)
    rx, ry = cx * math.cos(radians) - cy * math.sin(radians), cx * math.sin(radians) + cy * math.cos(radians)
    unreal.EditorAssetLibrary.delete_asset(first.get_path_name())
    mesh = import_mesh(path, folder, entity, base, scale, yaw, (-rx, -ry, -bottom))
    if not assets.rename_asset(mesh.get_path_name(), target):
        raise RuntimeError(f"Could not move {mesh.get_path_name()} to {target}")
    mesh = unreal.load_asset(target)
    # 가져오기가 원본의 머티리얼을 만들고도 칸에 끼우지 않은 칸(house_large의 Wood가 엔진의 WorldGridMaterial로 남음)을 같은 이름의 것으로 채운다.
    # static_materials를 통째로 바꾸면 저장에 남지 않아 set_material로 칸마다 바꾼다.
    filled = []
    for index, slot in enumerate(mesh.get_editor_property("static_materials")):
        material = slot.get_editor_property("material_interface")
        own = f"{folder}/{slot.get_editor_property('material_slot_name')}"
        if (material is None or not material.get_path_name().startswith(f"{folder}/")) and assets.does_asset_exist(own):
            mesh.set_material(index, unreal.load_asset(own))
            filled.append(own)
    if filled:
        save(mesh)
        unreal.log_warning(f"[props] {target}: filled the empty slots with {filled}")
    final = mesh.get_bounds()
    unreal.log_warning(f"[props] {target}: scale {scale:.3f}, yaw {yaw:.0f}, size {final.box_extent.x * 2 / 100:.2f} x {final.box_extent.y * 2 / 100:.2f} x {final.box_extent.z * 2 / 100:.2f} m, bottom {(final.origin.z - final.box_extent.z):.1f}")
    return mesh


def set_wind(mesh, sway):
    """꼭대기가 sway cm 흔들리게 M_Foliage 인스턴스의 Wind(cm / 높이(m)²)를 칸마다 둔다."""
    height = mesh.get_bounds().box_extent.z * 2.0 / 100.0
    for slot in mesh.get_editor_property("static_materials"):
        instance = slot.get_editor_property("material_interface")
        materials.set_material_instance_scalar_parameter_value(instance, "Wind", sway / max(height, 0.1) ** 2)
        save(instance)


camera_blocking = camera_blocking_keys()
for key, fit, meters, footprint, sway in ENVIRONMENT:
    # 카메라를 막는 종류는 그 키와 변형 모두(mountain_2 등) 가리면 반투명하다.
    faded = key in camera_blocking or key.rsplit("_", 1)[0] in camera_blocking
    base = ENTITY_PROP if faded else FOLIAGE if sway is not None else None
    mesh = bring(os.path.join(ART, "environment", f"{key}.fbx"), "/Game/Environment", key, fit, meters, footprint, False, base)
    if sway is not None:
        set_wind(mesh, sway)

for name, fit, meters, sway in FOLIAGE_MESHES:
    mesh = bring(os.path.join(ART, "environment", "foliage", f"{name}.fbx"), "/Game/Environment/Foliage", name, fit, meters, None, True, FOLIAGE)
    set_wind(mesh, sway)

for name, fit, meters, tint in PROPS:
    mesh = bring(os.path.join(ART, "entities", f"{name}.fbx"), "/Game/Props", name, fit, meters, None, True, ENTITY_PROP)
    if tint is not None:
        for slot in mesh.get_editor_property("static_materials"):
            instance = slot.get_editor_property("material_interface")
            color = materials.get_material_instance_vector_parameter_value(instance, "Color")
            materials.set_material_instance_vector_parameter_value(instance, "Color", unreal.LinearColor(color.r * tint[0], color.g * tint[1], color.b * tint[2], 1.0))
            save(instance)

if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(save_map_packages=False, save_content_packages=True):
    raise RuntimeError("Could not save the imported packages")
