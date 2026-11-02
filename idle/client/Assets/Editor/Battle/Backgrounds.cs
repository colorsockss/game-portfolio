using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 그림이 생기기 전까지 쓰는 스테이지 배경(Assets/Battle/Backgrounds의 PNG)을 코드로 그린다. 위에서부터 띠진 하늘,
    /// 지평선 위의 먼 실루엣(언덕, 숲, 천막, 성벽, 산, 바위), 배우가 서는 땅과 그 무늬다. 영웅이 걸으면 StageView가 그림을
    /// 가로로 이어 흘리므로 왼쪽과 오른쪽 끝이 이어지게(무늬의 주기가 너비를 나누게) 그린다. 파일 이름이 Stages 테이블의
    /// background이고 StageView가 그 이름으로 고른다. 같은 코드는 같은 픽셀을 그려 바이트가 같으면 파일을 쓰지 않으므로,
    /// 다시 실행해도 파일과 GUID가 그대로다.
    /// </summary>
    internal static class Backgrounds
    {
        /// <summary>PNG를 두는 폴더.</summary>
        internal const string Folder = "Assets/Battle/Backgrounds";

        /// <summary>가로 픽셀. 넓은 화면(보이는 가로 반폭 약 3.75유닛)까지 덮는 8유닛이다.</summary>
        private const int Width = 96;

        /// <summary>세로 픽셀. 길쭉한 화면(보이는 세로 반높이 약 6.1유닛)까지 덮는 14유닛이다.</summary>
        private const int Height = 168;

        /// <summary>유닛당 픽셀 수.</summary>
        private const int PixelsPerUnit = 12;

        /// <summary>지평선의 픽셀 줄. 그림의 가운데가 월드 원점이고, 지평선은 뒷줄 배우의 머리 위인 월드 y 2다.</summary>
        private const int Horizon = (Height / 2) + (2 * PixelsPerUnit);

        /// <summary>그림의 너비를 한 바퀴로 하는 각속도(픽셀당 라디안). 사인 무늬가 너비마다 되풀이된다.</summary>
        private const float Turn = 2f * Mathf.PI / Width;

        /// <summary>하늘과 땅의 그러데이션을 나누는 띠의 수.</summary>
        private const int Bands = 6;

        /// <summary>지평선 위 실루엣의 모양.</summary>
        private enum Skyline
        {
            /// <summary>완만한 언덕.</summary>
            Hills,

            /// <summary>뾰족한 나무가 늘어선 숲.</summary>
            Pines,

            /// <summary>세모난 천막.</summary>
            Tents,

            /// <summary>총안이 있는 성벽과 탑.</summary>
            Wall,

            /// <summary>꼭대기에 눈이 덮인 큰 산.</summary>
            Peaks,

            /// <summary>가늘고 높은 바위.</summary>
            Spikes,
        }

        /// <summary>땅의 무늬.</summary>
        private enum Floor
        {
            /// <summary>흩어진 풀.</summary>
            Grass,

            /// <summary>흩어진 돌.</summary>
            Pebbles,

            /// <summary>어긋나게 쌓은 돌바닥.</summary>
            Tiles,

            /// <summary>사선으로 갈라진 틈(용암).</summary>
            Cracks,
        }

        /// <summary>배경 하나의 이름, 색, 모양.</summary>
        private readonly struct Look
        {
            /// <summary>파일과 스프라이트의 이름.</summary>
            internal readonly string Name;

            /// <summary>하늘 맨 위의 색.</summary>
            internal readonly Color SkyTop;

            /// <summary>지평선 바로 위 하늘의 색.</summary>
            internal readonly Color SkyBottom;

            /// <summary>실루엣의 색.</summary>
            internal readonly Color Far;

            /// <summary>지평선 바로 아래 땅의 색. 아래로 갈수록 어두워진다.</summary>
            internal readonly Color Ground;

            /// <summary>땅의 무늬와 산꼭대기 눈의 색.</summary>
            internal readonly Color Mark;

            /// <summary>실루엣의 모양.</summary>
            internal readonly Skyline Skyline;

            /// <summary>땅의 무늬.</summary>
            internal readonly Floor Floor;

            /// <summary>배경 하나를 정한다.</summary>
            /// <param name="name">이름.</param>
            /// <param name="skyTop">하늘 맨 위의 색.</param>
            /// <param name="skyBottom">지평선 위 하늘의 색.</param>
            /// <param name="far">실루엣의 색.</param>
            /// <param name="ground">땅의 색.</param>
            /// <param name="mark">무늬의 색.</param>
            /// <param name="skyline">실루엣의 모양.</param>
            /// <param name="floor">땅의 무늬.</param>
            internal Look(
                string name, Color skyTop, Color skyBottom, Color far, Color ground, Color mark, Skyline skyline, Floor floor)
            {
                Name = name;
                SkyTop = skyTop;
                SkyBottom = skyBottom;
                Far = far;
                Ground = ground;
                Mark = mark;
                Skyline = skyline;
                Floor = floor;
            }
        }

        /// <summary>그리는 배경. 0번이 이름이 맞는 것이 없을 때 쓰는 배경이다. 배우가 눈에 띄도록 채도를 낮췄다.</summary>
        private static readonly Look[] s_looks =
        {
            new Look(
                "meadow", new Color(0.42f, 0.62f, 0.85f), new Color(0.7f, 0.82f, 0.92f), new Color(0.32f, 0.5f, 0.32f),
                new Color(0.36f, 0.52f, 0.3f), new Color(0.28f, 0.42f, 0.24f), Skyline.Hills, Floor.Grass),
            new Look(
                "forest", new Color(0.3f, 0.45f, 0.5f), new Color(0.55f, 0.68f, 0.64f), new Color(0.13f, 0.27f, 0.18f),
                new Color(0.24f, 0.36f, 0.2f), new Color(0.17f, 0.27f, 0.15f), Skyline.Pines, Floor.Grass),
            new Look(
                "camp", new Color(0.6f, 0.4f, 0.35f), new Color(0.85f, 0.65f, 0.45f), new Color(0.38f, 0.26f, 0.2f),
                new Color(0.5f, 0.4f, 0.28f), new Color(0.4f, 0.31f, 0.22f), Skyline.Tents, Floor.Pebbles),
            new Look(
                "fortress", new Color(0.3f, 0.32f, 0.38f), new Color(0.5f, 0.52f, 0.56f), new Color(0.26f, 0.26f, 0.29f),
                new Color(0.4f, 0.4f, 0.42f), new Color(0.31f, 0.31f, 0.33f), Skyline.Wall, Floor.Tiles),
            new Look(
                "snow", new Color(0.5f, 0.62f, 0.78f), new Color(0.76f, 0.83f, 0.9f), new Color(0.6f, 0.66f, 0.76f),
                new Color(0.82f, 0.86f, 0.9f), new Color(0.68f, 0.74f, 0.84f), Skyline.Peaks, Floor.Pebbles),
            new Look(
                "lava", new Color(0.16f, 0.05f, 0.08f), new Color(0.42f, 0.13f, 0.09f), new Color(0.11f, 0.07f, 0.09f),
                new Color(0.24f, 0.15f, 0.14f), new Color(0.85f, 0.38f, 0.1f), Skyline.Spikes, Floor.Cracks),
        };

        /// <summary>배경을 모두 그려 PNG로 쓰고 스프라이트로 불러온다.</summary>
        /// <returns>s_looks 순서의 스프라이트.</returns>
        internal static Sprite[] Build()
        {
            Directory.CreateDirectory(Folder);
            var sprites = new Sprite[s_looks.Length];
            for (int i = 0; i < s_looks.Length; i++)
                sprites[i] = Save(s_looks[i]);
            return sprites;
        }

        /// <summary>배경 하나를 그려 바뀐 경우에만 PNG로 쓰고, 점 필터의 스프라이트로 가져온다.</summary>
        /// <param name="look">그릴 배경.</param>
        /// <returns>가져온 스프라이트.</returns>
        private static Sprite Save(Look look)
        {
            string path = $"{Folder}/{look.Name}.png";
            var texture = new Texture2D(Width, Height, TextureFormat.RGBA32, false);
            try
            {
                texture.SetPixels32(Draw(look));
                byte[] png = texture.EncodeToPNG();
                if (!File.Exists(path) || !File.ReadAllBytes(path).AsSpan().SequenceEqual(png))
                    File.WriteAllBytes(path, png);
            }
            finally
            {
                Object.DestroyImmediate(texture);
            }

            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            importer.filterMode = FilterMode.Point;
            importer.mipmapEnabled = false;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            // 타일로 이어 그리려면(SpriteDrawMode.Tiled) 메시가 사각형이어야 한다.
            var settings = new TextureImporterSettings();
            importer.ReadTextureSettings(settings);
            settings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(settings);
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        /// <summary>배경 하나의 픽셀을 아래 줄부터 그린다.</summary>
        /// <param name="look">그릴 배경.</param>
        /// <returns>Width × Height 픽셀.</returns>
        private static Color32[] Draw(Look look)
        {
            var pixels = new Color32[Width * Height];
            for (int x = 0; x < Width; x++)
            {
                int height = SkylineHeight(look.Skyline, x);
                int far = Horizon + height;
                // 높은 산의 꼭대기 다섯 줄은 눈이다.
                bool snowCap = (look.Skyline == Skyline.Peaks) && (height > 12);
                for (int y = 0; y < Height; y++)
                {
                    Color color;
                    if (y < Horizon)
                        color = GroundColor(look, x, y);
                    else if (y < far)
                        color = (snowCap && (y >= far - 5)) ? look.Mark : look.Far;
                    else
                        color = Color.Lerp(look.SkyBottom, look.SkyTop, Band((float)(y - Horizon) / (Height - Horizon)));
                    pixels[(y * Width) + x] = color;
                }
            }
            return pixels;
        }

        /// <summary>땅 한 픽셀의 색: 아래로 갈수록 어두운 띠에 무늬를 얹고, 지평선 바로 아래 줄은 테두리로 어둡게 한다.</summary>
        /// <param name="look">그릴 배경.</param>
        /// <param name="x">픽셀 x.</param>
        /// <param name="y">픽셀 y. 지평선보다 아래다.</param>
        /// <returns>그 픽셀의 색.</returns>
        private static Color GroundColor(Look look, int x, int y)
        {
            Color ground = Color.Lerp(look.Ground, look.Ground * 0.7f, Band((float)(Horizon - 1 - y) / Horizon));
            ground.a = 1f;
            if (y == Horizon - 1)
                return Color.Lerp(ground, look.Far, 0.5f);
            uint hash = Hash(x, y);
            bool mark;
            switch (look.Floor)
            {
                case Floor.Grass:
                    // 풀 한 포기는 위아래 두 픽셀이다.
                    mark = ((hash % 23) == 0) || ((Hash(x, y - 1) % 23) == 0);
                    break;
                case Floor.Pebbles:
                    mark = (hash % 17) == 0;
                    break;
                case Floor.Tiles:
                    int row = (Horizon - 1 - y) / 8;
                    mark = (((Horizon - 1 - y) % 8) == 0) || (((x + ((row % 2) * 6)) % 12) == 0);
                    break;
                default:
                    mark = (((x + (y * 3)) % 32) == 0) || ((((x * 2) - y + 1000) % 48) == 0);
                    break;
            }
            return mark ? look.Mark : ground;
        }

        /// <summary>실루엣이 지평선 위로 솟은 높이(픽셀).</summary>
        /// <param name="skyline">실루엣의 모양.</param>
        /// <param name="x">픽셀 x.</param>
        /// <returns>높이. 0이면 실루엣이 없다.</returns>
        private static int SkylineHeight(Skyline skyline, int x)
        {
            switch (skyline)
            {
                case Skyline.Hills:
                    return Mathf.RoundToInt(10f + (6f * Mathf.Sin(x * Turn)) + (4f * Mathf.Sin((x * 4f * Turn) + 1f)));
                case Skyline.Pines:
                    return Peak(x, 12, 18, 10, 2f, 4);
                case Skyline.Tents:
                {
                    int center = ((x / 32) * 32) + 16;
                    int distance = Mathf.Abs(x - center);
                    // 천막 꼭대기의 기둥은 세 픽셀 더 솟는다.
                    return (distance == 0) ? 15 : Mathf.Max(2, 12 - distance);
                }
                case Skyline.Wall:
                {
                    bool tower = (x >= 40) && (x < 56);
                    int top = tower ? 30 : 16;
                    return top + (((x / 4) % 2 == 0) ? 4 : 0);
                }
                case Skyline.Peaks:
                    return Mathf.Max(
                        Mathf.Max(Slope(x, 10, 40), Slope(x, 46, 56)), Mathf.Max(Slope(x, 84, 44), 6));
                default:
                    return Peak(x, 16, 22, 16, 4f, 3);
            }
        }

        /// <summary><paramref name="spacing"/>픽셀마다 높이가 조금씩 다른 뾰족한 봉우리가 늘어선 줄의 높이.</summary>
        /// <param name="x">픽셀 x.</param>
        /// <param name="spacing">봉우리 사이 간격.</param>
        /// <param name="height">가장 낮은 봉우리의 높이.</param>
        /// <param name="variation">봉우리마다 더하는 높이의 범위.</param>
        /// <param name="steepness">가운데에서 한 픽셀 멀어질 때 낮아지는 높이.</param>
        /// <param name="floor">봉우리 사이의 높이.</param>
        /// <returns>높이.</returns>
        private static int Peak(int x, int spacing, int height, int variation, float steepness, int floor)
        {
            int center = ((x / spacing) * spacing) + (spacing / 2);
            int top = height + (int)(Hash(center, 0) % (uint)variation);
            return Mathf.Max(floor, Mathf.RoundToInt(top - (steepness * Mathf.Abs(x - center))));
        }

        /// <summary>가운데가 <paramref name="center"/>이고 높이가 <paramref name="height"/>인 산 하나의 높이.</summary>
        /// <param name="x">픽셀 x.</param>
        /// <param name="center">산꼭대기의 x.</param>
        /// <param name="height">산의 높이.</param>
        /// <returns>높이. 산 밖이면 0 이하다.</returns>
        private static int Slope(int x, int center, int height)
        {
            // 그림의 양 끝이 이어지므로 거리도 끝을 넘어 잰다.
            int distance = Mathf.Abs(x - center);
            return Mathf.RoundToInt(height - (1.2f * Mathf.Min(distance, Width - distance)));
        }

        /// <summary>0~1을 Bands개의 띠로 나눈 값.</summary>
        /// <param name="t">0~1.</param>
        /// <returns>띠의 아래 끝 값(0~1).</returns>
        private static float Band(float t) => Mathf.Floor(Mathf.Clamp01(t) * Bands) / (Bands - 1);

        /// <summary>픽셀 자리의 고정된 난수. 같은 자리는 늘 같은 값이다.</summary>
        /// <param name="x">픽셀 x.</param>
        /// <param name="y">픽셀 y.</param>
        /// <returns>난수.</returns>
        private static uint Hash(int x, int y)
        {
            uint hash = unchecked(((uint)x * 73856093u) ^ ((uint)y * 19349663u));
            hash ^= hash >> 13;
            hash = unchecked(hash * 0x5bd1e995u);
            hash ^= hash >> 15;
            return hash;
        }
    }
}
