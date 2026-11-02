using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 칸을 다시 쓰는 스크롤 목록. LoopScrollRect가 보이는 칸만 만들고 화면 밖으로 나간 칸을 다시 쓴다. 칸 하나가 원소
    /// 하나이고, 콘텐츠의 GridLayoutGroup(열 수 고정)이면 그리드, VerticalLayoutGroup이면 세로 목록이다. 칸은 루트에 ViewRefs가
    /// 있는 프리팹이고, 칸을 꺼내거나 다시 쓸 때마다 보일 원소를, 돌려받을 때는 숨었다고 알린다(<see cref="ItemList"/>). 원소
    /// 수가 바뀐 프레임에는 LateUpdate에서 칸을 한 번에 다시 채운다.
    /// </summary>
    [RequireComponent(typeof(LoopScrollRect))]
    public sealed class ScrollList : ItemList
    {
        /// <summary>칸 프리팹.</summary>
        [SerializeField]
        private ViewRefs _cellPrefab;

        /// <summary>돌려받아 꺼 둔 칸. 새 칸이 필요하면 여기서 먼저 꺼낸다.</summary>
        private readonly Stack<ViewRefs> _pool = new Stack<ViewRefs>();

        /// <summary>원소 수.</summary>
        private int _count;

        /// <summary>같은 오브젝트의 스크롤러.</summary>
        private LoopScrollRect _scroller;

        /// <summary>원소 수가 바뀌어 칸을 다시 채워야 한다.</summary>
        private bool _reload;

        /// <summary>원소 수를 정한다. 보이는 칸은 다음 LateUpdate에서 다시 알린다.</summary>
        /// <param name="count">원소 수.</param>
        [Preserve]
        public override void SetCount(int count)
        {
            if (count < 0)
                throw new ArgumentOutOfRangeException(nameof(count));
            _count = count;
            _reload = true;
        }

        /// <summary>스크롤러에 칸의 출처를 연결한다. 프리팹을 올리자마자 TypeScript가 칸을 정하므로 그 전에 한다.</summary>
        private void Awake()
        {
            _scroller = GetComponent<LoopScrollRect>();
            var source = new CellSource(this);
            _scroller.prefabSource = source;
            _scroller.dataSource = source;
        }

        /// <summary>
        /// 원소 수가 바뀌었으면 칸을 다시 채운다. 맨 위에 보이던 원소와 그 어긋남을 지키되, 줄어든 목록의 끝을 지나 스크롤해
        /// 있어서 아래가 비면 끝에서부터 채운다.
        /// </summary>
        private void LateUpdate()
        {
            if (!_reload)
                return;
            _reload = false;
            var first = 0;
            var offset = 0f;
            if (_scroller.content.childCount > 0)
                first = Math.Min(_scroller.GetFirstItem(out offset), Math.Max(_count - 1, 0));
            _scroller.totalCount = _count;
            _scroller.RefillCells(first, offset);
            RectTransform content = _scroller.content;
            if ((first > 0) && (content.rect.height - content.anchoredPosition.y < ((RectTransform)transform).rect.height))
                _scroller.RefillCellsFromEnd();
        }

        /// <summary>
        /// 스크롤러가 칸을 꺼내고 돌려주고 채울 때 부르는 출처. 이 콜백이 TypeScript에 보이는 API(타이핑과 IL2CPP 연결 코드)에
        /// 들지 않도록 목록의 public 멤버가 아닌 private 클래스에 둔다.
        /// </summary>
        private sealed class CellSource : LoopScrollPrefabSource, LoopScrollDataSource
        {
            /// <summary>칸을 쥔 목록.</summary>
            private readonly ScrollList _list;

            /// <summary>목록의 출처를 만든다.</summary>
            /// <param name="list">칸을 쥔 목록.</param>
            internal CellSource(ScrollList list) => _list = list;

            /// <summary>칸을 꺼낸다. 꺼 둔 칸이 없으면 만든다. 스크롤러가 콘텐츠에 넣고 켠다.</summary>
            /// <param name="index">칸이 보일 원소 번호.</param>
            /// <returns>칸.</returns>
            public GameObject GetObject(int index) =>
                _list._pool.Count > 0 ? _list._pool.Pop().gameObject : Object.Instantiate(_list._cellPrefab).gameObject;

            /// <summary>화면 밖으로 나간 칸을 돌려받아 숨었다고 알리고 꺼 둔다.</summary>
            /// <param name="cell">칸.</param>
            public void ReturnObject(Transform cell)
            {
                var item = cell.GetComponent<ViewRefs>();
                _list.Announce(item, -1);
                cell.gameObject.SetActive(false);
                cell.SetParent(_list.transform, false);
                _list._pool.Push(item);
            }

            /// <summary>칸에 보일 원소를 알린다.</summary>
            /// <param name="cell">칸.</param>
            /// <param name="index">원소 번호.</param>
            public void ProvideData(Transform cell, int index) => _list.Announce(cell.GetComponent<ViewRefs>(), index);
        }
    }
}
