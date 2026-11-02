using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 탭 막대(TypeScript/src/unity/binding/bind.ts의 bindTabBar). 꺼 둔 탭 버튼 틀을 탭 수만큼 복제한다. 탭의 수와
    /// 이름, 어느 탭이 골라졌는지, 탭의 알림 뱃지를 켤지는 TypeScript가 정하고, 고른 탭은 누를 수 없게 해 버튼의 disabled
    /// 색으로 보인다.
    /// </summary>
    public sealed class TabBar : MonoBehaviour
    {
        /// <summary>틀 안의 알림 뱃지 오브젝트 이름(에디터의 UiPrefabs.AddBadge가 넣는 빨간 점).</summary>
        private const string BadgeName = "Badge";

        /// <summary>탭 하나의 틀. 꺼 둔 자식이고, 이름은 그 아래의 글자다.</summary>
        [SerializeField]
        private Button _template;

        /// <summary>틀에서 복제한 탭. 순서가 탭 번호다.</summary>
        private readonly List<Button> _tabs = new List<Button>();

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>탭 수를 정한다. 늘어난 탭은 이름이 틀의 글자다.</summary>
        /// <param name="count">탭 수.</param>
        [Preserve]
        public void SetCount(int count)
        {
            if (count < 0)
                throw new ArgumentOutOfRangeException(nameof(count));
            while (_tabs.Count > count)
            {
                Destroy(_tabs[_tabs.Count - 1].gameObject);
                _tabs.RemoveAt(_tabs.Count - 1);
            }
            while (_tabs.Count < count)
            {
                Button tab = Instantiate(_template, transform);
                tab.gameObject.SetActive(true);
                _tabs.Add(tab);
            }
        }

        /// <summary>탭 하나의 이름을 정한다.</summary>
        /// <param name="index">탭 번호.</param>
        /// <param name="label">이름.</param>
        [Preserve]
        public void SetLabel(int index, string label) =>
            _tabs[index].GetComponentInChildren<TMP_Text>(true).text = label;

        /// <summary>고른 탭을 보인다. 그 탭만 누를 수 없다.</summary>
        /// <param name="index">고른 탭 번호. 범위 밖이면 모든 탭을 누를 수 있다.</param>
        [Preserve]
        public void Select(int index)
        {
            for (var i = 0; i < _tabs.Count; i++)
                _tabs[i].interactable = i != index;
        }

        /// <summary>탭 하나를 누를 때 나는 이벤트. TypeScript가 화면을 열 때 듣고 닫을 때 놓는다.</summary>
        /// <param name="index">탭 번호.</param>
        /// <returns>그 탭 버튼의 onClick.</returns>
        [Preserve]
        public UnityEvent GetClickEvent(int index) => _tabs[index].onClick;

        /// <summary>탭 하나의 알림 뱃지. TypeScript가 켜고 끈다.</summary>
        /// <param name="index">탭 번호.</param>
        /// <returns>그 탭의 Badge 자식. 틀에 없으면 null.</returns>
        [Preserve]
        public GameObject GetBadge(int index)
        {
            Transform badge = _tabs[index].transform.Find(BadgeName);
            return (badge != null) ? badge.gameObject : null;
        }
    }
}
