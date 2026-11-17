# 몬스터, 소환수, NPC, 펫의 스켈레탈 메시·스켈레톤·애니메이션·머티리얼을 가져온다(backlog 91). 원본은 저장소에 두지 않고(docs/art.md에 출처),
# Quaternius의 CC0 팩들을 압축을 푼 폴더들의 부모를 MMO_ART_SOURCE로 준다(기본 ~/.cache/mmo-art-sources). 다시 돌리면 같은 에셋을 덮는다.
#   cute-monsters/      Cute Animated Monsters - Aug 2020   (OpenGameArt. 모델마다 텍스처 하나)
#   monster-pack/       Animated Monster Pack by @Quaternius  (OpenGameArt. 머티리얼 색)
#   character-pack/     Ultimate Animated Character Pack - Nov 2019 (OpenGameArt. 머티리얼 색)
#   ultimate-monsters/  Ultimate Monsters의 FBX 낱개와 Atlas_Monsters.png (Quaternius의 Drive. 모델이 아틀라스 하나를 함께 씀)
#   ultimate-animals/   Ultimate Animated Animals의 FBX 낱개 (Quaternius의 Drive. 머티리얼 색)
# 머티리얼(M_Character, M_EntityColor)은 먼저 create_entity_materials.py로 만든다. 그 뒤 MmoCreateCharacterAssets 커맨드렛이 블렌드 스페이스,
# 애니메이션 블루프린트, 표현 표의 줄을 만든다.
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/import_creatures.py" -unattended -nosplash -nullrhi
import os

import unreal

SOURCE = os.environ.get("MMO_ART_SOURCE", os.path.expanduser("~/.cache/mmo-art-sources"))
CUTE = "cute-monsters/Cute Animated Monsters - Aug 2020"
MONSTERS = "monster-pack/Animated Monster Pack by @Quaternius"
PEOPLE = "character-pack/Ultimate Animated Character Pack - Nov 2019"
ULTIMATE = "ultimate-monsters"
ANIMALS = "ultimate-animals"

# (에셋 폴더 /Game/Creatures/<이름>, 팩, FBX 파일(팩 안의 경로), 텍스처(팩 안의 경로. 없으면 원본의 머티리얼 색), 색조).
# 색조는 같은 모델을 다른 몬스터로 쓸 때 텍스처나 원본의 색에 곱한다(소 → 멧돼지, 예티 → 돌거인. 91에서 CC0로 없는 것의 대체).
# 이름과 표현 표의 키(몬스터·NPC의 템플릿 번호)는 MmoCreateCharacterAssets 커맨드렛이 잇는다.
CREATURES = [
    ("Slime", MONSTERS, "FBX/Slime.fbx", None, None),
    ("Mushroom", ULTIMATE, "Mushnub.fbx", "Atlas_Monsters.png", None),
    ("Boar", ANIMALS, "Bull.fbx", None, (0.95, 0.72, 0.5)),
    ("Goblin", PEOPLE, "FBX/Goblin_Male.fbx", None, None),
    ("Wolf", ANIMALS, "Wolf.fbx", None, None),
    ("GoblinArcher", PEOPLE, "FBX/Goblin_Female.fbx", None, None),
    ("Orc", ULTIMATE, "Orc.fbx", "Atlas_Monsters.png", None),
    ("Skeleton", MONSTERS, "FBX/Skeleton.fbx", None, None),
    ("Troll", CUTE, "FBX/Cyclops.fbx", "Textures/Cyclops_Texture.png", None),
    ("StoneGiant", CUTE, "FBX/Yeti.fbx", "Textures/Yeti_Texture.png", (0.58, 0.58, 0.62)),
    ("Spirit", CUTE, "FBX/Ghost.fbx", "Textures/Ghost_Texture.png", None),
    # 펫(96). 부엉이가 CC0로 없어 둥근 새(Birb)다.
    ("Cat", ULTIMATE, "Cat.fbx", "Atlas_Monsters.png", None),
    ("Owl", ULTIMATE, "Birb.fbx", "Atlas_Monsters.png", None),
    ("Merchant", PEOPLE, "FBX/OldClassy_Male.fbx", None, None),
    ("Keeper", PEOPLE, "FBX/Worker_Male.fbx", None, None),
    ("Crafter", PEOPLE, "FBX/Viking_Male.fbx", None, None),
    ("QuestGiver", PEOPLE, "FBX/Wizard.fbx", None, None),
    ("Guard", PEOPLE, "FBX/Knight_Male.fbx", None, None),
]
# 바인드 포즈의 루트 크기(100)가 애니메이션의 루트(1)와 달라 움직이면 100분의 1로 줄어 보이지 않는 모델 → 그 루트 뼈. 애니메이션에서 루트 트랙을
# 지워 바인드 포즈를 따르게 한다(그 트랙의 회전과 위치는 바인드 포즈와 같아 잃는 것이 없다).
ROOT_TRACK_FIX = {"Slime": "Root"}
CHARACTER = "/Game/Characters/M_Character"
ENTITY_COLOR = "/Game/Characters/M_EntityColor"

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

