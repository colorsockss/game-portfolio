using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 날아가는 발사체 하나: 정해진 시간 동안 출발점에서 도착점으로 곧게 날며 클립을 재생한다. 날아가는 쪽을 향해
    /// 돌므로 클립은 오른쪽을 향해 그린다. 언제 쏘고 언제 거둘지는 TypeScript가 정한다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ProjectileView : MonoBehaviour
    {
        /// <summary>떨어지기 전에 사라질 때 작아지는 시간(초).</summary>
        private const float FizzleSeconds = 0.15f;

        /// <summary>발사체의 모습.</summary>
        [SerializeField]
        private SpriteRenderer _renderer;

        /// <summary>모습에 클립의 프레임을 넣는다.</summary>
        [SerializeField]
        private SpriteAnimator _animator;

        /// <summary>발사체 클립 묶음(arrow, orb, blob, rock).</summary>
        [SerializeField]
        private SpriteClipSet _clips;

        /// <summary>출발점.</summary>
        private Vector2 _from;

        /// <summary>도착점.</summary>
        private Vector2 _to;

        /// <summary>나는 시간(초).</summary>
        private float _seconds;

        /// <summary>쏜 뒤 지난 시간(초).</summary>
        private float _elapsed;

        /// <summary>크기 배율.</summary>
        private float _size = 1f;

        /// <summary>사라지는 중이면 true.</summary>
        private bool _fizzling;

        /// <summary>사라지기 시작한 뒤 지난 시간(초).</summary>
        private float _fizzleElapsed;

        /// <summary>진행 중인 비행과 사라짐을 시간만큼 진행한다.</summary>
        private void Update()
        {
            float delta = Time.deltaTime;
            _elapsed += delta;
            _fizzleElapsed = Mathf.Min(_fizzleElapsed + delta, FizzleSeconds);
            Apply();
        }

        /// <summary>
        /// (<paramref name="fromX"/>, <paramref name="fromY"/>)에서 (<paramref name="toX"/>, <paramref name="toY"/>)로
        /// <paramref name="seconds"/>초 동안 난다. 풀에서 다시 꺼낸 발사체도 이것으로 새로 시작한다.
        /// </summary>
        /// <param name="clip">클립 이름. 없으면 묶음의 첫 클립이다.</param>
        /// <param name="fromX">출발점 x.</param>
        /// <param name="fromY">출발점 y.</param>
        /// <param name="toX">도착점 x.</param>
        /// <param name="toY">도착점 y.</param>
        /// <param name="seconds">나는 시간(초).</param>
        /// <param name="r">색의 빨강(0~1).</param>
        /// <param name="g">색의 초록(0~1).</param>
        /// <param name="b">색의 파랑(0~1).</param>
        /// <param name="size">크기 배율.</param>
        [Preserve]
        public void Fly(
            string clip, float fromX, float fromY, float toX, float toY, float seconds,
            float r, float g, float b, float size)
        {
            _from = new Vector2(fromX, fromY);
            _to = new Vector2(toX, toY);
            _seconds = Mathf.Max(seconds, 0f);
            _elapsed = 0f;
            _size = size;
            _fizzling = false;
            _fizzleElapsed = 0f;
            _renderer.color = new Color(r, g, b, 1f);
            Vector2 direction = _to - _from;
            float angle = Mathf.Atan2(direction.y, direction.x) * Mathf.Rad2Deg;
            transform.localRotation = Quaternion.Euler(0f, 0f, angle);
            _animator.Play(_clips.Find(clip));
            Apply();
        }

        /// <summary>그 자리에서 0.15초 동안 작아지며 사라진다.</summary>
        [Preserve]
        public void Fizzle()
        {
            _fizzling = true;
            _fizzleElapsed = 0f;
            Apply();
        }

        /// <summary>지금 시각의 위치와 크기를 넣는다. 사라지는 중에는 그 자리에 멈춘다.</summary>
        private void Apply()
        {
            float progress = (_seconds > 0f) ? Mathf.Clamp01(_elapsed / _seconds) : 1f;
            if (!_fizzling)
                transform.localPosition = Vector2.Lerp(_from, _to, progress);
            float scale = _size * (_fizzling ? (1f - (_fizzleElapsed / FizzleSeconds)) : 1f);
            transform.localScale = new Vector3(scale, scale, 1f);
        }
    }
}
