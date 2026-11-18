# Tripo로 만든 직업 캐릭터(mmo/art/models/<직업>/. 어라운드 시트에서 Image to 3D, 자동 리깅의 UE5 Mannequin 뼈대)에 Quaternius의 Universal Animation
# Library 1·2(CC0, 무료판) 동작을 리타깃해 mmo/art/characters/<직업>.fbx와 그 텍스처로 낸다. Unreal은 그 뒤 import_characters.py가 가져온다.
# 마법사는 아직 System G6(export_characters.py)이다. UAL과 G6의 무기는 저장소에 두지 않고 MMO_ART_SOURCE(기본 ~/.cache/mmo-art-sources)에 푼다.
#   ual1/Universal Animation Library[Standard]/      Universal Animation Library[Standard].zip(itch.io)
#   ual2/Universal Animation Library 2[Standard]/    Universal Animation Library 2[Standard].zip(itch.io)
#   system-g6/ikrig/.../animations_bake_human_male.blend   검(G6의 IK 리그 파일. 기사의 검을 Tripo로 만들 때까지)
#
#   ~/.cache/blender/Blender.app/Contents/MacOS/Blender --disable-autoexec -b --factory-startup --python mmo/client-unreal/Scripts/export_tripo_characters.py
#
# 원본을 게임에 맞추는 것:
#   - 자동 리깅이 치마(골반 머리보다 낮고 주인 뼈가 팔이 아닌 꼭짓점)에 팔 사슬의 가중치를 섞어 팔을 들면 치마가 딸려 올라가서, 그 가중치를 지우고 남은 것을 1로 맞춘다.
#   - 뼈 이름을 게임의 이름으로 바꾼다: 상체를 섞는 뼈 spine_01 → Abdomen(UMmoAnimInstance::UpperBodyBone). 오른손의 무기 뼈 Weapon_R을 hand_r 아래에
#     더한다(자리는 칼을 쥔 대기 동작에서 손가락이 감싼 곳, Y축이 칼날).
#   - 동작은 UAL의 뼈마다 월드 회전을 옮긴다. UAL(+Y를 봄, T 포즈)을 Tripo(-Y를 봄, A 포즈)와 같은 쪽을 보게 돌리고, 쉬는 자세에서 뼈의 방향과
#     비틀림(손바닥이 아래인지 안쪽인지)이 다른 만큼은 뼈마다 한 번 구한 보정으로 맞춘다. UAL의 척추 셋은 Tripo의 척추 다섯 중
#     1·3·5번으로, 목·비틀림·손바닥 뼈는 부모를 따른다. 골반의 이동은 골반 높이의 비로 줄인다. 제자리 판(루트 모션 없음)을 쓴다.
#   - 크기는 Tripo 그대로(키 1)이고 표현 표의 크기 배수(1.8)가 맞춘다. 텍스처는 1024의 색, 노멀(OpenGL 방식. 가져올 때 초록을 뒤집음), 4096의 ORM을 1024로 줄인 것.
import math
import os
import shutil
import sys

import bpy
from mathutils import Matrix, Vector

SOURCE = os.environ.get("MMO_ART_SOURCE", os.path.expanduser("~/.cache/mmo-art-sources"))
UAL1 = os.path.join(SOURCE, "ual1/Universal Animation Library[Standard]/Unity/UAL1_Standard.fbx")
UAL2 = os.path.join(SOURCE, "ual2/Universal Animation Library 2[Standard]/Unity/UAL2_Standard.fbx")
G6_WEAPONS = os.path.join(SOURCE, "system-g6/ikrig/modular_rpg_characters_IK_rig_for_animating/animations_bake_human_male.blend")
ART = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art"))
OUT = os.path.join(ART, "characters")
TEXTURE_SIZE = 1024
FPS = 30

