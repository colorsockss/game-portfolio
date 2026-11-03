using TMPro;
using UnityEditor;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 환생 화면의 프리팹(Remote/UI/RebirthScreen)을 테마, 부품, 팝업 명세로 만든다. 메인 화면의 환생 버튼은
    /// ScreenPrefabs가 만든다. 다시 실행하면 같은 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.RebirthPrefabs.Build
    /// </code>
    /// </summary>
    public static class RebirthPrefabs
    {
        /// <summary>RebirthScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Rebirth Prefabs")]
        public static void Build()
        {
            BuildScreen();
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the rebirth prefab in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 위에서부터 환생 횟수, 지금 배율, 받을 것(여러 줄)을 쌓고, 아래쪽에 환생 버튼과 그 위의 "남는 것" 문구를 두며, 그
        /// 사이를 처음으로 돌아가는 것의 목록(여러 줄 본문)이 채우는 아래 판(큰 판)이다.
        /// </summary>
        private static void BuildScreen()
        {
            // 배율은 재화처럼 골드 색으로 보인다.
            Color gold = UiTheme.Load().Gold;
            UiSpec spec = UiSpec.Sheet("RebirthScreen", ScreenPrefabs.SheetHeight("rebirth"))
                .Header()
                .Text("countText", TextStyle.Ink, 60f)
                .Text("rateText", TextStyle.Large, 90f, configure: text => text.color = gold)
                .Text("gainText", TextStyle.Ink, 120f, configure: text => text.textWrappingMode = TextWrappingModes.Normal)
                .Footer(130f, ("rebirth", ButtonStyle.Danger, 640f));
            spec.Dock("keeps", 110f, dock => AddKeeps(spec, dock))
                .Body("resetsText", TextStyle.Ink, TextAlignmentOptions.Center)
                .Save();
        }

        /// <summary>환생 버튼 위에 남는 것(스킬, 장비, 재료)과 배율이 곱해지는 곳을 적는 흐린 문구를 둔다.</summary>
        /// <param name="spec">항목을 더할 명세.</param>
        /// <param name="dock">채울 판.</param>
        private static void AddKeeps(UiSpec spec, RectTransform dock)
        {
            TMP_Text keeps = UiPrefabs.AddText(dock, "Keeps", TextStyle.InkSmall, Vector2.zero, Vector2.one);
            keeps.textWrappingMode = TextWrappingModes.Normal;
            spec.Ref("keepsLabel", keeps);
        }
    }
}
