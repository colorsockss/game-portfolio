using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 버튼을 길게 누르고 있으면 onClick을 되풀이해 낸다(강화의 연속 누르기). 처음 누름은 버튼이 내고, <see cref="Delay"/>가
    /// 지나면 간격을 점점 줄이며 낸다. TypeScript는 onClick만 들으므로 짧게 누른 것과 구별하지 않는다. 버튼이 꺼지거나
    /// 손가락이 버튼 밖으로 나가면 멈춘다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Button))]
    public sealed class RepeatButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        /// <summary>되풀이를 시작하기까지 누르고 있는 시간(초).</summary>
        private const float Delay = 0.4f;

        /// <summary>처음 되풀이 간격(초).</summary>
        private const float FirstInterval = 0.15f;

        /// <summary>가장 짧은 되풀이 간격(초).</summary>
        private const float MinInterval = 0.05f;

        /// <summary>되풀이할 때마다 간격에 곱하는 값.</summary>
        private const float Speedup = 0.85f;

        /// <summary>되풀이하는 버튼.</summary>
        private Button _button;

        /// <summary>누르고 있는지.</summary>
        private bool _held;

        /// <summary>다음 되풀이까지 남은 시간(초).</summary>
        private float _wait;

        /// <summary>지금 되풀이 간격(초).</summary>
        private float _interval;

        /// <summary>버튼을 찾는다.</summary>
        private void Awake() => _button = GetComponent<Button>();

        /// <summary>꺼지면 멈춘다.</summary>
        private void OnDisable() => _held = false;

        /// <summary>누르기 시작한다. 히트스톱이 시간을 멈춰도 돌도록 unscaled 시간으로 센다.</summary>
        /// <param name="eventData">누름.</param>
        public void OnPointerDown(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Left)
                return;
            _held = true;
            _wait = Delay;
            _interval = FirstInterval;
        }

        /// <summary>손을 떼면 멈춘다.</summary>
        /// <param name="eventData">뗌.</param>
        public void OnPointerUp(PointerEventData eventData) => _held = false;

        /// <summary>버튼 밖으로 나가면 멈춘다.</summary>
        /// <param name="eventData">나감.</param>
        public void OnPointerExit(PointerEventData eventData) => _held = false;

        /// <summary>누르고 있는 동안 간격마다 onClick을 낸다.</summary>
        private void Update()
        {
            if (!_held)
                return;
            if (!_button.IsInteractable())
            {
                _held = false;
                return;
            }
            _wait -= Time.unscaledDeltaTime;
            if (_wait > 0f)
                return;
            _interval = Mathf.Max(MinInterval, _interval * Speedup);
            _wait = _interval;
            _button.onClick.Invoke();
        }
    }
}
