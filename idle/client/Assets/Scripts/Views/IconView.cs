using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 이름으로 고른 아이콘을 보이는 UI 이미지. 어떤 아이콘을 보일지는 TypeScript가 데이터(Items.icon)로 정한다. 이름이
    /// 비었거나 묶음에 없으면 숨어서, 레이아웃 그룹 안이면 자리도 비우지 않는다.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Image))]
    public sealed class IconView : MonoBehaviour
    {
        /// <summary>아이콘을 찾는 묶음.</summary>
        [SerializeField]
        private IconSet _icons;

        /// <summary>이름이 <paramref name="name"/>인 아이콘을 보인다. 없으면 숨는다.</summary>
        /// <param name="name">아이콘 이름(Items.icon). 빈 문자열이면 숨는다.</param>
        [Preserve]
        public void Show(string name)
        {
            Sprite icon = string.IsNullOrEmpty(name) ? null : _icons.Find(name);
            if (icon != null)
                GetComponent<Image>().sprite = icon;
            gameObject.SetActive(icon != null);
        }
    }
}
