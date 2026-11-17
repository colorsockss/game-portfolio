# 맵의 것(/Game/Environment/<메시의 키>)과 움직이지 않는 개체(/Game/Props/<이름>: 채집물, 바닥 아이템)의 스태틱 메시를 mmo/art/의 FBX에서
# 가져온다(backlog 91). 원본은 두 엔진이 함께 읽도록 저장소의 mmo/art/에 둔다(출처는 docs/art.md). 다시 돌리면 같은 에셋을 새로 만든다.
#   - 크기: 종류마다 키나 너비(m, 가로와 세로 가운데 긴 쪽)를 맞춘다. 원점을 바닥의 가운데로 옮긴다(맵 액터와 개체 액터가 그 자리에 놓음).
#   - 방향: 발자국이 길쭉한 맵의 것은 긴 변이 발자국의 긴 변(가로 = Y)을 따르게 90° 돈다(MapObjectKinds의 가로·세로).
#   - 머티리얼: 맵의 것은 가져오기가 만드는 불투명한 원본의 머티리얼이고, 개체는 M_EntityProp의 인스턴스(원본의 색. 서서히 나타나고 사라짐)다.
#     FBX마다 머티리얼 이름이 겹쳐(Green 등) 종류마다 하위 폴더에 가져오고 메시만 위로 옮긴다.
# 그 뒤 MmoBuildMap이 맵 액터에 진짜 메시를 입히고, MmoCreateCharacterAssets가 표현 표에 채집물과 바닥 아이템의 줄을 둔다.
# M_EntityProp은 먼저 create_entity_materials.py로 만든다.
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/import_props.py" -unattended -nosplash -nullrhi
import math
import os

import unreal

ART = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art"))
ENTITY_PROP = "/Game/Materials/M_EntityProp"

# (메시의 키, 맞출 것, m, 발자국(가로 Y, 세로 X. 길쭉한 것만)). 키와 발자국은 mmo/data/MapObjectKinds.xlsx와 같다.
ENVIRONMENT = [
    ("house_small", "width", 6.0, (6, 4)),
    ("house_large", "width", 10.0, (10, 6)),
    ("fence", "width", 4.0, (4, 1)),
    ("tree", "height", 6.0, None),
    ("mountain", "width", 10.0, None),
    ("grass", "height", 0.6, None),
    ("rock", "height", 1.4, None),
    ("rock_large", "width", 4.0, (4, 3)),
    ("flower", "height", 0.6, None),
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


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


def import_mesh(path, folder, entity, scale=1.0, yaw=0.0, translation=(0.0, 0.0, 0.0)):
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
    if entity:
        texture_data = options.get_editor_property("texture_import_data")
        texture_data.set_editor_property("base_material_name", unreal.SoftObjectPath(f"{ENTITY_PROP}.M_EntityProp"))
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


def bring(path, root, name, fit, meters, footprint, entity):
    """두 번 가져온다: 크기를 재고, 크기 배수·회전·원점을 넣어 다시. 메시는 <root>/<name>, 머티리얼은 <root>/<name>/에 둔다."""
    folder = f"{root}/{name}"
    target = f"{root}/{name}"
    for old in (target, folder):
        if assets.does_asset_exist(old):
            assets.delete_asset(old)
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)
    first = import_mesh(path, folder, entity)
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
    mesh = import_mesh(path, folder, entity, scale, yaw, (-rx, -ry, -bottom))
    if not assets.rename_asset(mesh.get_path_name(), target):
        raise RuntimeError(f"Could not move {mesh.get_path_name()} to {target}")
    mesh = unreal.load_asset(target)
    final = mesh.get_bounds()
    unreal.log_warning(f"[props] {target}: scale {scale:.3f}, yaw {yaw:.0f}, size {final.box_extent.x * 2 / 100:.2f} x {final.box_extent.y * 2 / 100:.2f} x {final.box_extent.z * 2 / 100:.2f} m, bottom {(final.origin.z - final.box_extent.z):.1f}")
    return mesh


for key, fit, meters, footprint in ENVIRONMENT:
    bring(os.path.join(ART, "environment", f"{key}.fbx"), "/Game/Environment", key, fit, meters, footprint, False)

for name, fit, meters, tint in PROPS:
    mesh = bring(os.path.join(ART, "entities", f"{name}.fbx"), "/Game/Props", name, fit, meters, None, True)
    if tint is not None:
        for slot in mesh.get_editor_property("static_materials"):
            instance = slot.get_editor_property("material_interface")
            color = materials.get_material_instance_vector_parameter_value(instance, "Color")
            materials.set_material_instance_vector_parameter_value(instance, "Color", unreal.LinearColor(color.r * tint[0], color.g * tint[1], color.b * tint[2], 1.0))
            save(instance)

if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(save_map_packages=False, save_content_packages=True):
    raise RuntimeError("Could not save the imported packages")
