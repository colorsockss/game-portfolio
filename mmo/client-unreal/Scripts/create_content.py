# 코드가 쓰는 에셋을 처음부터 만든다: 격자 머티리얼, 자리 표시용 몸통의 머티리얼, Field 레벨.
# 에셋을 손으로 고치지 않고 이 스크립트를 고쳐 다시 만든다(맵 원본은 backlog 65, 캐릭터 메시는 14).
# Field는 바닥(엔진 평면 + 격자), 해, 하늘, 하늘빛만 둔다. 조명은 모두 동적이다(라이트맵 없음).
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/create_content.py" -unattended -nosplash -nullrhi
import unreal

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

GRID = "/Game/Materials/M_Grid"
PLACEHOLDER = "/Game/Materials/M_Placeholder"
LEVEL = "/Game/Maps/Field"
# 맵은 ±1,024 m(packets.proto의 CONSTANT_MAP_HALF_EXTENT_METERS)이고 엔진 평면은 1 m 너비다.
MAP_SIZE_METERS = 2048

# 월드 자리에서 1 m마다 가는 선, 10 m마다 굵은 선을 긋는다. 선 굵기는 화면 픽셀 기준(fwidth)이라 멀리서도 깜빡이지 않는다.
GRID_CODE = """
float2 Meters = WorldPos.xy / 100.0;
float2 Minor = abs(frac(Meters + 0.5) - 0.5) / max(fwidth(Meters), 1e-4);
float2 Tens = Meters / 10.0;
float2 Major = abs(frac(Tens + 0.5) - 0.5) / max(fwidth(Tens), 1e-4);
float Line = max(0.5 * (1.0 - saturate(min(Minor.x, Minor.y) - 0.5)), 1.0 - saturate(min(Major.x, Major.y) - 1.0));
float3 Ground = float3(0.20, 0.24, 0.17);
return lerp(Ground, Ground * 0.4, Line);
"""


def recreate(path, asset_class, factory):
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    folder, name = path.rsplit("/", 1)
    return tools.create_asset(name, folder, asset_class, factory)


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {asset.get_path_name()}")


grid = recreate(GRID, unreal.Material, unreal.MaterialFactoryNew())
world_position = materials.create_material_expression(grid, unreal.MaterialExpressionWorldPosition, -600, 0)
grid_lines = materials.create_material_expression(grid, unreal.MaterialExpressionCustom, -300, 0)
grid_lines.set_editor_property("code", GRID_CODE)
grid_lines.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
grid_input = unreal.CustomInput()
grid_input.set_editor_property("input_name", "WorldPos")
grid_lines.set_editor_property("inputs", [grid_input])
materials.connect_material_expressions(world_position, "", grid_lines, "WorldPos")
materials.connect_material_property(grid_lines, "", unreal.MaterialProperty.MP_BASE_COLOR)
grid_roughness = materials.create_material_expression(grid, unreal.MaterialExpressionConstant, -300, 200)
grid_roughness.set_editor_property("r", 0.9)
materials.connect_material_property(grid_roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
materials.recompile_material(grid)
save(grid)

# 코드(AMmoEntityActor::TintPlaceholderBody)가 Color 파라미터로 개체마다 색을 정한다.
placeholder = recreate(PLACEHOLDER, unreal.Material, unreal.MaterialFactoryNew())
color = materials.create_material_expression(placeholder, unreal.MaterialExpressionVectorParameter, -300, 0)
color.set_editor_property("parameter_name", "Color")
color.set_editor_property("default_value", unreal.LinearColor(0.8, 0.8, 0.8, 1.0))
materials.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
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
floor.static_mesh_component.set_material(0, grid)
floor.set_actor_scale3d(unreal.Vector(MAP_SIZE_METERS, MAP_SIZE_METERS, 1))

# Rotator(roll, pitch, yaw): 해는 남서쪽 위에서 비스듬히 비춘다.
sun = spawn(unreal.DirectionalLight, "Sun", unreal.Vector(0, 0, 1000), unreal.Rotator(0, -50, 30))
sun.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sun.light_component.set_editor_property("atmosphere_sun_light", True)

spawn(unreal.SkyAtmosphere, "Sky")

sky_light = spawn(unreal.SkyLight, "SkyLight")
sky_light.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sky_light.light_component.set_editor_property("real_time_capture", True)

if not levels.save_current_level():
    raise RuntimeError(f"Could not save {LEVEL}")
unreal.log(f"Created {GRID}, {PLACEHOLDER}, {LEVEL}")
