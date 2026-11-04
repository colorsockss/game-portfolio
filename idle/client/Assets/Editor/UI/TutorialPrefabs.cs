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
    /// 튜토리얼 오버레이 프리팹(Remote/UI/TutorialOverlay)을 코드로 만든다. 다시 실행하면 같은 경로를 덮어쓰므로 GUID가
    /// 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.TutorialPrefabs.Build
    /// </code>
    /// </summary>
    public static class TutorialPrefabs
    {
        /// <summary>테두리 막대의 두께.</summary>
        private const float FrameWidth = 6f;

        /// <summary>
        /// 대상을 비추는 막(Spotlight: 대상 둘레의 어두운 막 넷과 테두리), 비출 대상이 없는 누름 스텝에서 화면 전체를 덮는
        /// 누름 버튼, 대사 창(대사와 누름 안내)을 순서대로 쌓는다. 막과 누름 버튼은 세이프 에어리어 밖(노치, 홈 인디케이터
        /// 자리)까지 덮고(UiPrefabs.Bleed), 대사 창은 세이프 에어리어 안에 있다. 루트와 대사 창은 탭을 받지 않아서, 막이 없는 스텝에서는
        /// 아래 화면이 그대로 눌린다. 처음에는 모두 꺼져 있고 TypeScript가 켠다.
        /// </summary>
        [MenuItem("Tools/UI/Build Tutorial Prefabs")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            UiPrefabs.SaveView("TutorialOverlay", Type.EmptyTypes, root =>
            {
                UiPrefabs.Stretch((RectTransform)root.transform, Vector2.zero, Vector2.zero);

                RectTransform area = UiPrefabs.AddRect(root.transform, "Spotlight");
                // 사방으로 같은 만큼 늘이므로 가운데(대사 창을 위아래 어디에 둘지 가르는 선)는 세이프 에어리어의 가운데다.
                UiPrefabs.Bleed(area);
                var spotlight = area.gameObject.AddComponent<Spotlight>();
                Image top = UiPrefabs.AddImage(area, "Top", theme.Dim);
                Image bottom = UiPrefabs.AddImage(area, "Bottom", theme.Dim);
                Image left = UiPrefabs.AddImage(area, "Left", theme.Dim);
                Image right = UiPrefabs.AddImage(area, "Right", theme.Dim);
                RectTransform frame = AddFrame(area, theme);

                Image cover = UiPrefabs.AddImage(root.transform, "TapButton", theme.Dim);
                UiPrefabs.Bleed(cover.rectTransform);
                var tap = cover.gameObject.AddComponent<Button>();
                tap.transition = Selectable.Transition.None;
                cover.gameObject.SetActive(false);

                (Image dialog, TMP_Text text, TMP_Text hint) = AddDialog(root.transform, theme);

                Fields.Wire(
                    spotlight, ("_top", top.rectTransform), ("_bottom", bottom.rectTransform), ("_left", left.rectTransform),
                    ("_right", right.rectTransform), ("_frame", frame), ("_dialog", dialog.rectTransform));
                foreach (Image shade in new[] { top, bottom, left, right })
                    shade.gameObject.SetActive(false);
                frame.gameObject.SetActive(false);

                return new (string Name, Object Target)[]
                {
                    ("spotlight", spotlight), ("tapButton", tap), ("dialog", dialog.gameObject),
                    ("dialogText", text), ("hint", hint.gameObject), ("hintLabel", hint)
                };
            });
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the tutorial overlay prefab in {UiPrefabs.Folder}");
        }

        /// <summary>대상 자리의 테두리: 가장자리를 따라 붙는 막대 넷. 자리와 크기는 Spotlight가 정하고, 탭은 받지 않는다.</summary>
        /// <param name="area">Spotlight의 RectTransform.</param>
        /// <param name="theme">테마.</param>
        /// <returns>테두리의 RectTransform.</returns>
        private static RectTransform AddFrame(Transform area, UiTheme theme)
        {
            RectTransform frame = UiPrefabs.AddRect(area, "Frame");
            AddEdge(frame, "Top", new Vector2(0f, 1f), Vector2.one, new Vector2(0f, -FrameWidth), Vector2.zero, theme);
            AddEdge(frame, "Bottom", Vector2.zero, new Vector2(1f, 0f), Vector2.zero, new Vector2(0f, FrameWidth), theme);
            AddEdge(frame, "Left", Vector2.zero, new Vector2(0f, 1f), Vector2.zero, new Vector2(FrameWidth, 0f), theme);
            AddEdge(frame, "Right", new Vector2(1f, 0f), Vector2.one, new Vector2(-FrameWidth, 0f), Vector2.zero, theme);
            return frame;
        }

        /// <summary>테두리 막대 하나를 앵커 사이에 둔다.</summary>
        /// <param name="frame">테두리.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="anchorMin">앵커 왼쪽 아래.</param>
        /// <param name="anchorMax">앵커 오른쪽 위.</param>
        /// <param name="offsetMin">왼쪽 아래 가장자리.</param>
        /// <param name="offsetMax">오른쪽 위 가장자리.</param>
        /// <param name="theme">테마.</param>
        private static void AddEdge(
            Transform frame, string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax,
            UiTheme theme)
        {
            Image edge = UiPrefabs.AddImage(frame, name, theme.Highlight);
            edge.raycastTarget = false;
            RectTransform rect = edge.rectTransform;
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.offsetMin = offsetMin;
            rect.offsetMax = offsetMax;
        }

        /// <summary>
        /// 화면 위쪽(메인 화면의 위쪽 막대 아래)에 왼쪽은 40, 오른쪽은 설정 버튼만큼 띄운 높이 300의 대사 창을 만든다. Spotlight가 대상의 반대쪽
        /// 가장자리로 옮긴다. 대사는 줄을 바꾸고, 누름 안내는 오른쪽 아래에 있다. 탭은 받지 않는다.
        /// </summary>
        /// <param name="root">오버레이의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>대사 창과 대사, 누름 안내.</returns>
        private static (Image Dialog, TMP_Text Text, TMP_Text Hint) AddDialog(Transform root, UiTheme theme)
        {
            Image dialog = UiPrefabs.AddImage(root, "Dialog", theme.Panel);
            dialog.sprite = theme.PanelSprite;
            dialog.type = Image.Type.Sliced;
            dialog.raycastTarget = false;
            RectTransform rect = dialog.rectTransform;
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = Vector2.one;
            rect.pivot = new Vector2(0.5f, 1f);
            // 왼쪽은 40을 띄우고, 오른쪽은 같은 높이에 있는 메인 화면의 설정 버튼을 가리지 않게 그 너비와 틈 20만큼 비운다.
            float right = ScreenPrefabs.SettingsButtonReach + 20f;
            rect.anchoredPosition = new Vector2((40f - right) / 2f, -200f);
            rect.sizeDelta = new Vector2(-(40f + right), 300f);

            TMP_Text text = UiPrefabs.AddText(dialog.transform, "Text", TextStyle.Ink, Vector2.zero, Vector2.one);
            text.rectTransform.offsetMin = new Vector2(40f, 80f);
            text.rectTransform.offsetMax = new Vector2(-40f, -30f);
            text.alignment = TextAlignmentOptions.TopLeft;
            text.textWrappingMode = TextWrappingModes.Normal;

            TMP_Text hint = UiPrefabs.AddText(dialog.transform, "Hint", TextStyle.InkSmall, Vector2.zero, new Vector2(1f, 0f));
            hint.rectTransform.offsetMin = new Vector2(40f, 20f);
            hint.rectTransform.offsetMax = new Vector2(-40f, 70f);
            hint.alignment = TextAlignmentOptions.BottomRight;
            hint.gameObject.SetActive(false);

            dialog.gameObject.SetActive(false);
            return (dialog, text, hint);
        }
    }
}