# 직업 → 역할마다 (팩, 동작, 앞에서 버릴 프레임 수) 조각들. 조각은 이어 붙인다(스킬 = 베기 + 회복). ("hold", n)은 다음 조각의 첫 자세를 n프레임
# 더 둔다. 칼끝이 가장 빨리 나가는 때를 데이터의 타격까지의 시간(Classes의 기사 공격 430 ms, Skills의 기사 공격 스킬 280 ms)에 맞춘 것이다.
# Sword_Attack은 383 ms, Sword_Regular_A는 250 ms라 1프레임씩 앞에 두어 417 ms와 283 ms.
ATTACK_HOLD = 1
SKILL_HOLD = 1
# 공격은 대기(Sword_Idle)의 자세에서 시작해 그 자세로 끝나는 Sword_Attack이다. 연속기의 조각(Sword_Regular_A·B·C)은 몸이 120–170° 돌아
# 기본 공격으로 되풀이하면 빙빙 돌아 보여서, 한 번 크게 도는 베기(Sword_Regular_A + 회복)는 스킬에 쓴다.
CLASSES = {
    "knight": {
        "Idle": [("ual1", "Sword_Idle", 0)],
        "Run": [("ual1", "Jog_Fwd_Loop", 0)],
        "Attack": [("hold", ATTACK_HOLD), ("ual1", "Sword_Attack", 0)],
        "Skill": [("hold", SKILL_HOLD), ("ual2", "Sword_Regular_A", 0), ("ual2", "Sword_Regular_A_Rec", 0)],
        "Gather": [("ual2", "Farm_Harvest", 0)],
        "Hit": [("ual1", "Hit_Chest", 0)],
        "Death": [("ual1", "Death01", 0)],
    },
}
# 무기 뼈의 자리를 정하는 동작(손가락이 칼자루를 쥔 것).
GRIP_ROLE = "Idle"
# Tripo(UE5 Mannequin) ← UAL. 손가락은 같은 이름이라 아래에서 더한다.
BONE_MAP = {
    "pelvis": "pelvis", "Abdomen": "spine_01", "spine_03": "spine_02", "spine_05": "spine_03", "neck_01": "neck_01", "head": "Head",
}
for side in ("l", "r"):
    for name in ("clavicle", "upperarm", "lowerarm", "hand", "thigh", "calf", "foot", "ball"):
        BONE_MAP[f"{name}_{side}"] = f"{name}_{side}"
    for finger in ("thumb", "index", "middle", "ring", "pinky"):
        for i in (1, 2, 3):
            BONE_MAP[f"{finger}_0{i}_{side}"] = f"{finger}_0{i}_{side}"
ARM_CHAIN = ("clavicle", "upperarm", "lowerarm", "hand", "index", "middle", "ring", "pinky", "thumb")


def fail(message):
    print(f"[export] ERROR {message}")
    sys.exit(1)


def rot(matrix):
    return matrix.to_3x3().normalized().to_quaternion()


def import_fbx(path):
    if not os.path.isfile(path):
        fail(f"{path} is missing")
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    armature = next(o for o in new if o.type == "ARMATURE")
    return armature, [o for o in new if o.type == "MESH"], [a for a in bpy.data.actions if a not in actions_before]


def fix_skirt_weights(armature, mesh):
    waist = (armature.matrix_world @ armature.data.bones["pelvis"].head_local).z
    names = {g.index: g.name for g in mesh.vertex_groups}
    fixed = 0
    for v in mesh.data.vertices:
        if (mesh.matrix_world @ v.co).z >= waist or not v.groups:
            continue
        if names[max(v.groups, key=lambda g: g.weight).group].startswith(ARM_CHAIN):
            continue
        drop = [g.group for g in v.groups if names[g.group].startswith(ARM_CHAIN)]
        if not drop:
            continue
        for index in drop:
            mesh.vertex_groups[index].remove([v.index])
        total = sum(g.weight for g in v.groups)
        for g in v.groups:
            g.weight /= total
        fixed += 1
    return fixed


def ordered_bones(armature):
    def depth(bone):
        return 0 if bone.parent is None else 1 + depth(bone.parent)
    return sorted(armature.data.bones, key=depth)


def use_action(obj, action):
    obj.animation_data_create()
    obj.animation_data.action = action
    if action.slots and obj.animation_data.action_slot is None:
        obj.animation_data.action_slot = action.slots[0]