for path in (CHARACTER, ENTITY_COLOR):
    if unreal.load_asset(path) is None:
        raise RuntimeError(f"{path} is missing. Run create_entity_materials.py first.")


def import_file(path, destination, options):
    if not os.path.isfile(path):
        raise RuntimeError(f"{path} is missing. Set MMO_ART_SOURCE to the folder with the unzipped packs (docs/art.md).")
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


def skeletal_options(textured):
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("import_animations", True)
    options.set_editor_property("create_physics_asset", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    # 텍스처가 있는 팩은 머티리얼을 만들지 않고 아래에서 인스턴스를 끼운다. 색만 있는 팩은 원본의 머티리얼마다 M_EntityColor의 인스턴스를
    # 만들고 원본의 색을 Color에 넣는다(나타나고 사라짐이 같은 머티리얼을 따르게).
    options.set_editor_property("import_materials", not textured)
    if not textured:
        data = options.get_editor_property("texture_import_data")
        data.set_editor_property("base_material_name", unreal.SoftObjectPath(f"{ENTITY_COLOR}.M_EntityColor"))
        data.set_editor_property("base_color_name", "Color")
    return options


def source_name_of(fbx):
    return os.path.splitext(os.path.basename(fbx))[0]


for name, pack, fbx, texture, tint in CREATURES:
    folder = f"/Game/Creatures/{name}"
    source_name = source_name_of(fbx)
    textured = texture is not None
    # 늘 새로 가져온다(지난 가져오기의 남은 에셋이나 두 번 곱한 색조가 남지 않게). 표현 표는 커맨드렛이 다시 만든다.
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)
    import_file(os.path.join(SOURCE, pack, fbx), folder, skeletal_options(textured))
    if name in ROOT_TRACK_FIX:
        for path in assets.list_assets(folder):
            animation = unreal.load_asset(path)
            if isinstance(animation, unreal.AnimSequence):
                animation.get_editor_property("controller").remove_bone_track(ROOT_TRACK_FIX[name])
                save(animation)
    mesh = unreal.load_asset(f"{folder}/{source_name}")
    if not textured and tint is not None:
        # 원본의 색을 받은 인스턴스(M_EntityColor)마다 색조를 곱한다.
        for slot in mesh.get_editor_property("materials"):
            instance = slot.get_editor_property("material_interface")
            color = materials.get_material_instance_vector_parameter_value(instance, "Color")
            materials.set_material_instance_vector_parameter_value(instance, "Color", unreal.LinearColor(color.r * tint[0], color.g * tint[1], color.b * tint[2], 1.0))
            save(instance)
    if textured:
        texture_path = import_file(os.path.join(SOURCE, pack, texture), folder, None)[0]
        instance_path = f"{folder}/MI_{name}"
        if assets.does_asset_exist(instance_path):
            assets.delete_asset(instance_path)
        instance = tools.create_asset(f"MI_{name}", folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        materials.set_material_instance_parent(instance, unreal.load_asset(CHARACTER))
        materials.set_material_instance_texture_parameter_value(instance, "BaseColor", unreal.load_asset(texture_path))
        if tint is not None:
            materials.set_material_instance_vector_parameter_value(instance, "Tint", unreal.LinearColor(tint[0], tint[1], tint[2], 1.0))
        save(instance)
        slots = []
        for slot in mesh.get_editor_property("materials"):
            slot.set_editor_property("material_interface", instance)
            slots.append(slot)
        mesh.modify()
        mesh.set_editor_property("materials", slots)
        save(mesh)

# 가져오기 작업은 돌려준 에셋(메시)만 저장하므로, 함께 만든 스켈레톤·애니메이션·머티리얼 인스턴스를 여기서 저장한다.
if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(save_map_packages=False, save_content_packages=True):
    raise RuntimeError("Could not save the imported packages")

# 커맨드렛이 동작을 이름 끝으로 찾으므로, 가져온 애니메이션과 바인드 포즈의 높이를 남겨 둔다.
for name, pack, fbx, texture, tint in CREATURES:
    folder = f"/Game/Creatures/{name}"
    source_name = source_name_of(fbx)
    mesh = unreal.load_asset(f"{folder}/{source_name}")
    height = mesh.get_bounds().box_extent.z * 2.0
    clips = sorted(path.rsplit(".", 1)[-1].replace(f"{source_name}_Anim_", "") for path in assets.list_assets(folder) if isinstance(unreal.load_asset(path), unreal.AnimSequence))
    slot_materials = [slot.get_editor_property("material_interface").get_name() for slot in mesh.get_editor_property("materials")]
    unreal.log(f"[creatures] {name}: height {height:.1f}, materials {slot_materials}, clips {clips}")
