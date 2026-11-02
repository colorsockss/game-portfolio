using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 프리팹을 코드로 만드는 스크립트가 같이 쓰는 낮은 단계의 도우미: 빈 오브젝트, 이미지, 글자, 늘이기, 세이프 에어리어
    /// 밖으로 늘이기, 자리 정하기, ViewRefs 항목과 직렬화 필드, 스크롤 목록, 저장. 색과 크기는 테마(<see cref="UiTheme"/>),
    /// 버튼·탭·팝업 틀 같은 부품은 <see cref="UiParts"/>, 팝업의 배치는 <see cref="UiSpec"/>이 맡는다. 고정 글자(버튼 이름,
    /// 제목)는 비워 두고 그 텍스트를 ViewRefs 항목(…Label)으로 내놓으면 TypeScript가 지금 언어의 문장으로 채운다
    /// (src/unity/binding/view.ts의 label). 문장은 idle/data/Strings.xlsx에 있다.
    /// </summary>
    internal static class UiPrefabs
    {
        /// <summary>프리팹을 만드는 폴더. 패치로 받는 Addressables 원격 그룹이고, 주소는 Remote 기준 경로(UI/이름)다.</summary>
        internal const string Folder = "Assets/Remote/UI";

        /// <summary>패치 전에 쓰는 프리팹(부트의 패치 화면)을 만드는 폴더. 앱에 들고 키는 같다(UI/이름).</summary>
        internal const string AppFolder = "Assets/Resources/UI";

        /// <summary>
        /// 바탕을 세이프 에어리어 밖으로 늘이는 거리(캔버스 단위). 노치와 홈 인디케이터의 여백은 기기마다 다르지만 캔버스
        /// 단위로 200을 넘지 않으므로 넉넉히 잡는다. 화면 밖으로 나간 부분은 그려지지 않는다.
        /// </summary>
        internal const float BleedMargin = 600f;

        /// <summary>RectTransform을 가진 빈 오브젝트를 부모 아래에 만든다.</summary>
        /// <param name="parent">부모 Transform.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>만든 오브젝트의 RectTransform.</returns>
        internal static RectTransform AddRect(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        /// <summary>단색 Image를 가진 오브젝트를 부모 아래에 만든다.</summary>
        /// <param name="parent">부모 Transform.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="color">색.</param>
        /// <returns>만든 Image.</returns>
        internal static Image AddImage(Transform parent, string name, Color color)
        {
            Image image = AddRect(parent, name).gameObject.AddComponent<Image>();
            image.color = color;
            return image;
        }

        /// <summary>버튼의 글자. ViewRefs의 …Label 항목으로 내놓으면 TypeScript가 채운다.</summary>
        /// <param name="button">글자를 자식으로 가진 버튼.</param>
        /// <returns>버튼의 글자.</returns>
        internal static TMP_Text LabelOf(Button button) => button.GetComponentInChildren<TMP_Text>(true);

        /// <summary>부모의 앵커 영역을 채우는 가운데 정렬 글자를 만든다. 탭은 받지 않는다.</summary>
        /// <param name="parent">부모 Transform.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="fontSize">글자 크기.</param>
        /// <param name="anchorMin">앵커 왼쪽 아래.</param>
        /// <param name="anchorMax">앵커 오른쪽 위.</param>
        /// <returns>만든 글자.</returns>
        internal static TMP_Text AddText(
            Transform parent, string name, float fontSize, Vector2 anchorMin, Vector2 anchorMax)
        {
            RectTransform rect = AddRect(parent, name);
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
            var text = rect.gameObject.AddComponent<TextMeshProUGUI>();
            text.text = string.Empty;
            text.fontSize = fontSize;
            text.color = Color.white;
            text.alignment = TextAlignmentOptions.Center;
            text.textWrappingMode = TextWrappingModes.NoWrap;
            text.raycastTarget = false;
            return text;
        }

        /// <summary>테마의 글자 모양(크기, 색)으로 부모의 앵커 영역을 채우는 가운데 정렬 글자를 만든다. 탭은 받지 않는다.</summary>
        /// <param name="parent">부모 Transform.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="style">글자 모양.</param>
        /// <param name="anchorMin">앵커 왼쪽 아래.</param>
        /// <param name="anchorMax">앵커 오른쪽 위.</param>
        /// <returns>만든 글자.</returns>
        internal static TMP_Text AddText(
            Transform parent, string name, TextStyle style, Vector2 anchorMin, Vector2 anchorMax)
        {
            (float size, Color color) = UiTheme.Load().Of(style);
            TMP_Text text = AddText(parent, name, size, anchorMin, anchorMax);
            text.color = color;
            return text;
        }

        /// <summary>부모를 채우되 가장자리를 띄운다.</summary>
        /// <param name="rect">늘일 RectTransform.</param>
        /// <param name="offsetMin">왼쪽 아래 가장자리.</param>
        /// <param name="offsetMax">오른쪽 위 가장자리(음수가 안쪽).</param>
        internal static void Stretch(RectTransform rect, Vector2 offsetMin, Vector2 offsetMax)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = offsetMin;
            rect.offsetMax = offsetMax;
        }

        /// <summary>
        /// 화면 전체를 덮는 바탕(팝업 뒤의 어두운 바탕, 전환 화면, 로그인 화면)을 세이프 에어리어 밖까지 늘인다. UI 레이어는
        /// 세이프 에어리어를 채우므로(UiRoot) 그냥 채우면 노치와 홈 인디케이터 자리가 덮이지 않는다. 사방으로 같은 만큼
        /// 늘이므로 가운데에 놓은 자식은 세이프 에어리어의 가운데에 남는다. 가장자리에 붙인 자식이 있는 것에는 쓰지 않는다.
        /// </summary>
        /// <param name="rect">늘일 RectTransform.</param>
        internal static void Bleed(RectTransform rect) =>
            Stretch(rect, new Vector2(-BleedMargin, -BleedMargin), new Vector2(BleedMargin, BleedMargin));

        /// <summary>한 점에 앵커를 두고 크기와 자리를 정한다.</summary>
        /// <param name="target">놓을 UI 오브젝트의 컴포넌트(RectTransform을 가진다).</param>
        /// <param name="anchor">앵커이자 피벗.</param>
        /// <param name="position">앵커에서의 자리.</param>
        /// <param name="size">크기.</param>
        internal static void Place(Component target, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var rect = (RectTransform)target.transform;
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.pivot = anchor;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
        }

        /// <summary>직렬화된 오브젝트 배열 필드를 채운다.</summary>
        /// <param name="property">배열 필드.</param>
        /// <param name="values">넣을 오브젝트.</param>
        internal static void SetArray(SerializedProperty property, Object[] values)
        {
            property.arraySize = values.Length;
            for (var i = 0; i < values.Length; i++)
                property.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
        }

        /// <summary>ViewRefs의 항목을 Object 항목들로 정한다. 있던 항목은 지운다.</summary>
        /// <param name="refs">항목을 넣을 ViewRefs.</param>
        /// <param name="entries">항목 이름과 가리킬 오브젝트.</param>
        internal static void SetRefs(ViewRefs refs, params (string Name, Object Target)[] entries)
        {
            var serialized = new SerializedObject(refs);
            SerializedProperty list = serialized.FindProperty("_entries");
            list.arraySize = 0;
            AddRefs(list, entries);
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>ViewRefs 항목 배열 끝에 Object 항목들을 더한다.</summary>
        /// <param name="list">ViewRefs의 _entries.</param>
        /// <param name="entries">항목 이름과 가리킬 오브젝트.</param>
        internal static void AddRefs(SerializedProperty list, params (string Name, Object Target)[] entries)
        {
            foreach ((string name, Object target) in entries)
            {
                list.arraySize++;
                SerializedProperty entry = list.GetArrayElementAtIndex(list.arraySize - 1);
                entry.FindPropertyRelative("Name").stringValue = name;
                entry.FindPropertyRelative("Kind").enumValueIndex = (int)ViewRefs.Kind.Object;
                entry.FindPropertyRelative("ObjectValue").objectReferenceValue = target;
            }
        }

        /// <summary>컴포넌트의 직렬화된 오브젝트 필드 하나를 정한다.</summary>
        /// <param name="component">필드를 가진 컴포넌트.</param>
        /// <param name="field">필드 이름.</param>
        /// <param name="value">넣을 오브젝트.</param>
        internal static void SetField(Object component, string field, Object value)
        {
            var serialized = new SerializedObject(component);
            serialized.FindProperty(field).objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// 패널 안에서 위쪽 <paramref name="top"/> 아래를 채우는 세로 스크롤 목록을 만든다. 열이 하나면 칸이 목록 너비를
        /// 채우고 높이는 칸의 LayoutElement가 정하며, 여럿이면 <paramref name="cellSize"/> 칸을 열 수만큼 놓는 그리드다.
        /// </summary>
        /// <param name="parent">패널.</param>
        /// <param name="cell">칸 프리팹.</param>
        /// <param name="columns">열 수.</param>
        /// <param name="cellSize">그리드 칸의 크기. 열이 하나면 쓰지 않는다.</param>
        /// <param name="top">패널 위쪽에서 목록 위쪽까지의 거리.</param>
        /// <returns>목록.</returns>
        internal static ScrollList AddScrollList(Transform parent, ViewRefs cell, int columns, Vector2 cellSize, float top)
        {
            UiTheme theme = UiTheme.Load();
            // 투명한 Image가 끌기를 받고, RectMask2D가 화면 밖 칸을 가린다.
            var go = new GameObject(
                "Grid", typeof(RectTransform), typeof(Image), typeof(RectMask2D), typeof(LoopVerticalScrollRect),
                typeof(ScrollList));
            go.transform.SetParent(parent, false);
            Stretch((RectTransform)go.transform, new Vector2(30f, 30f), new Vector2(-30f, -top));
            go.GetComponent<Image>().color = Color.clear;

            // 콘텐츠는 목록 위쪽에 붙어 너비를 채우고, 높이는 보이는 칸만큼 늘어난다.
            RectTransform content = AddRect(go.transform, "Content");
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = Vector2.one;
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = Vector2.zero;
            if (columns > 1)
            {
                var grid = content.gameObject.AddComponent<GridLayoutGroup>();
                grid.cellSize = cellSize;
                grid.spacing = new Vector2(theme.Spacing, theme.Spacing);
                grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
                grid.constraintCount = columns;
            }
            else
            {
                var layout = content.gameObject.AddComponent<VerticalLayoutGroup>();
                layout.spacing = theme.Spacing;
                layout.childControlWidth = true;
                layout.childControlHeight = true;
                layout.childForceExpandWidth = true;
                layout.childForceExpandHeight = false;
            }
            content.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var scroller = go.GetComponent<LoopVerticalScrollRect>();
            scroller.content = content;
            scroller.horizontal = false;
            scroller.vertical = true;
            scroller.movementType = LoopScrollRectBase.MovementType.Elastic;
            scroller.scrollSensitivity = 30f;

            var list = go.GetComponent<ScrollList>();
            var serialized = new SerializedObject(list);
            serialized.FindProperty("_cellPrefab").objectReferenceValue = cell;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return list;
        }

        /// <summary>
        /// 오브젝트를 폴더의 프리팹으로 저장한다. 있으면 덮어써서 GUID가 그대로이고, 지난 파일에 있던 오브젝트의 fileID도
        /// 그대로다(<see cref="PrefabIds"/>).
        /// </summary>
        /// <param name="root">프리팹의 루트.</param>
        /// <param name="name">프리팹 이름(확장자 제외).</param>
        /// <param name="inApp">부트의 패치 화면이 써서 앱에 넣는지. 아니면 패치로 받는다.</param>
        /// <returns>저장한 프리팹 에셋.</returns>
        internal static GameObject Save(GameObject root, string name, bool inApp = false) =>
            PrefabIds.Save(root, $"{(inApp ? AppFolder : Folder)}/{name}.prefab");
    }
}
