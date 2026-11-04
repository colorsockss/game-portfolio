using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 연출이 한 프레임에 세는 시간. 로딩이나 프리팹을 만드는 긴 프레임이 와도 연출이 건너뛰지 않도록 한 프레임을 1/30초까지만
    /// 센다.
    /// </summary>
    internal static class FrameTime
    {
        /// <summary>한 프레임에 세는 가장 긴 시간(초).</summary>
        private const float MaxSeconds = 1f / 30f;

        /// <summary>UI 연출의 한 프레임. 히트스톱(timeScale)과 상관없이 흐른다.</summary>
        internal static float Unscaled => Mathf.Min(Time.unscaledDeltaTime, MaxSeconds);

        /// <summary>전투 장면 연출의 한 프레임. 히트스톱 동안 함께 멈춘다.</summary>
        internal static float Scaled => Mathf.Min(Time.deltaTime, MaxSeconds);
    }
}
