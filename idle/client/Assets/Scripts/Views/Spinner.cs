using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>로딩 표시의 도는 그림. 켜져 있는 동안 시계 방향으로 돈다.</summary>
    [DisallowMultipleComponent]
    public sealed class Spinner : MonoBehaviour
    {
        /// <summary>초당 도는 각도.</summary>
        private const float DegreesPerSecond = 360f;

        /// <summary>시간만큼 돌린다.</summary>
        private void Update() => transform.Rotate(0f, 0f, -DegreesPerSecond * Time.deltaTime);
    }
}
