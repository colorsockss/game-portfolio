# Field 레벨의 땅, 해, 하늘, 하늘빛, 안개, 포스트 프로세스와 머티리얼(땅, 하늘, 풀과 나무, 맵 액터의 자리 표시)을 처음부터 만든다.
# 에셋을 손으로 고치지 않고 이 스크립트를 고쳐 다시 만든다. 맵에 놓인 것(건물, 나무 등)은 그 뒤에 에디터 모듈의 MmoBuildMap이
# 놓인 것의 목록에서 놓고, 땅의 마스크를 구워 땅 머티리얼의 인스턴스(MI_Ground)를 바닥에 입히며 풀과 덤불을 흩는다(102).
# 레벨을 다시 만드는 차례: 이 스크립트 → import_props.py(M_Foliage를 씀) → MmoBuildMap. 조명은 모두 동적이다(라이트맵 없음).
#
#   "/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" \
#     -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/create_content.py" -unattended -nosplash -nullrhi
import os

import unreal

assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

GROUND = "/Game/Materials/M_Ground"
FOLIAGE = "/Game/Materials/M_Foliage"
GROUND_TEXTURES = "/Game/Environment/Ground"
GROUND_ART = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../art/ground"))
OLD_GRID = "/Game/Materials/M_Grid"
SKY = "/Game/Materials/M_Sky"
PLACEHOLDER = "/Game/Materials/M_Placeholder"
LEVEL = "/Game/Maps/Field"
# 맵은 ±1,024 m(packets.proto의 CONSTANT_MAP_HALF_EXTENT_METERS)이고 엔진 평면은 1 m 너비다.
MAP_SIZE_METERS = 2048

