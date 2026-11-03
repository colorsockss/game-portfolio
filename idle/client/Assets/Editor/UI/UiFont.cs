using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 글꼴(Jua, SIL OFL 1.1, idle/art/fonts/Jua-OFL.txt)의 TMP 글꼴 에셋과 두 재질을 만들고 TMP의 기본 글꼴로 정한다. 기본
    /// 재질은 짙은 외곽선과 아래 그림자가 있는 글자(어두운 바탕, 버튼)이고, 잉크 재질은 외곽선이 없는 글자(크림색 판)다. 빌더가
    /// 만드는 글자는 기본 글꼴을 쓰므로 이것을 먼저 돌린다(<see cref="AllUiPrefabs"/>). 글꼴 에셋은 동적이라 플레이 모드에서
    /// 쓴 글자가 아틀라스에 그려지는데, 편집 모드로 돌아오면 비워서(<see cref="DynamicFontReset"/>) 커밋한 파일이 바뀌지 않는다.
    /// 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.UiFont.Build
    /// </code>
    /// </summary>
    public static class UiFont
    {
        /// <summary>글꼴 파일.</summary>
        private const string FontPath = "Assets/Fonts/Jua/Jua-Regular.ttf";

        /// <summary>TMP 글꼴 에셋.</summary>
        internal const string AssetPath = "Assets/Fonts/Jua/Jua SDF.asset";

        /// <summary>외곽선 없는 재질.</summary>
        private const string InkPath = "Assets/Fonts/Jua/Jua SDF - Ink.mat";

        /// <summary>아틀라스에 그리는 글자 크기. 기준 화면의 본문(44)보다 커서 큰 글자도 흐리지 않다.</summary>
        private const int SamplingSize = 72;

        /// <summary>글자 사이 여백. 외곽선과 그림자가 이 안에 들어간다.</summary>
        private const int Padding = 10;

        /// <summary>아틀라스 한 장의 한 변. 다 차면 같은 크기의 장을 더한다.</summary>
        private const int AtlasSize = 2048;

        /// <summary>외곽선과 그림자의 색. UI 그림의 외곽선(draw.py의 OUTLINE)과 같다.</summary>
        private static readonly Color s_outline = new Color32(43, 34, 54, 255);

        /// <summary>글꼴 에셋과 재질을 만들거나 고치고, TMP의 기본 글꼴과 테마의 잉크 재질로 정한다.</summary>
        [MenuItem("Tools/UI/Build Font")]
        public static void Build()
        {
            TMP_FontAsset asset = LoadOrCreate();
            Material face = asset.material;
            face.shader = Shader.Find("TextMeshPro/Distance Field");
            face.SetFloat(ShaderUtilities.ID_FaceDilate, 0.2f);
            face.EnableKeyword(ShaderUtilities.Keyword_Outline);
            face.SetColor(ShaderUtilities.ID_OutlineColor, s_outline);
            face.SetFloat(ShaderUtilities.ID_OutlineWidth, 0.42f);
            face.EnableKeyword(ShaderUtilities.Keyword_Underlay);
            face.SetColor(ShaderUtilities.ID_UnderlayColor, s_outline);
            face.SetFloat(ShaderUtilities.ID_UnderlayOffsetX, 0f);
            face.SetFloat(ShaderUtilities.ID_UnderlayOffsetY, -0.9f);
            face.SetFloat(ShaderUtilities.ID_UnderlayDilate, 0.6f);
            face.SetFloat(ShaderUtilities.ID_UnderlaySoftness, 0f);
            EditorUtility.SetDirty(face);

            var ink = AssetDatabase.LoadAssetAtPath<Material>(InkPath);
            if (ink == null)
            {
                ink = new Material(face);
                AssetDatabase.CreateAsset(ink, InkPath);
            }
            ink.CopyPropertiesFromMaterial(face);
            ink.shaderKeywords = new string[0];
            ink.SetFloat(ShaderUtilities.ID_FaceDilate, 0.05f);
            ink.SetFloat(ShaderUtilities.ID_OutlineWidth, 0f);
            EditorUtility.SetDirty(ink);

            var settings = new SerializedObject(TMP_Settings.instance);
            settings.FindProperty("m_defaultFontAsset").objectReferenceValue = asset;
            settings.ApplyModifiedPropertiesWithoutUndo();

            UiTheme theme = UiTheme.Load();
            theme.InkMaterial = ink;
            EditorUtility.SetDirty(theme);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the UI font {AssetPath}");
        }

        /// <summary>글꼴 에셋을 읽는다. 없으면 동적 SDF 에셋으로 만들고 아틀라스와 재질을 하위 에셋으로 넣는다.</summary>
        /// <returns>글꼴 에셋.</returns>
        private static TMP_FontAsset LoadOrCreate()
        {
            var asset = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(AssetPath);
            if (asset != null)
                return asset;
            var font = AssetDatabase.LoadAssetAtPath<Font>(FontPath);
            asset = TMP_FontAsset.CreateFontAsset(
                font, SamplingSize, Padding, GlyphRenderMode.SDFAA, AtlasSize, AtlasSize, AtlasPopulationMode.Dynamic, true);
            asset.name = "Jua SDF";
            AssetDatabase.CreateAsset(asset, AssetPath);
            asset.atlasTextures[0].name = "Jua SDF Atlas";
            AssetDatabase.AddObjectToAsset(asset.atlasTextures[0], asset);
            asset.material.name = "Jua SDF Material";
            AssetDatabase.AddObjectToAsset(asset.material, asset);
            // 빌드에는 빈 아틀라스로 들어가 기기에서 쓰는 글자만 그린다.
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("m_ClearDynamicDataOnBuild").boolValue = true;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return asset;
        }
    }

    /// <summary>
    /// 플레이 모드가 끝나 편집 모드로 돌아오면 UI 글꼴 에셋의 아틀라스를 비운다. 동적 글꼴은 쓴 글자를 에셋에 그려 두므로, 비우지
    /// 않으면 플레이할 때마다 커밋한 에셋이 바뀐다.
    /// </summary>
    [InitializeOnLoad]
    internal static class DynamicFontReset
    {
        /// <summary>플레이 모드의 바뀜을 듣는다.</summary>
        static DynamicFontReset() => EditorApplication.playModeStateChanged += Reset;

        /// <summary>편집 모드로 돌아왔으면 아틀라스를 비우고 저장한다.</summary>
        /// <param name="change">바뀐 상태.</param>
        private static void Reset(PlayModeStateChange change)
        {
            if (change != PlayModeStateChange.EnteredEditMode)
                return;
            var asset = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(UiFont.AssetPath);
            if (asset == null)
                return;
            asset.ClearFontAssetData(true);
            AssetDatabase.SaveAssetIfDirty(asset);
        }
    }
}
