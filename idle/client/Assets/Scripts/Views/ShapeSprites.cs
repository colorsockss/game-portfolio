using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 전투 월드의 도형이 쓰는 스프라이트. 에셋 파일 없이 실행 중에 한 번 만들고, 도형의 색은
    /// SpriteRenderer.color로 입힌다.
    /// </summary>
    internal static class ShapeSprites
    {
        /// <summary>한 변이 1유닛인 흰 사각형. 아직 만들지 않았거나 없어졌으면 null이다.</summary>
        private static Sprite s_square;

        /// <summary>지름이 1유닛인 흰 원. 아직 만들지 않았거나 없어졌으면 null이다.</summary>
        private static Sprite s_shadow;

        /// <summary>
        /// 지름이 1유닛이고 중심이 피벗인, 가장자리로 갈수록 투명해지는 흰 원 스프라이트. 배우의 발밑 그림자이고, 처음 쓸 때 만든다.
        /// </summary>
        internal static Sprite Shadow
        {
            get
            {
                if (s_shadow == null)
                {
                    const int size = 64;
                    var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
                    texture.name = "Shadow";
                    texture.wrapMode = TextureWrapMode.Clamp;
                    var pixels = new Color32[size * size];
                    for (int y = 0; y < size; y++)
                    {
                        for (int x = 0; x < size; x++)
                        {
                            // 중심에서의 거리(가장자리가 1). 안쪽 절반은 진하고 그 밖은 가장자리까지 흐려진다.
                            var offset = new Vector2(((x + 0.5f) / size) - 0.5f, ((y + 0.5f) / size) - 0.5f);
                            float distance = offset.magnitude * 2f;
                            float alpha = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.5f, 1f, distance));
                            pixels[(y * size) + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255f));
                        }
                    }
                    texture.SetPixels32(pixels);
                    texture.Apply();
                    s_shadow = Sprite.Create(
                        texture, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), size);
                    s_shadow.name = "Shadow";
                }
                return s_shadow;
            }
        }

        /// <summary>한 변이 1유닛이고 중심이 피벗인 흰 사각형 스프라이트. 처음 쓸 때 만든다.</summary>
        internal static Sprite Square
        {
            get
            {
                if (s_square == null)
                {
                    var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
                    texture.name = "Square";
                    texture.SetPixel(0, 0, Color.white);
                    texture.Apply();
                    // 텍스처가 1픽셀이므로 픽셀당 유닛 1이 곧 한 변 1유닛이다.
                    s_square = Sprite.Create(
                        texture, new Rect(0f, 0f, 1f, 1f), new Vector2(0.5f, 0.5f), 1f);
                    s_square.name = "Square";
                }
                return s_square;
            }
        }
    }
}
