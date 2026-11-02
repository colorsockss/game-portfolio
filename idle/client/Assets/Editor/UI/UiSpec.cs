using System.Collections.Generic;
using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 팝업을 선언으로 만드는 명세. 패널 안을 위에서부터 쌓고(머리, 글자 줄, 칸 줄, 탭), 남은 자리를 목록이나 본문이 채우며,
    /// 아래에는 버튼 줄을 둔다. 자리는 쌓는 순서와 테마의 간격으로 정해서 숫자를 직접 적지 않는다. 이름을 준 요소는 루트의
    /// ViewRefs 항목이 되고, 버튼은 이름에 Button과 Label을 붙인 두 항목(버튼, 글자)이 된다. 예:
    /// <code>
    /// UiSpec.Popup("InventoryScreen", 960f, 1400f).Header().Tabs("tabs").List("items", row, 210f).Save();
    /// </code>
    /// </summary>
    internal sealed class UiSpec
    {
        /// <summary>테마.</summary>
        private readonly UiTheme _theme;

        /// <summary>프리팹의 루트. ViewRefs를 가진다.</summary>
        private readonly GameObject _root;

        /// <summary>쌓는 패널.</summary>
        private readonly RectTransform _panel;

        /// <summary>내놓을 ViewRefs 항목(적은 순서).</summary>
        private readonly List<(string Name, Object Target)> _refs = new List<(string Name, Object Target)>();

        /// <summary>패널 위쪽에서 쓴 높이.</summary>
        private float _top;

        /// <summary>패널 아래쪽에서 쓴 높이(버튼 줄).</summary>
        private float _bottom;

        /// <summary>명세를 시작한다.</summary>
        /// <param name="root">프리팹의 루트.</param>
        /// <param name="panel">쌓는 패널.</param>
        /// <param name="theme">테마.</param>
        private UiSpec(GameObject root, RectTransform panel, UiTheme theme)
        {
            _root = root;
            _panel = panel;
            _theme = theme;
        }

        /// <summary>테마.</summary>
        internal UiTheme Theme => _theme;

        /// <summary>쌓는 패널. 명세에 없는 것을 놓을 때 쓴다.</summary>
        internal RectTransform Panel => _panel;

        /// <summary>
        /// 화면을 덮는 어두운 바탕 위 가운데에 패널을 둔 팝업을 시작한다. 바탕은 세이프 에어리어 밖까지 덮고 탭을 받아 아래
        /// 화면의 버튼이 눌리지 않는다(<see cref="UiParts.AddPopupFrame"/>).
        /// </summary>
        /// <param name="name">프리팹 이름.</param>
        /// <param name="width">패널 너비.</param>
        /// <param name="height">패널 높이.</param>
        /// <returns>명세.</returns>
        internal static UiSpec Popup(string name, float width, float height)
        {
            var root = new GameObject(name, typeof(RectTransform), typeof(ViewRefs));
            UiPrefabs.Stretch((RectTransform)root.transform, Vector2.zero, Vector2.zero);
            RectTransform panel = UiParts.AddPopupFrame(root.transform, new Vector2(width, height));
            return new UiSpec(root, panel, UiTheme.Load());
        }

        /// <summary>
        /// 위쪽 머리: 왼쪽 제목과 오른쪽 닫기 버튼. 둘 다 글자가 비어 있고 항목 titleLabel, closeButton, closeLabel이 된다.
        /// </summary>
        /// <returns>명세.</returns>
        internal UiSpec Header()
        {
            TMP_Text title = UiPrefabs.AddText(_panel, "Title", TextStyle.Title, new Vector2(0f, 1f), Vector2.one);
            title.rectTransform.offsetMin = new Vector2(_theme.Padding, -_theme.HeaderHeight);
            title.rectTransform.offsetMax = new Vector2(-170f, 0f);
            title.alignment = TextAlignmentOptions.MidlineLeft;

            Button close = UiParts.AddButton(_panel, "CloseButton", ButtonStyle.Secondary);
            UiPrefabs.Place(close, Vector2.one, new Vector2(-_theme.Padding, -20f), new Vector2(160f, 100f));
            _top = _theme.HeaderHeight;
            return Ref("titleLabel", title).Ref("closeButton", close).Ref("closeLabel", UiPrefabs.LabelOf(close));
        }

        /// <summary>위쪽에 빈 자리를 더 둔다(묶음 사이).</summary>
        /// <param name="height">더 둘 높이.</param>
        /// <returns>명세.</returns>
        internal UiSpec Space(float height)
        {
            _top += height;
            return this;
        }

        /// <summary>가로로 꽉 찬 글자 줄을 쌓는다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="style">글자 모양.</param>
        /// <param name="height">줄 높이.</param>
        /// <param name="gap">앞 요소와의 간격. 없으면 테마의 간격이다.</param>
        /// <param name="alignment">정렬. 없으면 가운데다.</param>
        /// <param name="configure">모양에 없는 것(색, 크기)을 더 정한다.</param>
        /// <returns>명세.</returns>
        internal UiSpec Text(
            string name, TextStyle style, float height, float? gap = null,
            TextAlignmentOptions alignment = TextAlignmentOptions.Center, System.Action<TMP_Text> configure = null)
        {
            TMP_Text text = UiPrefabs.AddText(_panel, ObjectName(name), style, Vector2.zero, Vector2.one);
            StackRow(text.rectTransform, height, gap);
            text.alignment = alignment;
            configure?.Invoke(text);
            return Ref(name, text);
        }

        /// <summary>탭 막대를 쌓는다(<see cref="UiParts.AddTabs"/>).</summary>
        /// <param name="name">항목 이름.</param>
        /// <returns>명세.</returns>
        internal UiSpec Tabs(string name)
        {
            TabBar tabs = UiParts.AddTabs(_panel, ObjectName(name));
            StackRow((RectTransform)tabs.transform, _theme.TabHeight, null);
            return Ref(name, tabs);
        }

        /// <summary>
        /// 틀을 TypeScript가 정한 수만큼 가로로 고르게 늘어놓는 칸 줄(ViewList)을 쌓는다. 칸이 넓이보다 많으면 레이아웃이
        /// 줄여 넣는다.
        /// </summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="template">칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="height">줄 높이.</param>
        /// <returns>명세.</returns>
        internal UiSpec Row(string name, GameObject template, float height)
        {
            ViewList list = AddViewList(name, template, vertical: false);
            StackRow((RectTransform)list.transform, height, null);
            return Ref(name, list);
        }

        /// <summary>틀을 TypeScript가 정한 수만큼 세로로 쌓는 줄 목록(ViewList)을 쌓는다. 높이는 줄 수만큼 잡는다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="template">줄 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="rowHeight">줄 하나의 높이.</param>
        /// <param name="rows">잡아 둘 줄 수.</param>
        /// <returns>명세.</returns>
        internal UiSpec Stack(string name, GameObject template, float rowHeight, int rows)
        {
            ViewList list = AddViewList(name, template, vertical: true);
            StackRow((RectTransform)list.transform, (rows * rowHeight) + ((rows - 1) * _theme.Spacing), null);
            return Ref(name, list);
        }

        /// <summary>남은 자리를 칸이 너비를 채우는 세로 스크롤 목록(가상화, LoopScrollRect)으로 채운다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="cell">칸 프리팹. 높이는 칸의 LayoutElement가 정한다.</param>
        /// <returns>명세.</returns>
        internal UiSpec List(string name, ViewRefs cell) => AddList(name, cell, 1, Vector2.zero);

        /// <summary>남은 자리를 스크롤 그리드(가상화, LoopScrollRect)로 채운다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="cell">칸 프리팹.</param>
        /// <param name="cellSize">칸의 크기.</param>
        /// <param name="columns">열 수.</param>
        /// <returns>명세.</returns>
        internal UiSpec Grid(string name, ViewRefs cell, Vector2 cellSize, int columns) =>
            AddList(name, cell, columns, cellSize);

        /// <summary>남은 자리를 스크롤 목록으로 채운다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="cell">칸 프리팹.</param>
        /// <param name="columns">열 수.</param>
        /// <param name="cellSize">그리드 칸의 크기.</param>
        /// <returns>명세.</returns>
        private UiSpec AddList(string name, ViewRefs cell, int columns, Vector2 cellSize)
        {
            ScrollList list = UiPrefabs.AddScrollList(_panel, cell, columns, cellSize, 0f);
            FillRest((RectTransform)list.transform);
            return Ref(name, list);
        }

        /// <summary>남은 자리를 줄을 바꾸는 본문 글자로 채운다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="style">글자 모양.</param>
        /// <param name="alignment">정렬.</param>
        /// <returns>명세.</returns>
        internal UiSpec Body(string name, TextStyle style, TextAlignmentOptions alignment)
        {
            TMP_Text text = UiPrefabs.AddText(_panel, ObjectName(name), style, Vector2.zero, Vector2.one);
            text.textWrappingMode = TextWrappingModes.Normal;
            text.alignment = alignment;
            FillRest(text.rectTransform);
            return Ref(name, text);
        }

        /// <summary>
        /// 아래쪽 버튼 줄. 버튼이 하나면 가운데, 둘이면 양 끝에 둔다. 버튼마다 이름에 Button과 Label을 붙인 항목이 된다(예:
        /// ok → okButton, okLabel). 남은 자리를 채우는 요소보다 먼저 적는다.
        /// </summary>
        /// <param name="height">버튼 높이.</param>
        /// <param name="buttons">버튼의 이름, 모양, 너비. 왼쪽부터.</param>
        /// <returns>명세.</returns>
        internal UiSpec Footer(float height, params (string Name, ButtonStyle Style, float Width)[] buttons)
        {
            float margin = _theme.Padding + 10f;
            for (var i = 0; i < buttons.Length; i++)
            {
                (string name, ButtonStyle style, float width) = buttons[i];
                Button button = UiParts.AddButton(_panel, ObjectName(name) + "Button", style);
                if (buttons.Length == 1)
                    UiPrefabs.Place(button, new Vector2(0.5f, 0f), new Vector2(0f, margin), new Vector2(width, height));
                else if (i == 0)
                    UiPrefabs.Place(button, Vector2.zero, new Vector2(margin, margin), new Vector2(width, height));
                else
                    UiPrefabs.Place(button, Vector2.right, new Vector2(-margin, margin), new Vector2(width, height));
                Ref($"{name}Button", button).Ref($"{name}Label", UiPrefabs.LabelOf(button));
            }
            _bottom = margin + height;
            return this;
        }

        /// <summary>
        /// 패널 아래쪽(버튼 줄이 있으면 그 위)에 가로로 꽉 찬 빈 판을 두고 <paramref name="configure"/>로 채운다. 뒤의 목록과
        /// 본문은 그 위까지 찬다. 판의 GameObject가 항목이 되어 켜고 끌 수 있다.
        /// </summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="height">판 높이.</param>
        /// <param name="configure">판 안을 채운다.</param>
        /// <returns>명세.</returns>
        internal UiSpec Dock(string name, float height, System.Action<RectTransform> configure)
        {
            RectTransform dock = UiPrefabs.AddRect(_panel, ObjectName(name));
            float bottom = (_bottom > 0f) ? _bottom + _theme.Spacing : _theme.Padding;
            dock.anchorMin = Vector2.zero;
            dock.anchorMax = new Vector2(1f, 0f);
            dock.pivot = new Vector2(0.5f, 0f);
            dock.offsetMin = new Vector2(_theme.Padding, bottom);
            dock.offsetMax = new Vector2(-_theme.Padding, bottom + height);
            _bottom = bottom + height;
            configure(dock);
            return Ref(name, dock.gameObject);
        }

        /// <summary>항목 하나를 더한다. 명세에 없는 것을 <see cref="Panel"/>에 직접 놓았을 때 쓴다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="target">가리킬 오브젝트.</param>
        /// <returns>명세.</returns>
        internal UiSpec Ref(string name, Object target)
        {
            _refs.Add((name, target));
            return this;
        }

        /// <summary>항목을 루트의 ViewRefs에 넣고 UI 프리팹 폴더에 저장한다(fileID 유지).</summary>
        /// <param name="inApp">부트의 패치 화면이 써서 앱(Resources)에 넣는지. 아니면 패치로 받는다(Remote).</param>
        /// <returns>저장한 프리팹.</returns>
        internal GameObject Save(bool inApp = false)
        {
            try
            {
                UiPrefabs.SetRefs(_root.GetComponent<ViewRefs>(), _refs.ToArray());
                return UiPrefabs.Save(_root, _root.name, inApp);
            }
            finally
            {
                Object.DestroyImmediate(_root);
            }
        }

        /// <summary>위에서 다음 자리에 가로로 꽉 찬(여백만큼 띄운) 줄을 둔다.</summary>
        /// <param name="rect">놓을 것.</param>
        /// <param name="height">높이.</param>
        /// <param name="gap">앞 요소와의 간격. 없으면 테마의 간격이다.</param>
        private void StackRow(RectTransform rect, float height, float? gap)
        {
            float top = _top + (gap ?? _theme.Spacing);
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = Vector2.one;
            rect.pivot = new Vector2(0.5f, 1f);
            rect.offsetMin = new Vector2(_theme.Padding, -(top + height));
            rect.offsetMax = new Vector2(-_theme.Padding, -top);
            _top = top + height;
        }

        /// <summary>위에서 쓴 자리와 아래 버튼 줄 사이를 여백만큼 띄워 채운다.</summary>
        /// <param name="rect">채울 것.</param>
        private void FillRest(RectTransform rect)
        {
            float bottom = (_bottom > 0f) ? _bottom + _theme.Spacing : _theme.Padding;
            UiPrefabs.Stretch(
                rect, new Vector2(_theme.Padding, bottom), new Vector2(-_theme.Padding, -(_top + _theme.Spacing)));
            _top = float.PositiveInfinity;
        }

        /// <summary>틀을 복제해 늘어놓는 ViewList를 패널에 만든다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="template">틀 프리팹.</param>
        /// <param name="vertical">세로로 쌓으면 true.</param>
        /// <returns>ViewList.</returns>
        private ViewList AddViewList(string name, GameObject template, bool vertical)
        {
            var go = new GameObject(
                ObjectName(name), typeof(RectTransform),
                vertical ? typeof(VerticalLayoutGroup) : typeof(HorizontalLayoutGroup), typeof(ViewList));
            go.transform.SetParent(_panel, false);
            var layout = go.GetComponent<HorizontalOrVerticalLayoutGroup>();
            layout.spacing = _theme.Spacing;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = !vertical;
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(template, go.transform);
            instance.SetActive(false);
            var list = go.GetComponent<ViewList>();
            UiPrefabs.SetField(list, "_template", instance.GetComponent<ViewRefs>());
            return list;
        }

        /// <summary>
        /// 항목 이름에서 오브젝트 이름을 만든다: 끝의 Text나 Label을 떼고 첫 글자를 대문자로 바꾼다(durationText → Duration,
        /// items → Items).
        /// </summary>
        /// <param name="name">항목 이름.</param>
        /// <returns>오브젝트 이름.</returns>
        private static string ObjectName(string name)
        {
            foreach (string suffix in new[] { "Text", "Label" })
            {
                if (name.EndsWith(suffix) && (name.Length > suffix.Length))
                    name = name.Substring(0, name.Length - suffix.Length);
            }
            return char.ToUpperInvariant(name[0]) + name.Substring(1);
        }
    }
}
