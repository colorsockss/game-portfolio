# Field 레벨의 땅, 해, 하늘, 하늘빛, 안개와 머티리얼(땅, 하늘, 맵 액터의 자리 표시)을 처음부터 만든다.
# 에셋을 손으로 고치지 않고 이 스크립트를 고쳐 다시 만든다. 맵에 놓인 것(건물, 나무 등)은 그 뒤에 에디터 모듈의 MmoBuildMap이
# 놓인 것의 목록에서 놓는다(레벨을 다시 만드는 차례: 이 스크립트 → MmoBuildMap). 조명은 모두 동적이다(라이트맵 없음).
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/create_content.py" -unattended -nosplash -nullrhi
import unreal

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

GROUND = "/Game/Materials/M_Ground"
OLD_GRID = "/Game/Materials/M_Grid"
SKY = "/Game/Materials/M_Sky"
PLACEHOLDER = "/Game/Materials/M_Placeholder"
LEVEL = "/Game/Maps/Field"
# 맵은 ±1,024 m(packets.proto의 CONSTANT_MAP_HALF_EXTENT_METERS)이고 엔진 평면은 1 m 너비다.
MAP_SIZE_METERS = 2048

# 풀밭 색을 월드 자리의 느린 물결로 얼룩지게 하고, 1 m 칸의 선을 아주 옅게 남긴다(가까이서 칸이 보이게. 선 굵기는 화면 픽셀 기준).
GROUND_CODE = """
float2 Meters = WorldPos.xy / 100.0;
float Patch = 0.5 + 0.25 * sin(Meters.x * 0.21 + sin(Meters.y * 0.13) * 2.0) + 0.25 * sin(Meters.y * 0.17 + sin(Meters.x * 0.11) * 2.0);
float3 Ground = lerp(float3(0.16, 0.24, 0.10), float3(0.27, 0.31, 0.15), Patch);
float2 Minor = abs(frac(Meters + 0.5) - 0.5) / max(fwidth(Meters), 1e-4);
float Line = 0.25 * (1.0 - saturate(min(Minor.x, Minor.y) - 0.5));
return lerp(Ground, Ground * 0.7, Line);
"""
# 하늘: 아래(지평선)는 옅고 위는 짙은 파랑. 하늘 메시의 바깥 방향(월드 자리 - 카메라)의 z로 섞는다.
SKY_CODE = """
float Up = saturate(normalize(Direction).z);
return lerp(float3(0.62, 0.74, 0.86), float3(0.22, 0.42, 0.75), pow(Up, 0.6));
"""
SKY_COLOR = unreal.LinearColor(0.62, 0.74, 0.86, 1.0)


def recreate(path, asset_class, factory):
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    folder, name = path.rsplit("/", 1)
    return tools.create_asset(name, folder, asset_class, factory)


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


def custom(material, code, input_name, x, y):
    node = materials.create_material_expression(material, unreal.MaterialExpressionCustom, x, y)
    node.set_editor_property("code", code)
    node.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    custom_input = unreal.CustomInput()
    custom_input.set_editor_property("input_name", input_name)
    node.set_editor_property("inputs", [custom_input])
    return node


def roughness(material, value):
    node = materials.create_material_expression(material, unreal.MaterialExpressionConstant, -300, 200)
    node.set_editor_property("r", value)
    materials.connect_material_property(node, "", unreal.MaterialProperty.MP_ROUGHNESS)


if assets.does_asset_exist(OLD_GRID):
    assets.delete_asset(OLD_GRID)

