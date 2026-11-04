using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 스테이지 배경의 두 겹(Assets/Battle/Backgrounds/Far, Near의 PNG)을 스프라이트로 임포트한다. 원경은 하늘과 먼 풍경이고
    /// 불투명하며, 근경은 땅과 가까운 소품이고 위쪽이 투명하다. 그림은 idle/art/backgrounds의 &lt;이름&gt;_far.png,
    /// &lt;이름&gt;_near.png를 옮겨 온 것이다(idle/docs/art.md). 파일 이름이 Stages 테이블의 background이고 StageView가
    /// 그 이름으로 고른다. 영웅이 걸으면 StageView가 두 겹을 가로로 이어 흘리므로 그림은 왼쪽과 오른쪽 끝이 이어진다.
    /// </summary>
    internal static class Backgrounds
    {
        /// <summary>두 겹의 폴더를 담은 폴더.</summary>
        internal const string Folder = "Assets/Battle/Backgrounds";

        /// <summary>유닛당 픽셀 수. 768×1344 그림이 8×14유닛이라 넓은 화면과 길쭉한 화면까지 덮는다.</summary>
        private const int PixelsPerUnit = 96;

        /// <summary>두 겹을 모두 임포트한다. 원경마다 같은 이름의 근경이 있어야 한다.</summary>
        /// <returns>이름순의 원경과, 같은 차례의 근경.</returns>
        internal static (Sprite[] Far, Sprite[] Near) Build()
        {
            string[] names = Directory.GetFiles($"{Folder}/Far", "*.png")
                .Select(Path.GetFileNameWithoutExtension)
                .OrderBy(name => name, System.StringComparer.Ordinal)
                .ToArray();
            if (names.Length == 0)
                throw new FileNotFoundException($"No background pictures in {Folder}/Far");
            return (names.Select(name => Import("Far", name)).ToArray(), names.Select(name => Import("Near", name)).ToArray());
        }

        /// <summary>그림 하나를 이어 그릴 수 있는 스프라이트로 임포트한다.</summary>
        /// <param name="layer">겹의 폴더 이름(Far, Near).</param>
        /// <param name="name">배경의 이름.</param>
        /// <returns>스프라이트.</returns>
        private static Sprite Import(string layer, string name)
        {
            string path = $"{Folder}/{layer}/{name}.png";
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
                throw new FileNotFoundException($"No background picture {path}");
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Bilinear;
            // 프리팹이 모든 배경을 참조해 한꺼번에 올라가므로 압축한다(무압축이면 12장에 약 47 MiB).
            importer.textureCompression = TextureImporterCompression.Compressed;
            // 타일로 이어 그리려면(SpriteDrawMode.Tiled) 메시가 사각형이어야 한다.
            var settings = new TextureImporterSettings();
            importer.ReadTextureSettings(settings);
            settings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(settings);
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }
    }
}
