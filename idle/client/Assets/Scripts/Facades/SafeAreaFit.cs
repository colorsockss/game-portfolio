using UnityEngine;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 세이프 에어리어와 화면 크기로 UI 캔버스 배율과 레이어 앵커를 구한다. 에디터에서 창을 숨기거나 옮기는 프레임에는 화면
    /// 크기가 0이거나 값이 NaN일 수 있다. 그런 값이 레이어 앵커에 한 번 들어가면 그 아래 RectTransform의 위치가 모두
    /// NaN으로 저장되어 값이 돌아와도 되돌릴 수 없으므로, 그런 입력은 거절하고 지난 배치를 그대로 둔다.
    /// </summary>
    internal static class SafeAreaFit
    {
        /// <summary>배율과 앵커를 구한다.</summary>
        /// <param name="safeArea">세이프 에어리어(픽셀).</param>
        /// <param name="screen">화면 크기(픽셀).</param>
        /// <param name="reference">UI 기준 해상도.</param>
        /// <param name="scale">세이프 에어리어가 기준 해상도를 가로세로 모두 담는 가장 큰 배율.</param>
        /// <param name="anchorMin">레이어의 왼쪽 아래 앵커. 화면 안으로 자른다.</param>
        /// <param name="anchorMax">레이어의 오른쪽 위 앵커. 화면 안으로 자른다.</param>
        /// <returns>값을 쓸 수 있으면 true. 크기가 0 이하이거나 NaN·무한대가 있으면 false.</returns>
        internal static bool TryFit(
            Rect safeArea, Vector2 screen, Vector2 reference, out float scale, out Vector2 anchorMin,
            out Vector2 anchorMax)
        {
            scale = 0f;
            anchorMin = Vector2.zero;
            anchorMax = Vector2.one;
            if (!IsPositive(screen.x) || !IsPositive(screen.y) || !IsPositive(safeArea.width) ||
                !IsPositive(safeArea.height) || !IsFinite(safeArea.x) || !IsFinite(safeArea.y))
            {
                return false;
            }
            scale = Mathf.Min(safeArea.width / reference.x, safeArea.height / reference.y);
            anchorMin = Clamp01(safeArea.min / screen);
            anchorMax = Clamp01(safeArea.max / screen);
            return true;
        }

        /// <summary>0보다 큰 유한한 값인지. NaN은 비교가 거짓이라 걸러진다.</summary>
        /// <param name="value">값.</param>
        /// <returns>0보다 크고 무한대가 아니면 true.</returns>
        private static bool IsPositive(float value) => (value > 0f) && !float.IsInfinity(value);

        /// <summary>NaN도 무한대도 아닌지.</summary>
        /// <param name="value">값.</param>
        /// <returns>유한하면 true.</returns>
        private static bool IsFinite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);

        /// <summary>두 성분을 0과 1 사이로 자른다.</summary>
        /// <param name="value">값.</param>
        /// <returns>자른 값.</returns>
        private static Vector2 Clamp01(Vector2 value) =>
            new Vector2(Mathf.Clamp01(value.x), Mathf.Clamp01(value.y));
    }
}
