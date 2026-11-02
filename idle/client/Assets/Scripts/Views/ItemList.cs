using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 원소마다 칸(루트에 ViewRefs가 있는 오브젝트) 하나를 보이는 목록(TypeScript/src/unity/binding/view.ts의 list). 몇 개를
    /// 둘지와 칸에 무엇을 보일지는 TypeScript가 정한다. 칸에 보일 원소가 정해지거나 바뀌면 그 칸과 원소 번호를 Shown으로
    /// 알리고, TypeScript가 그 칸을 원소의 뷰로 바인딩한다. 칸을 늘어놓는 방법은 하위 클래스가 정한다(<see cref="ViewList"/>는
    /// 모두 만들고, <see cref="ScrollList"/>는 보이는 칸만 만들어 다시 쓴다).
    /// </summary>
    public abstract class ItemList : MonoBehaviour
    {
        /// <summary>칸에 보일 원소가 정해질 때 나는 이벤트.</summary>
        private readonly UnityEvent _shown = new UnityEvent();

        /// <summary>칸마다 처음 알릴 때 준 번호.</summary>
        private readonly Dictionary<ViewRefs, int> _slots = new Dictionary<ViewRefs, int>();

        /// <summary>다음에 처음 알리는 칸의 번호.</summary>
        private int _nextSlot;

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>
        /// 칸 하나에 보일 원소가 정해지면 난다. 칸과 원소는 인자가 아니라 <see cref="ShownItem"/>, <see cref="ShownIndex"/>,
        /// <see cref="ShownSlot"/>에 둔다(값 형식 인자의 델리게이트는 IL2CPP에서 PuerTS가 따로 만들어야 한다).
        /// </summary>
        [Preserve]
        public UnityEvent Shown => _shown;

        /// <summary>마지막으로 알린 칸.</summary>
        [Preserve]
        public ViewRefs ShownItem { get; private set; }

        /// <summary>마지막으로 알린 칸이 보일 원소의 번호. 칸이 숨었으면 -1이다.</summary>
        [Preserve]
        public int ShownIndex { get; private set; } = -1;

        /// <summary>마지막으로 알린 칸의 번호. 칸마다 다르고 칸이 있는 동안 바뀌지 않는다.</summary>
        [Preserve]
        public int ShownSlot { get; private set; }

        /// <summary>원소 수를 정한다. 칸을 보이거나 숨기면 Shown으로 알린다(지금 또는 다음 그리기에서).</summary>
        /// <param name="count">원소 수.</param>
        [Preserve]
        public abstract void SetCount(int count);

        /// <summary>칸 하나가 원소 하나를 보이게 됐다고(숨었으면 -1) 알린다.</summary>
        /// <param name="item">칸.</param>
        /// <param name="index">원소 번호. 숨었으면 -1.</param>
        protected void Announce(ViewRefs item, int index)
        {
            if (!_slots.TryGetValue(item, out int slot))
                _slots[item] = slot = _nextSlot++;
            ShownItem = item;
            ShownIndex = index;
            ShownSlot = slot;
            _shown.Invoke();
        }

        /// <summary>없앨 칸의 번호를 잊는다. 그 번호는 다시 쓰지 않는다.</summary>
        /// <param name="item">칸.</param>
        protected void Forget(ViewRefs item) => _slots.Remove(item);
    }
}
