# 직업마다 캐릭터(스켈레탈 메시, 스켈레톤, 애니메이션, 텍스처, 머티리얼)를 mmo/art/characters/<직업>.fbx에서 가져온다(backlog 98).
# FBX와 텍스처는 Blender로 내보내 저장소에 둔 것이다(docs/art.md): 기사는 export_tripo_characters.py(Tripo의 모델과 UAL의 동작, PBR 텍스처),
# 마법사는 export_characters.py(System G6의 Modular RPG Characters, 색 텍스처).
# 다시 돌리면 직업의 폴더를 지우고 새로 만든다. 캐릭터 머티리얼(M_Character, M_EntityColor)은 먼저 create_entity_materials.py로 만든다.
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/import_characters.py" -unattended -nosplash -nullrhi
# 대기·달리기 블렌드 스페이스와 애니메이션 블루프린트, 표현 표의 줄은 그 뒤에 에디터 모듈의 MmoCreateCharacterAssets 커맨드렛이 만든다.
import os

import unreal

ART = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art/characters"))
CHARACTER = "/Game/Characters/M_Character"
CHARACTER_PBR = "/Game/Characters/M_CharacterPBR"
ENTITY_COLOR = "/Game/Characters/M_EntityColor"

# 직업의 폴더 이름 → FBX 이름. 메시는 FBX의 이름, 스켈레톤은 <FBX>_Skeleton이 된다.
CLASSES = {"Knight": "knight", "Mage": "mage"}
# 구운 무기의 칸(머티리얼 이름 Weapon_*)은 텍스처가 없어(원본의 무기 텍스처가 팩에 없음) 색만 준다. 게임은 이름에 Weapon이 든 칸을 무기로 본다.
WEAPON_COLORS = {"Weapon_Sword": (0.55, 0.57, 0.6), "Weapon_Staff": (0.3, 0.17, 0.08)}

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

for path in (CHARACTER, CHARACTER_PBR, ENTITY_COLOR):
    if unreal.load_asset(path) is None:
        raise RuntimeError(f"{path} is missing. Run create_entity_materials.py first.")


def import_file(path, destination, options=None):
    if not os.path.isfile(path):
        raise RuntimeError(f"{path} is missing. Run export_characters.py first.")
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


def instance(name, folder, parent):
    path = f"{folder}/{name}"
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    created = tools.create_asset(name, folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    materials.set_material_instance_parent(created, unreal.load_asset(parent))
    return created


def import_texture(path, folder, srgb=True, compression=None, flip_green=False):
    texture = unreal.load_asset(import_file(path, f"{folder}/Textures")[0])
    texture.set_editor_property("srgb", srgb)
    if compression is not None:
        texture.set_editor_property("compression_settings", compression)
    texture.set_editor_property("flip_green_channel", flip_green)
    save(texture)
    return texture


def slot_material(class_name, folder, slot_name):
    """칸 이름이 텍스처의 이름이면 그 텍스처를 끼운 M_Character의 인스턴스, PBR 셋(<칸>_basecolor, _normal, _orm)이 있으면 M_CharacterPBR의
    인스턴스, 무기면 색을 준 M_EntityColor의 인스턴스."""
    pbr = os.path.join(ART, "textures", f"{slot_name}_basecolor.jpg")
    if slot_name in WEAPON_COLORS:
        # 게임이 무기 칸을 머티리얼 이름(Weapon)으로 찾는다(MmoCharacterLook::ShowWeapon).
        created = instance(f"MI_{class_name}_Weapon", folder, ENTITY_COLOR)
        materials.set_material_instance_vector_parameter_value(created, "Color", unreal.LinearColor(*WEAPON_COLORS[slot_name], 1.0))
    elif os.path.isfile(pbr):
        created = instance(f"MI_{slot_name}", folder, CHARACTER_PBR)
        materials.set_material_instance_texture_parameter_value(created, "BaseColor", import_texture(pbr, folder))
        # Tripo의 노멀 맵은 OpenGL 방식(초록 = 위)이라 Unreal(DirectX 방식)에 맞게 초록을 뒤집는다.
        normal = import_texture(os.path.join(ART, "textures", f"{slot_name}_normal.jpg"), folder, False, unreal.TextureCompressionSettings.TC_NORMALMAP, True)
        materials.set_material_instance_texture_parameter_value(created, "Normal", normal)
        orm = import_texture(os.path.join(ART, "textures", f"{slot_name}_orm.png"), folder, False, unreal.TextureCompressionSettings.TC_DEFAULT)
        materials.set_material_instance_texture_parameter_value(created, "ORM", orm)
    else:
        texture = import_file(os.path.join(ART, "textures", f"{slot_name}.png"), f"{folder}/Textures")[0]
        created = instance(f"MI_{slot_name}", folder, CHARACTER)
        materials.set_material_instance_texture_parameter_value(created, "BaseColor", unreal.load_asset(texture))
    save(created)
    return created


for class_name, source_name in CLASSES.items():
    folder = f"/Game/Characters/{class_name}"
    # 늘 새로 가져온다(지난 팩의 메시와 동작이 남지 않게). 블렌드 스페이스와 블루프린트는 커맨드렛이 다시 만든다.
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)

    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("import_animations", True)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("create_physics_asset", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    # FBX는 Blender의 1 단위를 1 cm로 담아(마법사는 키 4.2, 기사는 키 1) 100배로 가져온다. 메시와 동작에 같은 배수를 주고, 게임의 키는 표현 표의 크기 배수가 맞춘다.
    options.get_editor_property("skeletal_mesh_import_data").set_editor_property("import_uniform_scale", 100.0)
    options.get_editor_property("anim_sequence_import_data").set_editor_property("import_uniform_scale", 100.0)
    import_file(os.path.join(ART, f"{source_name}.fbx"), folder, options)

    mesh = unreal.load_asset(f"{folder}/{source_name}")
    slots = []
    for slot in mesh.get_editor_property("materials"):
        slot.set_editor_property("material_interface", slot_material(class_name, folder, str(slot.get_editor_property("material_slot_name"))))
        slots.append(slot)
    mesh.modify()
    mesh.set_editor_property("materials", slots)
    save(mesh)

# 가져오기 작업은 돌려준 에셋(메시)만 저장하므로, 함께 만든 스켈레톤과 애니메이션을 여기서 저장한다.
if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(save_map_packages=False, save_content_packages=True):
    raise RuntimeError("Could not save the imported packages")
for class_name, source_name in CLASSES.items():
    folder = f"/Game/Characters/{class_name}"
    mesh = unreal.load_asset(f"{folder}/{source_name}")
    bounds = mesh.get_bounds()
    names = [slot.get_editor_property("material_interface").get_name() for slot in mesh.get_editor_property("materials")]
    clips = sorted(path.rsplit(".", 1)[-1] for path in assets.list_assets(folder) if isinstance(unreal.load_asset(path), unreal.AnimSequence))
    unreal.log_warning(f"[import] {folder}: height {bounds.box_extent.z * 2.0:.1f}, materials {names}, clips {clips}")