def landmark(armature, bone_name, side_of):
    """쉬는 자세에서 뼈의 비틀림을 정하는 몸의 방향(월드). 팔과 손가락은 손가락 마디의 선(새끼 → 검지), 엄지는 손바닥의 법선, 발은 옆, 나머지는 앞(-Y)."""
    w = armature.matrix_world
    side = side_of(bone_name)
    if side and bone_name.startswith(("upperarm", "lowerarm", "hand", "index", "middle", "ring", "pinky", "thumb")):
        bones = armature.data.bones
        knuckles = w @ bones[f"index_01_{side}"].head_local - w @ bones[f"pinky_01_{side}"].head_local
        if bone_name.startswith("thumb"):
            palm = w @ bones[f"middle_01_{side}"].head_local - w @ bones[f"hand_{side}"].head_local
            return knuckles.cross(palm)
        return knuckles
    if bone_name.startswith(("foot", "ball")):
        return Vector((1, 0, 0))
    return Vector((0, -1, 0))


def rest_frame(armature, bone_name, side_of):
    """뼈의 방향(Y)과 몸의 방향(X)으로 만든 직교 틀(월드 회전)."""
    rest = armature.matrix_world @ armature.data.bones[bone_name].matrix_local
    y = (rest.to_3x3().normalized() @ Vector((0, 1, 0))).normalized()
    x = landmark(armature, bone_name, side_of)
    x = (x - y * x.dot(y)).normalized()
    return Matrix((x, y, x.cross(y))).transposed().to_quaternion()


def face_like(source, target):
    """UAL은 +Y를, Tripo는 -Y를 본다. 발끝(foot → ball)의 방향이 같아지게 원본 아마추어를 Z축으로 돌린 빈 부모 아래에 둔다(월드 회전을 옮기므로
    보는 쪽이 같아야 함). 오브젝트를 직접 돌리면 UAL의 동작에 든 오브젝트의 회전 키가 덮어써 동작 중에는 돌지 않았다."""
    def yaw(armature):
        w, b = armature.matrix_world, armature.data.bones
        toe = sum((w @ b[f"ball_{s}"].head_local - w @ b[f"foot_{s}"].head_local for s in ("l", "r")), Vector())
        return math.atan2(toe.y, toe.x)
    turn = bpy.data.objects.new(f"{source.name}_Turn", None)
    bpy.context.scene.collection.objects.link(turn)
    turn.rotation_euler.z = yaw(target) - yaw(source)
    source.parent = turn
    source.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()


def side_suffix(name):
    return name[-1] if name[-2:] in ("_l", "_r") else None


class Retarget:
    """UAL 아마추어 하나의 동작을 Tripo 아마추어로 옮긴다."""

    def __init__(self, target, source):
        self.target, self.source = target, source
        self.bones = ordered_bones(target)
        wt, ws = target.matrix_world, source.matrix_world
        self.offset = {}
        for name, source_name in BONE_MAP.items():
            if name not in target.data.bones or source_name not in source.data.bones:
                fail(f"bone {name} or {source_name} is missing")
            t_rest = wt @ target.data.bones[name].matrix_local
            s_rest = ws @ source.data.bones[source_name].matrix_local
            # 쉬는 자세의 두 뼈를 같은 몸의 방향(뼈의 방향과 비틀림)으로 맞추는 월드 회전. 손바닥이 아래(UAL)와 안쪽(Tripo)처럼 달라도 맞는다.
            align = rest_frame(target, name, side_suffix) @ rest_frame(source, source_name, side_suffix).inverted()
            self.offset[name] = rot(s_rest).inverted() @ align.inverted() @ rot(t_rest)
        self.pelvis_rest_t = target.data.bones["pelvis"].head_local.copy()
        self.pelvis_rest_s = ws @ source.data.bones["pelvis"].head_local
        self.ratio = (wt @ self.pelvis_rest_t).z / self.pelvis_rest_s.z

    def pose(self):
        """지금 프레임의 UAL 자세를 Tripo 뼈마다의 matrix_basis로."""
        wt_inv = self.target.matrix_world.inverted()
        ws = self.source.matrix_world
        posed, basis = {}, {}
        for bone in self.bones:
            rest = bone.matrix_local
            base = posed[bone.parent.name] @ bone.parent.matrix_local.inverted() @ rest if bone.parent else rest.copy()
            source_name = BONE_MAP.get(bone.name)
            if source_name is None:
                posed[bone.name] = base
                basis[bone.name] = Matrix.Identity(4)
                continue
            s_now = ws @ self.source.pose.bones[source_name].matrix
            want = rot(wt_inv) @ rot(s_now) @ self.offset[bone.name]
            head = base.translation
            if bone.name == "pelvis":
                moved = (ws @ self.source.pose.bones["pelvis"].head) - self.pelvis_rest_s
                head = self.pelvis_rest_t + rot(wt_inv) @ (moved * self.ratio)
            posed[bone.name] = Matrix.Translation(head) @ want.to_matrix().to_4x4()
            basis[bone.name] = base.inverted() @ posed[bone.name]
        return basis


