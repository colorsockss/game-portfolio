using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.U2D.Sprites;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 배우의 그림(Assets/Battle/Actors/묶음 이름/클립 이름.png)을 클립 프레임으로 임포트한다. 그림은 정사각 프레임을 왼쪽부터
    /// 가로로 이은 한 장이고, 발은 프레임 중심보다 64픽셀 아래, 대기 첫 프레임의 몸은 150픽셀이다(idle/docs/art.md).
    /// 피벗이 프레임 가운데라서 ActorClips의 임시 그림과 같은 자리에 같은 크기(몸 1유닛)로 선다.
    /// </summary>
    internal static class ActorArt
    {
        /// <summary>그림 폴더. 하위 폴더 이름이 클립 묶음의 이름(hero 등)이다.</summary>
        internal const string Folder = "Assets/Battle/Actors";

        /// <summary>프레임 한 변의 최소 픽셀 수. 가로로 넓은 동작은 더 큰 정사각 여백을 쓴다.</summary>
        private const int MinimumFrameSize = 256;

        /// <summary>유닛당 픽셀 수. 대기의 몸(150픽셀)이 임시 그림처럼 1유닛이다.</summary>
        private const int PixelsPerUnit = 150;

        /// <summary>이 묶음의 그림이 있는지.</summary>
        /// <param name="set">클립 묶음의 이름.</param>
        /// <returns>그림 폴더가 있으면 true.</returns>
        internal static bool Has(string set) => AssetDatabase.IsValidFolder($"{Folder}/{set}");

        /// <summary>그림이 있는 묶음의 이름(그림 폴더의 하위 폴더 이름).</summary>
        /// <returns>묶음의 이름. 그림 폴더가 없으면 비어 있다.</returns>
        internal static IEnumerable<string> Sets() => AssetDatabase.IsValidFolder(Folder)
            ? AssetDatabase.GetSubFolders(Folder).Select(Path.GetFileName)
            : Enumerable.Empty<string>();

        /// <summary>
        /// 클립 하나의 그림을 임포트 설정과 프레임 자르기까지 맞추고 프레임을 차례로 돌려준다. 다시 해도 같은 이름의 프레임은
        /// 같은 스프라이트 ID를 써서 묶음의 참조가 그대로다.
        /// </summary>
        /// <param name="set">클립 묶음의 이름.</param>
        /// <param name="clip">클립 이름(파일 이름).</param>
        /// <param name="frames">프레임 수. 그림의 너비가 이것과 맞지 않으면 던진다.</param>
        /// <returns>프레임 스프라이트.</returns>
        internal static Sprite[] Import(string set, string clip, int frames)
        {
            string path = $"{Folder}/{set}/{clip}.png";
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
                throw new FileNotFoundException($"No actor picture {path}");
            importer.GetSourceTextureWidthAndHeight(out int width, out int height);
            int frameSize = height;
            if ((frameSize < MinimumFrameSize) || (width != frameSize * frames))
                throw new InvalidDataException($"{path} is {width}x{height}, expected {frames} square frames of at least {MinimumFrameSize}px");

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Bilinear;
            // 프리팹이 모든 묶음을 참조해 시트가 한꺼번에 올라가므로 압축한다(무압축이면 74장에 약 87 MiB).
            importer.textureCompression = TextureImporterCompression.Compressed;
            Slice(importer, set, clip, frames, frameSize);
            importer.SaveAndReimport();

            Dictionary<string, Sprite> sprites = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>()
                .ToDictionary(sprite => sprite.name);
            return Enumerable.Range(0, frames).Select(i => sprites[FrameName(set, clip, i)]).ToArray();
        }

        /// <summary>그림을 왼쪽부터 프레임 칸으로 자른다. 피벗은 칸 가운데다.</summary>
        /// <param name="importer">그림의 임포터.</param>
        /// <param name="set">클립 묶음의 이름.</param>
        /// <param name="clip">클립 이름.</param>
        /// <param name="frames">프레임 수.</param>
        /// <param name="frameSize">시트 높이로 정한 정사각 프레임의 한 변.</param>
        private static void Slice(TextureImporter importer, string set, string clip, int frames, int frameSize)
        {
            var factory = new SpriteDataProviderFactories();
            factory.Init();
            ISpriteEditorDataProvider provider = factory.GetSpriteEditorDataProviderFromObject(importer);
            provider.InitSpriteEditorDataProvider();
            var capability = provider.GetDataProvider<ISpriteFrameEditCapability>();
            if ((capability == null) || !capability.GetEditCapability().HasCapability(EEditCapability.CreateAndDeleteSprite))
                throw new System.InvalidOperationException($"{importer.assetPath} cannot be sliced");

            // 이름이 같은 프레임은 전의 ID를 그대로 써서, 묶음이 가리키는 스프라이트가 바뀌지 않게 한다.
            Dictionary<string, GUID> ids = provider.GetSpriteRects().ToDictionary(rect => rect.name, rect => rect.spriteID);
            SpriteRect[] rects = Enumerable.Range(0, frames).Select(i =>
            {
                string name = FrameName(set, clip, i);
                return new SpriteRect
                {
                    name = name,
                    rect = new Rect(i * frameSize, 0f, frameSize, frameSize),
                    alignment = SpriteAlignment.Center,
                    pivot = new Vector2(0.5f, 0.5f),
                    spriteID = ids.TryGetValue(name, out GUID id) ? id : GUID.Generate(),
                };
            }).ToArray();
            provider.SetSpriteRects(rects);
            provider.GetDataProvider<ISpriteNameFileIdDataProvider>()?.SetNameFileIdPairs(
                rects.Select(rect => new SpriteNameFileIdPair(rect.name, rect.spriteID)).ToList());
            provider.Apply();
        }

        /// <summary>프레임 스프라이트의 이름. 임시 그림의 하위 스프라이트와 같은 모양이다.</summary>
        /// <param name="set">클립 묶음의 이름.</param>
        /// <param name="clip">클립 이름.</param>
        /// <param name="index">프레임 번호.</param>
        /// <returns>이름.</returns>
        private static string FrameName(string set, string clip, int index) => $"{set}_{clip}_{index}";
    }
}
