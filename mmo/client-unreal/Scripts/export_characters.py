# 마법사(몸, 옷, 무기, 동작)를 System G6의 Modular RPG Characters(CC0, OpenGameArt)에서 골라 mmo/art/characters/<직업>.fbx와
# 그 텍스처로 내보낸다(backlog 98). 기사는 Tripo의 모델로 바꿔 export_tripo_characters.py가 낸다.
# 원본은 Blender 2.79의 .blend라 Blender로 열고, 내보낸 FBX는 두 엔진이 함께 읽도록 저장소에 둔다(LFS).
# Unreal은 그 뒤 import_characters.py가 가져온다. 원본은 저장소에 두지 않고 MMO_ART_SOURCE(기본 ~/.cache/mmo-art-sources)에 압축을 푼다.
#   system-g6/unpacked/modular_rpg_characters/                         modular_rpg_characters.7z(본편: 몸, 갑옷, 동작, 텍스처)
#   system-g6/ikrig/modular_rpg_characters_IK_rig_for_animating/        modular_rpg_characters_ik_rig_for_animating.7z(무기)
#
#   ~/.cache/blender/Blender.app/Contents/MacOS/Blender --disable-autoexec -b --factory-startup --python mmo/client-unreal/Scripts/export_characters.py
#
# 원본을 게임에 맞추는 것:
#   - 갑옷 조각은 뼈의 버텍스 그룹만 있고 아마추어에 붙어 있지 않아 붙인다. 무기는 IK 리그 파일에서 손의 뼈(wep_pos_R)에 붙은 자리 그대로 가져와
#     그 뼈에 다 묶는다(구운 무기. 게임은 머티리얼 이름에 Weapon이 든 칸을 무기로 보고 감추거나 보인다).
#   - 뼈 이름을 게임의 이름으로 바꾼다: 상체를 섞는 뼈 torso → Abdomen(UMmoAnimInstance::UpperBodyBone), 오른손 무기 wep_pos_R → Weapon_R.
#   - 동작은 역할 이름(Idle, Run, Attack, Skill, Cast, Gather, Death)으로 바꾸고 쓰는 것만 남긴다. 피격 동작은 팩에 없다.
#   - 2.79의 머티리얼이 텍스처를 잇던 칸은 새 Blender에서 빠지므로, 같은 이름의 옛 텍스처 데이터블록(tex_<머티리얼>)이 가리키는 그림을 찾아
#     머티리얼 이름을 그 그림의 이름으로 바꾸고 그림을 함께 내보낸다(가져오는 쪽이 칸 이름으로 텍스처를 찾음).
import os
import shutil
import sys

import bpy

SOURCE = os.environ.get("MMO_ART_SOURCE", os.path.expanduser("~/.cache/mmo-art-sources"))
MAIN = os.path.join(SOURCE, "system-g6/unpacked/modular_rpg_characters/human_male.blend")
WEAPONS = os.path.join(SOURCE, "system-g6/ikrig/modular_rpg_characters_IK_rig_for_animating/animations_bake_human_male.blend")
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art/characters"))
ARMATURE = "human_male"
BONES = {"torso": "Abdomen", "wep_pos_R": "Weapon_R"}

# 직업 → 조각, 무기(IK 리그 파일의 오브젝트, 머티리얼 이름), 역할 → 원본의 동작(앞의 human_male_를 뺀 이름).
CLASSES = {
    "mage": {
        "parts": ["head_default", "hair_2", "light_armor", "light_boots", "light_gloves", "light_helmet"],
        "weapon": ("staff_old", "Weapon_Staff"),
        "actions": {
            "Idle": "idle_combat_two_handed_staff",
            "Run": "run",
            "Attack": "cast_two_handed_staff",
            "Skill": "cast_unarmed_magic",
            "Cast": "channel_two_handed_staff",
            "Gather": "gathering",
            "Death": "death",
        },
    },
}


def fail(message):
    print(f"[export] ERROR {message}")
    sys.exit(1)


def include_all_collections():
    """조각이 든 컬렉션이 뷰 레이어에서 빠져 있어(내보내기는 보이는 것만 고름) 모두 넣는다."""
    def include(layer):
        layer.exclude = False
        layer.hide_viewport = False
        for child in layer.children:
            include(child)
    include(bpy.context.view_layer.layer_collection)
    for collection in bpy.data.collections:
        collection.hide_viewport = False
        collection.hide_render = False


def fcurves_of(action):
    """Blender 4.4부터 동작의 F커브는 층 → 스트립 → 슬롯마다의 묶음 아래에 있다."""
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield bag


def rename_bones(armature, meshes):
    for old, new in BONES.items():
        if old not in armature.data.bones:
            fail(f"bone {old} is missing")
        armature.data.bones[old].name = new
        for mesh in meshes:
            group = mesh.vertex_groups.get(old)
            if group:
                group.name = new
        # 아마추어에 걸리지 않은 동작은 이름을 바꿔도 따라오지 않아 F커브의 경로와 그룹을 직접 바꾼다.
        for action in bpy.data.actions:
            for bag in fcurves_of(action):
                for curve in bag.fcurves:
                    curve.data_path = curve.data_path.replace(f'pose.bones["{old}"]', f'pose.bones["{new}"]')
                for group in bag.groups:
                    if group.name == old:
                        group.name = new


def attach(mesh, armature):
    if not any(m.type == "ARMATURE" for m in mesh.modifiers):
        mesh.modifiers.new("Armature", "ARMATURE").object = armature
    world = mesh.matrix_world.copy()
    mesh.parent = armature
    mesh.matrix_world = world