ground = recreate(GROUND, unreal.Material, unreal.MaterialFactoryNew())
ground_color = custom(ground, GROUND_CODE, "WorldPos", -300, 0)
materials.connect_material_expressions(materials.create_material_expression(ground, unreal.MaterialExpressionWorldPosition, -600, 0), "", ground_color, "WorldPos")
materials.connect_material_property(ground_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
roughness(ground, 0.95)
materials.recompile_material(ground)
save(ground)

# 모바일 렌더러는 하늘 메시가 없으면 하늘을 그리지 않는다. 빛을 받지 않는 IsSky 머티리얼을 큰 구에 입혀 모든 플랫폼에 같은 하늘을 그린다.
sky = recreate(SKY, unreal.Material, unreal.MaterialFactoryNew())
sky.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
sky.set_editor_property("is_sky", True)
sky.set_editor_property("two_sided", True)
sky_direction = materials.create_material_expression(sky, unreal.MaterialExpressionCameraVectorWS, -600, 0)
sky_color = custom(sky, SKY_CODE, "Direction", -300, 0)
negate = materials.create_material_expression(sky, unreal.MaterialExpressionMultiply, -450, 0)
negate.set_editor_property("const_b", -1.0)
materials.connect_material_expressions(sky_direction, "", negate, "A")
materials.connect_material_expressions(negate, "", sky_color, "Direction")
materials.connect_material_property(sky_color, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
materials.recompile_material(sky)
save(sky)

# 맵 액터의 자리 표시 도형: 색을 컴포넌트의 커스텀 프리미티브 데이터 0–2에서 읽어, 머티리얼 하나로 종류마다 다른 색을 입힌다(MmoBuildMap).
placeholder = recreate(PLACEHOLDER, unreal.Material, unreal.MaterialFactoryNew())
placeholder_color = materials.create_material_expression(placeholder, unreal.MaterialExpressionVectorParameter, -300, 0)
placeholder_color.set_editor_property("parameter_name", "Color")
placeholder_color.set_editor_property("use_custom_primitive_data", True)
placeholder_color.set_editor_property("primitive_data_index", 0)
placeholder_color.set_editor_property("default_value", unreal.LinearColor(1.0, 0.0, 1.0, 1.0))
materials.connect_material_property(placeholder_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
roughness(placeholder, 0.85)
materials.recompile_material(placeholder)
save(placeholder)

# 열려 있는 레벨은 지울 수 없으므로, 이미 있으면 열어서 액터를 비운다.
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
if assets.does_asset_exist(LEVEL):
    if not levels.load_level(LEVEL):
        raise RuntimeError(f"Could not load {LEVEL}")
    actors.destroy_actors([a for a in actors.get_all_level_actors() if not isinstance(a, (unreal.WorldSettings, unreal.Brush))])
elif not levels.new_level(LEVEL):
    raise RuntimeError(f"Could not create {LEVEL}")


def spawn(actor_class, label, location=unreal.Vector(0, 0, 0), rotation=unreal.Rotator(0, 0, 0)):
    actor = actors.spawn_actor_from_class(actor_class, location, rotation)
    actor.set_actor_label(label)
    return actor


floor = spawn(unreal.StaticMeshActor, "Floor")
floor.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Plane.Plane"))
floor.static_mesh_component.set_material(0, ground)
floor.set_actor_scale3d(unreal.Vector(MAP_SIZE_METERS, MAP_SIZE_METERS, 1))

# Rotator(roll, pitch, yaw): 해는 남서쪽 위에서 비스듬히 비춘다.
sun = spawn(unreal.DirectionalLight, "Sun", unreal.Vector(0, 0, 1000), unreal.Rotator(0, -50, 30))
sun.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sun.light_component.set_editor_property("atmosphere_sun_light", True)

spawn(unreal.SkyAtmosphere, "Sky")

sky_light = spawn(unreal.SkyLight, "SkyLight")
sky_light.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sky_light.light_component.set_editor_property("real_time_capture", True)

# 하늘 메시(엔진 구, 지름 1 m)는 맵보다 크게 둔다. 그림자를 드리우지 않고 충돌도 없다.
sky_sphere = spawn(unreal.StaticMeshActor, "SkySphere")
sky_sphere.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Sphere.Sphere"))
sky_sphere.static_mesh_component.set_material(0, sky)
sky_sphere.static_mesh_component.set_editor_property("cast_shadow", False)
# 단단한 구라 충돌이 있으면 그 안에서 시작하는 카메라(스프링 암)의 선이 막혀 카메라가 캐릭터 안으로 당겨진다.
sky_sphere.static_mesh_component.set_collision_profile_name("NoCollision")
sky_sphere.set_actor_scale3d(unreal.Vector(MAP_SIZE_METERS * 2, MAP_SIZE_METERS * 2, MAP_SIZE_METERS * 2))

# 거리 안개를 하늘의 지평선 색에 맞춰, 먼 땅이 하늘로 이어지게 한다.
fog = spawn(unreal.ExponentialHeightFog, "Fog")
fog.component.set_editor_property("fog_density", 0.0008)
fog.component.set_editor_property("fog_inscattering_luminance", SKY_COLOR)
fog.component.set_editor_property("start_distance", 10000.0)

if not levels.save_current_level():
    raise RuntimeError(f"Could not save {LEVEL}")
unreal.log(f"Created {GROUND}, {SKY}, {PLACEHOLDER}, {LEVEL}")
