# 개체(캐릭터와 몬스터·NPC·소환수의 메시, 그 자리 표시와 채집물·바닥 아이템, 손의 무기, 펫)를 그리는 머티리얼을 만든다. 모두 디더 마스크라, 개체마다
# 커스텀 프리미티브 데이터의 한 칸(사라진 정도: 0 다 보임 ~ 1 안 보임)으로 0.3초 동안 서서히 나타나고 사라진다(59). 칸이 비면 0이라 다 보인다.
# 에셋이 있으면 지우지 않고 노드를 다시 만들어(머티리얼 인스턴스와 표현 표의 참조가 그대로) 다시 돌려도 된다.
# 캐릭터를 가져오는 import_characters.py보다 먼저 돌린다(M_Character를 부모로 인스턴스를 만듦).
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/create_entity_materials.py" -unattended -nosplash -nullrhi
import unreal

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

CHARACTER = "/Game/Characters/M_Character"
# 텍스처 없이 머티리얼 색만 쓰는 팩(91)의 기본 머티리얼. FBX를 가져올 때 원본의 머티리얼마다 인스턴스를 만들어 Color에 원본의 색을 넣는다.
ENTITY_COLOR = "/Game/Characters/M_EntityColor"
ENTITY_PLACEHOLDER = "/Game/Materials/M_EntityPlaceholder"
# 사라진 정도를 읽는 커스텀 프리미티브 데이터의 칸. 자리 표시는 0–2가 색이라 3이다(UMmoEntitySubsystem과 같은 수).
CHARACTER_FADE_INDEX = 0
PLACEHOLDER_FADE_INDEX = 3


def fresh(path):
    """머티리얼이 있으면 노드를 비우고, 없으면 만든다."""
    if assets.does_asset_exist(path):
        material = unreal.load_asset(path)
        materials.delete_all_material_expressions(material)
        return material
    folder, name = path.rsplit("/", 1)
    return tools.create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())


def constant(material, value, x, y):
    node = materials.create_material_expression(material, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


# 4×4 순서 디더: 픽셀마다 문턱을 달리해 보이는 비율만큼만 남긴다(마스크의 기준은 0).
DITHER_CODE = """
const float Order[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };
int2 Cell = int2(fmod(floor(Parameters.SvPosition.xy), 4.0));
return Shown - (Order[Cell.y * 4 + Cell.x] + 0.5) / 16.0;
"""


def fade(material, index):
    """마스크: 1 - (칸 index의 사라진 정도)를 디더로 거른다. 그림자도 같은 마스크를 따른다."""
    material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    material.set_editor_property("opacity_mask_clip_value", 0.0)
    gone = materials.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -700, 400)
    gone.set_editor_property("parameter_name", "Fade")
    gone.set_editor_property("use_custom_primitive_data", True)
    gone.set_editor_property("primitive_data_index", index)
    gone.set_editor_property("default_value", 0.0)
    shown = materials.create_material_expression(material, unreal.MaterialExpressionOneMinus, -500, 400)
    materials.connect_material_expressions(gone, "", shown, "")
    dither = materials.create_material_expression(material, unreal.MaterialExpressionCustom, -300, 400)
    dither.set_editor_property("code", DITHER_CODE)
    dither.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    shown_input = unreal.CustomInput()
    shown_input.set_editor_property("input_name", "Shown")
    dither.set_editor_property("inputs", [shown_input])
    materials.connect_material_expressions(shown, "", dither, "Shown")
    materials.connect_material_property(dither, "", unreal.MaterialProperty.MP_OPACITY_MASK)


def save(material):
    materials.recompile_material(material)
    if not assets.save_loaded_asset(material, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {material.get_path_name()}")


# 텍스처 하나를 받는 캐릭터 머티리얼. 직업과 몬스터마다 인스턴스가 텍스처와 색조를 바꾼다(import_characters.py, import_creatures.py).
character = fresh(CHARACTER)
# 스켈레탈 메시 사용 표시가 없으면 게임에서는(에디터만 자동으로 켬) 엔진의 기본 머티리얼로 그린다.
character.set_editor_property("used_with_skeletal_mesh", True)
texture = materials.create_material_expression(character, unreal.MaterialExpressionTextureSampleParameter2D, -600, 0)
texture.set_editor_property("parameter_name", "BaseColor")
# 텍스처 파라미터는 기본 텍스처가 있어야 컴파일된다.
texture.set_editor_property("texture", unreal.load_asset("/Engine/EngineResources/DefaultTexture.DefaultTexture"))
# 색조: 텍스처에 곱한다(기본 흰색이라 그대로). 같은 모델을 다른 몬스터로 쓸 때 색을 바꾼다(돼지 → 멧돼지, 예티 → 돌거인. 91).
tint = materials.create_material_expression(character, unreal.MaterialExpressionVectorParameter, -600, 250)
tint.set_editor_property("parameter_name", "Tint")
tint.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
tinted = materials.create_material_expression(character, unreal.MaterialExpressionMultiply, -300, 0)
materials.connect_material_expressions(texture, "RGB", tinted, "A")
materials.connect_material_expressions(tint, "", tinted, "B")
materials.connect_material_property(tinted, "", unreal.MaterialProperty.MP_BASE_COLOR)
materials.connect_material_property(constant(character, 0.8, -300, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
fade(character, CHARACTER_FADE_INDEX)
save(character)

# 머티리얼 색만 쓰는 팩의 머티리얼: 색은 인스턴스의 Color(가져오기가 원본의 색을 넣음)이고, 나타나고 사라지는 것은 캐릭터와 같은 칸이다.
entity_color = fresh(ENTITY_COLOR)
entity_color.set_editor_property("used_with_skeletal_mesh", True)
body_color = materials.create_material_expression(entity_color, unreal.MaterialExpressionVectorParameter, -300, 0)
body_color.set_editor_property("parameter_name", "Color")
body_color.set_editor_property("default_value", unreal.LinearColor(0.5, 0.5, 0.5, 1.0))
materials.connect_material_property(body_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
materials.connect_material_property(constant(entity_color, 0.8, -300, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
fade(entity_color, CHARACTER_FADE_INDEX)
save(entity_color)

# 개체의 자리 표시와 손의 무기·펫: 색은 커스텀 프리미티브 데이터 0–2(맵의 M_Placeholder와 같음), 사라진 정도는 3.
# 맵의 자리 표시는 불투명한 M_Placeholder로 두어(마스크는 그리기가 더 비쌈) 나누었다.
placeholder = fresh(ENTITY_PLACEHOLDER)
color = materials.create_material_expression(placeholder, unreal.MaterialExpressionVectorParameter, -300, 0)
color.set_editor_property("parameter_name", "Color")
color.set_editor_property("use_custom_primitive_data", True)
color.set_editor_property("primitive_data_index", 0)
color.set_editor_property("default_value", unreal.LinearColor(1.0, 0.0, 1.0, 1.0))
materials.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
materials.connect_material_property(constant(placeholder, 0.85, -300, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
fade(placeholder, PLACEHOLDER_FADE_INDEX)
save(placeholder)
unreal.log(f"[materials] {CHARACTER}, {ENTITY_COLOR} and {ENTITY_PLACEHOLDER} are masked with the fade in custom primitive data {CHARACTER_FADE_INDEX} and {PLACEHOLDER_FADE_INDEX}")
