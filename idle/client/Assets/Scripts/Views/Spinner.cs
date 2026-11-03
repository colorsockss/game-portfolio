using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>켜져 있는 동안 시계 방향으로 도는 그림: 로딩 표시, 보스 해골 뒤의 빛살.</summary>
    [DisallowMultipleComponent]
    public sealed class Spinner : MonoBehaviour
    {
        /// <summary>초당 도는 각도. 빌더가 쓰임에 맞게 정한다.</summary>
        [SerializeField]
        private float _degreesPerSecond = 360f;

        /// <summary>시간만큼 돌린다. 히트스톱에도 멈추지 않게 unscaled 시간으로 돈다.</summary>
        private void Update() => transform.Rotate(0f, 0f, -_degreesPerSecond * Time.unscaledDeltaTime);
    }
}
