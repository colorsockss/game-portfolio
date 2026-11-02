using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 개발 빌드에서만 여는 디버그 오버레이 프리팹(Remote/UI/DebugOverlay)을 코드로 만든다. 다시 실행하면 같은 경로를
    /// 덮어쓰므로 GUID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.DebugPrefabs.Build
    /// </code>
    /// </summary>
    public static class DebugPrefabs
    {
        /// <summary>패널 바탕색. 아래 화면이 비쳐 보이게 조금 투명하다.</summary>
        private static readonly Color s_panelColor = new Color(0f, 0f, 0f, 0.85f);

        /// <summary>
        /// 왼쪽 아래의 DEV 버튼과 그것이 펼치는 패널(FPS, 서버 시간, 스크롤되는 상태 덤프, 치트 입력란과 실행 버튼, 결과)을
        /// 만든다. 버튼은 메인 화면 아래쪽 버튼 줄보다 아래의 띠에 두어 팝업 제목이나 위쪽 막대를 가리지 않는다. 루트는 탭을
        /// 받지 않아서, 접혀 있으면 버튼 밖의 탭은 아래 화면에 닿는다. 펼친 패널은 탭을 막는다.
        /// </summary>
        [MenuItem("Tools/UI/Build Debug Prefabs")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject("DebugOverlay", typeof(RectTransform), typeof(ViewRefs));
            try
            {
                UiPrefabs.Stretch((RectTransform)root.transform, Vector2.zero, Vector2.zero);

                Button toggle = UiParts.AddButton(root.transform, "ToggleButton", ButtonStyle.Secondary);
                // 메인 화면 아래쪽 버튼 줄(아래에서 40–150)의 첫 버튼을 가리지 않게 그 위에 둔다.
                UiPrefabs.Place(toggle, Vector2.zero, new Vector2(20f, 165f), new Vector2(140f, 70f));

                Image panel = UiPrefabs.AddImage(root.transform, "Panel", s_panelColor);
                UiPrefabs.Stretch(panel.rectTransform, new Vector2(20f, 320f), new Vector2(-20f, -320f));

                TMP_Text fps = TopText(panel.transform, "Fps", new Vector2(0f, 1f), new Vector2(0.4f, 1f), theme);
                fps.alignment = TextAlignmentOptions.MidlineLeft;
                TMP_Text serverTime = TopText(panel.transform, "ServerTime", new Vector2(0.4f, 1f), Vector2.one, theme);
                serverTime.alignment = TextAlignmentOptions.MidlineRight;

                TMP_Text dump = AddDump(panel.transform);

                TMP_InputField cheat = AddInput(panel.transform, theme);
                Button run = UiParts.AddButton(panel.transform, "CheatButton", ButtonStyle.Secondary);
                UiPrefabs.Place(run, Vector2.right, new Vector2(-20f, 140f), new Vector2(220f, 100f));

                TMP_Text result = UiPrefabs.AddText(panel.transform, "CheatResult", TextStyle.Small, Vector2.zero, Vector2.right);
                result.color = theme.Text;
                result.rectTransform.offsetMin = new Vector2(20f, 20f);
                result.rectTransform.offsetMax = new Vector2(-20f, 120f);
                result.alignment = TextAlignmentOptions.MidlineLeft;
                result.textWrappingMode = TextWrappingModes.Normal;

                panel.gameObject.SetActive(false);
                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(),
                    ("toggleButton", toggle), ("panel", panel.gameObject), ("fpsText", fps),
                    ("serverTimeText", serverTime), ("dumpText", dump), ("cheatInput", cheat),
                    ("cheatButton", run), ("cheatResultText", result), ("toggleLabel", UiPrefabs.LabelOf(toggle)),
                    ("cheatLabel", UiPrefabs.LabelOf(run)), ("cheatPlaceholder", (TMP_Text)cheat.placeholder));
                UiPrefabs.Save(root, "DebugOverlay");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the debug overlay prefab in {UiPrefabs.Folder}");
        }

        /// <summary>패널 위쪽 높이 80의 줄에서 가로로 앵커 사이를 채우는 글자를 만든다.</summary>
        /// <param name="panel">패널.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="anchorMin">앵커 왼쪽(위쪽 가장자리).</param>
        /// <param name="anchorMax">앵커 오른쪽(위쪽 가장자리).</param>
        /// <param name="theme">테마.</param>
        /// <returns>만든 글자.</returns>
        private static TMP_Text TopText(Transform panel, string name, Vector2 anchorMin, Vector2 anchorMax, UiTheme theme)
        {
            TMP_Text text = UiPrefabs.AddText(panel, name, 40f, anchorMin, anchorMax);
            text.rectTransform.offsetMin = new Vector2(20f, -100f);
            text.rectTransform.offsetMax = new Vector2(-20f, -20f);
            text.color = theme.Good;
            return text;
        }

        /// <summary>패널 가운데를 채우고 세로로 스크롤되는 상태 덤프 글자를 만든다.</summary>
        /// <param name="panel">패널.</param>
        /// <returns>덤프 글자. 내용만큼 높아진다.</returns>
        private static TMP_Text AddDump(Transform panel)
        {
            // 투명한 Image가 끌기를 받고, RectMask2D가 영역 밖 줄을 가린다.
            var go = new GameObject("Dump", typeof(RectTransform), typeof(Image), typeof(RectMask2D), typeof(ScrollRect));
            go.transform.SetParent(panel, false);
            var viewport = (RectTransform)go.transform;
            UiPrefabs.Stretch(viewport, new Vector2(20f, 260f), new Vector2(-20f, -120f));
            go.GetComponent<Image>().color = Color.clear;

            TMP_Text text = UiPrefabs.AddText(go.transform, "Text", 26f, Vector2.up, Vector2.one);
            text.rectTransform.pivot = new Vector2(0.5f, 1f);
            text.alignment = TextAlignmentOptions.TopLeft;
            text.textWrappingMode = TextWrappingModes.Normal;
            text.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var scroll = go.GetComponent<ScrollRect>();
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.viewport = viewport;
            scroll.content = text.rectTransform;
            scroll.scrollSensitivity = 30f;
            return text;
        }

        /// <summary>
        /// 패널 아래쪽, 실행 버튼 왼쪽의 치트 입력란을 만든다(입력란 부품을 어두운 패널에 맞춰 칠함). 쓰는 법은 TypeScript가
        /// 결과 줄에 보인다.
        /// </summary>
        /// <param name="panel">패널.</param>
        /// <param name="theme">테마.</param>
        /// <returns>입력란.</returns>
        private static TMP_InputField AddInput(Transform panel, UiTheme theme)
        {
            TMP_InputField field = UiParts.AddInput(panel, "CheatInput");
            var rect = (RectTransform)field.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.right;
            rect.pivot = Vector2.zero;
            rect.offsetMin = new Vector2(20f, 140f);
            rect.offsetMax = new Vector2(-260f, 240f);
            field.GetComponent<Image>().color = theme.Surface;
            field.textComponent.fontSize = 36f;
            field.textComponent.color = theme.Text;
            var placeholder = (TMP_Text)field.placeholder;
            placeholder.fontSize = 28f;
            // 어두운 바탕에서도 읽히게 흐린 글자색이다.
            placeholder.color = theme.Muted;
            return field;
        }
    }
}
