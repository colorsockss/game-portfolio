using TMPro;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 잠깐 떴다 사라지는 한 줄 알림. 보이면 0.2초 동안 나타나 2초 머문 뒤 0.2초 동안 사라진다. 새 알림은 지금
    /// 것을 바꿔 처음부터 다시 보인다. 탭은 받지 않는다(CanvasGroup의 blocksRaycasts는 프리팹에서 끈다).
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CanvasGroup))]
    public sealed class Toast : MonoBehaviour
    {
        /// <summary>나타나는 데와 사라지는 데 각각 걸리는 시간(초).</summary>
        private const float FadeSeconds = 0.2f;

        /// <summary>다 보인 채 머무는 시간(초).</summary>
        private const float HoldSeconds = 2f;

        /// <summary>보인 뒤 다 사라질 때까지의 시간(초).</summary>
        private const float TotalSeconds = FadeSeconds + HoldSeconds + FadeSeconds;

        /// <summary>투명도를 바꾸는 그룹. 프리팹에서는 투명하다.</summary>
        [SerializeField]
        private CanvasGroup _group;

        /// <summary>알림 글자.</summary>
        [SerializeField]
        private TMP_Text _label;

        /// <summary>보인 뒤 지난 시간(초). TotalSeconds면 사라진 것이다.</summary>
        private float _elapsed = TotalSeconds;

        /// <summary>보이는 중이면 시간만큼 진행시킨다.</summary>
        private void Update()
        {
            if (_elapsed >= TotalSeconds)
                return;
            _elapsed = Mathf.Min(_elapsed + Time.deltaTime, TotalSeconds);
            Apply();
        }

        /// <summary>알림을 처음부터 보인다.</summary>
        /// <param name="text">보일 글자.</param>
        [Preserve]
        public void Show(string text)
        {
            _label.text = text;
            _elapsed = 0f;
            Apply();
        }

        /// <summary>지금 시각의 투명도를 넣는다: 나타나고, 머물고, 사라진다.</summary>
        private void Apply()
        {
            float fadeIn = _elapsed / FadeSeconds;
            float fadeOut = (TotalSeconds - _elapsed) / FadeSeconds;
            _group.alpha = Mathf.Clamp01(Mathf.Min(fadeIn, fadeOut));
        }
    }
}
