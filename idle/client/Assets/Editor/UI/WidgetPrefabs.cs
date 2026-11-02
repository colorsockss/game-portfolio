using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 공용 위젯의 프리팹(Remote/UI/CurrencySlot, CurrencyBar, ConfirmPopup, RewardPopup, Toast, Loading)과 앱에 드는 부트의
    /// 패치 화면(Resources/UI/TransitionScreen, NoticePopup)을 테마와 부품으로 만든다. 고정 글자는 비워 ViewRefs 항목(…Label)으로 내놓는다(TypeScript가
    /// 지금 언어로 채운다). 다시 실행하면 같은 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.WidgetPrefabs.Build
    /// </code>
    /// </summary>
    public static class WidgetPrefabs
    {
        /// <summary>위젯 프리팹을 모두 만든다.</summary>
        [MenuItem("Tools/UI/Build Widget Prefabs")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            BuildCurrencyBar(BuildCurrencySlot(theme), theme);
            BuildConfirmPopup();
            BuildNoticePopup();
            BuildRewardPopup(theme);
            BuildToast(theme);
            BuildLoading(theme);
            BuildTransitionScreen(theme);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the widget prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>재화 바의 한 칸(이름표나 아이콘, 굴러가는 수량)을 만든다. 재화 바의 ViewList가 이것을 틀로 복제한다.</summary>
        /// <param name="theme">테마.</param>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildCurrencySlot(UiTheme theme)
        {
            var root = new GameObject(
                "CurrencySlot", typeof(RectTransform), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(460f, 120f);
                var element = root.GetComponent<LayoutElement>();
                element.preferredWidth = 460f;
                element.preferredHeight = 120f;

                TMP_Text label = UiPrefabs.AddText(root.transform, "Name", TextStyle.Label, Vector2.zero, Vector2.up);
                label.rectTransform.offsetMax = new Vector2(120f, 0f);
                // 재화 바는 이름 대신 아이콘을, 장비의 능력치 칸은 아이콘 없이 이름을 보인다(같은 자리).
                IconView icon = UiIcons.Add(root.transform, "Icon");
                UiPrefabs.Place(icon, new Vector2(0f, 0.5f), new Vector2(20f, 0f), new Vector2(80f, 80f));

                TMP_Text amount = UiPrefabs.AddText(root.transform, "Amount", 52f, Vector2.zero, Vector2.one);
                amount.rectTransform.offsetMin = new Vector2(140f, 0f);
                amount.text = "0";
                amount.color = theme.Gold;
                amount.alignment = TextAlignmentOptions.Right;
                var rolling = amount.gameObject.AddComponent<RollingText>();
                UiPrefabs.SetField(rolling, "_label", amount);

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("nameText", label), ("icon", icon), ("amountText", rolling));
                return UiPrefabs.Save(root, "CurrencySlot");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 재화마다 칸 하나를 오른쪽부터 가로로 늘어놓는 재화 바를 만든다. 다른 화면에 중첩해 쓰고, 피벗이 오른쪽이라
        /// 재화가 늘면 왼쪽으로 넓어진다.
        /// </summary>
        /// <param name="slot">칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="theme">테마.</param>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildCurrencyBar(GameObject slot, UiTheme theme)
        {
            var root = new GameObject(
                "CurrencyBar",
                typeof(RectTransform), typeof(HorizontalLayoutGroup), typeof(ContentSizeFitter),
                typeof(ViewList), typeof(ViewRefs));
            try
            {
                UiPrefabs.Place(root.transform, new Vector2(1f, 0.5f), Vector2.zero, new Vector2(460f, 120f));
                var layout = root.GetComponent<HorizontalLayoutGroup>();
                layout.spacing = theme.Spacing;
                layout.childAlignment = TextAnchor.MiddleRight;
                layout.childControlWidth = true;
                layout.childControlHeight = true;
                layout.childForceExpandWidth = false;
                layout.childForceExpandHeight = true;
                root.GetComponent<ContentSizeFitter>().horizontalFit = ContentSizeFitter.FitMode.PreferredSize;

                var template = (GameObject)PrefabUtility.InstantiatePrefab(slot, root.transform);
                template.SetActive(false);
                var list = root.GetComponent<ViewList>();
                UiPrefabs.SetField(list, "_template", template.GetComponent<ViewRefs>());

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("currencies", list));
                return UiPrefabs.Save(root, "CurrencyBar");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>묻는 말과 취소·확인 버튼을 가진 팝업을 만든다.</summary>
        private static void BuildConfirmPopup() =>
            UiSpec.Popup("ConfirmPopup", 840f, 520f)
                .Footer(120f, ("cancel", ButtonStyle.Secondary, 360f), ("ok", ButtonStyle.Secondary, 360f))
                .Body("messageText", TextStyle.Body, TextAlignmentOptions.Center)
                .Save();

        /// <summary>
        /// 알리는 말과 가운데의 확인 버튼 하나를 가진 팝업을 만든다. 부트가 패치를 받지 못했을 때 다시 시도를 기다리는 데
        /// 쓰므로 앱에 든다.
        /// </summary>
        private static void BuildNoticePopup() =>
            UiSpec.Popup("NoticePopup", 840f, 520f)
                .Footer(120f, ("ok", ButtonStyle.Secondary, 360f))
                .Body("messageText", TextStyle.Body, TextAlignmentOptions.Center)
                .Save(inApp: true);

        /// <summary>제목, 모은 시간, 오른 레벨, 받은 아이템 줄과 받기 버튼을 가진 보상 팝업을 만든다.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildRewardPopup(UiTheme theme) =>
            UiSpec.Popup("RewardPopup", 900f, 1000f)
                .Space(20f)
                .Text("titleLabel", TextStyle.Title, 100f)
                .Text("durationText", TextStyle.Label, 70f, gap: 0f)
                .Text("levelText", TextStyle.Body, 80f, gap: 10f, configure: text =>
                {
                    text.fontSize = 52f;
                    text.color = theme.Good;
                })
                .Footer(130f, ("ok", ButtonStyle.Secondary, 400f))
                .Body("itemsText", TextStyle.Body, TextAlignmentOptions.Top)
                .Save();

        /// <summary>
        /// 아래 패널 바로 위에 뜨는 토스트를 만든다. 처음에는 투명하고 탭을 받지 않아서, 앱 내내 열어 두어도 아래
        /// 화면을 가리지 않는다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildToast(UiTheme theme)
        {
            var root = new GameObject(
                "Toast",
                typeof(RectTransform), typeof(CanvasGroup), typeof(Image), typeof(Toast), typeof(ViewRefs));
            try
            {
                UiPrefabs.Place(
                    root.transform, new Vector2(0.5f, 0.45f), Vector2.zero, new Vector2(900f, 110f));
                var group = root.GetComponent<CanvasGroup>();
                group.alpha = 0f;
                group.blocksRaycasts = false;
                group.interactable = false;
                var background = root.GetComponent<Image>();
                background.color = theme.Notice;
                background.raycastTarget = false;

                TMP_Text label = UiPrefabs.AddText(root.transform, "Text", theme.LabelSize, Vector2.zero, Vector2.one);
                label.rectTransform.offsetMin = new Vector2(theme.Padding, 0f);
                label.rectTransform.offsetMax = new Vector2(-theme.Padding, 0f);

                var toast = root.GetComponent<Toast>();
                UiPrefabs.SetField(toast, "_group", group);
                UiPrefabs.SetField(toast, "_label", label);
                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("toast", toast));
                UiPrefabs.Save(root, "Toast");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 위쪽 막대 아래에 뜨는 로딩 표시(도는 사각형과 문구)를 만든다. 그동안의 탭은 UI 캔버스의 차단막이 막으므로
        /// 탭을 받지 않는다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildLoading(UiTheme theme)
        {
            var root = new GameObject("Loading", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                UiPrefabs.Place(
                    root.transform, new Vector2(0.5f, 1f), new Vector2(0f, -200f), new Vector2(700f, 90f));
                var background = root.GetComponent<Image>();
                background.color = theme.Notice;
                background.raycastTarget = false;

                Image spinner = UiPrefabs.AddImage(root.transform, "Spinner", theme.Text);
                spinner.raycastTarget = false;
                UiPrefabs.Place(spinner, new Vector2(0f, 0.5f), new Vector2(60f, 0f), new Vector2(44f, 44f));
                // 가운데를 축으로 돈다.
                spinner.rectTransform.pivot = new Vector2(0.5f, 0.5f);
                spinner.gameObject.AddComponent<Spinner>();

                TMP_Text message = UiPrefabs.AddText(root.transform, "Message", 36f, Vector2.zero, Vector2.one);
                message.rectTransform.offsetMin = new Vector2(110f, 0f);
                message.rectTransform.offsetMax = new Vector2(-theme.Padding, 0f);
                message.alignment = TextAlignmentOptions.Left;

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("messageText", message));
                UiPrefabs.Save(root, "Loading");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 화면 전체를 가리는 전환 화면(바탕, 가운데 문구, 그 아래 업데이트 진행 막대)을 만든다. 앱이 가린 채로 시작하므로
        /// 처음에는 불투명하다. 탭은 받지 않고, 가린 동안의 입력은 UI 캔버스의 차단막이 막는다. 진행 막대는 꺼 두고
        /// 업데이트를 받는 동안만 TypeScript가 켠다.
        /// </summary>
        /// <param name="theme">테마.</param>
        private static void BuildTransitionScreen(UiTheme theme)
        {
            var root = new GameObject(
                "TransitionScreen",
                typeof(RectTransform), typeof(CanvasGroup), typeof(Image), typeof(Fade), typeof(ViewRefs));
            try
            {
                UiPrefabs.Bleed((RectTransform)root.transform);
                var group = root.GetComponent<CanvasGroup>();
                group.alpha = 1f;
                group.blocksRaycasts = false;
                group.interactable = false;
                var background = root.GetComponent<Image>();
                background.color = theme.Panel;
                background.raycastTarget = false;

                TMP_Text message = UiPrefabs.AddText(root.transform, "Message", TextStyle.Label, Vector2.zero, Vector2.one);
                message.fontSize = theme.BodySize;
                UiPrefabs.Place(message, new Vector2(0.5f, 0.5f), new Vector2(0f, 40f), new Vector2(960f, 160f));
                message.textWrappingMode = TextWrappingModes.Normal;

                (Image track, Image fill) = UiParts.AddGauge(root.transform, "ProgressBar");
                track.color = theme.Surface;
                UiPrefabs.Place(track, new Vector2(0.5f, 0.5f), new Vector2(0f, -80f), new Vector2(720f, 16f));
                track.gameObject.SetActive(false);

                var fade = root.GetComponent<Fade>();
                UiPrefabs.SetField(fade, "_group", group);
                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(),
                    ("fade", fade), ("messageText", message), ("progressBar", track.gameObject), ("progressFill", fill));
                // 부트의 패치 화면이라 앱에 든다.
                UiPrefabs.Save(root, "TransitionScreen", inApp: true);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }
    }
}
