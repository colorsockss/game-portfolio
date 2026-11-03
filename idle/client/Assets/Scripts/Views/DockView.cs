using System;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 이름으로 고른 높이로 UI를 옮긴다(앵커에서의 y). 이름과 높이(메인 화면 아래 탭마다 그 판의 위 가장자리)는 UI 빌더가
    /// 넣고, TypeScript는 이름만 보낸다. 그래서 런타임은 판의 높이를 모른다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(RectTransform))]
    public sealed class DockView : MonoBehaviour
    {
        /// <summary>자리의 이름. 0번은 없는 이름에도 쓴다.</summary>
        [SerializeField]
        private string[] _keys;

        /// <summary>이름 순서의 높이.</summary>
        [SerializeField]
        private float[] _positions;

        /// <summary><paramref name="key"/>의 높이로 옮긴다. 없는 이름이면 0번 높이다.</summary>
        /// <param name="key">자리 이름(예: 아래 탭 이름, 빈 문자열은 탭이 모두 꺼짐).</param>
        [Preserve]
        public void Show(string key)
        {
            if ((_positions == null) || (_positions.Length == 0))
                return;
            int index = Math.Max(Array.IndexOf(_keys, key), 0);
            var rect = (RectTransform)transform;
            rect.anchoredPosition = new Vector2(rect.anchoredPosition.x, _positions[index]);
        }
    }
}
