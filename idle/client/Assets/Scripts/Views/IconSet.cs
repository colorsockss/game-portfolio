using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// UI 아이콘 묶음(Assets/UI/Icons.asset). 스프라이트 이름이 데이터(Items.icon)가 고르는 키다. Tools/UI/Build All
    /// Prefabs가 Assets/UI/Sprites/Icons의 그림으로 다시 채운다.
    /// </summary>
    public sealed class IconSet : ScriptableObject
    {
        /// <summary>아이콘. 이름 순서다.</summary>
        [SerializeField]
        private Sprite[] _icons;

        /// <summary>이름이 <paramref name="name"/>인 아이콘.</summary>
        /// <param name="name">스프라이트 이름.</param>
        /// <returns>찾은 아이콘. 없으면 null.</returns>
        public Sprite Find(string name)
        {
            foreach (Sprite icon in _icons)
            {
                if (icon.name == name)
                    return icon;
            }
            return null;
        }
    }
}
