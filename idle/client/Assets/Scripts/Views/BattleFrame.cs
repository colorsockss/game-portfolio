using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 메인 화면에서 전투를 보이는 띠: 천장(스테이지 막대)의 아래 가장자리와 바닥(영웅 띠)의 위 가장자리 사이. 월드
    /// 카메라(Facades의 CameraFraming)가 프레임마다 그 가운데를 화면 픽셀로 재어 배우를 세운다. 해상도, 세이프 에어리어,
    /// 판에 따라 옮겨 가는 바닥(DockView)이 모두 잰 값에 들어 있으므로 따로 맞출 것이 없다. 켜진 것 하나만 쓴다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class BattleFrame : MonoBehaviour
    {
        /// <summary>GetWorldCorners의 버퍼.</summary>
        private static readonly Vector3[] s_corners = new Vector3[4];

        /// <summary>띠의 위를 정하는 UI. 아래 가장자리를 쓴다.</summary>
        [SerializeField]
        private RectTransform _ceiling;

        /// <summary>띠의 아래를 정하는 UI. 위 가장자리를 쓴다.</summary>
        [SerializeField]
        private RectTransform _floor;

        /// <summary>지금 켜진 띠. 메인 화면이 없으면 null이다.</summary>
        internal static BattleFrame Active { get; private set; }

        /// <summary>
        /// 띠 가운데의 화면 높이(픽셀, 아래가 0). 캔버스가 Screen Space Overlay라 UI의 월드 좌표가 곧 화면 픽셀이다.
        /// </summary>
        internal float CenterPixel => (Corner(_floor, 1) + Corner(_ceiling, 0)) / 2f;

        /// <summary>켜지면 지금 띠가 된다.</summary>
        private void OnEnable() => Active = this;

        /// <summary>꺼지면 지금 띠에서 빠진다.</summary>
        private void OnDisable()
        {
            if (Active == this)
                Active = null;
        }

        /// <summary><paramref name="rect"/>의 모서리 하나의 화면 높이.</summary>
        /// <param name="rect">UI.</param>
        /// <param name="corner">GetWorldCorners의 순서(0 왼쪽 아래, 1 왼쪽 위).</param>
        /// <returns>화면 높이(픽셀).</returns>
        private static float Corner(RectTransform rect, int corner)
        {
            rect.GetWorldCorners(s_corners);
            return s_corners[corner].y;
        }
    }
}
