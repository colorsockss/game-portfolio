using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 버튼을 길게 누르고 있으면 onClick을 되풀이해 낸다(강화의 연속 누르기). uGUI의 Button은 누를 때가 아니라 버튼 위에서 뗄 때
    /// onClick을 내므로, <see cref="Delay"/>보다 짧게 누르면 버튼이 뗄 때 한 번 내고, 오래 누르면 이 컴포넌트가 그때부터
    /// <see cref="Interval"/>마다 낸다. 되풀이를 시작하면 누름의 eligibleForClick을 꺼서(ScrollRect가 끌기를 시작할 때 입력 모듈이
    /// 하는 것과 같다) 뗄 때 한 번 더 내지 않는다. 그래서 짧게 누르면 한 번, 길게 누르면 되풀이한 만큼이다. TypeScript는 onClick만
    /// 듣는다. 손을 떼거나 끌어서 스크롤하면(OnPointerUp), 포인터 아래가 이 버튼이 아니게 되면(OnPointerExit: 입력 모듈은 포인터가
    /// 움직이지 않아도 매 프레임 레이캐스트하므로 손가락이 나갈 때뿐 아니라 차단막이나 팝업이 덮을 때도 온다), 버튼이 꺼지거나 누를 수
    /// 없게 되거나 앱이 멈추거나 포커스를 잃으면 멈추고, 다시 누를 때까지 이어 가지 않는다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Button))]
    public sealed class RepeatButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        /// <summary>되풀이를 시작하기까지 누르고 있는 시간(초).</summary>
        private const float Delay = 0.4f;

        /// <summary>
        /// 되풀이 간격(초). 되풀이마다 게임 커맨드가 하나 가는데, 서버는 연결마다 초당 10개, 한꺼번에 20개까지 받고
        /// (idle/server/src/rpc.ts의 COMMAND_RATE) 넘치면 TooManyRequests로 답해 클라이언트가 그 강화를 되돌린다. 초당 8번이면
        /// 그동안 보내는 다른 커맨드(전투 정산, 보스 도전)에 초당 2개가 남는다. 간격이 끝난 프레임부터 다시 세므로 이보다 자주 내지
        /// 않는다. 더 빨리 올리는 것은 배수 탭(×10, ×100)이 맡는다.
        /// </summary>
        private const float Interval = 0.125f;

        /// <summary>되풀이하는 버튼.</summary>
        private Button _button;

        /// <summary>누르고 있는 포인터의 이벤트(입력 모듈이 그 포인터 내내 같은 것을 쓴다). 누르고 있지 않으면 null이다.</summary>
        private PointerEventData _press;

        /// <summary>다음 되풀이까지 남은 시간(초).</summary>
        private float _wait;

        /// <summary>버튼을 찾는다.</summary>
        private void Awake() => _button = GetComponent<Button>();

        /// <summary>꺼지면 멈춘다. ScrollList는 돌려받은 칸을 끄므로, 다른 원소에 다시 쓰인 칸은 누름을 이어 가지 않는다.</summary>
        private void OnDisable() => _press = null;

        /// <summary>앱이 멈추면 멈춘다. 돌아온 첫 프레임의 긴 unscaledDeltaTime으로 내지 않게 한다.</summary>
        /// <param name="paused">멈췄으면 true.</param>
        private void OnApplicationPause(bool paused)
        {
            if (paused)
                _press = null;
        }

        /// <summary>포커스를 잃으면 멈춘다. runInBackground라 그동안에도 Update가 돌고, 뗌은 오지 않을 수 있다.</summary>
        /// <param name="focused">포커스가 있으면 true.</param>
        private void OnApplicationFocus(bool focused)
        {
            if (!focused)
                _press = null;
        }

        /// <summary>누르기 시작한다. 히트스톱이 시간을 멈춰도 돌도록 unscaled 시간으로 센다.</summary>
        /// <param name="eventData">누름.</param>
        public void OnPointerDown(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Left)
                return;
            _press = eventData;
            _wait = Delay;
        }

        /// <summary>손을 떼거나 끌기가 시작되면 멈춘다.</summary>
        /// <param name="eventData">뗌.</param>
        public void OnPointerUp(PointerEventData eventData) => _press = null;

        /// <summary>포인터 아래가 이 버튼이 아니게 되면 멈춘다.</summary>
        /// <param name="eventData">나감.</param>
        public void OnPointerExit(PointerEventData eventData) => _press = null;

        /// <summary>누르고 있는 동안 간격마다 onClick을 낸다.</summary>
        private void Update()
        {
            if (_press == null)
                return;
            if (!_button.IsInteractable())
            {
                _press = null;
                return;
            }
            _wait -= Time.unscaledDeltaTime;
            if (_wait > 0f)
                return;
            _wait = Interval;
            // 되풀이한 누름이므로 뗄 때 Button이 한 번 더 내지 않게 한다. 입력 모듈은 뗄 때 이것을 본다.
            _press.eligibleForClick = false;
            _button.onClick.Invoke();
        }
    }
}
