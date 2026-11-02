using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// SpriteRenderer 하나에 SpriteClip의 프레임을 차례로 넣는다. 무엇을 언제 재생할지는 부르는 쪽(ActorView)이
    /// 정한다. 프레임이 바뀔 때만 sprite를 쓴다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SpriteAnimator : MonoBehaviour
    {
        /// <summary>프레임을 넣을 렌더러.</summary>
        [SerializeField]
        private SpriteRenderer _renderer;

        /// <summary>재생 중인 클립. 아직 없으면 null이다.</summary>
        private SpriteClip _clip;

        /// <summary>재생을 시작한 뒤 지난 시간(초).</summary>
        private float _time;

        /// <summary>렌더러에 넣은 프레임의 번호. 넣은 것이 없으면 -1이다.</summary>
        private int _shown = -1;

        /// <summary>재생 중인 클립. 아직 없으면 null이다.</summary>
        public SpriteClip Clip => _clip;

        /// <summary>반복하지 않는 클립이 끝까지 재생되었으면 true.</summary>
        public bool Finished => (_clip != null) && !_clip.Loop && (_time >= _clip.Duration);

        /// <summary>클립을 <paramref name="time"/>초 지점부터 재생한다. 늦게 시작하면 앞 프레임을 건너뛴다.</summary>
        /// <param name="clip">재생할 클립.</param>
        /// <param name="time">시작할 지점(초).</param>
        public void Play(SpriteClip clip, float time = 0f)
        {
            _clip = clip;
            _time = time;
            _shown = -1;
            Show();
        }

        /// <summary>재생 중인 클립을 시간만큼 진행한다.</summary>
        private void Update()
        {
            if (_clip == null)
                return;
            _time += Time.deltaTime;
            Show();
        }

        /// <summary>지금 시간의 프레임이 넣은 것과 다르면 렌더러에 넣는다.</summary>
        private void Show()
        {
            int frame = _clip.FrameAt(_time);
            if (frame == _shown)
                return;
            _shown = frame;
            _renderer.sprite = _clip.Frames[frame];
        }
    }
}
