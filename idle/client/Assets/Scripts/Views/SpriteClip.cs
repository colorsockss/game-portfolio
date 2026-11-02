using System;
using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 스프라이트 프레임을 차례로 보이는 클립 하나. 이름은 배우의 상태(idle, enter, attack, cast, hit,
    /// die, special)이고 SpriteClipSet이 이름으로 찾는다.
    /// </summary>
    [Serializable]
    public sealed class SpriteClip
    {
        /// <summary>상태 이름.</summary>
        public string Name;

        /// <summary>차례로 보일 프레임.</summary>
        public Sprite[] Frames;

        /// <summary>초당 프레임 수.</summary>
        public float FramesPerSecond = 10f;

        /// <summary>끝나면 처음으로 돌아가는지. 아니면 마지막 프레임에 멈춘다.</summary>
        public bool Loop;

        /// <summary>타격이 닿는 프레임의 번호. 타격이 없는 클립은 -1이다.</summary>
        public int ImpactFrame = -1;

        /// <summary>한 바퀴의 길이(초).</summary>
        public float Duration => Frames.Length / FramesPerSecond;

        /// <summary>처음부터 타격 프레임까지의 시간(초), 곧 선딜레이. 타격이 없으면 0이다.</summary>
        public float Windup => (ImpactFrame < 0) ? 0f : (ImpactFrame / FramesPerSecond);

        /// <summary>재생을 시작하고 <paramref name="time"/>초 지난 때의 프레임 번호.</summary>
        /// <param name="time">재생 시작부터 지난 시간(초).</param>
        /// <returns>Frames의 번호.</returns>
        public int FrameAt(float time)
        {
            int frame = Mathf.Max(0, Mathf.FloorToInt(time * FramesPerSecond));
            return Loop ? (frame % Frames.Length) : Mathf.Min(frame, Frames.Length - 1);
        }
    }
}
