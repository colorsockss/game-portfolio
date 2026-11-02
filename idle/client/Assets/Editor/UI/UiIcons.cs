using System.IO;
using System.Linq;
using PortfolioIdleRpg.Views;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 아이콘(Assets/UI/Sprites/Icons): 임포트 설정을 맞추고, 데이터가 이름으로 고르는 묶음(Icons.asset)을 채우고,
    /// 빌더가 아이콘 칸을 놓는다. 그림을 더하거나 바꾸면 Tools/UI/Build All Prefabs가 이것부터 다시 한다.
    /// </summary>
    internal static class UiIcons
    {
        /// <summary>아이콘 그림의 폴더. 파일 이름이 아이콘 이름(Items.icon)이다.</summary>
        internal const string Folder = "Assets/UI/Sprites/Icons";

        /// <summary>아이콘 묶음 에셋의 경로.</summary>
        private const string SetPath = "Assets/UI/Icons.asset";

        /// <summary>
        /// 아이콘 한 변의 최대 픽셀. 가장 크게 보이는 가방 칸(기준 화면 110)을 넘으면 아틀라스만 커지므로 원본(256)을
        /// 줄여 넣는다.
        /// </summary>
        private const int MaxSize = 128;

        /// <summary>폴더의 그림을 아이콘으로 임포트하고 묶음을 이름 순서로 다시 채운다.</summary>
        internal static void Build()
        {
            AssetDatabase.Refresh();
            string[] paths = Directory.GetFiles(Folder, "*.png")
                .Select(path => path.Replace('\\', '/'))
                .OrderBy(path => path, System.StringComparer.Ordinal)
                .ToArray();
            foreach (string path in paths)
                Import(path);

            var set = AssetDatabase.LoadAssetAtPath<IconSet>(SetPath);
            if (set == null)
            {
                set = ScriptableObject.CreateInstance<IconSet>();
                AssetDatabase.CreateAsset(set, SetPath);
            }
            var serialized = new SerializedObject(set);
            UiPrefabs.SetArray(
                serialized.FindProperty("_icons"),
                paths.Select(path => (Object)Get(Path.GetFileNameWithoutExtension(path))).ToArray());
            serialized.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built {paths.Length} icons in {SetPath}");
        }

        /// <summary>이름이 <paramref name="name"/>인 아이콘. 빌더가 고정된 아이콘(메인 버튼)을 넣을 때 쓴다.</summary>
        /// <param name="name">아이콘 이름(확장자 없는 파일 이름).</param>
        /// <returns>아이콘.</returns>
        internal static Sprite Get(string name)
        {
            var icon = AssetDatabase.LoadAssetAtPath<Sprite>($"{Folder}/{name}.png");
            if (icon == null)
                throw new FileNotFoundException($"No icon {Folder}/{name}.png");
            return icon;
        }

        /// <summary>
        /// TypeScript가 이름으로 고르는 아이콘 칸을 놓는다. 처음에는 숨어 있다. 자리는 부르는 쪽이 정한다.
        /// </summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>아이콘 칸.</returns>
        internal static IconView Add(Transform parent, string name)
        {
            Image image = AddFixed(parent, name, null);
            var icon = image.gameObject.AddComponent<IconView>();
            UiPrefabs.SetField(icon, "_icons", AssetDatabase.LoadAssetAtPath<IconSet>(SetPath));
            image.gameObject.SetActive(false);
            return icon;
        }

        /// <summary>정해진 아이콘을 보이는 이미지를 놓는다. 비율을 지키고 탭은 받지 않는다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="icon">아이콘. null이면 TypeScript가 정한다.</param>
        /// <returns>이미지.</returns>
        internal static Image AddFixed(Transform parent, string name, Sprite icon)
        {
            Image image = UiPrefabs.AddImage(parent, name, Color.white);
            image.sprite = icon;
            image.preserveAspect = true;
            image.raycastTarget = false;
            return image;
        }

        /// <summary>그림 하나를 UI 아이콘으로 임포트한다. 설정이 같으면 다시 임포트하지 않는다.</summary>
        /// <param name="path">그림 경로.</param>
        private static void Import(string path)
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            if ((importer.textureType == TextureImporterType.Sprite) && (importer.maxTextureSize == MaxSize) && !importer.mipmapEnabled)
                return;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Bilinear;
            importer.maxTextureSize = MaxSize;
            // 압축은 아이콘이 들어가는 아틀라스(Assets/UI/Ui.spriteatlasv2)가 정한다.
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
        }
    }
}
