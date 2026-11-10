# 직업마다 캐릭터(스켈레탈 메시, 스켈레톤, 애니메이션, 텍스처, 머티리얼)를 가져온다. 원본은 저장소에 두지 않고(docs/art.md에 출처),
# 압축을 푼 Quaternius "RPG Characters - Nov 2020"(CC0) 폴더를 MMO_CHARACTER_SOURCE로 준다. 다시 돌리면 같은 에셋을 덮는다.
#
#   MMO_CHARACTER_SOURCE="<압축을 푼 폴더>/RPG Characters - Nov 2020" \
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/import_characters.py" -unattended -nosplash -nullrhi
# 대기·달리기 블렌드 스페이스는 그 뒤에 에디터 모듈의 MmoCreateLocomotion 커맨드렛이 만든다(Python으로는 다시 계산되지 않음).
import os

import unreal

SOURCE = os.environ.get("MMO_CHARACTER_SOURCE")
if not SOURCE or not os.path.isdir(SOURCE):
    raise RuntimeError("Set MMO_CHARACTER_SOURCE to the unzipped 'RPG Characters - Nov 2020' folder.")

# 직업 → 원본 이름. 기사는 Warrior, 마법사는 Wizard다.
CLASSES = {"Knight": "Warrior", "Mage": "Wizard"}
MATERIAL = "/Game/Characters/M_Character"

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


def import_file(path, destination, options=None):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", path)
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    if options is not None:
        task.set_editor_property("options", options)
    tools.import_asset_tasks([task])
    imported = task.get_editor_property("imported_object_paths")
    if not imported:
        raise RuntimeError(f"Nothing was imported from {path}")
    return imported


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


# 텍스처 하나를 받는 캐릭터 머티리얼. 직업마다 인스턴스가 텍스처만 바꾼다.
if assets.does_asset_exist(MATERIAL):
    assets.delete_asset(MATERIAL)
material = tools.create_asset("M_Character", "/Game/Characters", unreal.Material, unreal.MaterialFactoryNew())
# 스켈레탈 메시 사용 표시가 없으면 게임에서는(에디터만 자동으로 켬) 엔진의 기본 머티리얼로 그린다.
material.set_editor_property("used_with_skeletal_mesh", True)
texture = materials.create_material_expression(material, unreal.MaterialExpressionTextureSampleParameter2D, -400, 0)
texture.set_editor_property("parameter_name", "BaseColor")
# 텍스처 파라미터는 기본 텍스처가 있어야 컴파일된다.
texture.set_editor_property("texture", unreal.load_asset("/Engine/EngineResources/DefaultTexture.DefaultTexture"))
materials.connect_material_property(texture, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
roughness = materials.create_material_expression(material, unreal.MaterialExpressionConstant, -400, 300)
roughness.set_editor_property("r", 0.8)
materials.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
materials.recompile_material(material)
save(material)

def material_instance(name, folder, texture_file):
    """M_Character에 텍스처 하나를 끼운 인스턴스."""
    texture_path = import_file(os.path.join(SOURCE, "Textures", texture_file), folder)[0]
    path = f"{folder}/{name}"
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    instance = tools.create_asset(name, folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    materials.set_material_instance_parent(instance, material)
    materials.set_material_instance_texture_parameter_value(instance, "BaseColor", unreal.load_asset(texture_path))
    save(instance)
    return instance


# 원본의 무기 이름(텍스처 파일 이름의 앞부분).
WEAPONS = {"Warrior": "Warrior_Sword", "Wizard": "Wizard_Staff"}

for class_name, source_name in CLASSES.items():
    folder = f"/Game/Characters/{class_name}"

    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("import_animations", True)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("create_physics_asset", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    import_file(os.path.join(SOURCE, "FBX", f"{source_name}.fbx"), folder, options)

    # 메시의 슬롯은 몸(<원본>_Texture)과 무기(<무기>_Texture) 둘이고, 슬롯 이름이 원본의 텍스처 이름이다.
    body = material_instance(f"MI_{class_name}", folder, f"{source_name}_Texture.png")
    weapon = material_instance(f"MI_{class_name}_Weapon", folder, f"{WEAPONS[source_name]}_Texture.png")
    mesh = unreal.load_asset(f"{folder}/{source_name}")
    slots = []
    for slot in mesh.get_editor_property("materials"):
        is_weapon = str(slot.get_editor_property("material_slot_name")).startswith(WEAPONS[source_name])
        slot.set_editor_property("material_interface", weapon if is_weapon else body)
        slots.append(slot)
    mesh.modify()
    mesh.set_editor_property("materials", slots)
    save(mesh)

# 가져오기 작업은 돌려준 에셋(메시)만 저장하므로, 함께 만든 스켈레톤과 애니메이션을 여기서 저장한다.
if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(save_map_packages=False, save_content_packages=True):
    raise RuntimeError("Could not save the imported packages")
for path in unreal.EditorAssetLibrary.list_assets("/Game/Characters", recursive=True):
    asset = unreal.load_asset(path)
    if isinstance(asset, unreal.SkeletalMesh):
        names = [slot.get_editor_property("material_interface").get_name() for slot in asset.get_editor_property("materials")]
        unreal.log(f"[import] {path} materials {names}")
