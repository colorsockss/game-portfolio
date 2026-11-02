using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 골드 능력치 강화 화면의 프리팹(Remote/UI/UpgradeScreen, UpgradeCell)을 테마, 부품, 팝업 명세로 만든다. 메인 화면의
    /// 강화 버튼은 ScreenPrefabs가 만든다. 다시 실행하면 같은 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는
    /// 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.UpgradePrefabs.Build
    /// </code>
    /// </summary>
    public static class UpgradePrefabs
    {
        /// <summary>목록 칸의 높이.</summary>
        private const float CellHeight = 150f;

        /// <summary>칸 오른쪽의 강화 버튼 너비.</summary>
        private const float ButtonWidth = 240f;

        /// <summary>UpgradeCell.prefab과 그것을 쓰는 UpgradeScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Upgrade Prefabs")]
        public static void Build()
        {
            BuildScreen(BuildCell());
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the upgrade prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 목록의 칸 프리팹을 만든다. 칸의 ViewRefs 항목은 이름(왼쪽 위), 단계(왼쪽 아래), 더한 양(가운데)과
        /// 오른쪽의 강화 버튼, 그 글자(다음 비용)다.
        /// </summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject(
                "UpgradeCell", typeof(RectTransform), typeof(Image), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(0f, CellHeight);
                root.GetComponent<LayoutElement>().preferredHeight = CellHeight;

                var background = root.GetComponent<Image>();
                background.color = theme.Surface;
                var cell = root.GetComponent<ViewRefs>();

                TMP_Text upgradeName = UiPrefabs.AddText(
                    background.transform, "Name", 44f, new Vector2(0f, 0.5f), new Vector2(0.45f, 1f));
                upgradeName.rectTransform.offsetMin = new Vector2(30f, 0f);
                upgradeName.alignment = TextAlignmentOptions.BottomLeft;
                upgradeName.fontStyle = FontStyles.Bold;
                TMP_Text level = UiPrefabs.AddText(
                    background.transform, "Level", 34f, Vector2.zero, new Vector2(0.45f, 0.5f));
                level.rectTransform.offsetMin = new Vector2(30f, 0f);
                level.alignment = TextAlignmentOptions.TopLeft;
                level.color = theme.Muted;
                TMP_Text bonus = UiPrefabs.AddText(
                    background.transform, "Bonus", 40f, new Vector2(0.45f, 0f), new Vector2(0.7f, 1f));
                bonus.alignment = TextAlignmentOptions.Center;
                bonus.color = theme.Good;

                Button upgrade = UiParts.AddButton(background.transform, "UpgradeButton", ButtonStyle.Primary);
                UiPrefabs.Place(upgrade, new Vector2(1f, 0.5f), new Vector2(-20f, 0f), new Vector2(ButtonWidth, 110f));

                UiPrefabs.SetRefs(
                    cell, ("nameText", upgradeName), ("levelText", level), ("bonusText", bonus),
                    ("upgradeButton", upgrade), ("costText", UiPrefabs.LabelOf(upgrade)));

                GameObject saved = UiPrefabs.Save(root, "UpgradeCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>화면을 덮는 어두운 바탕 위에 제목, 닫기 버튼, 강화 목록을 담은 패널을 둔 팝업 프리팹을 만든다.</summary>
        /// <param name="cell">목록의 칸 프리팹.</param>
        private static void BuildScreen(ViewRefs cell) =>
            UiSpec.Popup("UpgradeScreen", 960f, 1100f)
                .Header()
                .List("items", cell)
                .Save();
    }
}
