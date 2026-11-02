using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 놓을 때를 알리는 슬라이더(TypeScript/src/unity/binding/bind.ts의 bindSlider). 끄는 동안의 값은 Slider의
    /// onValueChanged가 알리고, 놓으면 Released가 난다. 설정 화면이 끄는 동안 바로 들리게 바꾸고 놓을 때 저장하는 데 쓴다.
    /// </summary>
    public sealed class ReleaseSlider : Slider
    {
        /// <summary>놓을 때 나는 이벤트.</summary>
        private readonly UnityEvent _released = new UnityEvent();

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>끌던 슬라이더를 놓으면 난다. TypeScript가 화면을 열 때 듣고 닫을 때 놓는다.</summary>
        [Preserve]
        public UnityEvent Released => _released;

        /// <summary>끌던 것을 놓으면 Released를 낸다. Slider처럼 왼쪽 버튼(터치)만 끈다.</summary>
        /// <param name="eventData">포인터 이벤트.</param>
        public override void OnPointerUp(PointerEventData eventData)
        {
            base.OnPointerUp(eventData);
            if (eventData.button == PointerEventData.InputButton.Left)
                _released.Invoke();
        }
    }
}
