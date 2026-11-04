using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 설정 화면의 프리팹(Remote/UI/SettingsScreen, SettingsChannel)을 테마, 부품, 팝업 명세로 만든다. 메인 화면의 설정
    /// 버튼은 ScreenPrefabs가 만든다. 고정 글자는 비워 두고 ViewRefs 항목(…Label)으로 내놓는다. 다시 실행하면 같은 경로를
    /// 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.SettingsPrefabs.Build
    /// </code>
    /// </summary>
    public static class SettingsPrefabs
    {
        /// <summary>채널 한 줄의 높이.</summary>
        private const float RowHeight = 150f;

        /// <summary>SettingsChannel.prefab과 그것을 쓰는 SettingsScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Settings Prefabs")]
        public static void Build()
        {
            BuildScreen(BuildChannel());
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the settings prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 채널 한 줄(왼쪽 이름, 가운데 볼륨 슬라이더, 오른쪽 뮤트 토글)을 만든다. 설정 화면의 ViewList가 이것을 틀로
        /// 복제한다.
        /// </summary>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildChannel()
        {
            return UiPrefabs.SaveView("SettingsChannel", new[] { typeof(LayoutElement) }, root =>
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(900f, RowHeight);
                root.GetComponent<LayoutElement>().preferredHeight = RowHeight;

                TMP_Text label = UiPrefabs.AddText(root.transform, "Name", TextStyle.Ink, Vector2.zero, Vector2.up);
                label.rectTransform.offsetMax = new Vector2(200f, 0f);
                label.alignment = TextAlignmentOptions.MidlineLeft;

                // 이름(왼쪽 200)과 토글(오른쪽 240) 사이를 채운다.
                ReleaseSlider slider = UiParts.AddSlider(root.transform, "VolumeSlider");
                UiPrefabs.Stretch((RectTransform)slider.transform, new Vector2(220f, 40f), new Vector2(-260f, -40f));
                Toggle mute = UiParts.AddToggle(root.transform, "MuteToggle");
                var toggleRect = (RectTransform)mute.transform;
                toggleRect.anchorMin = Vector2.right;
                toggleRect.anchorMax = Vector2.one;
                toggleRect.offsetMin = new Vector2(-240f, 0f);
                toggleRect.offsetMax = Vector2.zero;

                return new (string Name, Object Target)[]
                {
                    ("nameText", label), ("volumeSlider", slider), ("muteToggle", mute),
                    ("muteLabel", mute.GetComponentInChildren<TMP_Text>(true))
                };
            });
        }

        /// <summary>
        /// 화면을 덮는 어두운 바탕 위에 제목, 닫기 버튼, 채널 줄 목록, 초당 프레임 탭, 언어 탭, 아래쪽 로그아웃 버튼을 담은
        /// 패널을 둔 팝업 프리팹을 만든다. 채널 줄은 Enums의 SoundChannel마다 하나이고, 언어 탭은 Strings의 언어 열마다
        /// 하나이며 TypeScript가 수를 정한다. 패널은 채널 두 줄 높이다.
        /// </summary>
        /// <param name="channel">채널 한 줄 프리팹. 꺼 둔 틀로 넣는다.</param>
        private static void BuildScreen(GameObject channel) =>
            UiSpec.Popup("SettingsScreen", 960f, 1260f)
                .Header()
                .Stack("channels", channel, RowHeight, 2)
                .Space(20f)
                .Text("frameRateLabel", TextStyle.Ink, 80f, alignment: TextAlignmentOptions.MidlineLeft)
                .Tabs("frameRates")
                .Space(20f)
                .Text("languageLabel", TextStyle.Ink, 80f, alignment: TextAlignmentOptions.MidlineLeft)
                .Tabs("languages")
                .Footer(120f, ("logout", ButtonStyle.Danger, 400f))
                .Save();
    }
}
