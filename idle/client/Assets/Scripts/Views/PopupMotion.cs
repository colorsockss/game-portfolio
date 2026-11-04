using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 팝업 틀의 열기·닫기 연출. 켜지면 바탕과 패널이 나타나며 패널이 조금 작은 크기에서 커지고, Close를 부르면 거꾸로
    /// 돌아간 뒤 Finished를 낸다. UI 스택은 Finished를 듣고 나서 인스턴스를 없애고, 그동안의 입력은 UI 캔버스의 차단막이
    /// 막는다. 팝업 틀 부품(Assets/UI/Parts/PopupFrame)에 있어서 팝업마다 저절로 붙는다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CanvasGroup))]
    public sealed class PopupMotion : MonoBehaviour
    {
        /// <summary>다 나타나는 데 걸리는 시간(초).</summary>
        private const float OpenSeconds = 0.15f;

        /// <summary>다 사라지는 데 걸리는 시간(초).</summary>
        private const float CloseSeconds = 0.12f;

        /// <summary>다 사라졌을 때 패널의 배율.</summary>
        private const float HiddenScale = 0.9f;

        /// <summary>바탕과 패널을 함께 투명하게 하는 그룹.</summary>
        [SerializeField]
        private CanvasGroup _group;

        /// <summary>커지고 작아지는 패널.</summary>
        [SerializeField]
        private RectTransform _panel;

        /// <summary>다 사라지면 나는 이벤트.</summary>
        private readonly UnityEvent _finished = new UnityEvent();

        /// <summary>보이는 정도. 0이면 다 사라졌고 1이면 다 나타났다.</summary>
        private float _shown;

        /// <summary>Close를 불러 사라지는 중인지.</summary>
        private bool _closing;

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>Close 뒤 다 사라지면 한 번 난다.</summary>
        [Preserve]
        public UnityEvent Finished => _finished;

        /// <summary>사라진 데서 나타나기 시작한다.</summary>
        private void OnEnable()
        {
            _shown = 0f;
            _closing = false;
            Apply();
        }

        /// <summary>목표로 보이는 정도를 옮기고, 다 사라지면 멈추고 Finished를 낸다.</summary>
        private void Update()
        {
            float target = _closing ? 0f : 1f;
            if (_shown == target)
                return;
            float seconds = _closing ? CloseSeconds : OpenSeconds;
            _shown = Mathf.MoveTowards(_shown, target, FrameTime.Unscaled / seconds);
            Apply();
            if (!_closing || (_shown != 0f))
                return;
            enabled = false;
            _finished.Invoke();
        }

        /// <summary>
        /// 사라지기 시작한다. 나타나던 중이면 지금 정도에서 돌아간다. 꺼져 있어 연출을 돌릴 수 없으면 false이고, 그때는
        /// Finished가 나지 않는다.
        /// </summary>
        /// <returns>연출을 시작했으면 true.</returns>
        [Preserve]
        public bool Close()
        {
            if (!isActiveAndEnabled)
                return false;
            _closing = true;
            return true;
        }

        /// <summary>보이는 정도를 투명도와 패널 배율에 넣는다. 배율은 끝으로 갈수록 느려진다.</summary>
        private void Apply()
        {
            _group.alpha = _shown;
            float eased = 1f - ((1f - _shown) * (1f - _shown));
            _panel.localScale = Vector3.one * Mathf.Lerp(HiddenScale, 1f, eased);
        }
    }
}