def bake(retarget_of, actions, role, segments):
    """조각들을 이어 역할 이름의 동작 하나로 굽는다."""
    target = next(iter(retarget_of.values())).target
    baked = bpy.data.actions.new(role)
    use_action(target, baked)
    for pb in target.pose.bones:
        pb.rotation_mode = "QUATERNION"
    frame = 1
    scene = bpy.context.scene
    hold = 0
    for segment in segments:
        if segment[0] == "hold":
            hold = segment[1]
            continue
        pack, name, skip = segment
        action = actions[pack].get(name)
        if action is None:
            fail(f"{pack} has no action {name}")
        retarget = retarget_of[pack]
        use_action(retarget.source, action)
        start, end = int(action.frame_range[0]) + skip, int(action.frame_range[1])
        for f in [start] * hold + list(range(start, end + 1)):
            scene.frame_set(f)
            for name_, matrix in retarget.pose().items():
                pb = target.pose.bones[name_]
                pb.matrix_basis = matrix
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                if name_ == "pelvis":
                    pb.keyframe_insert("location", frame=frame)
            frame += 1
        hold = 0
    return baked, frame - 1


def add_weapon_bone(target, grip_action):
    """칼을 쥔 동작의 첫 프레임에서 손가락이 감싼 곳에 Weapon_R을 둔다(Y축 = 새끼손가락 → 검지 쪽, Z축 = 손바닥의 법선)."""
    use_action(target, grip_action)
    bpy.context.scene.frame_set(1)
    pose = target.pose.bones
    joints = [pose[f"{f}_0{i}_r"].head for f in ("index", "middle", "ring", "pinky") for i in (1, 2, 3)]
    center = sum(joints, Vector()) / len(joints)
    forward = (pose["middle_01_r"].head - pose["hand_r"].head).normalized()
    along = pose["index_01_r"].head - pose["pinky_01_r"].head
    along = (along - forward * along.dot(forward)).normalized()
    normal = forward.cross(along).normalized()
    grip = Matrix((along.cross(normal), along, normal)).transposed().to_4x4()
    grip.translation = center
    hand_posed = pose["hand_r"].matrix
    local = hand_posed.inverted() @ grip
    hand_rest = target.data.bones["hand_r"].matrix_local
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.mode_set(mode="EDIT")
    bone = target.data.edit_bones.new("Weapon_R")
    bone.parent = target.data.edit_bones["hand_r"]
    bone.head = (0, 0, 0)
    bone.tail = (0, 0.05, 0)
    bone.matrix = hand_rest @ local
    bpy.ops.object.mode_set(mode="OBJECT")
    return target.data.bones["Weapon_R"].matrix_local.copy()


