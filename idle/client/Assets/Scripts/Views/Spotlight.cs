using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 튜토리얼이 UI 대상 하나를 비추는 막. 대상 둘레를 어두운 막 넷(위, 아래, 왼쪽, 오른쪽)으로 덮어 그 밖의 탭을 막고, 대상
    /// 자리는 비워서 탭이 아래 레이어의 대상에 닿게 한다. 대상의 자리는 LateUpdate마다 따라가고, 대상이 없어지거나 꺼지면 막지
    /// 않는다. 대사 창은 대상과 겹치지 않게 대상의 반대쪽(화면 위나 아래)에 둔다. 어느 대상을 비출지는 TypeScript가 정한다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class Spotlight : MonoBehaviour
    {
        /// <summary>대상 둘레에 두는 여백.</summary>
        private const float Padding = 16f;

        /// <summary>대사 창이 위에 있을 때 화면 위쪽과의 거리. 메인 화면의 위쪽 막대 아래다.</summary>
        private const float TopMargin = 200f;

        /// <summary>대사 창이 아래에 있을 때 화면 아래쪽과의 거리.</summary>
        private const float BottomMargin = 40f;

        /// <summary>대상 위쪽을 덮는 막.</summary>
        [SerializeField]
        private RectTransform _top;

        /// <summary>대상 아래쪽을 덮는 막.</summary>
        [SerializeField]
        private RectTransform _bottom;

        /// <summary>대상 왼쪽을 덮는 막.</summary>
        [SerializeField]
        private RectTransform _left;

        /// <summary>대상 오른쪽을 덮는 막.</summary>
        [SerializeField]
        private RectTransform _right;

        /// <summary>대상 자리의 테두리. 탭은 받지 않는다.</summary>
        [SerializeField]
        private RectTransform _frame;

        /// <summary>대사 창. 이 오브젝트와 같은 부모를 채우는 형제다.</summary>
        [SerializeField]
        private RectTransform _dialog;

        /// <summary>막 넷과 테두리. 함께 켜고 끈다.</summary>
        private RectTransform[] _parts;

        /// <summary>GetWorldCorners가 채우는 대상의 네 꼭짓점.</summary>
        private readonly Vector3[] _corners = new Vector3[4];

        /// <summary>비추는 대상. 없으면 null이다.</summary>
        private RectTransform _target;

        /// <summary>마지막으로 놓은 대상 자리. 막을 걷었으면 null이다.</summary>
        private Rect? _placed;

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>UI 오브젝트(컴포넌트나 GameObject)를 비춘다. RectTransform이 없는 것은 걷는 것과 같다.</summary>
        /// <param name="target">비출 오브젝트.</param>
        [Preserve]
        public void Focus(Object target)
        {
            _target = target switch
            {
                Component component => component.transform as RectTransform,
                GameObject targetObject => targetObject.transform as RectTransform,
                _ => null,
            };
            LateUpdate();
        }

        /// <summary>걷는다. 아무것도 막지 않는다.</summary>
        [Preserve]
        public void Clear()
        {
            _target = null;
            LateUpdate();
        }

        /// <summary>막이 화면 가운데를 기준으로 자리를 잡게 앵커와 피벗을 맞춘다.</summary>
        private void Awake()
        {
            _parts = new[] { _top, _bottom, _left, _right, _frame };
            foreach (RectTransform part in _parts)
            {
                part.anchorMin = new Vector2(0.5f, 0.5f);
                part.anchorMax = new Vector2(0.5f, 0.5f);
                part.pivot = Vector2.zero;
            }
            Show(null);
        }

        /// <summary>대상의 자리로 막과 대사 창을 옮긴다. 자리가 그대로면 아무것도 바꾸지 않는다.</summary>
        private void LateUpdate()
        {
            Rect? hole = ((_target != null) && _target.gameObject.activeInHierarchy) ? Hole() : null;
            if (hole != _placed)
                Show(hole);
        }

        /// <summary>
        /// 대상의 자리를 이 오브젝트의 좌표(가운데가 원점)로 구하고, 여백을 더해 화면 안으로 자른다. 스크롤 목록은 칸이 있는
        /// 곳(내용과 보이는 영역이 겹치는 곳)만 비춘다. 빈 영역까지 비추면 구멍이 화면 대부분을 차지해 대사 창이 화면의 다른
        /// 내용(장비 화면의 능력치 줄 등)을 가린다.
        /// </summary>
        /// <returns>대상의 자리.</returns>
        private Rect Hole()
        {
            var self = (RectTransform)transform;
            Rect area = self.rect;
            Rect hole = Local(_target);
            var scroll = _target.GetComponent<ScrollRect>();
            if ((scroll != null) && (scroll.content != null))
            {
                Rect content = Local(scroll.content);
                hole = Rect.MinMaxRect(
                    Mathf.Max(hole.xMin, content.xMin), Mathf.Max(hole.yMin, content.yMin),
                    Mathf.Min(hole.xMax, content.xMax), Mathf.Min(hole.yMax, content.yMax));
            }
            Vector2 min = Vector2.Max(hole.min - (Vector2.one * Padding), area.min);
            Vector2 max = Vector2.Min(hole.max + (Vector2.one * Padding), area.max);
            return Rect.MinMaxRect(min.x, min.y, Mathf.Max(min.x, max.x), Mathf.Max(min.y, max.y));
        }

        /// <summary>RectTransform 하나의 자리를 이 오브젝트의 좌표로 구한다.</summary>
        /// <param name="target">자리를 구할 것.</param>
        /// <returns>이 오브젝트의 좌표로 옮긴 자리.</returns>
        private Rect Local(RectTransform target)
        {
            target.GetWorldCorners(_corners);
            Vector2 min = transform.InverseTransformPoint(_corners[0]);
            Vector2 max = transform.InverseTransformPoint(_corners[2]);
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
        }

        /// <summary>대상 자리를 비워 둔 막을 놓거나(대상이 있을 때) 걷고, 대사 창을 대상의 반대쪽에 둔다.</summary>
        /// <param name="hole">대상의 자리. 없으면 막을 걷는다.</param>
        private void Show(Rect? hole)
        {
            _placed = hole;
            bool shown = hole.HasValue;
            foreach (RectTransform part in _parts)
                part.gameObject.SetActive(shown);
            // 대상이 화면 아래쪽 절반에 있으면 대사 창을 위에, 아니면 아래에 둔다. 대상이 없으면 위다.
            Rect area = ((RectTransform)transform).rect;
            PlaceDialog(!shown || (hole.Value.center.y < area.center.y));
            if (!shown)
                return;
            Rect at = hole.Value;
            Place(_top, new Vector2(area.xMin, at.yMax), area.max);
            Place(_bottom, area.min, new Vector2(area.xMax, at.yMin));
            Place(_left, new Vector2(area.xMin, at.yMin), new Vector2(at.xMin, at.yMax));
            Place(_right, new Vector2(at.xMax, at.yMin), new Vector2(area.xMax, at.yMax));
            Place(_frame, at.min, at.max);
        }

        /// <summary>막 하나를 이 오브젝트의 좌표로 두 꼭짓점 사이에 둔다.</summary>
        /// <param name="part">막.</param>
        /// <param name="min">왼쪽 아래.</param>
        /// <param name="max">오른쪽 위.</param>
        private static void Place(RectTransform part, Vector2 min, Vector2 max)
        {
            part.anchoredPosition = min;
            part.sizeDelta = Vector2.Max(max - min, Vector2.zero);
        }

        /// <summary>
        /// 대사 창을 화면 위나 아래 가장자리에 붙인다. 너비, 높이, 가로 자리는 프리팹이 정한 대로다(위쪽에서 메인 화면의 설정
        /// 버튼을 비우는 자리).
        /// </summary>
        /// <param name="atTop">위에 두려면 true.</param>
        private void PlaceDialog(bool atTop)
        {
            float edge = atTop ? 1f : 0f;
            _dialog.anchorMin = new Vector2(0f, edge);
            _dialog.anchorMax = new Vector2(1f, edge);
            _dialog.pivot = new Vector2(0.5f, edge);
            _dialog.anchoredPosition = new Vector2(_dialog.anchoredPosition.x, atTop ? -TopMargin : BottomMargin);
        }
    }
}
