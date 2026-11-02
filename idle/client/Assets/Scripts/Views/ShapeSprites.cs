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