def bring_weapon(name, material_name, armature):
    """IK 리그 파일에서 무기를 가져와 쉬는 자세의 자리 그대로 오른손 뼈에 다 묶는다."""
    with bpy.data.libraries.load(WEAPONS, link=False) as (source, target):
        if name not in source.objects:
            fail(f"{name} is not in {WEAPONS}")
        target.objects = [name]
    weapon = target.objects[0]
    rig = weapon.parent
    rig.data.pose_position = "REST"
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.scene.collection.objects.link(weapon)
    bpy.context.view_layer.update()
    # 두 파일의 아마추어가 같은 쉬는 자세인지 손의 뼈로 본다.
    ours = armature.matrix_world @ armature.data.bones["Weapon_R"].head_local
    theirs = rig.matrix_world @ rig.data.bones["wep_pos_R"].head_local
    if (ours - theirs).length > 1e-3:
        fail(f"the hand bones differ: {tuple(ours)} and {tuple(theirs)}")
    data = weapon.data.copy()
    data.transform(armature.matrix_world.inverted() @ weapon.matrix_world)
    material = data.materials[0].copy()
    material.name = material_name
    data.materials.clear()
    data.materials.append(material)
    held = bpy.data.objects.new(material_name, data)
    bpy.context.scene.collection.objects.link(held)
    held.parent = armature
    group = held.vertex_groups.new(name="Weapon_R")
    group.add(range(len(data.vertices)), 1.0, "REPLACE")
    held.modifiers.new("Armature", "ARMATURE").object = armature
    bpy.data.objects.remove(weapon)
    bpy.data.objects.remove(rig)
    return held


def texture_file(material):
    """머티리얼 mat_<이름>의 옛 텍스처 데이터블록 tex_<이름>(없으면 _skirt를 뺀 것)이 가리키는 그림 파일."""
    stem = material.name[len("mat_"):]
    for name in (f"tex_{stem}", f"tex_{stem.removesuffix('_skirt')}"):
        texture = bpy.data.textures.get(name)
        if texture and getattr(texture, "image", None):
            path = bpy.path.abspath(texture.image.filepath, library=texture.image.library)
            if os.path.isfile(path):
                return path
    fail(f"no texture file for {material.name}")


def name_materials_by_texture(meshes, textures):
    """칸의 머티리얼 이름을 그림 파일의 이름으로 바꾼다. 같은 그림을 쓰는 칸(갑옷과 치마)은 한 머티리얼로 합친다."""
    by_texture = {}
    for mesh in meshes:
        for slot in mesh.material_slots:
            path = texture_file(slot.material)
            stem = os.path.splitext(os.path.basename(path))[0]
            if stem not in by_texture:
                material = slot.material.copy()
                material.name = stem
                by_texture[stem] = material
                textures.add(path)
            slot.material = by_texture[stem]


def keep_actions(roles):
    wanted = {f"human_male_{source}": role for role, source in roles.items()}
    missing = [source for source in wanted if source not in bpy.data.actions]
    if missing:
        fail(f"actions are missing: {missing}")
    # 같은 원본을 두 역할이 쓰면 복사한다(지금은 없음).
    for action in list(bpy.data.actions):
        if action.name in wanted:
            action.name = wanted[action.name]
        else:
            bpy.data.actions.remove(action)


os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
for class_name, spec in CLASSES.items():
    bpy.ops.wm.open_mainfile(filepath=MAIN, load_ui=False)
    include_all_collections()
    armature = bpy.data.objects[ARMATURE]
    meshes = []
    for part in spec["parts"]:
        mesh = bpy.data.objects.get(f"human_male_{part}")
        if mesh is None:
            fail(f"human_male_{part} is missing")
        meshes.append(mesh)
    rename_bones(armature, [o for o in bpy.data.objects if o.type == "MESH"])
    for mesh in meshes:
        attach(mesh, armature)
    textures = set()
    name_materials_by_texture(meshes, textures)
    meshes.append(bring_weapon(*spec["weapon"], armature))
    keep_actions(spec["actions"])
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions["Idle"]
    # Unreal은 FBX에서 이름이 Armature인 아마추어 노드를 뼈로 두지 않는다(루트 뼈가 하나 더 생기지 않음). 동작의 이름은 Armature|<역할>이 된다.
    armature.name = "Armature"

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [armature] + meshes:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    path = os.path.join(OUT, f"{class_name}.fbx")
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        # 크기를 노드에 남기지 않고 데이터에 굽는다(키 4.2 단위. import_characters.py가 100배로 가져옴). FBX_SCALE_NONE은 키가 맞게 들어오지만
        # 아마추어 노드의 크기 100이 바인드 포즈에만 남아 동작을 틀면 메시가 보이지 않았다(import_creatures.py의 슬라임과 같음).
        apply_scale_options="FBX_SCALE_ALL",
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=True,
        bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True,
        bake_anim_simplify_factor=0.0,
        path_mode="STRIP",
    )
    for texture in sorted(textures):
        shutil.copyfile(texture, os.path.join(OUT, "textures", os.path.basename(texture)))
    tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
    print(f"[export] {path}: {tris} triangles, materials {sorted(m.material_slots[0].material.name for m in meshes)}, "
          f"actions {sorted(a.name for a in bpy.data.actions)}, textures {sorted(os.path.basename(t) for t in textures)}")
