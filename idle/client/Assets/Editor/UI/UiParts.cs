using System;
using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 화면이 함께 쓰는 UI 부품의 프리팹(Assets/UI/Parts): 모양별 버튼, 알림 뱃지, 탭 막대, 팝업 틀, 게이지, 토글,
    /// 슬라이더, 입력란. 테마(<see cref="UiTheme"/>)로 굽고, 화면 빌더는 부품의 인스턴스(중첩 프리팹)를 품는다. 그래서 부품을
    /// 고치면 다시 빌드하지 않은 화면에도 반영되고, diff에는 그 부품만 나온다. 화면 빌더보다 먼저 돈다(AllUiPrefabs).
    /// </summary>
    public static class UiParts
    {
        /// <summary>부품 프리팹의 폴더. 런타임이 직접 읽지 않으므로 Resources 밖이다.</summary>
        internal const string Folder = "Assets/UI/Parts";

        /// <summary>테마로 부품 프리팹을 모두 만든다.</summary>
        [MenuItem("Tools/UI/Build Parts")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            EnsureFolder();
            foreach (ButtonStyle style in Enum.GetValues(typeof(ButtonStyle)))
                BuildButton(theme, style);
            BuildBadge(theme);
            BuildTabBar(theme);
            BuildPopupFrame(theme);
            BuildGauge(theme);
            BuildToggle(theme);
            BuildSlider(theme);
            BuildInput(theme);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the UI parts in {Folder}");
        }

        /// <summary>모양에 맞는 버튼 부품을 놓는다. 글자는 비어 있다(<see cref="UiPrefabs.LabelOf"/>).</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="style">버튼 모양.</param>
        /// <returns>버튼.</returns>
        internal static Button AddButton(Transform parent, string name, ButtonStyle style) =>
            Instantiate($"Button{style}", parent, name).GetComponent<Button>();

        /// <summary>부모의 오른쪽 위 모서리에 꺼 둔 알림 뱃지를 놓는다. 탭 막대는 이 이름(Badge)으로 탭마다 찾는다.</summary>
        /// <param name="parent">뱃지를 붙일 버튼이나 탭.</param>
        /// <returns>뱃지.</returns>
        internal static GameObject AddBadge(Transform parent) => Instantiate("Badge", parent, "Badge");

        /// <summary>탭 막대를 놓는다. 자리는 부르는 쪽이 정한다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>탭 막대.</returns>
        internal static TabBar AddTabs(Transform parent, string name) =>
            Instantiate("TabBar", parent, name).GetComponent<TabBar>();

        /// <summary>화면을 덮는 어두운 바탕과 가운데 패널(팝업 틀)을 놓는다.</summary>
        /// <param name="parent">팝업의 루트.</param>
        /// <param name="panelSize">패널 크기.</param>
        /// <returns>패널.</returns>
        internal static RectTransform AddPopupFrame(Transform parent, Vector2 panelSize)
        {
            GameObject frame = Instantiate("PopupFrame", parent, "Frame");
            var panel = (RectTransform)frame.transform.Find("Panel");
            panel.sizeDelta = panelSize;
            return panel;
        }

        /// <summary>왼쪽부터 채우는 게이지를 놓는다. 자리는 부르는 쪽이 정한다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>막대와 채움(fillAmount가 비율).</returns>
        internal static (Image Track, Image Fill) AddGauge(Transform parent, string name)
        {
            GameObject gauge = Instantiate("Gauge", parent, name);
            return (gauge.GetComponent<Image>(), gauge.transform.Find("Fill").GetComponent<Image>());
        }

        /// <summary>상자와 글자로 된 토글을 놓는다. 상자와 글자 어느 쪽을 눌러도 토글된다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>토글.</returns>
        internal static Toggle AddToggle(Transform parent, string name) =>
            Instantiate("Toggle", parent, name).GetComponent<Toggle>();

        /// <summary>0~1의 슬라이더를 놓는다. 값은 놓을 때(Released) 저장된다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>슬라이더.</returns>
        internal static ReleaseSlider AddSlider(Transform parent, string name) =>
            Instantiate("Slider", parent, name).GetComponent<ReleaseSlider>();

        /// <summary>한 줄 입력란을 놓는다. 안내 글자는 비어 있다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>입력란.</returns>
        internal static TMP_InputField AddInput(Transform parent, string name) =>
            Instantiate("Input", parent, name).GetComponent<TMP_InputField>();

        /// <summary>테마 그림(칸, 줄, 띠, 알약)을 입힌 이미지를 놓는다. 탭은 받지 않는다. 자리는 부르는 쪽이 정한다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="sprite">테마의 스프라이트.</param>
        /// <param name="color">곱할 색.</param>
        /// <returns>이미지.</returns>
        internal static Image AddFrame(Transform parent, string name, Sprite sprite, Color color)
        {
            Image image = UiPrefabs.AddImage(parent, name, color);
            Paint(image, sprite, color);
            image.raycastTarget = false;
            return image;
        }

        /// <summary>
        /// 아래 판(UiSpec.Sheet)과 메인 화면의 장착 현황 판이 쓰는 면: 아래 탭 바로 위에서 <paramref name="height"/>만큼
        /// 올라오는 크림색 면 하나(Surface)다. 아래 영역의 어두운 바탕 위에 테두리 카드를 한 겹 더 두지 않고 면이 곧 바탕이며,
        /// 위아래 경계는 영웅 띠와 아래 탭 막대의 외곽선이 맡는다. 면은 양옆으로 세이프 에어리어 밖까지 늘이고 탭을 받아 뒤의
        /// 전투가 눌리지 않게 한다. 내용은 돌려준 칸(세이프 에어리어 너비)에 놓는다.
        /// </summary>
        /// <param name="parent">부모(화면의 루트).</param>
        /// <param name="theme">테마.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="height">판 높이.</param>
        /// <returns>내용을 놓을 칸.</returns>
        internal static RectTransform AddSheet(Transform parent, UiTheme theme, string name, float height)
        {
            RectTransform sheet = UiPrefabs.AddRect(parent, name);
            sheet.anchorMin = Vector2.zero;
            sheet.anchorMax = Vector2.right;
            sheet.pivot = new Vector2(0.5f, 0f);
            sheet.offsetMin = new Vector2(0f, ScreenPrefabs.NavHeight);
            sheet.offsetMax = new Vector2(0f, ScreenPrefabs.NavHeight + height);
            Image surface = UiPrefabs.AddImage(sheet, "Surface", theme.Sheet);
            surface.raycastTarget = true;
            UiPrefabs.Stretch(surface.rectTransform, new Vector2(-UiPrefabs.BleedMargin, 0f), new Vector2(UiPrefabs.BleedMargin, 0f));
            return sheet;
        }

        /// <summary>그래픽에 번호로 색을 고르는 TintView를 붙인다(장비 등급, 스킬 속성). 처음에는 0번 색이다.</summary>
        /// <param name="graphic">색을 입힐 그래픽.</param>
        /// <param name="colors">번호 순서의 색(테마의 색표).</param>
        /// <returns>TintView.</returns>
        internal static TintView AddTint(Graphic graphic, Color[] colors)
        {
            graphic.color = colors[0];
            var tint = graphic.gameObject.AddComponent<TintView>();
            var serialized = new SerializedObject(tint);
            SerializedProperty list = serialized.FindProperty("_colors");
            list.arraySize = colors.Length;
            for (var i = 0; i < colors.Length; i++)
                list.GetArrayElementAtIndex(i).colorValue = colors[i];
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return tint;
        }

        /// <summary>부품 프리팹의 인스턴스를 부모 아래에 놓는다.</summary>
        /// <param name="part">부품 이름.</param>
        /// <param name="parent">부모.</param>
        /// <param name="name">인스턴스 이름.</param>
        /// <returns>인스턴스.</returns>
        private static GameObject Instantiate(string part, Transform parent, string name)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>($"{Folder}/{part}.prefab");
            if (asset == null)
                throw new InvalidOperationException($"{Folder}/{part}.prefab is missing; run Tools/UI/Build Parts first");
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(asset, parent);
            instance.name = name;
            return instance;
        }

        /// <summary>부품 폴더가 없으면 만든다.</summary>
        private static void EnsureFolder()
        {
            if (!AssetDatabase.IsValidFolder("Assets/UI"))
                AssetDatabase.CreateFolder("Assets", "UI");
            if (!AssetDatabase.IsValidFolder(Folder))
                AssetDatabase.CreateFolder("Assets/UI", "Parts");
        }

        /// <summary>부품 하나를 만들어 저장한다.</summary>
        /// <param name="name">부품 이름(프리팹 이름).</param>
        /// <param name="build">루트를 채우는 일.</param>
        private static void Save(string name, Action<GameObject> build)
        {
            var root = new GameObject(name, typeof(RectTransform));
            try
            {
                build(root);
                PrefabIds.Save(root, $"{Folder}/{name}.prefab");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>바탕 이미지에 테마의 스프라이트를 입힌다. 9-slice 테두리가 있으면 늘인다. 스프라이트가 없으면 사각형이다.</summary>
        /// <param name="image">이미지.</param>
        /// <param name="sprite">스프라이트.</param>
        /// <param name="color">색.</param>
        internal static void Paint(Image image, Sprite sprite, Color color)
        {
            image.sprite = sprite;
            image.type = (sprite != null) && (sprite.border != Vector4.zero) ? Image.Type.Sliced : Image.Type.Simple;
            image.color = color;
        }

        /// <summary>모양 하나의 버튼: 바탕 이미지, ColorTint 버튼, 가운데 글자.</summary>
        /// <param name="theme">테마.</param>
        /// <param name="style">버튼 모양.</param>
        private static void BuildButton(UiTheme theme, ButtonStyle style) => Save($"Button{style}", root =>
        {
            ((RectTransform)root.transform).sizeDelta = new Vector2(360f, 120f);
            var image = root.AddComponent<Image>();
            Paint(image, theme.ButtonSprite, theme.Of(style));
            var button = root.AddComponent<Button>();
            button.targetGraphic = image;
            button.colors = theme.ButtonColors;
            TMP_Text label = UiPrefabs.AddText(root.transform, "Text (TMP)", theme.BodySize, Vector2.zero, Vector2.one);
            label.color = theme.Text;
            // 아래 턱만큼 글자를 올려 윗면의 가운데에 둔다.
            label.rectTransform.offsetMin = new Vector2(12f, 10f);
            label.rectTransform.offsetMax = new Vector2(-12f, 0f);
            label.enableAutoSizing = true;
            label.fontSizeMin = theme.TinySize;
            label.fontSizeMax = theme.BodySize;
        });

        /// <summary>오른쪽 위 모서리에서 조금 바깥으로 나온 빨간 점. 꺼 둔 채로 두고 TypeScript가 켠다.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildBadge(UiTheme theme) => Save("Badge", root =>
        {
            var dot = root.AddComponent<Image>();
            Paint(dot, theme.DotSprite, theme.Badge);
            dot.type = Image.Type.Simple;
            dot.raycastTarget = false;
            UiPrefabs.Place(dot, Vector2.one, new Vector2(12f, 12f), new Vector2(46f, 46f));
            root.SetActive(false);
        });

        /// <summary>
        /// 세그먼트 탭 막대: 어두운 홈 안에 탭을 고르게 나눠 붙인다. 탭은 꺼 둔 틀 버튼을 TypeScript가 정한 수만큼 복제한 것이고,
        /// 고른 탭은 누를 수 없게 되어 비활성 색(주황)의 납작한 칸으로 채워지며, 나머지는 칸이 투명해 홈 위의 글자만 보인다.
        /// 버튼처럼 떠 있지 않아 고르는 탭으로 읽힌다. 틀에는 꺼 둔 알림 뱃지가 있어 탭마다 복제된다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildTabBar(UiTheme theme) => Save("TabBar", root =>
        {
            ((RectTransform)root.transform).sizeDelta = new Vector2(900f, theme.TabHeight);
            var track = root.AddComponent<Image>();
            Paint(track, theme.PillSprite, theme.Pill);
            var layout = root.AddComponent<HorizontalLayoutGroup>();
            layout.padding = new RectOffset(7, 7, 7, 7);
            layout.spacing = 4f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = true;

            var template = new GameObject("TabTemplate", typeof(RectTransform), typeof(Image), typeof(Button));
            template.transform.SetParent(root.transform, false);
            var image = template.GetComponent<Image>();
            Paint(image, theme.ChipSprite, Color.white);
            var button = template.GetComponent<Button>();
            button.targetGraphic = image;
            ColorBlock colors = theme.ButtonColors;
            // 고르지 않은 탭은 칸이 보이지 않고, 누르는 동안만 옅게 비친다.
            colors.normalColor = new Color(1f, 1f, 1f, 0f);
            colors.highlightedColor = new Color(1f, 1f, 1f, 0f);
            colors.pressedColor = new Color(1f, 1f, 1f, 0.25f);
            // 누른 뒤에도 선택 상태로 밝게 남지 않게 보통 색과 같게 둔다.
            colors.selectedColor = colors.normalColor;
            colors.disabledColor = theme.Accent;
            button.colors = colors;
            TMP_Text label = UiPrefabs.AddText(template.transform, "Text (TMP)", theme.LabelSize, Vector2.zero, Vector2.one);
            label.color = theme.Text;
            label.rectTransform.offsetMin = new Vector2(8f, 2f);
            label.rectTransform.offsetMax = new Vector2(-8f, 0f);
            AddBadge(template.transform);
            template.SetActive(false);

            var tabs = root.AddComponent<TabBar>();
            UiPrefabs.SetField(tabs, "_template", button);
        });

        /// <summary>
        /// 화면을 덮는 어두운 바탕과 그 가운데의 패널. 바탕은 세이프 에어리어 밖까지 덮고 탭을 받아 아래 화면이 눌리지 않는다.
        /// 패널의 크기와 내용은 화면이 정한다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildPopupFrame(UiTheme theme) => Save("PopupFrame", root =>
        {
            UiPrefabs.Bleed((RectTransform)root.transform);
            root.AddComponent<Image>().color = theme.Dim;
            Image panel = UiPrefabs.AddImage(root.transform, "Panel", theme.Panel);
            Paint(panel, theme.PanelSprite, theme.Panel);
            panel.rectTransform.sizeDelta = new Vector2(960f, 1400f);

            var motion = root.AddComponent<PopupMotion>();
            UiPrefabs.SetField(motion, "_group", root.GetComponent<CanvasGroup>());
            UiPrefabs.SetField(motion, "_panel", panel.rectTransform);
        });

        /// <summary>
        /// 왼쪽부터 채우는 게이지: 어두운 알약 막대와 그 안(외곽선 안쪽)을 채우는 Filled 이미지. 처음에는 비어 있고 탭을 받지
        /// 않는다. 높이는 놓는 쪽이 정한다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildGauge(UiTheme theme) => Save("Gauge", root =>
        {
            ((RectTransform)root.transform).sizeDelta = new Vector2(520f, 40f);
            var track = root.AddComponent<Image>();
            Paint(track, theme.PillSprite, theme.Pill);
            track.raycastTarget = false;
            Image fill = UiPrefabs.AddImage(root.transform, "Fill", theme.Good);
            fill.raycastTarget = false;
            UiPrefabs.Stretch(fill.rectTransform, new Vector2(5f, 5f), new Vector2(-5f, -5f));
            // Filled는 스프라이트가 있어야 채운다.
            fill.sprite = theme.GaugeSprite;
            fill.type = Image.Type.Filled;
            fill.fillMethod = Image.FillMethod.Horizontal;
            fill.fillOrigin = (int)Image.OriginHorizontal.Left;
            fill.fillAmount = 0f;
        });

        /// <summary>
        /// 왼쪽의 상자와 오른쪽 글자로 된 토글(너비 240). 글자도 탭을 받아 어느 쪽을 눌러도 토글된다. 처음에는 꺼져 있고 글자는
        /// 비어 있다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildToggle(UiTheme theme) => Save("Toggle", root =>
        {
            ((RectTransform)root.transform).sizeDelta = new Vector2(240f, 150f);
            Image box = UiPrefabs.AddImage(root.transform, "Background", theme.Positive);
            Paint(box, theme.TileSprite, theme.Positive);
            UiPrefabs.Place(box, new Vector2(0f, 0.5f), Vector2.zero, new Vector2(70f, 70f));
            Image check = UiPrefabs.AddImage(box.transform, "Checkmark", theme.Text);
            check.sprite = theme.CheckSprite;
            check.raycastTarget = false;
            UiPrefabs.Stretch(check.rectTransform, new Vector2(8f, 8f), new Vector2(-8f, -8f));

            TMP_Text label = UiPrefabs.AddText(root.transform, "Label", theme.LabelSize, Vector2.zero, Vector2.one);
            label.rectTransform.offsetMin = new Vector2(90f, 0f);
            label.alignment = TextAlignmentOptions.MidlineLeft;
            theme.Inked(label, theme.Ink);
            // 글자를 눌러도 토글되게 글자가 탭을 받는다. 탭은 부모의 Toggle로 올라간다.
            label.raycastTarget = true;

            var toggle = root.AddComponent<Toggle>();
            toggle.targetGraphic = box;
            toggle.graphic = check;
            toggle.colors = theme.ButtonColors;
            toggle.isOn = false;
        });

        /// <summary>
        /// 0~1의 볼륨 슬라이더: 가운데 40% 높이의 알약 막대와 채움, 동그란 손잡이. 키보드·게임패드로는 움직이지 않게 해서, 값은
        /// 놓을 때(Released) 저장된다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildSlider(UiTheme theme) => Save("Slider", root =>
        {
            ((RectTransform)root.transform).sizeDelta = new Vector2(420f, 70f);
            Image background = UiPrefabs.AddImage(root.transform, "Background", theme.Pill);
            Paint(background, theme.PillSprite, theme.Pill);
            SetBand(background.rectTransform);
            RectTransform fillArea = UiPrefabs.AddRect(root.transform, "Fill Area");
            SetBand(fillArea);
            // 막대의 외곽선 안쪽만 채운다.
            fillArea.offsetMin = new Vector2(5f, 5f);
            fillArea.offsetMax = new Vector2(-5f, -5f);
            Image fill = UiPrefabs.AddImage(fillArea, "Fill", theme.Accent);
            fill.sprite = theme.GaugeSprite;
            UiPrefabs.Stretch(fill.rectTransform, Vector2.zero, Vector2.zero);
            // 손잡이의 가운데가 양 끝에 닿도록 손잡이 폭의 절반만큼 안쪽에서 움직인다.
            RectTransform handleArea = UiPrefabs.AddRect(root.transform, "Handle Slide Area");
            UiPrefabs.Stretch(handleArea, new Vector2(35f, 0f), new Vector2(-35f, 0f));
            Image handle = UiPrefabs.AddImage(handleArea, "Handle", theme.Text);
            handle.sprite = theme.DotSprite;
            handle.rectTransform.sizeDelta = new Vector2(70f, 0f);

            var slider = root.AddComponent<ReleaseSlider>();
            slider.fillRect = fill.rectTransform;
            slider.handleRect = handle.rectTransform;
            slider.targetGraphic = handle;
            slider.colors = theme.ButtonColors;
            slider.direction = Slider.Direction.LeftToRight;
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.value = 1f;
            slider.navigation = new Navigation { mode = Navigation.Mode.None };
        });

        /// <summary>슬라이더 높이의 가운데 40%를 가로로 채운다(막대와 채움).</summary>
        /// <param name="rect">막대나 채움 영역.</param>
        private static void SetBand(RectTransform rect)
        {
            rect.anchorMin = new Vector2(0f, 0.3f);
            rect.anchorMax = new Vector2(1f, 0.7f);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        /// <summary>한 줄 입력란: 바탕, 글자 영역, 안내 글자(기울임, 반투명), 입력 글자.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildInput(UiTheme theme)
        {
            GameObject made = TMP_DefaultControls.CreateInputField(new TMP_DefaultControls.Resources());
            try
            {
                made.name = "Input";
                ((RectTransform)made.transform).sizeDelta = new Vector2(760f, 130f);
                Paint(made.GetComponent<Image>(), theme.InputSprite, theme.InputBackground);
                var field = made.GetComponent<TMP_InputField>();
                field.lineType = TMP_InputField.LineType.SingleLine;
                field.textComponent.fontSize = theme.BodySize;
                field.textComponent.color = theme.InputText;
                field.textComponent.alignment = TextAlignmentOptions.MidlineLeft;
                var placeholder = (TMP_Text)field.placeholder;
                placeholder.fontSize = theme.BodySize;
                placeholder.alignment = TextAlignmentOptions.MidlineLeft;
                placeholder.text = string.Empty;
                placeholder.color = new Color(theme.InputText.r, theme.InputText.g, theme.InputText.b, 0.5f);
                PrefabIds.Save(made, $"{Folder}/Input.prefab");
            }
            finally
            {
                Object.DestroyImmediate(made);
            }
        }
    }
}
