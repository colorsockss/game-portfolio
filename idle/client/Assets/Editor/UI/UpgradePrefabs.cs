using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 골드 능력치 강화 화면의 프리팹(Remote/UI/UpgradeScreen, UpgradeCell)을 테마, 부품, 판 명세로 만든다. 메인 화면 아래 탭
    /// 위의 작은 판이고, 머리에 ×1·×10·×100 배수 탭이 있다. 메인 화면의 강화 탭은 ScreenPrefabs가 만든다. 다시 실행하면 같은
    /// 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.UpgradePrefabs.Build
    /// </code>
    /// </summary>
    public static class UpgradePrefabs
    {
        /// <summary>목록 칸의 높이.</summary>
        private const float CellHeight = 120f;

        /// <summary>칸 왼쪽 아이콘 칸의 한 변.</summary>
        private const float TileSize = 96f;

        /// <summary>칸의 글자가 시작하는 자리(아이콘 칸 오른쪽).</summary>
        private const float TextLeft = 130f;

        /// <summary>칸 오른쪽의 강화 버튼 너비.</summary>
        private const float ButtonWidth = 250f;

        /// <summary>머리의 배수 탭 막대 너비. 제목의 오른쪽에 들어간다.</summary>
        private const float MultiplierWidth = 400f;

        /// <summary>UpgradeCell.prefab과 그것을 쓰는 UpgradeScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Upgrade Prefabs")]
        public static void Build()
        {
            BuildScreen(BuildCell());
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the upgrade prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 목록의 칸 프리팹(크림색 줄)을 만든다. ViewRefs 항목은 아이콘(왼쪽 칸), 이름과 단계(위 줄), 지금 더한 양과 강화 뒤의
        /// 양(아래 줄), 오른쪽의 강화 버튼과 그 글자(고른 배수의 비용)다. 버튼은 길게 누르면 되풀이해 눌린다(RepeatButton).
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
                UiParts.Paint(background, theme.CellSprite, theme.Cell);
                background.raycastTarget = false;
                var cell = root.GetComponent<ViewRefs>();

                Image tile = UiParts.AddFrame(background.transform, "Tile", theme.SlotSprite, theme.Secondary);
                UiPrefabs.Place(tile, new Vector2(0f, 0.5f), new Vector2(14f, 0f), new Vector2(TileSize, TileSize));
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(14f, 18f), new Vector2(-14f, -10f));

                TMP_Text upgradeName = UiPrefabs.AddText(
                    background.transform, "Name", TextStyle.Ink, new Vector2(0f, 0.5f), new Vector2(0.3f, 1f));
                upgradeName.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                upgradeName.alignment = TextAlignmentOptions.BottomLeft;
                upgradeName.fontSize = theme.LabelSize;
                TMP_Text level = UiPrefabs.AddText(
                    background.transform, "Level", TextStyle.InkLabel, new Vector2(0.3f, 0.5f), new Vector2(0.62f, 1f));
                level.alignment = TextAlignmentOptions.BottomLeft;
                level.fontSize = theme.SmallSize;
                TMP_Text bonus = UiPrefabs.AddText(
                    background.transform, "Bonus", TextStyle.InkLabel, Vector2.zero, new Vector2(0.3f, 0.5f));
                bonus.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                bonus.alignment = TextAlignmentOptions.TopLeft;
                bonus.fontSize = theme.SmallSize;
                TMP_Text next = UiPrefabs.AddText(
                    background.transform, "Next", TextStyle.Ink, new Vector2(0.3f, 0f), new Vector2(0.62f, 0.5f));
                next.alignment = TextAlignmentOptions.TopLeft;
                next.fontSize = theme.SmallSize;
                next.color = theme.GoodInk;

                Button upgrade = UiParts.AddButton(background.transform, "UpgradeButton", ButtonStyle.Positive);
                UiPrefabs.Place(upgrade, new Vector2(1f, 0.5f), new Vector2(-12f, 2f), new Vector2(ButtonWidth, 96f));
                upgrade.gameObject.AddComponent<RepeatButton>();
                Image coin = UiIcons.AddFixed(upgrade.transform, "Coin", UiIcons.Get("currency_gold"));
                UiPrefabs.Place(coin, new Vector2(0f, 0.5f), new Vector2(14f, 5f), new Vector2(54f, 54f));
                TMP_Text cost = UiPrefabs.LabelOf(upgrade);
                cost.rectTransform.offsetMin = new Vector2(70f, 10f);

                UiPrefabs.SetRefs(
                    cell, ("icon", icon), ("nameText", upgradeName), ("levelText", level), ("bonusText", bonus),
                    ("nextText", next), ("upgradeButton", upgrade), ("costText", cost));

                GameObject saved = UiPrefabs.Save(root, "UpgradeCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 메인 화면 아래 탭 위의 작은 판을 만든다: 머리(제목, 배수 탭), 길게 누르기 안내, 강화 목록. 배수 탭은 항목
        /// multipliers, 안내는 holdHintLabel이다.
        /// </summary>
        /// <param name="cell">목록의 칸 프리팹.</param>
        private static void BuildScreen(ViewRefs cell)
        {
            UiSpec spec = UiSpec.Sheet("UpgradeScreen", ScreenPrefabs.SheetHeight("upgrade")).Header();
            TabBar multipliers = UiParts.AddTabs(spec.Panel, "Multipliers");
            UiPrefabs.Place(
                multipliers, Vector2.one, new Vector2(-spec.Theme.Padding, -16f), new Vector2(MultiplierWidth, 82f));
            spec.Ref("multipliers", multipliers)
                .Text("holdHintLabel", TextStyle.InkSmall, 36f, gap: 0f, alignment: TextAlignmentOptions.MidlineRight)
                .List("items", cell)
                .Save();
        }
    }
}