def bring_g6_sword(target, weapon_rest):
    """G6의 검을 wep_pos_R 뼈 공간 그대로(그 아마추어의 키 4.19 → 1로 줄여) Weapon_R에 묶는다. 머티리얼 이름 Weapon_Sword(게임이 무기 칸으로 봄)."""
    with bpy.data.libraries.load(G6_WEAPONS, link=False) as (source, loaded):
        loaded.objects = ["main_hand_sword_old"]
    sword = loaded.objects[0]
    rig = sword.parent
    rig.data.pose_position = "REST"
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.scene.collection.objects.link(sword)
    bpy.context.view_layer.update()
    height = max((rig.matrix_world @ b.tail_local).z for b in rig.data.bones)
    to_bone = (rig.matrix_world @ rig.data.bones["wep_pos_R"].matrix_local).inverted() @ sword.matrix_world
    data = sword.data.copy()
    data.transform(target.matrix_world.inverted() @ target.matrix_world @ weapon_rest @ Matrix.Scale(1.0 / height, 4) @ to_bone)
    material = data.materials[0].copy() if data.materials else bpy.data.materials.new("Weapon_Sword")
    material.name = "Weapon_Sword"
    data.materials.clear()
    data.materials.append(material)
    held = bpy.data.objects.new("Weapon_Sword", data)
    bpy.context.scene.collection.objects.link(held)
    held.parent = target
    held.vertex_groups.new(name="Weapon_R").add(range(len(data.vertices)), 1.0, "REPLACE")
    held.modifiers.new("Armature", "ARMATURE").object = target
    bpy.data.objects.remove(sword)
    bpy.data.objects.remove(rig)
    return held


def save_textures(class_name):
    folder = os.path.join(ART, "models", class_name)
    out = os.path.join(OUT, "textures")
    for kind in ("basecolor", "normal"):
        path = os.path.join(folder, f"{class_name}_{kind}.jpg")
        if not os.path.isfile(path):
            fail(f"{path} is missing")
        shutil.copyfile(path, os.path.join(out, f"{class_name}_{kind}.jpg"))
    # Tripo의 _rm은 4096의 ORM(R 가림, G 거칠기, B 금속)이다. 1024로 줄인다.
    orm = bpy.data.images.load(os.path.join(folder, f"{class_name}_rm.jpg"))
    orm.colorspace_settings.name = "Non-Color"
    orm.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    orm.filepath_raw = os.path.join(out, f"{class_name}_orm.png")
    orm.file_format = "PNG"
    orm.save()


os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
for class_name, roles in CLASSES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    target, meshes, _ = import_fbx(os.path.join(ART, "models", class_name, f"{class_name}.fbx"))
    if len(meshes) != 1:
        fail(f"{class_name}.fbx should have one mesh, found {len(meshes)}")
    mesh = meshes[0]
    fixed = fix_skirt_weights(target, mesh)
    target.data.bones["spine_01"].name = "Abdomen"
    # 자동 리깅이 묶지 않은 뼈는 버텍스 그룹이 없다.
    if "spine_01" in mesh.vertex_groups:
        mesh.vertex_groups["spine_01"].name = "Abdomen"
    mesh.name = class_name
    mesh.data.materials[0].name = class_name

    retarget_of, actions = {}, {}
    for pack, path in (("ual1", UAL1), ("ual2", UAL2)):
        source, source_meshes, source_actions = import_fbx(path)
        for m in source_meshes:
            bpy.data.objects.remove(m)
        face_like(source, target)
        retarget_of[pack] = Retarget(target, source)
        actions[pack] = {a.name.rsplit("|", 1)[-1]: a for a in source_actions}

    frames = {}
    baked = {}
    for role, segments in roles.items():
        baked[role], frames[role] = bake(retarget_of, actions, role, segments)
    weapon_rest = add_weapon_bone(target, baked[GRIP_ROLE])
    sword = bring_g6_sword(target, weapon_rest)

    for retarget in retarget_of.values():
        turn = retarget.source.parent
        bpy.data.objects.remove(retarget.source)
        bpy.data.objects.remove(turn)
    for action in list(bpy.data.actions):
        if action not in baked.values():
            bpy.data.actions.remove(action)
    use_action(target, baked["Idle"])
    # Unreal은 FBX에서 이름이 Armature인 아마추어 노드를 뼈로 두지 않는다. 동작의 이름은 Armature|<역할>이 된다(export_characters.py와 같음).
    target.name = "Armature"

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (target, mesh, sword):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target
    path = os.path.join(OUT, f"{class_name}.fbx")
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
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
    save_textures(class_name)
    tris = sum(len(p.vertices) - 2 for m in (mesh, sword) for p in m.data.polygons)
    print(f"[export] {path}: {tris} triangles, {len(target.data.bones)} bones, skirt weights fixed on {fixed} vertices, "
          f"actions {sorted((role, n) for role, n in frames.items())}")
