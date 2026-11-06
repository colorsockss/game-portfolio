using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 배우의 HP 바 위에 걸린 효과를 한 줄의 아이콘 칸으로 보인다. 칸 아래 막대가 효과의 색으로, 남은 시간만큼 줄어든다.
    /// 어떤 아이콘과 색을 보일지는 TypeScript가 정하고, 이것은 남은 시간을 세며 막대만 줄인다. 이 오브젝트의 자리가 줄의
    /// 아래 끝(막대의 아래)이다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class EffectIcons : MonoBehaviour
    {
        /// <summary>칸 한 변(유닛).</summary>
        private const float IconSize = 0.36f;

        /// <summary>칸 사이와, 칸과 막대 사이의 틈(유닛).</summary>

        private const float Gap = 0.04f;

        /// <summary>남은 시간 막대의 높이(유닛).</summary>
        private const float BarHeight = 0.05f;

        /// <summary>Show가 이름(스프라이트 이름, Effects.icon)으로 고르는 아이콘.</summary>
        [SerializeField]
        private Sprite[] _sprites;

        /// <summary>효과 칸. 앞에서부터 쓴다.</summary>
        [SerializeField]
        private SpriteRenderer[] _icons;

        /// <summary>칸마다 아래의 남은 시간 막대.</summary>
        [SerializeField]
        private SpriteRenderer[] _bars;

        /// <summary>칸마다 남은 시간(초).</summary>
        private float[] _left;

        /// <summary>칸마다 처음 지속 시간(초). 0이면 막대가 줄지 않는다.</summary>
        private float[] _total;

        /// <summary>보이는 칸 수.</summary>
        private int _count;

        /// <summary>칸에 도형 스프라이트를 넣고 모두 숨긴다.</summary>
        private void Awake()
        {
            _left = new float[_icons.Length];
            _total = new float[_icons.Length];
            for (int i = 0; i < _icons.Length; i++)
            {
                _icons[i].sprite = ShapeSprites.Square;
                _bars[i].sprite = ShapeSprites.Square;
            }
            SetCount(0);
        }

        /// <summary>남은 시간을 줄이고 막대를 그린다.</summary>
        private void Update()
        {
            for (int i = 0; i < _count; i++)
            {
                _left[i] = Mathf.Max(0f, _left[i] - Time.deltaTime);
                LayoutBar(i);
            }
        }

        /// <summary>앞에서부터 <paramref name="count"/>칸만 보이고 가운데에 맞춰 늘어놓는다. 넘치면 잘린다.</summary>
        /// <param name="count">보일 칸 수.</param>
        [Preserve]
        public void SetCount(int count)
        {
            _count = Mathf.Clamp(count, 0, _icons.Length);
            for (int i = 0; i < _icons.Length; i++)
            {
                bool shown = i < _count;
                _icons[i].gameObject.SetActive(shown);
                _bars[i].gameObject.SetActive(shown);
                float x = (i - ((_count - 1) * 0.5f)) * (IconSize + Gap);
                _icons[i].transform.localPosition = new Vector3(x, BarHeight + Gap + (IconSize * 0.5f), 0f);
                _icons[i].transform.localScale = new Vector3(IconSize, IconSize, 1f);
                if (shown)
                    LayoutBar(i);
            }
        }

        /// <summary>
        /// <paramref name="index"/>번 칸의 아이콘, 색과 남은 시간을 정한다. 이름이 맞는 아이콘이 없으면 칸이 그 색의 사각형이다.
        /// </summary>
        /// <param name="index">칸 번호(0부터).</param>
        /// <param name="icon">아이콘 이름(Effects.icon). 빈 문자열이면 사각형이다.</param>
        /// <param name="r">막대(아이콘이 없으면 칸) 색의 빨강(0~1).</param>
        /// <param name="g">막대(아이콘이 없으면 칸) 색의 초록(0~1).</param>
        /// <param name="b">막대(아이콘이 없으면 칸) 색의 파랑(0~1).</param>
        /// <param name="seconds">남은 시간(초).</param>
        /// <param name="total">처음 지속 시간(초). 0이면 막대가 줄지 않는다.</param>
        [Preserve]
        public void Show(int index, string icon, float r, float g, float b, float seconds, float total)
        {
            if ((index < 0) || (index >= _count))
                return;
            Sprite sprite = Find(icon);
            _icons[index].sprite = (sprite != null) ? sprite : ShapeSprites.Square;
            _icons[index].color = (sprite != null) ? Color.white : new Color(r, g, b, 1f);
            _bars[index].color = new Color(r, g, b, 1f);
            _left[index] = Mathf.Max(0f, seconds);
            _total[index] = Mathf.Max(0f, total);
            LayoutBar(index);
        }

        /// <summary>이름이 <paramref name="name"/>인 아이콘.</summary>
        /// <param name="name">스프라이트 이름.</param>
        /// <returns>찾은 아이콘. 없으면 null.</returns>
        private Sprite Find(string name)
        {
            if (string.IsNullOrEmpty(name))
                return null;
            foreach (Sprite sprite in _sprites)
            {
                if (sprite.name == name)
                    return sprite;
            }
            return null;
        }

        /// <summary><paramref name="index"/>번 칸 아래에 남은 비율만큼의 막대를 왼쪽에 맞춰 놓는다.</summary>
        /// <param name="index">칸 번호.</param>
        private void LayoutBar(int index)
        {
            float ratio = (_total[index] > 0f) ? Mathf.Clamp01(_left[index] / _total[index]) : 1f;
            float width = IconSize * ratio;
            Vector3 icon = _icons[index].transform.localPosition;
            _bars[index].transform.localPosition = new Vector3(icon.x + ((width - IconSize) * 0.5f), BarHeight * 0.5f, 0f);
            _bars[index].transform.localScale = new Vector3(width, BarHeight, 1f);
        }
    }
}
