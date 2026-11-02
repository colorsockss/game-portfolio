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
    /// 화면 레이어의 두 화면(Remote/UI/MainScreen, LoginScreen)을 테마와 부품으로 처음부터 만든다. 메인 화면은 위쪽
    /// 막대(제목, 재화 바, 경험치 막대), 스테이지와 처치 수, 보스 도전과 다음 스테이지 버튼, 아래쪽 버튼 줄(로그아웃, 가방, 장비,
    /// 설정)이고, 로그인 화면은 가운데 카드(제목, ID 입력란, 로그인 버튼, 상태 문구)다. 바탕은 세이프 에어리어 밖까지 늘이고,
    /// 고정 글자는 비워 ViewRefs 항목(…Label)으로 내놓는다. 재화 바를 품으므로 위젯 빌더 다음에 돈다. 배치 모드에서는 다음을
    /// 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.ScreenPrefabs.Build
    /// </code>
    /// </summary>
    public static class ScreenPrefabs
    {
        /// <summary>메인 화면 위쪽 막대의 높이.</summary>
        private const float TopBarHeight = 160f;

        /// <summary>아래쪽 버튼 줄의 버튼 하나의 너비. 다섯 개와 그 사이 틈이 기준 너비(1080)에 양옆 20씩 남기고 들어간다.</summary>
        private const float MainButtonWidth = 192f;

        /// <summary>아래쪽 버튼 줄의 가운데가 화면 아래 가장자리에서 떨어진 거리.</summary>
        private const float MainButtonY = 95f;

        /// <summary>아래쪽 버튼 줄의 버튼 하나의 높이.</summary>
        private const float MainButtonHeight = 110f;

        /// <summary>아래쪽 버튼의 아이콘 한 변. 위 가장자리에서 6만큼 띄우고 그 아래(높이의 40%)에 글자가 온다.</summary>
        private const float MainIconSize = 58f;

        /// <summary>오른쪽 위 설정 버튼(아이콘만)의 한 변.</summary>
        private const float SettingsButtonSize = 100f;

        /// <summary>설정 버튼과 오른쪽 가장자리, 위쪽 막대 사이의 틈.</summary>
        private const float SettingsButtonInset = 40f;

        /// <summary>
        /// 설정 버튼이 오른쪽 가장자리에서 차지하는 너비. 같은 높이에 뜨는 튜토리얼 대사 창(TutorialPrefabs)이 이만큼 오른쪽을
        /// 비운다.
        /// </summary>
        internal const float SettingsButtonReach = SettingsButtonInset + SettingsButtonSize;

        /// <summary>메인 화면과 로그인 화면을 만든다.</summary>
        [MenuItem("Tools/UI/Build Screen Prefabs")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            BuildMainScreen(theme);
            BuildLoginScreen(theme);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the main and login screens in {UiPrefabs.Folder}");
        }

        /// <summary>메인 화면을 만든다. 전투 월드가 뒤에 비치도록 루트 바탕은 투명하다.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildMainScreen(UiTheme theme)
        {
            var root = new GameObject("MainScreen", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                UiPrefabs.Stretch((RectTransform)root.transform, Vector2.zero, Vector2.zero);
                root.GetComponent<Image>().color = new Color(theme.Panel.r, theme.Panel.g, theme.Panel.b, 0f);
                var refs = new List<(string Name, Object Target)>();

                // 아래 패널(화면 아래 40%)은 아래와 양옆으로 세이프 에어리어 밖까지 늘인다.
                Image bottomPanel = UiPrefabs.AddImage(root.transform, "BottomPanel", theme.Panel);
                bottomPanel.rectTransform.anchorMin = Vector2.zero;
                bottomPanel.rectTransform.anchorMax = new Vector2(1f, 0.4f);
                bottomPanel.rectTransform.pivot = new Vector2(0.5f, 0f);
                bottomPanel.rectTransform.offsetMin = new Vector2(-UiPrefabs.BleedMargin, -UiPrefabs.BleedMargin);
                bottomPanel.rectTransform.offsetMax = new Vector2(UiPrefabs.BleedMargin, 0f);

                refs.AddRange(AddTopBar(root.transform, theme));

                refs.Add(("stageLabel", AddCentered(root.transform, "StageLabel", TextStyle.Label, 740f, 900f, 50f)));
                refs.Add(("stageText", AddCentered(root.transform, "Stage", TextStyle.Large, 675f, 960f, 80f)));
                TMP_Text waves = AddCentered(root.transform, "WavesText", TextStyle.Body, 600f, 400f, 70f);
                waves.rectTransform.anchoredPosition = new Vector2(-220f, 600f);
                TMP_Text bossTime = AddCentered(root.transform, "BossTimeText", TextStyle.Body, 600f, 400f, 70f);
                bossTime.rectTransform.anchoredPosition = new Vector2(220f, 600f);
                refs.Add(("wavesText", waves));
                refs.Add(("bossTimeText", bossTime));

                refs.AddRange(AddButton(root.transform, "BossButton", "boss", ButtonStyle.Danger, 505f, 760f, 110f));
                refs.AddRange(AddButton(
                    root.transform, "NextStageButton", "nextStage", ButtonStyle.Primary, 370f, 760f, 130f));

                // 아래쪽 버튼 한 줄(강화, 스킬, 장비, 가방, 환생)을 같은 너비로 가운데에 늘어놓는다. 장비 버튼에는 더 좋은 장비의
                // 알림 뱃지가 있다.
                (string Object, string Name, ButtonStyle Style)[] row =
                {
                    ("UpgradeButton", "upgrade", ButtonStyle.Positive),
                    ("SkillsButton", "skills", ButtonStyle.Positive),
                    ("EquipmentButton", "equipment", ButtonStyle.Positive),
                    ("InventoryButton", "inventory", ButtonStyle.Positive),
                    ("RebirthButton", "rebirth", ButtonStyle.Danger),
                };
                for (var i = 0; i < row.Length; i++)
                {
                    float x = (i - ((row.Length - 1) / 2f)) * (MainButtonWidth + theme.Spacing);
                    (string Name, Object Target)[] button = AddButton(
                        root.transform, row[i].Object, row[i].Name, row[i].Style, MainButtonY, MainButtonWidth, MainButtonHeight);
                    var rect = (RectTransform)((Button)button[0].Target).transform;
                    rect.anchoredPosition = new Vector2(x, MainButtonY);
                    // 아이콘은 글자 위에 둔다. 버튼 너비에 나란히 두면 영어 이름(Equipment)이 넘친다.
                    Image icon = UiIcons.AddFixed(rect, "Icon", UiIcons.Get($"main_{row[i].Name}"));
                    UiPrefabs.Place(icon, new Vector2(0.5f, 1f), new Vector2(0f, -6f), new Vector2(MainIconSize, MainIconSize));
                    var label = (TMP_Text)button[1].Target;
                    label.fontSize = theme.SmallSize;
                    label.rectTransform.anchorMin = Vector2.zero;
                    label.rectTransform.anchorMax = new Vector2(1f, 0.4f);
                    label.rectTransform.offsetMin = Vector2.zero;
                    label.rectTransform.offsetMax = Vector2.zero;
                    refs.AddRange(button);
                    if (row[i].Name == "equipment")
                        refs.Add(("equipmentBadge", UiParts.AddBadge(rect)));
                }

                // 설정은 전투 화면 오른쪽 위(위쪽 막대 바로 아래)의 아이콘만 있는 버튼이다. 로그아웃은 설정 화면 안에 있다.
                Button settings = UiParts.AddButton(root.transform, "SettingsButton", ButtonStyle.Secondary);
                UiPrefabs.Place(
                    settings, Vector2.one, new Vector2(-SettingsButtonInset, -(TopBarHeight + SettingsButtonInset)),
                    new Vector2(SettingsButtonSize, SettingsButtonSize));
                UiPrefabs.LabelOf(settings).gameObject.SetActive(false);
                Image gear = UiIcons.AddFixed(settings.transform, "Icon", UiIcons.Get("main_settings"));
                UiPrefabs.Stretch(gear.rectTransform, new Vector2(14f, 14f), new Vector2(-14f, -14f));
                refs.Add(("settingsButton", settings));

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), refs.ToArray());
                UiPrefabs.Save(root, "MainScreen");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 위쪽 막대: 왼쪽의 제목(아이디, 레벨, 경험치 비율)과 그 아래 경험치 막대, 오른쪽의 재화 바. 막대에는 가장자리에 붙인
        /// 자식이 있어 막대 자체는 늘이지 않고, 같은 색의 막을 위로 세이프 에어리어 밖까지 늘인다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddTopBar(Transform root, UiTheme theme)
        {
            Image bar = UiPrefabs.AddImage(root, "TopBar", theme.Surface);
            bar.rectTransform.anchorMin = new Vector2(0f, 1f);
            bar.rectTransform.anchorMax = Vector2.one;
            bar.rectTransform.pivot = new Vector2(0.5f, 1f);
            bar.rectTransform.anchoredPosition = Vector2.zero;
            bar.rectTransform.sizeDelta = new Vector2(0f, TopBarHeight);

            Image bleed = UiPrefabs.AddImage(bar.transform, "TopBleed", theme.Surface);
            bleed.raycastTarget = false;
            bleed.rectTransform.anchorMin = Vector2.up;
            bleed.rectTransform.anchorMax = Vector2.one;
            bleed.rectTransform.offsetMin = new Vector2(-UiPrefabs.BleedMargin, 0f);
            bleed.rectTransform.offsetMax = new Vector2(UiPrefabs.BleedMargin, UiPrefabs.BleedMargin);

            TMP_Text title = UiPrefabs.AddText(bar.transform, "Title", 52f, Vector2.zero, Vector2.one);
            title.alignment = TextAlignmentOptions.Left;
            title.textWrappingMode = TextWrappingModes.Normal;
            UiPrefabs.Place(title, new Vector2(0f, 0.5f), new Vector2(50f, 0f), new Vector2(520f, 120f));

            var currencyBar = (GameObject)PrefabUtility.InstantiatePrefab(
                AssetDatabase.LoadAssetAtPath<GameObject>($"{UiPrefabs.Folder}/CurrencyBar.prefab"), bar.transform);
            UiPrefabs.Place(currencyBar.transform, new Vector2(1f, 0.5f), new Vector2(-50f, 0f), new Vector2(460f, 120f));

            // 제목(왼쪽 50~570) 아래의 얇은 막대.
            (Image track, Image fill) = UiParts.AddGauge(bar.transform, "ExpBar");
            track.color = theme.Panel;
            UiPrefabs.Place(track, Vector2.zero, new Vector2(50f, 14f), new Vector2(520f, 14f));

            return new (string Name, Object Target)[]
            {
                ("titleText", title), ("currencyBar", currencyBar.GetComponent<ViewRefs>()), ("expBar", fill),
            };
        }

        /// <summary>로그인 화면을 만든다: 세이프 에어리어 밖까지 덮는 바탕과 가운데 카드.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildLoginScreen(UiTheme theme)
        {
            var root = new GameObject("LoginScreen", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                UiPrefabs.Bleed((RectTransform)root.transform);
                root.GetComponent<Image>().color = theme.Panel;

                Image card = UiPrefabs.AddImage(root.transform, "Card", theme.Surface);
                card.sprite = theme.ButtonSprite;
                card.type = Image.Type.Sliced;
                card.rectTransform.sizeDelta = new Vector2(880f, 560f);

                TMP_Text title = UiPrefabs.AddText(card.transform, "Title", 80f, Vector2.zero, Vector2.one);
                title.textWrappingMode = TextWrappingModes.Normal;
                title.rectTransform.anchorMin = new Vector2(0.5f, 1f);
                title.rectTransform.anchorMax = new Vector2(0.5f, 1f);
                title.rectTransform.anchoredPosition = new Vector2(0f, 100f);
                title.rectTransform.sizeDelta = new Vector2(960f, 140f);

                TMP_InputField input = UiParts.AddInput(card.transform, "IdInput");
                ((RectTransform)input.transform).anchoredPosition = new Vector2(0f, 160f);
                input.characterLimit = 16;
                input.textComponent.fontSize = 52f;
                var placeholder = (TMP_Text)input.placeholder;
                placeholder.fontSize = 52f;

                (string Name, Object Target)[] login = AddButton(
                    card.transform, "LoginButton", "login", ButtonStyle.Primary, 0f, 760f, 140f);
                var loginRect = (RectTransform)((Button)login[0].Target).transform;
                loginRect.anchorMin = new Vector2(0.5f, 0.5f);
                loginRect.anchorMax = new Vector2(0.5f, 0.5f);
                loginRect.anchoredPosition = Vector2.zero;

                TMP_Text status = UiPrefabs.AddText(card.transform, "Status", TextStyle.Label, Vector2.zero, Vector2.one);
                status.textWrappingMode = TextWrappingModes.Normal;
                status.rectTransform.anchorMin = new Vector2(0.5f, 0.5f);
                status.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
                status.rectTransform.anchoredPosition = new Vector2(0f, -170f);
                status.rectTransform.sizeDelta = new Vector2(760f, 140f);

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(),
                    ("idInput", input), ("loginButton", login[0].Target), ("statusText", status), ("titleLabel", title),
                    ("loginLabel", login[1].Target), ("idPlaceholder", placeholder));
                UiPrefabs.Save(root, "LoginScreen");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>화면 아래 가운데를 기준으로 높이 <paramref name="y"/>에 가운데를 둔 글자를 만든다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="style">글자 모양.</param>
        /// <param name="y">아래 가장자리에서 가운데까지.</param>
        /// <param name="width">너비.</param>
        /// <param name="height">높이.</param>
        /// <returns>글자.</returns>
        private static TMP_Text AddCentered(
            Transform parent, string name, TextStyle style, float y, float width, float height)
        {
            TMP_Text text = UiPrefabs.AddText(parent, name, style, Vector2.zero, Vector2.one);
            text.textWrappingMode = TextWrappingModes.Normal;
            RectTransform rect = text.rectTransform;
            rect.anchorMin = new Vector2(0.5f, 0f);
            rect.anchorMax = new Vector2(0.5f, 0f);
            rect.anchoredPosition = new Vector2(0f, y);
            rect.sizeDelta = new Vector2(width, height);
            return text;
        }

        /// <summary>
        /// 화면 아래 가운데를 기준으로 높이 <paramref name="y"/>에 가운데를 둔 버튼을 놓고, 이름에 Button과 Label을 붙인
        /// ViewRefs 항목(버튼, 글자)을 돌려준다.
        /// </summary>
        /// <param name="parent">부모.</param>
        /// <param name="objectName">오브젝트 이름.</param>
        /// <param name="name">항목 이름의 앞부분.</param>
        /// <param name="style">버튼 모양.</param>
        /// <param name="y">아래 가장자리에서 가운데까지.</param>
        /// <param name="width">너비.</param>
        /// <param name="height">높이.</param>
        /// <returns>버튼과 글자 항목.</returns>
        private static (string Name, Object Target)[] AddButton(
            Transform parent, string objectName, string name, ButtonStyle style, float y, float width, float height)
        {
            Button button = UiParts.AddButton(parent, objectName, style);
            var rect = (RectTransform)button.transform;
            rect.anchorMin = new Vector2(0.5f, 0f);
            rect.anchorMax = new Vector2(0.5f, 0f);
            rect.anchoredPosition = new Vector2(0f, y);
            rect.sizeDelta = new Vector2(width, height);
            return new (string Name, Object Target)[] { ($"{name}Button", button), ($"{name}Label", UiPrefabs.LabelOf(button)) };
        }
    }
}
