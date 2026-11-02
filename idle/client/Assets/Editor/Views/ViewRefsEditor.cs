using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using PortfolioIdleRpg.Views;
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// ViewRefs 인스펙터: UI Toolkit으로 그린 키-값 표이고 스타일은 ViewRefsEditor.uss가 맡는다. 행은
    /// 항목의 모양이 바뀔 때(추가, 삭제, 이동)만 만들고 다시 그릴 때마다 만들지 않으며, 입력해도
    /// 아무것도 다시 만들지 않는다. 값의 종류는 항목을 추가할 때 고르고 그 필드에 드러난다.
    /// 끌어 온 오브젝트는 놓일 곳(표나 목록)이 밝아지고, 들어갈 자리에 선이 보인다.
    /// </summary>
    [CustomEditor(typeof(ViewRefs))]
    public sealed class ViewRefsEditor : UnityEditor.Editor
    {
        /// <summary>USS 클래스 이름의 블록(BEM).</summary>
        private const string Block = "view-refs";

        /// <summary>항목 행의 USS 클래스.</summary>
        private const string RowClass = Block + "__row";

        /// <summary>목록 칸의 USS 클래스.</summary>
        private const string ItemClass = Block + "__item";

        /// <summary>오브젝트를 끌어 올린 놓을 곳의 USS 클래스.</summary>
        private const string DropTargetClass = Block + "--drop-target";

        /// <summary>놓을 곳의 안내 문구가 놓았을 때 일을 알릴 때의 USS 클래스.</summary>
        private const string ActiveCaptionClass = Block + "__caption--active";

        /// <summary>표 아래의 놓기 안내 문구.</summary>
        private const string TableHint = "Drop objects here to add them · Alt: as one list";

        /// <summary>TypeScript 객체 리터럴에 따옴표 없이 쓸 수 있는 키.</summary>
        private static readonly Regex s_identifier = new Regex("^[A-Za-z_$][A-Za-z0-9_$]*$");

        /// <summary>GameObject를 놓으면 뷰가 가장 원할 법한 컴포넌트를 이 순서로 찾는다.</summary>
        private static readonly string[] s_preferredTypes =
        {
            "PortfolioIdleRpg.Views.ViewRefs",
            "TMPro.TMP_InputField", "UnityEngine.UI.InputField",
            "TMPro.TMP_Dropdown", "UnityEngine.UI.Dropdown",
            "UnityEngine.UI.Button", "UnityEngine.UI.Toggle", "UnityEngine.UI.Slider",
            "UnityEngine.UI.Scrollbar", "UnityEngine.UI.ScrollRect",
            "TMPro.TMP_Text", "UnityEngine.UI.Text",
            "UnityEngine.UI.RawImage", "UnityEngine.UI.Image",
        };

        /// <summary>항목 행을 담는 요소.</summary>
        private VisualElement _entryRows;

        /// <summary>항목 행의 끌기와 놓을 자리.</summary>
        private Rows _entrySlots;

        /// <summary>행을 마지막으로 만들 때의 <see cref="Shape"/>.</summary>
        private string _shape;

        /// <summary>오브젝트를 끌어 올린 놓을 곳. 없으면 null이다.</summary>
        private DropArea _hovered;

        /// <summary>
        /// 타입 버튼마다 툴팁을 새로 고치는 함수. 다른 오브젝트를 지정하면 행이 아니라 툴팁이 바뀐다.
        /// </summary>
        private readonly List<Action> _typeLabels = new List<Action>();

        /// <summary>ViewRefs의 직렬화된 항목 배열.</summary>
        private SerializedProperty Entries => serializedObject.FindProperty("_entries");

        /// <summary>표, 아래쪽 막대, 문제 경고로 인스펙터를 만든다.</summary>
        /// <returns>인스펙터의 루트 요소.</returns>
        public override VisualElement CreateInspectorGUI()
        {
            var root = new VisualElement();
            root.AddToClassList(Block);
            // 스타일 시트는 이 스크립트 옆에 있으므로 폴더를 옮겨도 찾는다.
            string styles = Path.ChangeExtension(
                AssetDatabase.GetAssetPath(MonoScript.FromScriptableObject(this)), "uss");
            StyleSheet sheet = AssetDatabase.LoadAssetAtPath<StyleSheet>(styles);
            if (sheet != null)
                root.styleSheets.Add(sheet);

            VisualElement table = Element($"{Block}__table");
            table.Add(Header());
            _entryRows = Element($"{Block}__rows");
            table.Add(_entryRows);
            // 표 아래쪽 막대: 복사, 놓기 안내 문구, 추가.
            VisualElement footer = Element($"{Block}__footer");
            Button add = null;
            add = ToolbarButton(
                "Add", "Toolbar Plus More", "Add an entry of a type", () => ShowAddMenu(add.worldBound));
            add.AddToClassList($"{Block}__button--primary");
            Label caption = Text(TableHint, $"{Block}__caption");
            Button copy = null;
            copy = ToolbarButton("Copy TS", null, "Copy the TypeScript declaration of these refs", () =>
            {
                CopyTypeScript();
                copy.Q<Label>().text = "Copied";
                copy.AddToClassList($"{Block}__button--done");
                copy.schedule.Execute(() =>
                {
                    copy.Q<Label>().text = "Copy TS";
                    copy.RemoveFromClassList($"{Block}__button--done");
                }).StartingIn(1500);
            });
            footer.Add(copy);
            footer.Add(caption);
            footer.Add(add);
            table.Add(footer);
            root.Add(table);
            AcceptDrops(new DropArea(table, caption, TableHint, () => _entrySlots,
                (count, asList) => (asList && (count > 1))
                    ? $"Release to add {count} objects as one list here"
                    : $"Release to add {Plural(count, "entry", "entries")} here",
                InsertDropped));

            var problems = new HelpBox(string.Empty, HelpBoxMessageType.Warning);
            root.Add(problems);
            void Check()
            {
                string message = FindProblems(Entries);
                problems.text = message;
                problems.style.display = message.Length == 0 ? DisplayStyle.None : DisplayStyle.Flex;
            }

            Rebuild();
            Check();
            // 실행 취소, 다시 실행, 프리팹 되돌리기도 잡아낸다.
            root.TrackSerializedObjectValue(serializedObject, _ =>
            {
                if (Shape() != _shape)
                    Rebuild();
                else
                    _typeLabels.ForEach(refresh => refresh());
                Check();
            });
            return root;
        }

        /// <summary>
        /// 행이 의존하는 것: 항목의 개수와 종류, 각 목록의 길이. 키나 값을 고쳐도 이것들은
        /// 바뀌지 않는다.
        /// </summary>
        /// <returns>행의 모양을 나타내는 문자열.</returns>
        private string Shape()
        {
            SerializedProperty entries = Entries;
            StringBuilder text = new StringBuilder().Append(entries.arraySize);
            for (var i = 0; i < entries.arraySize; i++)
            {
                SerializedProperty entry = entries.GetArrayElementAtIndex(i);
                text.Append(',').Append(entry.FindPropertyRelative("Kind").intValue)
                    .Append(':').Append(entry.FindPropertyRelative("ListValue").arraySize);
            }
            return text.ToString();
        }

        /// <summary>항목 행을 모두 새로 만든다.</summary>
        private void Rebuild()
        {
            Leave();
            serializedObject.Update();
            _shape = Shape();
            _entryRows.Unbind();
            _entryRows.Clear();
            _typeLabels.Clear();
            SerializedProperty entries = Entries;
            _entrySlots = new Rows(_entryRows, entries, RowClass, Rebuild);
            for (var i = 0; i < entries.arraySize; i++)
                _entryRows.Add(EntryRow(entries.GetArrayElementAtIndex(i), i));
            if (entries.arraySize == 0)
                _entryRows.Add(Text("No entries yet. Use + Add, or drop objects here.", $"{Block}__empty"));
        }

        /// <summary>표의 머리 행을 만든다.</summary>
        /// <returns>머리 행.</returns>
        private static VisualElement Header()
        {
            VisualElement header = Element($"{Block}__header");
            header.Add(Text("Key", $"{Block}__key-column"));
            header.Add(new Label("Value"));
            return header;
        }

        /// <summary>항목 하나의 행: 핸들, 키, 값, 타입 버튼, 지우기 버튼.</summary>
        /// <param name="entry">항목.</param>
        /// <param name="index">항목의 인덱스.</param>
        /// <returns>행.</returns>
        private VisualElement EntryRow(SerializedProperty entry, int index)
        {
            var kind = (ViewRefs.Kind)entry.FindPropertyRelative("Kind").intValue;
            VisualElement row = Element(RowClass);
            if (index % 2 == 1)
                row.AddToClassList($"{RowClass}--odd");
            row.Add(_entrySlots.Handle(index, "≡", $"{Block}__handle"));

            var key = new TextField();
            key.AddToClassList($"{Block}__key");
            key.BindProperty(entry.FindPropertyRelative("Name"));
            if (kind == ViewRefs.Kind.List)
            {
                row.AddToClassList($"{RowClass}--list");
                VisualElement column = Element($"{Block}__key-column");
                column.Add(key);
                int count = entry.FindPropertyRelative("ListValue").arraySize;
                column.Add(Text(Plural(count, "item", "items"), $"{Block}__count"));
                row.Add(column);
            }
            else
            {
                row.Add(key);
            }

            row.Add(ValueField(entry, kind));
            row.Add(TypeButton(entry, kind));
            row.Add(RemoveButton(() => DeleteAt(Entries, index)));
            return row;
        }

        /// <summary>항목의 종류에 맞는 값 필드를 만든다.</summary>
        /// <param name="entry">항목.</param>
        /// <param name="kind">항목의 종류.</param>
        /// <returns>값 필드.</returns>
        private VisualElement ValueField(SerializedProperty entry, ViewRefs.Kind kind)
        {
            switch (kind)
            {
                case ViewRefs.Kind.Object:
                    return ObjectField(entry.FindPropertyRelative("ObjectValue"));
                case ViewRefs.Kind.List:
                    return ListField(entry.FindPropertyRelative("ListValue"));
                case ViewRefs.Kind.String:
                    var text = new TextField();
                    text.BindProperty(entry.FindPropertyRelative("StringValue"));
                    text.AddToClassList($"{Block}__value");
                    return text;
                case ViewRefs.Kind.Number:
                    var number = new DoubleField();
                    number.BindProperty(entry.FindPropertyRelative("NumberValue"));
                    number.AddToClassList($"{Block}__value");
                    return number;
                default:
                    var toggle = new Toggle();
                    toggle.BindProperty(entry.FindPropertyRelative("BoolValue"));
                    toggle.AddToClassList($"{Block}__value");
                    return toggle;
            }
        }

        /// <summary>오브젝트 필드를 만든다. 오른쪽 클릭으로 같은 GameObject의 다른 컴포넌트를 고른다.</summary>
        /// <param name="value">오브젝트 참조 속성.</param>
        /// <returns>오브젝트 필드.</returns>
        private static ObjectField ObjectField(SerializedProperty value)
        {
            var field = new ObjectField
            {
                objectType = typeof(Object),
                allowSceneObjects = true,
                tooltip = "Right-click to use another component of this GameObject",
            };
            field.AddToClassList($"{Block}__value");
            field.BindProperty(value);
            field.AddManipulator(
                new ContextualMenuManipulator(menuEvent => AddComponentChoices(menuEvent.menu, value)));
            return field;
        }

        /// <summary>
        /// 목록 필드를 만든다. 항목마다 한 줄: 인덱스를 끌어 순서를 바꾸고, ×로 지우고, "+ Slot"으로 빈
        /// 칸을 더하며, 목록에 놓은 오브젝트는 선이 보이는 자리에 들어간다.
        /// </summary>
        /// <param name="list">오브젝트 참조 배열 속성.</param>
        /// <returns>목록 필드.</returns>
        private VisualElement ListField(SerializedProperty list)
        {
            VisualElement box = Element($"{Block}__list");
            VisualElement items = Element($"{Block}__items");
            var slots = new Rows(items, list, ItemClass, Rebuild);
            for (var i = 0; i < list.arraySize; i++)
            {
                int index = i;
                VisualElement item = Element(ItemClass);
                item.Add(slots.Handle(index, index.ToString(), $"{Block}__index"));
                item.Add(ObjectField(list.GetArrayElementAtIndex(index)));
                item.Add(RemoveButton(() => DeleteAt(list, index)));
                items.Add(item);
            }
            box.Add(items);

            VisualElement footer = Element($"{Block}__list-footer");
            var add = new Button(() => InsertIntoList(list, list.arraySize, new Object[] { null }))
            {
                text = "+ Slot",
            };
            add.AddToClassList($"{Block}__link");
            footer.Add(add);
            const string Hint = "or drop objects on this list";
            Label caption = Text(Hint, $"{Block}__caption");
            footer.Add(caption);
            box.Add(footer);
            AcceptDrops(new DropArea(box, caption, Hint, () => slots,
                (count, _) => $"Release to add {Plural(count, "item", "items")} here",
                (slot, dropped, _) => InsertIntoList(list, slot, dropped)));
            return box;
        }

        /// <summary>USS 클래스가 붙은 빈 요소를 만든다.</summary>
        /// <param name="className">USS 클래스.</param>
        /// <returns>요소.</returns>
        private static VisualElement Element(string className)
        {
            var element = new VisualElement();
            element.AddToClassList(className);
            return element;
        }

        /// <summary>USS 클래스가 붙은 레이블을 만든다.</summary>
        /// <param name="text">레이블 문구.</param>
        /// <param name="className">USS 클래스.</param>
        /// <returns>레이블.</returns>
        private static Label Text(string text, string className)
        {
            var label = new Label(text);
            label.AddToClassList(className);
            return label;
        }

        /// <summary>× 지우기 버튼을 만든다.</summary>
        /// <param name="remove">누르면 할 일.</param>
        /// <returns>버튼.</returns>
        private static Button RemoveButton(Action remove)
        {
            var button = new Button(remove) { text = "×", tooltip = "Remove" };
            button.AddToClassList($"{Block}__remove");
            return button;
        }

        /// <summary>개수와 단수형 또는 복수형 명사를 붙인다.</summary>
        /// <param name="count">개수.</param>
        /// <param name="one">단수형.</param>
        /// <param name="many">복수형.</param>
        /// <returns>"1 item", "2 items" 같은 문구.</returns>
        private static string Plural(int count, string one, string many) =>
            $"{count} {(count == 1 ? one : many)}";

        /// <summary>TypeScript가 선언할 때 쓰는 종류 이름(ref.object(), ref.list() 등의 이름).</summary>
        /// <param name="kind">항목의 종류.</param>
        /// <returns>종류 이름.</returns>
        private static string KindName(ViewRefs.Kind kind)
        {
            switch (kind)
            {
                case ViewRefs.Kind.Object:
                    return "object";
                case ViewRefs.Kind.List:
                    return "list";
                case ViewRefs.Kind.String:
                    return "string";
                case ViewRefs.Kind.Number:
                    return "number";
                default:
                    return "bool";
            }
        }

        /// <summary>텍스트 앞에 에디터 아이콘을 둘 수 있는 납작한 버튼을 만든다.</summary>
        /// <param name="text">버튼 문구.</param>
        /// <param name="icon">에디터 아이콘 이름. 없으면 null.</param>
        /// <param name="tooltip">툴팁.</param>
        /// <param name="clicked">누르면 할 일.</param>
        /// <returns>버튼.</returns>
        private static Button ToolbarButton(string text, string icon, string tooltip, Action clicked)
        {
            var button = new Button(clicked) { tooltip = tooltip };
            button.AddToClassList($"{Block}__button");
            if (icon != null)
            {
                var image = new Image { image = EditorGUIUtility.IconContent(icon).image };
                image.AddToClassList($"{Block}__button-icon");
                button.Add(image);
            }
            button.Add(new Label(text));
            return button;
        }

        /// <summary>
        /// 항목의 타입을 보여 주는 작은 버튼: 오브젝트가 가리키는 컴포넌트, 목록의 요소 타입, 값의 종류
        /// (툴팁에 표시). 누르면 컴포넌트를 바꾸거나(목록은 모든 항목을 한꺼번에) 항목을 다른 종류로
        /// 변환한다.
        /// </summary>
        /// <param name="entry">항목.</param>
        /// <param name="kind">항목의 종류.</param>
        /// <returns>버튼.</returns>
        private VisualElement TypeButton(SerializedProperty entry, ViewRefs.Kind kind)
        {
            Button button = null;
            button = new Button(() => ShowTypeMenu(entry, kind, button.worldBound)) { text = "▾" };
            button.AddToClassList($"{Block}__type");
            void Refresh() =>
                button.tooltip = $"{TypeLabel(entry, kind)}: click to change the component or the type";
            Refresh();
            _typeLabels.Add(Refresh);
            return button;
        }

        /// <summary>타입 버튼의 툴팁에 쓰는 항목의 타입 이름.</summary>
        /// <param name="entry">항목.</param>
        /// <param name="kind">항목의 종류.</param>
        /// <returns>컴포넌트나 요소 타입의 이름, 없으면 종류 이름.</returns>
        private static string TypeLabel(SerializedProperty entry, ViewRefs.Kind kind)
        {
            switch (kind)
            {
                case ViewRefs.Kind.Object:
                    Object value = entry.FindPropertyRelative("ObjectValue").objectReferenceValue;
                    return value == null ? KindName(kind) : value.GetType().Name;
                case ViewRefs.Kind.List:
                    Type common = CommonType(entry.FindPropertyRelative("ListValue"));
                    return common == null ? KindName(kind) : $"{common.Name}[]";
                default:
                    return KindName(kind);
            }
        }

        /// <summary>
        /// 타입 메뉴를 연다. 오브젝트와 목록은 컴포넌트를 먼저 나열하고, 모든 항목은 다른 종류로 변환할
        /// 수 있다.
        /// </summary>
        /// <param name="entry">항목.</param>
        /// <param name="kind">항목의 종류.</param>
        /// <param name="position">메뉴를 열 버튼의 영역.</param>
        private void ShowTypeMenu(SerializedProperty entry, ViewRefs.Kind kind, Rect position)
        {
            serializedObject.Update();
            var menu = new GenericMenu();
            string convert = string.Empty;
            if ((kind == ViewRefs.Kind.Object) || (kind == ViewRefs.Kind.List))
            {
                if (kind == ViewRefs.Kind.Object)
                    AddComponentItems(menu, entry.FindPropertyRelative("ObjectValue"));
                else
                    AddListComponentItems(menu, entry.FindPropertyRelative("ListValue"));
                menu.AddSeparator(string.Empty);
                convert = "Convert to/";
            }
            foreach (ViewRefs.Kind option in Enum.GetValues(typeof(ViewRefs.Kind)))
            {
                ViewRefs.Kind chosen = option;
                menu.AddItem(new GUIContent($"{convert}{KindName(chosen)}"), chosen == kind,
                    () => ChangeKind(entry, chosen));
            }
            menu.DropDown(position);
        }

        /// <summary>오브젝트가 붙은 GameObject와 그 컴포넌트를 고르는 메뉴 항목을 더한다.</summary>
        /// <param name="menu">메뉴.</param>
        /// <param name="value">오브젝트 참조 속성.</param>
        private static void AddComponentItems(GenericMenu menu, SerializedProperty value)
        {
            Object current = value.objectReferenceValue;
            GameObject gameObject = GameObjectOf(current);
            if (gameObject == null)
            {
                menu.AddDisabledItem(new GUIContent("Assign an object to pick its component"));
                return;
            }
            foreach ((string label, Object candidate) in Candidates(gameObject))
                menu.AddItem(new GUIContent(label), candidate == current, () => Assign(value, candidate));
        }

        /// <summary>목록의 모든 항목을 한꺼번에, 항목의 GameObject가 모두 가진 타입으로 바꾸는 메뉴 항목을 더한다.</summary>
        /// <param name="menu">메뉴.</param>
        /// <param name="list">오브젝트 참조 배열 속성.</param>
        private static void AddListComponentItems(GenericMenu menu, SerializedProperty list)
        {
            var gameObjects = new List<GameObject>();
            var currentTypes = new HashSet<Type>();
            for (var i = 0; i < list.arraySize; i++)
            {
                Object value = list.GetArrayElementAtIndex(i).objectReferenceValue;
                GameObject gameObject = GameObjectOf(value);
                if (gameObject == null)
                    continue;
                gameObjects.Add(gameObject);
                currentTypes.Add(value.GetType());
            }
            if (gameObjects.Count == 0)
            {
                menu.AddDisabledItem(new GUIContent("Add objects to pick their component"));
                return;
            }

            var types = new List<Type> { typeof(GameObject) };
            foreach (Component component in gameObjects[0].GetComponents<Component>())
            {
                if (component == null)
                    continue;
                Type type = component.GetType();
                if (!types.Contains(type)
                    && gameObjects.All(gameObject => gameObject.GetComponent(type) != null))
                {
                    types.Add(type);
                }
            }
            menu.AddDisabledItem(new GUIContent("Every item as"));
            foreach (Type type in types)
            {
                Type chosen = type;
                bool isCurrent = (currentTypes.Count == 1) && currentTypes.Contains(chosen);
                menu.AddItem(new GUIContent(chosen.Name), isCurrent, () =>
                {
                    list.serializedObject.Update();
                    for (var i = 0; i < list.arraySize; i++)
                    {
                        SerializedProperty item = list.GetArrayElementAtIndex(i);
                        GameObject gameObject = GameObjectOf(item.objectReferenceValue);
                        if (gameObject != null)
                        {
                            item.objectReferenceValue = chosen == typeof(GameObject)
                                ? gameObject
                                : (Object)gameObject.GetComponent(chosen);
                        }
                    }
                    list.serializedObject.ApplyModifiedProperties();
                });
            }
        }

        // ---- 오브젝트 놓기 ----------------------------------------------------------------------

        /// <summary>
        /// 오브젝트를 놓을 수 있는 곳: 밝아지고, 놓았을 때 들어갈 자리에 선을 보이며, 안내 문구가
        /// 무슨 일이 일어날지 알려 준다.
        /// </summary>
        private sealed class DropArea
        {
            /// <summary>놓기를 받는 요소.</summary>
            public readonly VisualElement Element;

            /// <summary>안내 문구를 보이는 레이블.</summary>
            public readonly Label Caption;

            /// <summary>끌고 있지 않을 때의 안내 문구.</summary>
            public readonly string Hint;

            /// <summary>놓을 자리를 정하는 행. 행을 새로 만들면 바뀌므로 그때그때 가져온다.</summary>
            public readonly Func<Rows> Slots;

            /// <summary>끄는 오브젝트 수와 Alt 여부로, 놓았을 때 일을 알리는 문구를 만든다.</summary>
            public readonly Func<int, bool, string> Describe;

            /// <summary>놓은 오브젝트를 자리, 오브젝트, Alt 여부로 넣는다.</summary>
            public readonly Action<int, Object[], bool> Insert;

            /// <summary>놓을 곳을 만든다.</summary>
            /// <param name="element">놓기를 받는 요소.</param>
            /// <param name="caption">안내 문구를 보이는 레이블.</param>
            /// <param name="hint">끌고 있지 않을 때의 안내 문구.</param>
            /// <param name="slots">놓을 자리를 정하는 행을 가져온다.</param>
            /// <param name="describe">놓았을 때 일을 알리는 문구를 만든다.</param>
            /// <param name="insert">놓은 오브젝트를 넣는다.</param>
            public DropArea(VisualElement element, Label caption, string hint, Func<Rows> slots,
                Func<int, bool, string> describe, Action<int, Object[], bool> insert)
            {
                Element = element;
                Caption = caption;
                Hint = hint;
                Slots = slots;
                Describe = describe;
                Insert = insert;
            }
        }

        /// <summary>놓을 곳이 끌기 이벤트를 받게 한다.</summary>
        /// <param name="area">놓을 곳.</param>
        private void AcceptDrops(DropArea area)
        {
            area.Element.RegisterCallback<DragUpdatedEvent>(dragEvent =>
            {
                int count = DragAndDrop.objectReferences.Length;
                // 오브젝트 필드는 자기 위에 놓은 것을 직접 받으므로 그대로 둔다.
                if ((count == 0) || IsInObjectField(dragEvent.target))
                {
                    Leave();
                    return;
                }
                DragAndDrop.visualMode = DragAndDropVisualMode.Copy;
                Hover(area, dragEvent.mousePosition.y, count, dragEvent.altKey);
                dragEvent.StopPropagation();
            });
            area.Element.RegisterCallback<DragPerformEvent>(dragEvent =>
            {
                Object[] dropped = DragAndDrop.objectReferences;
                if ((dropped.Length == 0) || IsInObjectField(dragEvent.target))
                    return;
                DragAndDrop.AcceptDrag();
                int slot = area.Slots().SlotAt(dragEvent.mousePosition.y);
                Leave();
                area.Insert(slot, dropped, dragEvent.altKey);
                dragEvent.StopPropagation();
            });
            area.Element.RegisterCallback<DragLeaveEvent>(_ =>
            {
                if (_hovered == area)
                    Leave();
            });
            area.Element.RegisterCallback<DragExitedEvent>(_ => Leave());
        }

        /// <summary>놓을 곳을 밝히고, 들어갈 자리에 선을 보이고, 안내 문구를 바꾼다.</summary>
        /// <param name="area">놓을 곳.</param>
        /// <param name="mouseY">마우스의 세로 위치.</param>
        /// <param name="count">끄는 오브젝트 수.</param>
        /// <param name="asList">Alt를 눌러 목록 하나로 넣는지.</param>
        private void Hover(DropArea area, float mouseY, int count, bool asList)
        {
            if (_hovered != area)
            {
                Leave();
                _hovered = area;
                area.Element.AddToClassList(DropTargetClass);
                area.Caption.AddToClassList(ActiveCaptionClass);
            }
            Rows slots = area.Slots();
            slots.ShowMarker(slots.SlotAt(mouseY));
            area.Caption.text = area.Describe(count, asList);
        }

        /// <summary>밝힌 놓을 곳을 원래대로 돌린다.</summary>
        private void Leave()
        {
            if (_hovered == null)
                return;
            _hovered.Element.RemoveFromClassList(DropTargetClass);
            _hovered.Caption.RemoveFromClassList(ActiveCaptionClass);
            _hovered.Caption.text = _hovered.Hint;
            _hovered.Slots()?.HideMarker();
            _hovered = null;
        }

        /// <summary>이벤트 대상이 오브젝트 필드 안에 있는지 돌려준다.</summary>
        /// <param name="target">이벤트 대상.</param>
        /// <returns>오브젝트 필드 안이면 true.</returns>
        private static bool IsInObjectField(IEventHandler target)
        {
            for (var element = target as VisualElement; element != null; element = element.parent)
            {
                if (element is ObjectField)
                    return true;
            }
            return false;
        }

        // ---- 편집 -------------------------------------------------------------------------------

        /// <summary>추가할 항목의 종류를 고르는 메뉴를 연다.</summary>
        /// <param name="position">메뉴를 열 버튼의 영역.</param>
        private void ShowAddMenu(Rect position)
        {
            var menu = new GenericMenu();
            foreach (ViewRefs.Kind kind in Enum.GetValues(typeof(ViewRefs.Kind)))
            {
                ViewRefs.Kind chosen = kind;
                menu.AddItem(new GUIContent(KindName(chosen)), false,
                    () => InsertEntries(Entries.arraySize, new[] { (chosen, "key", Array.Empty<Object>()) }));
            }
            menu.DropDown(position);
        }

        /// <summary>표에 놓은 오브젝트를 항목으로 넣는다. Alt면 목록 항목 하나로 넣는다.</summary>
        /// <param name="slot">넣을 자리.</param>
        /// <param name="dropped">놓은 오브젝트.</param>
        /// <param name="asList">Alt를 눌러 목록 하나로 넣는지.</param>
        private void InsertDropped(int slot, Object[] dropped, bool asList)
        {
            if (asList && (dropped.Length > 1))
            {
                InsertEntries(slot, new[] { (ViewRefs.Kind.List, KeyFor(dropped[0].name), dropped) });
            }
            else
            {
                InsertEntries(slot,
                    dropped.Select(value => (ViewRefs.Kind.Object, KeyFor(value.name), new[] { value })));
            }
        }

        /// <summary>항목을 넣는다. Object 항목은 <c>values</c>의 첫 값을, List 항목은 전부 받는다.</summary>
        /// <param name="slot">넣을 자리.</param>
        /// <param name="added">넣을 항목의 종류, 이름, 값.</param>
        private void InsertEntries(
            int slot, IEnumerable<(ViewRefs.Kind kind, string name, Object[] values)> added)
        {
            serializedObject.Update();
            SerializedProperty entries = Entries;
            var names = new HashSet<string>();
            for (var i = 0; i < entries.arraySize; i++)
                names.Add(entries.GetArrayElementAtIndex(i).FindPropertyRelative("Name").stringValue);

            int index = slot;
            foreach ((ViewRefs.Kind kind, string name, Object[] values) in added)
            {
                entries.InsertArrayElementAtIndex(index);
                // 새 요소는 이웃의 복사본으로 시작하므로 필드를 모두 초기화한다.
                SerializedProperty entry = entries.GetArrayElementAtIndex(index);
                entry.FindPropertyRelative("Name").stringValue = Unique(name, names);
                entry.FindPropertyRelative("Kind").intValue = (int)kind;
                entry.FindPropertyRelative("ObjectValue").objectReferenceValue =
                    ((kind == ViewRefs.Kind.Object) && (values.Length > 0))
                        ? PreferredComponent(values[0])
                        : null;
                SerializedProperty list = entry.FindPropertyRelative("ListValue");
                list.arraySize = kind == ViewRefs.Kind.List ? values.Length : 0;
                for (var i = 0; i < list.arraySize; i++)
                    list.GetArrayElementAtIndex(i).objectReferenceValue = PreferredComponent(values[i]);
                entry.FindPropertyRelative("StringValue").stringValue = string.Empty;
                entry.FindPropertyRelative("NumberValue").doubleValue = 0;
                entry.FindPropertyRelative("BoolValue").boolValue = false;
                index++;
            }
            serializedObject.ApplyModifiedProperties();
            Rebuild();
        }

        /// <summary>목록의 자리에 오브젝트를 넣는다.</summary>
        /// <param name="list">오브젝트 참조 배열 속성.</param>
        /// <param name="slot">넣을 자리.</param>
        /// <param name="values">넣을 오브젝트.</param>
        private void InsertIntoList(SerializedProperty list, int slot, Object[] values)
        {
            serializedObject.Update();
            for (var i = 0; i < values.Length; i++)
            {
                list.InsertArrayElementAtIndex(slot + i);
                list.GetArrayElementAtIndex(slot + i).objectReferenceValue = PreferredComponent(values[i]);
            }
            serializedObject.ApplyModifiedProperties();
            Rebuild();
        }

        /// <summary>
        /// 항목의 종류를 바꾼다. 오브젝트는 하나일 때와 목록일 때 사이에서 그대로 옮겨지므로, 앞뒤로
        /// 바꿔도 잃는 것이 없다.
        /// </summary>
        /// <param name="entry">항목.</param>
        /// <param name="kind">새 종류.</param>
        private void ChangeKind(SerializedProperty entry, ViewRefs.Kind kind)
        {
            serializedObject.Update();
            SerializedProperty objectValue = entry.FindPropertyRelative("ObjectValue");
            SerializedProperty list = entry.FindPropertyRelative("ListValue");
            if ((kind == ViewRefs.Kind.List)
                && (list.arraySize == 0)
                && (objectValue.objectReferenceValue != null))
            {
                list.arraySize = 1;
                list.GetArrayElementAtIndex(0).objectReferenceValue = objectValue.objectReferenceValue;
            }
            if ((kind == ViewRefs.Kind.Object)
                && (objectValue.objectReferenceValue == null)
                && (list.arraySize > 0))
            {
                objectValue.objectReferenceValue = list.GetArrayElementAtIndex(0).objectReferenceValue;
            }
            entry.FindPropertyRelative("Kind").intValue = (int)kind;
            serializedObject.ApplyModifiedProperties();
            Rebuild();
        }

        /// <summary>배열의 요소 하나를 지운다.</summary>
        /// <param name="array">배열 속성.</param>
        /// <param name="index">지울 요소의 인덱스.</param>
        private void DeleteAt(SerializedProperty array, int index)
        {
            serializedObject.Update();
            int size = array.arraySize;
            array.DeleteArrayElementAtIndex(index);
            // 일부 Unity 버전은 첫 호출에서 오브젝트 참조를 비우기만 하고 요소는 지우지 않는다.
            if (array.arraySize == size)
                array.DeleteArrayElementAtIndex(index);
            serializedObject.ApplyModifiedProperties();
            Rebuild();
        }

        /// <summary>
        /// <paramref name="names"/>에 없는 이름을 만들어 더한다. 겹치면 2부터 번호를 붙인다.
        /// </summary>
        /// <param name="name">바라는 이름.</param>
        /// <param name="names">이미 쓴 이름. 만든 이름이 더해진다.</param>
        /// <returns>겹치지 않는 이름.</returns>
        private static string Unique(string name, HashSet<string> names)
        {
            string unique = name;
            for (var n = 2; !names.Add(unique); n++)
                unique = $"{name}{n}";
            return unique;
        }

        /// <summary>
        /// 오브젝트 이름을 TypeScript가 그대로 쓸 수 있는 키로 바꾼다. "Btn_Login" → "btnLogin",
        /// "Text (TMP)" → "textTMP".
        /// </summary>
        /// <param name="objectName">오브젝트 이름.</param>
        /// <returns>camelCase 키. 쓸 글자가 없으면 "key".</returns>
        private static string KeyFor(string objectName)
        {
            var key = new StringBuilder();
            foreach (string word in Regex.Split(objectName, "[^A-Za-z0-9]+"))
            {
                if (word.Length == 0)
                    continue;
                key.Append(key.Length == 0 ? char.ToLowerInvariant(word[0]) : char.ToUpperInvariant(word[0]));
                key.Append(word, 1, word.Length - 1);
            }
            if (key.Length == 0)
                return "key";
            if (char.IsDigit(key[0]))
                key.Insert(0, '_');
            return key.ToString();
        }

        /// <summary>놓은 GameObject에서 뷰가 가장 원할 법한 컴포넌트를 고른다.</summary>
        /// <param name="dropped">놓은 오브젝트.</param>
        /// <returns>고른 컴포넌트. GameObject가 아니면 그대로, 맞는 컴포넌트가 없으면 GameObject.</returns>
        private static Object PreferredComponent(Object dropped)
        {
            if (!(dropped is GameObject gameObject))
                return dropped;
            Component[] components = gameObject.GetComponents<Component>();
            foreach (string typeName in s_preferredTypes)
            {
                foreach (Component component in components)
                {
                    if ((component != null) && IsType(component.GetType(), typeName))
                        return component;
                }
            }
            return gameObject;
        }

        /// <summary>타입이나 그 기반 타입의 전체 이름이 <paramref name="fullName"/>인지 돌려준다.</summary>
        /// <param name="type">검사할 타입.</param>
        /// <param name="fullName">타입의 전체 이름.</param>
        /// <returns>맞으면 true.</returns>
        private static bool IsType(Type type, string fullName)
        {
            for (var current = type; current != null; current = current.BaseType)
            {
                if (current.FullName == fullName)
                    return true;
            }
            return false;
        }

        /// <summary>
        /// 오브젝트 필드의 오른쪽 클릭 메뉴에 컴포넌트 선택지를 더한다. 메뉴를 열 때 만들고, 그리는
        /// 중에는 만들지 않는다.
        /// </summary>
        /// <param name="menu">오른쪽 클릭 메뉴.</param>
        /// <param name="value">오브젝트 참조 속성.</param>
        private static void AddComponentChoices(DropdownMenu menu, SerializedProperty value)
        {
            Object current = value.objectReferenceValue;
            GameObject gameObject = GameObjectOf(current);
            if (gameObject == null)
                return;
            foreach ((string label, Object candidate) in Candidates(gameObject))
            {
                menu.AppendAction($"Use/{label}", _ => Assign(value, candidate),
                    candidate == current
                        ? DropdownMenuAction.Status.Checked
                        : DropdownMenuAction.Status.Normal);
            }
        }

        /// <summary>GameObject와 그 컴포넌트를 타입으로 표시하고, 타입이 반복되면 번호를 붙인다.</summary>
        /// <param name="gameObject">GameObject.</param>
        /// <returns>표시 이름과 오브젝트의 목록.</returns>
        private static List<(string label, Object candidate)> Candidates(GameObject gameObject)
        {
            var candidates = new List<(string, Object)> { ("GameObject", gameObject) };
            var counts = new Dictionary<string, int>();
            foreach (Component component in gameObject.GetComponents<Component>())
            {
                // 없는 스크립트(missing script)는 null 컴포넌트로 나타난다.
                if (component == null)
                    continue;
                string typeName = component.GetType().Name;
                counts[typeName] = counts.TryGetValue(typeName, out int count) ? count + 1 : 1;
                string label = counts[typeName] == 1 ? typeName : $"{typeName} ({counts[typeName]})";
                candidates.Add((label, component));
            }
            return candidates;
        }

        /// <summary>오브젝트가 GameObject면 그대로, 컴포넌트면 그 GameObject를 돌려준다.</summary>
        /// <param name="value">오브젝트.</param>
        /// <returns>GameObject, 둘 다 아니면 null.</returns>
        private static GameObject GameObjectOf(Object value) =>
            value is GameObject gameObject
                ? gameObject
                : value is Component component ? component.gameObject : null;

        /// <summary>오브젝트 참조 속성에 오브젝트를 넣고 적용한다.</summary>
        /// <param name="value">오브젝트 참조 속성.</param>
        /// <param name="target">넣을 오브젝트.</param>
        private static void Assign(SerializedProperty value, Object target)
        {
            value.serializedObject.Update();
            value.objectReferenceValue = target;
            value.serializedObject.ApplyModifiedProperties();
        }

        // ---- TypeScript와 검사 ------------------------------------------------------------------

        /// <summary>항목의 TypeScript 선언을 클립보드에 복사한다.</summary>
        private void CopyTypeScript()
        {
            serializedObject.Update();
            SerializedProperty entries = Entries;
            var code = new StringBuilder();
            code.Append("// ").Append(target.name).Append("의 ViewRefs에서 가져옴.\n");
            code.Append("const refs = {\n");
            for (var i = 0; i < entries.arraySize; i++)
            {
                SerializedProperty entry = entries.GetArrayElementAtIndex(i);
                string name = entry.FindPropertyRelative("Name").stringValue;
                string key = s_identifier.IsMatch(name)
                    ? name
                    : $"\"{name.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
                code.Append("  ").Append(key).Append(": ").Append(Declaration(entry)).Append(",\n");
            }
            code.Append("};\n");
            EditorGUIUtility.systemCopyBuffer = code.ToString();
            Debug.Log($"Copied the TypeScript refs of {target.name}:\n{code}");
        }

        /// <summary>항목 하나의 TypeScript 선언(ref.object("...") 등)을 만든다.</summary>
        /// <param name="entry">항목.</param>
        /// <returns>선언.</returns>
        private static string Declaration(SerializedProperty entry)
        {
            switch ((ViewRefs.Kind)entry.FindPropertyRelative("Kind").intValue)
            {
                case ViewRefs.Kind.Object:
                    Object value = entry.FindPropertyRelative("ObjectValue").objectReferenceValue;
                    string typeName = value == null ? "UnityEngine.Object" : value.GetType().FullName;
                    return $"ref.object(\"{typeName}\")";
                case ViewRefs.Kind.List:
                    Type common = CommonType(entry.FindPropertyRelative("ListValue"));
                    return $"ref.list(\"{common?.FullName ?? "UnityEngine.Object"}\")";
                case ViewRefs.Kind.String:
                    return "ref.string()";
                case ViewRefs.Kind.Number:
                    return "ref.number()";
                default:
                    return "ref.bool()";
            }
        }

        /// <summary>목록의 모든 요소가 해당하는 가장 파생된 타입.</summary>
        /// <param name="list">오브젝트 참조 배열 속성.</param>
        /// <returns>공통 타입, 비어 있는 목록이면 null.</returns>
        private static Type CommonType(SerializedProperty list)
        {
            Type common = null;
            for (var i = 0; i < list.arraySize; i++)
            {
                Object value = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (value == null)
                    continue;
                Type type = value.GetType();
                if (common == null)
                    common = type;
                while (!common.IsAssignableFrom(type))
                    common = common.BaseType;
            }
            return common;
        }

        /// <summary>뷰가 열리지 못하게 막는 것: 없거나 겹치는 키, 지정하지 않은 오브젝트.</summary>
        /// <param name="entries">항목 배열 속성.</param>
        /// <returns>문제를 한 줄에 하나씩 적은 문구, 없으면 빈 문자열.</returns>
        private static string FindProblems(SerializedProperty entries)
        {
            var seen = new HashSet<string>();
            var problems = new List<string>();
            for (var i = 0; i < entries.arraySize; i++)
            {
                SerializedProperty entry = entries.GetArrayElementAtIndex(i);
                string name = entry.FindPropertyRelative("Name").stringValue;
                if (string.IsNullOrWhiteSpace(name))
                    problems.Add($"Entry #{i} has no key.");
                else if (!seen.Add(name))
                    problems.Add($"\"{name}\" is used more than once.");

                switch ((ViewRefs.Kind)entry.FindPropertyRelative("Kind").intValue)
                {
                    case ViewRefs.Kind.Object:
                        if (entry.FindPropertyRelative("ObjectValue").objectReferenceValue == null)
                            problems.Add($"\"{name}\" has no object.");
                        break;
                    case ViewRefs.Kind.List:
                        SerializedProperty list = entry.FindPropertyRelative("ListValue");
                        for (var j = 0; j < list.arraySize; j++)
                        {
                            if (list.GetArrayElementAtIndex(j).objectReferenceValue == null)
                            {
                                problems.Add($"\"{name}\" has an empty slot at {j}.");
                                break;
                            }
                        }
                        break;
                }
            }
            return string.Join("\n", problems);
        }

        // ---- 행 ---------------------------------------------------------------------------------

        /// <summary>
        /// 배열 하나의 행: <c>container</c>의 자식 중 <c>rowClass</c>가 붙은 것을 배열 순서대로 모은다. 행의
        /// 핸들을 끌면 그 요소가 옮겨지고, 옮기는 행이나 놓은 것이 들어갈 자리에 선이 보인다.
        /// </summary>
        private sealed class Rows
        {
            /// <summary>행을 담는 요소.</summary>
            private readonly VisualElement _container;

            /// <summary>행이 보여 주는 배열 속성.</summary>
            private readonly SerializedProperty _array;

            /// <summary>행을 가려내는 USS 클래스.</summary>
            private readonly string _rowClass;

            /// <summary>요소를 옮긴 뒤 행을 새로 만드는 함수.</summary>
            private readonly Action _rebuild;

            /// <summary>들어갈 자리를 보이는 선.</summary>
            private readonly VisualElement _marker;

            /// <summary>끌고 있는 요소의 인덱스. 끌고 있지 않으면 -1이다.</summary>
            private int _from = -1;

            /// <summary>끄는 요소가 들어갈 자리.</summary>
            private int _slot = -1;

            /// <summary>행을 만들고 선을 <paramref name="container"/>에 더한다.</summary>
            /// <param name="container">행을 담는 요소.</param>
            /// <param name="array">행이 보여 주는 배열 속성.</param>
            /// <param name="rowClass">행을 가려내는 USS 클래스.</param>
            /// <param name="rebuild">요소를 옮긴 뒤 행을 새로 만드는 함수.</param>
            public Rows(VisualElement container, SerializedProperty array, string rowClass, Action rebuild)
            {
                _container = container;
                _array = array;
                _rowClass = rowClass;
                _rebuild = rebuild;
                _marker = new VisualElement { pickingMode = PickingMode.Ignore };
                _marker.AddToClassList($"{Block}__marker");
                container.Add(_marker);
            }

            /// <summary>끌어서 <paramref name="index"/>의 요소를 옮기는 핸들을 만든다.</summary>
            /// <param name="index">요소의 인덱스.</param>
            /// <param name="text">핸들 문구.</param>
            /// <param name="className">핸들의 USS 클래스.</param>
            /// <returns>핸들.</returns>
            public VisualElement Handle(int index, string text, string className)
            {
                var handle = new Label(text) { tooltip = "Drag to reorder" };
                handle.AddToClassList(className);
                handle.RegisterCallback<PointerDownEvent>(pointerEvent =>
                {
                    if (pointerEvent.button != 0)
                        return;
                    _from = index;
                    _slot = index;
                    handle.CapturePointer(pointerEvent.pointerId);
                    pointerEvent.StopPropagation();
                });
                handle.RegisterCallback<PointerMoveEvent>(pointerEvent =>
                {
                    if ((_from < 0) || !handle.HasPointerCapture(pointerEvent.pointerId))
                        return;
                    _slot = SlotAt(pointerEvent.position.y);
                    ShowMarker(_slot);
                });
                handle.RegisterCallback<PointerUpEvent>(pointerEvent =>
                {
                    if ((_from < 0) || !handle.HasPointerCapture(pointerEvent.pointerId))
                        return;
                    handle.ReleasePointer(pointerEvent.pointerId);
                    Move();
                });
                handle.RegisterCallback<PointerCaptureOutEvent>(_ =>
                {
                    _from = -1;
                    HideMarker();
                });
                return handle;
            }

            /// <summary><paramref name="positionY"/>에 가장 가까운 틈: 0은 첫 행 위, 행의 개수는 마지막 행 아래다.</summary>
            /// <param name="positionY">세로 위치.</param>
            /// <returns>틈의 인덱스.</returns>
            public int SlotAt(float positionY)
            {
                List<VisualElement> rows = RowElements();
                for (var i = 0; i < rows.Count; i++)
                {
                    if (positionY < rows[i].worldBound.center.y)
                        return i;
                }
                return rows.Count;
            }

            /// <summary>틈에 선을 보인다.</summary>
            /// <param name="at">틈의 인덱스.</param>
            public void ShowMarker(int at)
            {
                List<VisualElement> rows = RowElements();
                float top = rows.Count == 0
                    ? 0
                    : at < rows.Count ? rows[at].layout.yMin : rows[rows.Count - 1].layout.yMax;
                _marker.style.top = top - 1;
                _marker.style.display = DisplayStyle.Flex;
                _marker.BringToFront();
            }

            /// <summary>선을 숨긴다.</summary>
            public void HideMarker() => _marker.style.display = DisplayStyle.None;

            /// <summary>행 요소를 배열 순서대로 돌려준다.</summary>
            /// <returns>행 요소.</returns>
            private List<VisualElement> RowElements() =>
                _container.Children().Where(child => child.ClassListContains(_rowClass)).ToList();

            /// <summary>끈 요소를 놓은 자리로 옮기고 행을 새로 만든다.</summary>
            private void Move()
            {
                int source = _from;
                int destination = _slot > source ? _slot - 1 : _slot;
                _from = -1;
                HideMarker();
                if ((source < 0) || (destination == source))
                    return;
                _array.serializedObject.Update();
                _array.MoveArrayElement(source, destination);
                _array.serializedObject.ApplyModifiedProperties();
                _rebuild();
            }
        }
    }
}
