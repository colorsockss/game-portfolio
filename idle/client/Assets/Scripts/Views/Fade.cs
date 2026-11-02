using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 화면 전체를 가리는 막(전환 화면). FadeTo로 가리거나 걷으면 0.25초 동안 투명도를 옮기고, 다 옮기면 Finished를
    /// 낸다. 이미 그 투명도면 다음 프레임에 낸다. 탭은 받지 않는다(CanvasGroup의 blocksRaycasts는 프리팹에서 끈다).
    /// 가린 동안의 입력은 UI 캔버스의 차단막이 막는다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CanvasGroup))]
    public sealed class Fade : MonoBehaviour
    {
        /// <summary>다 가리거나 다 걷는 데 걸리는 시간(초).</summary>
        private const float FadeSeconds = 0.25f;

        /// <summary>한 프레임에 세는 가장 긴 시간(초). 로딩으로 긴 프레임이 와도 페이드를 건너뛰지 않는다.</summary>
        private const float MaxFrameSeconds = 1f / 30f;

        /// <summary>투명도를 바꾸는 그룹. 앱이 가린 채로 시작하므로 프리팹에서는 불투명하다.</summary>
        [SerializeField]
        private CanvasGroup _group;

        /// <summary>목표 투명도에 다 가면 나는 이벤트.</summary>
        private readonly UnityEvent _finished = new UnityEvent();

        /// <summary>목표 투명도.</summary>
        private float _target;

        /// <summary>목표로 가는 중이거나, 다 가서 Finished를 내야 하는지.</summary>
        private bool _moving;

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>목표 투명도에 다 가면 난다. TypeScript가 화면을 열 때 듣고 닫을 때 놓는다.</summary>
        [Preserve]
        public UnityEvent Finished => _finished;

        /// <summary>지금 투명도를 목표로 둔다.</summary>
        private void Awake() => _target = _group.alpha;

        /// <summary>목표로 투명도를 옮기고, 다 가면 Finished를 낸다.</summary>
        private void Update()
        {
            if (!_moving)
                return;
            float step = Mathf.Min(Time.unscaledDeltaTime, MaxFrameSeconds) / FadeSeconds;
            _group.alpha = Mathf.MoveTowards(_group.alpha, _target, step);
            if (_group.alpha != _target)
                return;
            _moving = false;
            _finished.Invoke();
        }

        /// <summary>화면을 가리거나 걷는다. 가던 중이면 지금 투명도에서 새 목표로 간다.</summary>
        /// <param name="covered">가리려면 true, 걷으려면 false.</param>
        [Preserve]
        public void FadeTo(bool covered)
        {
            _target = covered ? 1f : 0f;
            _moving = true;
        }
    }
}
