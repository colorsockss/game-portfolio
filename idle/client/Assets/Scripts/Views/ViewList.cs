using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 같은 위젯을 수만큼 늘어놓는 목록. 꺼 둔 틀(루트에 ViewRefs가 있는 자식)을 원소마다 복제하고, 복제하자마자 알린다
    /// (<see cref="ItemList"/>). 배치는 같은 오브젝트의 레이아웃 그룹이 한다.
    /// </summary>
    public sealed class ViewList : ItemList
    {
        /// <summary>원소 하나의 틀. 꺼 둔 자식이다.</summary>
        [SerializeField]
        private ViewRefs _template;

        /// <summary>틀에서 복제한 원소. 순서가 원소 번호다.</summary>
        private readonly List<ViewRefs> _items = new List<ViewRefs>();

        /// <summary>원소 수를 정한다. 늘어난 원소는 복제하자마자, 줄어든 원소는 없애기 전에 알린다.</summary>
        /// <param name="count">원소 수.</param>
        [Preserve]
        public override void SetCount(int count)
        {
            if (count < 0)
                throw new ArgumentOutOfRangeException(nameof(count));
            while (_items.Count > count)
            {
                ViewRefs last = _items[_items.Count - 1];
                _items.RemoveAt(_items.Count - 1);
                Announce(last, -1);
                Forget(last);
                Destroy(last.gameObject);
            }
            while (_items.Count < count)
            {
                ViewRefs item = Instantiate(_template, transform);
                item.gameObject.SetActive(true);
                _items.Add(item);
                Announce(item, _items.Count - 1);
            }
        }
    }
}