# 땅(103): MmoBuildMap이 구운 마스크(R 흙, G 돌길, B 그을린 땅, A 숲 바닥. 필드의 작은 모서리가 텍스처 (0, 0)이고 u가 x, v가 z)로
# 풀밭 위에 네 땅을 섞는다. 마스크의 가장자리는 노이즈로 들쭉날쭉하게 자르고, 풀과 흙은 돌린 두 크기를 섞어 되풀이를 감추며,
# 큰 노이즈로 밝기와 색을 얼룩지게 하고 느리게 흐르는 구름 그림자를 얹는다. 월드의 X가 패킷의 z, Y가 x다.
GROUND_WEIGHTS = """
float2 Meters = WorldPos.xy / 100.0;
float2 FieldUV = (Meters.yx - FieldMin) / FieldSize;
// 필드 밖(바닥은 2,048 m)은 마스크를 쓰지 않는다(가장자리 픽셀이 지평선까지 늘어나 줄무늬가 됨).
float4 Mask = Texture2DSample(TexMask, TexMaskSampler, FieldUV) * (1.0 - smoothstep(0.49, 0.5, max(abs(FieldUV.x - 0.5), abs(FieldUV.y - 0.5))));
float Jag = (Texture2DSample(TexNoise, TexNoiseSampler, Meters / 11.0).g - 0.5) * 0.45;
float Forest = saturate((Mask.a + Jag - 0.3) * 2.2);
float Dirt = saturate((Mask.r + Jag - 0.3) * 3.0);
float Cobble = saturate((Mask.g + Jag * 0.6 - 0.35) * 4.0);
float Scorch = saturate((Mask.b + Jag - 0.3) * 2.5);
"""
GROUND_CODE = GROUND_WEIGHTS + """
float3 Big = Texture2DSample(TexNoise, TexNoiseSampler, Meters / 97.0).rgb;
float2 UV = Meters / 4.0;
float2 Turned = float2(UV.x * 0.8 - UV.y * 0.6, UV.x * 0.6 + UV.y * 0.8) * 0.37;
float3 Grass = lerp(Texture2DSample(TexGrass, TexGrassSampler, UV).rgb, Texture2DSample(TexGrass, TexGrassSampler, Turned).rgb, Big.r);
Grass = lerp(Grass, dot(Grass, float3(0.3, 0.59, 0.11)).xxx, 0.38) * float3(0.86, 0.9, 0.72) * lerp(0.62, 0.88, Big.g);
Grass = lerp(Grass, Grass * float3(1.2, 1.05, 0.6), smoothstep(0.55, 0.85, Big.b) * 0.5);
float3 ForestFloor = Texture2DSample(TexForest, TexForestSampler, UV * 0.8).rgb * lerp(0.7, 0.9, Big.g);
float3 DirtColor = lerp(Texture2DSample(TexDirt, TexDirtSampler, UV * 0.9).rgb, Texture2DSample(TexDirt, TexDirtSampler, Turned * 1.6).rgb, 0.5);
DirtColor = lerp(DirtColor, dot(DirtColor, float3(0.3, 0.59, 0.11)).xxx, 0.4) * 0.72;
float3 CobbleColor = Texture2DSample(TexCobble, TexCobbleSampler, Meters / 12.0).rgb;
CobbleColor = lerp(CobbleColor, dot(CobbleColor, float3(0.3, 0.59, 0.11)).xxx, 0.65) * float3(0.92, 0.92, 0.98) * lerp(0.72, 1.0, Big.g);
float3 ScorchColor = Texture2DSample(TexScorched, TexScorchedSampler, Meters / 6.0).rgb;
ScorchColor = lerp(ScorchColor, dot(ScorchColor, float3(0.3, 0.59, 0.11)).xxx, 0.35);
float3 Color = lerp(Grass, ForestFloor, Forest);
Color = lerp(Color, DirtColor, Dirt);
Color = lerp(Color, CobbleColor, Cobble);
// 광장의 닳은 자리: 돌길 위에 흙이 조금 비친다.
Color = lerp(Color, DirtColor, Cobble * saturate(Mask.r * 1.5 + Jag) * 0.4);
Color = lerp(Color, ScorchColor, Scorch);
float Cloud = smoothstep(0.45, 0.72, Texture2DSample(TexNoise, TexNoiseSampler, Meters / 173.0 + Time * float2(0.0035, 0.002)).r);
return Color * lerp(1.0, 0.8, Cloud);
"""
# 높낮이가 보이는 돌길과 그을린 땅만 노멀 맵을 쓴다(모바일의 텍스처 수를 아낌).
GROUND_NORMAL = GROUND_WEIGHTS + """
float3 Normal = float3(0.0, 0.0, 1.0);
Normal = lerp(Normal, UnpackNormalMap(Texture2DSample(TexCobbleN, TexCobbleNSampler, Meters / 12.0)).xyz, Cobble);
Normal = lerp(Normal, UnpackNormalMap(Texture2DSample(TexScorchedN, TexScorchedNSampler, Meters / 6.0)).xyz, Scorch);
return normalize(Normal);
"""
# 풀과 나무의 바람(103): 바닥(높이 0)은 그대로이고 높이의 제곱만큼 흔든다. Wind는 메시마다(import_props.py) 꼭대기가 흔들리는 cm / 높이(m)²다.
# 맵의 것과 풀은 모두 땅(높이 0)에 서 있어 월드 높이를 메시의 높이로 쓴다(인스턴스 메시도 같음).
WIND_CODE = """
float Height = max(WorldPos.z, 0.0) / 100.0;
float Phase = dot(WorldPos.xy, float2(0.0011, 0.0007)) * 6.2831;
float Sway = sin(Time * 1.6 + Phase) + 0.35 * sin(Time * 3.7 + Phase * 2.3);
float Bend = Wind * Height * Height;
return float3(Sway * Bend, Sway * Bend * 0.5, 0.0);
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


def fresh(path):
    """머티리얼이 있으면 노드를 비우고, 없으면 만든다. 인스턴스(MI_Ground, 풀과 나무)가 가리키는 부모를 지우지 않는다."""
    if assets.does_asset_exist(path):
        material = unreal.load_asset(path)
        materials.delete_all_material_expressions(material)
        return material
    folder, name = path.rsplit("/", 1)
    return tools.create_asset(name, folder, unreal.Material, unreal.MaterialFactoryNew())


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


def custom_inputs(material, code, sources, x, y):
    """입력이 여럿인 커스텀 노드. sources는 (입력 이름, 식)이다."""
    node = materials.create_material_expression(material, unreal.MaterialExpressionCustom, x, y)
    node.set_editor_property("code", code)
    node.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    inputs = []
    for name, _ in sources:
        custom_input = unreal.CustomInput()
        custom_input.set_editor_property("input_name", name)
        inputs.append(custom_input)
    node.set_editor_property("inputs", inputs)
    for name, source in sources:
        materials.connect_material_expressions(source, "", node, name)
    return node


def import_ground_texture(name, kind):
    """mmo/art/ground/<name>.png를 가져온다. kind: color(sRGB), linear(마스크·노이즈), normal."""
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.join(GROUND_ART, f"{name}.png"))
    task.set_editor_property("destination_path", GROUND_TEXTURES)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)
    tools.import_asset_tasks([task])
    texture = unreal.load_asset(f"{GROUND_TEXTURES}/{name}")
    if texture is None:
        raise RuntimeError(f"Could not import {name}.png from {GROUND_ART}")
    if kind == "normal":
        texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        texture.set_editor_property("srgb", False)
    elif kind == "linear":
        texture.set_editor_property("srgb", False)
    texture.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_WORLD)
    save(texture)
    return texture


def texture_object(material, texture, sampler, x, y):
    node = materials.create_material_expression(material, unreal.MaterialExpressionTextureObject, x, y)
    node.set_editor_property("texture", texture)
    node.set_editor_property("sampler_type", sampler)
    return node


def scalar(material, name, value, x, y):
    node = materials.create_material_expression(material, unreal.MaterialExpressionScalarParameter, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("default_value", value)
    return node


def constant(material, value, x, y):
    node = materials.create_material_expression(material, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


def roughness(material, value):
    node = materials.create_material_expression(material, unreal.MaterialExpressionConstant, -300, 200)
    node.set_editor_property("r", value)
    materials.connect_material_property(node, "", unreal.MaterialProperty.MP_ROUGHNESS)


if assets.does_asset_exist(OLD_GRID):
    assets.delete_asset(OLD_GRID)

COLOR = unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
LINEAR = unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR
NORMAL = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
ground_textures = {name: import_ground_texture(name, "color") for name in ("grass", "forest", "dirt", "cobble", "scorched")}
ground_textures["noise"] = import_ground_texture("noise", "linear")
ground_textures["cobble_n"] = import_ground_texture("cobble_n", "normal")
ground_textures["scorched_n"] = import_ground_texture("scorched_n", "normal")

ground = fresh(GROUND)
# 마스크는 MmoBuildMap이 인스턴스(MI_Ground)에 끼운다. 기본값(검정)이면 온통 풀밭이다.
ground_mask = materials.create_material_expression(ground, unreal.MaterialExpressionTextureObjectParameter, -900, -300)
ground_mask.set_editor_property("parameter_name", "GroundMask")
ground_mask.set_editor_property("texture", unreal.load_asset("/Engine/EngineResources/Black"))
ground_mask.set_editor_property("sampler_type", LINEAR)
ground_position = materials.create_material_expression(ground, unreal.MaterialExpressionWorldPosition, -900, -400)
field_min = scalar(ground, "FieldMin", -300.0, -900, -200)
field_size = scalar(ground, "FieldSize", 600.0, -900, -100)
ground_noise = texture_object(ground, ground_textures["noise"], LINEAR, -900, 0)
weight_inputs = [("WorldPos", ground_position), ("FieldMin", field_min), ("FieldSize", field_size), ("TexMask", ground_mask), ("TexNoise", ground_noise)]
ground_color = custom_inputs(ground, GROUND_CODE, weight_inputs + [
    ("Time", materials.create_material_expression(ground, unreal.MaterialExpressionTime, -900, 100)),
    ("TexGrass", texture_object(ground, ground_textures["grass"], COLOR, -900, 200)),
    ("TexForest", texture_object(ground, ground_textures["forest"], COLOR, -900, 300)),
    ("TexDirt", texture_object(ground, ground_textures["dirt"], COLOR, -900, 400)),
    ("TexCobble", texture_object(ground, ground_textures["cobble"], COLOR, -900, 500)),
    ("TexScorched", texture_object(ground, ground_textures["scorched"], COLOR, -900, 600)),
], -400, 0)
materials.connect_material_property(ground_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
ground_normal = custom_inputs(ground, GROUND_NORMAL, weight_inputs + [
    ("TexCobbleN", texture_object(ground, ground_textures["cobble_n"], NORMAL, -900, 700)),
    ("TexScorchedN", texture_object(ground, ground_textures["scorched_n"], NORMAL, -900, 800)),
], -400, 300)
materials.connect_material_property(ground_normal, "", unreal.MaterialProperty.MP_NORMAL)
roughness(ground, 0.92)
materials.connect_material_property(constant(ground, 0.3, -300, 400), "", unreal.MaterialProperty.MP_SPECULAR)
materials.recompile_material(ground)
save(ground)

# 풀과 나무(103): 가져온 원본의 색(Color, 가져오기가 칸마다 채움)에 바람의 흔들림(Wind)을 더한 머티리얼. 흩는 풀은 인스턴스 메시다.
foliage = fresh(FOLIAGE)
foliage.set_editor_property("two_sided", True)
foliage.set_editor_property("used_with_instanced_static_meshes", True)
foliage_color = materials.create_material_expression(foliage, unreal.MaterialExpressionVectorParameter, -300, 0)
foliage_color.set_editor_property("parameter_name", "Color")
foliage_color.set_editor_property("default_value", unreal.LinearColor(0.3, 0.5, 0.2, 1.0))
materials.connect_material_property(foliage_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
roughness(foliage, 0.85)
foliage_position = materials.create_material_expression(foliage, unreal.MaterialExpressionWorldPosition, -700, 300)
foliage_position.set_editor_property("world_position_shader_offset", unreal.WorldPositionIncludedOffsets.WPT_EXCLUDE_ALL_SHADER_OFFSETS)
wind = custom_inputs(foliage, WIND_CODE, [
    ("WorldPos", foliage_position),
    ("Time", materials.create_material_expression(foliage, unreal.MaterialExpressionTime, -700, 400)),
    ("Wind", scalar(foliage, "Wind", 0.0, -700, 500)),
], -400, 300)
materials.connect_material_property(wind, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
materials.recompile_material(foliage)
save(foliage)

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

# Rotator(roll, pitch, yaw): 해는 남서쪽 위에서 비스듬히 비춘다. 103: 그림자가 길게 보이게 조금 낮추고 따뜻한 빛으로, 위에서 보는
# 카메라(13–36 m)라 그림자 거리를 60 m로 줄여 그림자를 선명하게 한다.
sun = spawn(unreal.DirectionalLight, "Sun", unreal.Vector(0, 0, 1000), unreal.Rotator(0, -42, 30))
sun.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sun.light_component.set_editor_property("atmosphere_sun_light", True)
sun.light_component.set_editor_property("light_color", unreal.Color(r=255, g=245, b=228, a=255))
sun.light_component.set_editor_property("dynamic_shadow_distance_movable_light", 6000.0)

spawn(unreal.SkyAtmosphere, "Sky")

sky_light = spawn(unreal.SkyLight, "SkyLight")
sky_light.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sky_light.light_component.set_editor_property("real_time_capture", True)
# 하늘빛이 그늘을 덜 밝혀 해와 그늘의 대비가 보이게 한다(103).
sky_light.light_component.set_editor_property("intensity", 0.75)

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

# 포스트 프로세스(103): 레벨 전체에 하나. 블룸은 스킬 이펙트의 빛(가산 머티리얼이 1을 넘음)이 번지게 하고, 노출은 자동이되 천천히
# 따라가 어두운 숲과 밝은 길을 오가도 출렁이지 않게 하며(조금 어둡게), 색은 조금 따뜻하고 대비를 높이며, 가장자리는 어둡게 한다. 모바일(Vulkan, 모바일
# HDR)도 블룸·톤 매핑·색 보정·비네트를 그린다. SSAO는 데스크톱만이다.
post = spawn(unreal.PostProcessVolume, "PostProcess")
post.set_editor_property("unbound", True)
settings = post.get_editor_property("settings")
for name, value in [
    ("bloom_intensity", 0.6),
    ("auto_exposure_speed_up", 2.0),
    ("auto_exposure_speed_down", 2.0),
    ("auto_exposure_bias", -0.4),
    ("white_temp", 6650.0),
    ("color_saturation", unreal.Vector4(1.0, 1.0, 1.0, 1.0)),
    ("color_contrast", unreal.Vector4(1.07, 1.07, 1.07, 1.0)),
    ("vignette_intensity", 0.45),
    ("ambient_occlusion_intensity", 0.6),
    ("ambient_occlusion_radius", 120.0),
]:
    settings.set_editor_property(f"override_{name}", True)
    settings.set_editor_property(name, value)
post.set_editor_property("settings", settings)

if not levels.save_current_level():
    raise RuntimeError(f"Could not save {LEVEL}")
unreal.log(f"Created {GROUND}, {SKY}, {PLACEHOLDER}, {LEVEL}")
