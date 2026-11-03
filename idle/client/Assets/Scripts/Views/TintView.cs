using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 번호로 고른 색을 UI 그래픽에 입힌다. 색표(장비 등급, 스킬 속성)는 UI 빌더가 테마에서 넣고, TypeScript는 데이터의 번호만
    /// 보낸다. 그래서 런타임은 테마의 색을 모른다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Graphic))]
    public sealed class TintView : MonoBehaviour
    {
        /// <summary>번호 순서의 색. 0번은 범위 밖 번호에도 쓴다.</summary>
        [SerializeField]
        private Color[] _colors;

        /// <summary><paramref name="index"/>번 색을 입힌다. 범위 밖이면 0번 색이다.</summary>
        /// <param name="index">색 번호(예: Items.grade, 0은 등급 없음).</param>
        [Preserve]
        public void Show(int index)
        {
            if ((_colors == null) || (_colors.Length == 0))
                return;
            GetComponent<Graphic>().color = _colors[((index >= 0) && (index < _colors.Length)) ? index : 0];
        }
    }
}
