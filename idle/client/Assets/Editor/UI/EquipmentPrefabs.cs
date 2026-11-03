using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 장비 화면의 프리팹(Remote/UI/EquipmentScreen, EquipmentCell)을 테마, 부품, 판 명세로 만든다. 메인 화면 아래 탭 위의 큰
    /// 판이고, 가진 장비가 등급 색 칸의 그리드로 보인다. 메인 화면의 장비 탭은 ScreenPrefabs가 만든다. 능력치 칸은 위젯의
    /// CurrencySlot을 쓰므로 Tools/UI/Build Widget Prefabs 다음에 실행한다. 다시 실행하면 같은 경로를 덮어쓰므로 GUID와
    /// fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.EquipmentPrefabs.Build
    /// </code>
    /// </summary>
    public static class EquipmentPrefabs
    {
        /// <summary>능력치 칸으로 쓰는 위젯(이름표와 굴러가는 수).</summary>
        private const string StatSlotPath = UiPrefabs.Folder + "/CurrencySlot.prefab";

        /// <summary>그리드의 열 수.</summary>
        private const int Columns = 6;

        /// <summary>그리드 칸(등급 칸)의 한 변. 강화·합성 패널을 연 채로 두 줄이 보인다.</summary>
        private const float TileSize = 150f;

        /// <summary>아래쪽 강화·합성 패널의 높이.</summary>
        private const float ForgeHeight = 300f;

        /// <summary>패널과 머리의 버튼 너비.</summary>
        private const float ButtonWidth = 200f;

        /// <summary>EquipmentCell.prefab과 그것을 쓰는 EquipmentScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Equipment Prefabs")]
        public static void Build()
        {
            var statSlot = AssetDatabase.LoadAssetAtPath<GameObject>(StatSlotPath);
            if (statSlot == null)
            {
                Debug.LogError($"[UI] {StatSlotPath} is missing; run Tools/UI/Build Widget Prefabs first");
                return;
            }
            BuildScreen(BuildCell(), statSlot);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the equipment prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 그리드의 칸 프리팹: 칸 전체가 누르는 버튼(고르고, 입지 않은 것이면 입기)인 등급 색 칸이다. 안에 아이콘, 왼쪽 위의
        /// 강화 단계, 아래의 합성 재료 막대와 그 수, 오른쪽 위의 착용 표시(E)와 더 좋은 장비의 빨간 점이 있고, 고른 칸이면 주황
        /// 테두리가 켜진다. ViewRefs 항목은 icon, tint, levelText, countBar(합성할 다음 장비가 없으면 숨는 막대), countFill,
        /// countText, wornMark, betterBadge, selectedMark, selectButton이다.
        /// </summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject("EquipmentCell", typeof(RectTransform), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(TileSize, TileSize);
                // 고른 테두리를 칸 안에 두어 스크롤 목록의 가장자리에서 잘리지 않게 한다.
                Image selected = UiParts.AddFrame(root.transform, "SelectedMark", theme.TileSprite, theme.Accent);
                UiPrefabs.Stretch(selected.rectTransform, Vector2.zero, Vector2.zero);
                Image tile = UiParts.AddFrame(root.transform, "Tile", theme.TileSprite, theme.Grades[0]);
                UiPrefabs.Stretch(tile.rectTransform, new Vector2(7f, 7f), new Vector2(-7f, -7f));
                tile.raycastTarget = true;
                TintView tint = UiParts.AddTint(tile, theme.Grades);
                var button = tile.gameObject.AddComponent<Button>();
                button.targetGraphic = tile;
                button.colors = theme.ButtonColors;

                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(22f, 36f), new Vector2(-22f, -14f));
                TMP_Text level = UiPrefabs.AddText(tile.transform, "Level", 30f, new Vector2(0f, 1f), Vector2.one);
                level.rectTransform.offsetMin = new Vector2(12f, -46f);
                level.rectTransform.offsetMax = new Vector2(0f, -4f);
                level.alignment = TextAlignmentOptions.TopLeft;

                (Image track, Image fill) = UiParts.AddGauge(tile.transform, "Count");
                track.rectTransform.anchorMin = Vector2.zero;
                track.rectTransform.anchorMax = new Vector2(1f, 0f);
                track.rectTransform.pivot = new Vector2(0.5f, 0f);
                track.rectTransform.offsetMin = new Vector2(10f, 12f);
                track.rectTransform.offsetMax = new Vector2(-10f, 40f);
                TMP_Text count = UiPrefabs.AddText(track.transform, "CountText", 22f, Vector2.zero, Vector2.one);
                count.rectTransform.offsetMin = new Vector2(0f, 2f);

                // 착용 표시는 누르는 것이 아니라 뱃지처럼 동그라미다. 뱃지와 함께 칸 안의 모서리에 두어 스크롤 목록의 마스크에 잘리지 않게 한다.
                Image worn = UiParts.AddFrame(root.transform, "WornMark", theme.DotSprite, theme.Primary);
                UiPrefabs.Place(worn, Vector2.one, Vector2.zero, new Vector2(52f, 52f));
                TMP_Text wornText = UiPrefabs.AddText(worn.transform, "Text", 28f, Vector2.zero, Vector2.one);
                wornText.rectTransform.offsetMin = new Vector2(0f, 2f);
                wornText.text = "E";
                GameObject better = UiParts.AddBadge(root.transform);
                UiPrefabs.Place(better.transform, Vector2.one, Vector2.zero, new Vector2(46f, 46f));

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("icon", icon), ("tint", tint), ("levelText", level),
                    ("countBar", track.gameObject), ("countFill", fill),
                    ("countText", count), ("wornMark", worn.gameObject), ("betterBadge", better),
                    ("selectedMark", selected.gameObject), ("selectButton", button));
                GameObject saved = UiPrefabs.Save(root, "EquipmentCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 메인 화면 아래 탭 위의 큰 판을 만든다: 머리(제목, 일괄 장착·합성 버튼), 능력치 줄, 슬롯 탭, 장비
        /// 그리드, 아래쪽 강화·합성 패널. 능력치 칸(공격, 방어, HP)의 수는 TypeScript가 정한다.
        /// </summary>
        /// <param name="cell">그리드의 칸 프리팹.</param>
        /// <param name="statSlot">능력치 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        private static void BuildScreen(ViewRefs cell, GameObject statSlot)
        {
            UiSpec spec = UiSpec.Sheet("EquipmentScreen", ScreenPrefabs.SheetHeight("equipment")).Header();
            Button equipBest = UiParts.AddButton(spec.Panel, "EquipBestButton", ButtonStyle.Positive);
            UiPrefabs.Place(
                equipBest, Vector2.one, new Vector2(-(spec.Theme.Padding + ButtonWidth + 12f), -18f),
                new Vector2(ButtonWidth, 86f));
            Button mergeAll = UiParts.AddButton(spec.Panel, "MergeAllButton", ButtonStyle.Special);
            UiPrefabs.Place(mergeAll, Vector2.one, new Vector2(-spec.Theme.Padding, -18f), new Vector2(ButtonWidth, 86f));
            spec.Ref("equipBestButton", equipBest).Ref("equipBestLabel", UiPrefabs.LabelOf(equipBest))
                .Ref("mergeAllButton", mergeAll).Ref("mergeAllLabel", UiPrefabs.LabelOf(mergeAll))
                .Row("stats", statSlot, 84f)
                .Tabs("tabs");
            spec.Dock("forgePanel", ForgeHeight, dock => AddForge(spec, dock))
                .Grid("items", cell, new Vector2(TileSize, TileSize), Columns)
                .Save();
        }

        /// <summary>
        /// 고른 장비의 강화·합성 패널(크림색 줄)을 채운다. 위에서부터 이름·단계와 입기·벗기 버튼, 스탯, 강화 비용과 강화 버튼,
        /// 합성 줄(재료 수, 결과, 합성 버튼)이다. 합성 줄은 다음 장비가 있을 때만 켜지는 mergeRow다.
        /// </summary>
        /// <param name="spec">항목을 더할 명세.</param>
        /// <param name="dock">채울 판.</param>
        private static void AddForge(UiSpec spec, RectTransform dock)
        {
            UiTheme theme = spec.Theme;
            Image background = UiParts.AddFrame(dock, "Background", theme.CellSprite, theme.Cell);
            UiPrefabs.Stretch(background.rectTransform, Vector2.zero, Vector2.zero);

            TMP_Text forgeName = UiPrefabs.AddText(dock, "ForgeName", TextStyle.Ink, new Vector2(0f, 0.72f), new Vector2(0.5f, 1f));
            forgeName.rectTransform.offsetMin = new Vector2(30f, 0f);
            forgeName.alignment = TextAlignmentOptions.MidlineLeft;
            forgeName.fontSize = 42f;
            TMP_Text step = UiPrefabs.AddText(dock, "ForgeStep", TextStyle.InkLabel, new Vector2(0.5f, 0.72f), new Vector2(0.78f, 1f));
            step.alignment = TextAlignmentOptions.MidlineLeft;
            Button equip = UiParts.AddButton(dock, "EquipToggleButton", ButtonStyle.Primary);
            UiPrefabs.Place(equip, new Vector2(1f, 0.86f), new Vector2(-16f, 0f), new Vector2(ButtonWidth, 76f));
            TMP_Text detail = UiPrefabs.AddText(dock, "ForgeDetail", TextStyle.InkSmall, new Vector2(0f, 0.52f), new Vector2(1f, 0.72f));
            detail.rectTransform.offsetMin = new Vector2(30f, 0f);
            detail.alignment = TextAlignmentOptions.MidlineLeft;

            // 강화 줄: 왼쪽에 다음 단계의 골드(동전과 굴러가는 수), 오른쪽에 강화 버튼.
            Image coin = UiIcons.AddFixed(dock, "Coin", UiIcons.Get("currency_gold"));
            UiPrefabs.Place(coin, new Vector2(0f, 0.39f), new Vector2(26f, 0f), new Vector2(54f, 54f));
            TMP_Text cost = UiPrefabs.AddText(dock, "EnhanceCost", TextStyle.Ink, new Vector2(0f, 0.26f), new Vector2(0.6f, 0.52f));
            cost.rectTransform.offsetMin = new Vector2(92f, 0f);
            cost.text = "0";
            cost.alignment = TextAlignmentOptions.MidlineLeft;
            var rolling = cost.gameObject.AddComponent<RollingText>();
            UiPrefabs.SetField(rolling, "_label", cost);
            Button enhance = UiParts.AddButton(dock, "EnhanceButton", ButtonStyle.Positive);
            UiPrefabs.Place(enhance, new Vector2(1f, 0.39f), new Vector2(-16f, 0f), new Vector2(ButtonWidth, 76f));
            enhance.gameObject.AddComponent<RepeatButton>();

            // 합성 줄.
            RectTransform merge = UiPrefabs.AddRect(dock, "MergeRow");
            merge.anchorMin = Vector2.zero;
            merge.anchorMax = new Vector2(1f, 0.26f);
            merge.offsetMin = new Vector2(0f, 8f);
            merge.offsetMax = Vector2.zero;
            TMP_Text mergeCount = UiPrefabs.AddText(merge, "MergeCount", TextStyle.InkSmall, Vector2.zero, new Vector2(0.35f, 1f));
            mergeCount.rectTransform.offsetMin = new Vector2(30f, 0f);
            mergeCount.alignment = TextAlignmentOptions.MidlineLeft;
            TMP_Text mergeInto = UiPrefabs.AddText(merge, "MergeInto", TextStyle.InkSmall, new Vector2(0.35f, 0f), new Vector2(0.78f, 1f));
            mergeInto.alignment = TextAlignmentOptions.MidlineLeft;
            Button mergeButton = UiParts.AddButton(merge, "MergeButton", ButtonStyle.Special);
            UiPrefabs.Place(mergeButton, new Vector2(1f, 0.5f), new Vector2(-16f, 0f), new Vector2(ButtonWidth, 70f));

            spec.Ref("forgeNameText", forgeName).Ref("forgeStepText", step).Ref("forgeDetailText", detail)
                .Ref("equipToggleButton", equip).Ref("equipToggleLabel", UiPrefabs.LabelOf(equip))
                .Ref("enhanceCostText", rolling).Ref("enhanceButton", enhance).Ref("enhanceLabel", UiPrefabs.LabelOf(enhance))
                .Ref("mergeRow", merge.gameObject).Ref("mergeCountText", mergeCount).Ref("mergeIntoText", mergeInto)
                .Ref("mergeButton", mergeButton).Ref("mergeLabel", UiPrefabs.LabelOf(mergeButton));
        }
    }
}
