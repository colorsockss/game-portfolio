using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 가방 화면의 프리팹(Remote/UI/InventoryScreen, InventoryCell)을 코드로 만든다. 다시 실행하면 같은
    /// 경로의 프리팹을 덮어쓰므로 GUID와 참조가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.InventoryPrefabs.Build
    /// </code>
    /// </summary>
    public static class InventoryPrefabs
    {
        /// <summary>그리드의 열 수.</summary>
        private const int Columns = 5;

        /// <summary>칸(등급 칸)의 한 변.</summary>
        private const float SlotSize = 176f;

        /// <summary>칸 아래 이름 줄의 높이.</summary>
        private const float NameHeight = 44f;

        /// <summary>InventoryCell.prefab을 만든 뒤 그것을 쓰는 InventoryScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Inventory Prefabs")]
        public static void Build()
        {
            ViewRefs cell = BuildCell();
            BuildScreen(cell);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the inventory prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 그리드의 칸 프리팹을 만든다: 등급 색 칸 안의 아이콘과 오른쪽 아래 수량, 칸 아래의 이름. ViewRefs 항목은 아이콘,
        /// 이름, 수량, 칸의 등급 색(tint)이다.
        /// </summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject("InventoryCell", typeof(RectTransform), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(SlotSize, SlotSize + NameHeight);
                Image tile = UiParts.AddFrame(root.transform, "Tile", theme.SlotSprite, theme.Grades[0]);
                UiPrefabs.Place(tile, new Vector2(0.5f, 1f), Vector2.zero, new Vector2(SlotSize, SlotSize));
                TintView tint = UiParts.AddTint(tile, theme.Grades);
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch(icon.GetComponent<RectTransform>(), new Vector2(26f, 26f), new Vector2(-26f, -26f));
                TMP_Text amount = UiPrefabs.AddText(tile.transform, "Amount", theme.LabelSize, Vector2.zero, Vector2.one);
                amount.rectTransform.offsetMin = new Vector2(10f, 8f);
                amount.rectTransform.offsetMax = new Vector2(-14f, 0f);
                amount.alignment = TextAlignmentOptions.BottomRight;
                // 장비 그림이 생기기 전에는 같은 슬롯의 장비가 같은 아이콘이라 이름이 가른다.
                TMP_Text itemName = UiPrefabs.AddText(root.transform, "Name", TextStyle.InkSmall, Vector2.zero, new Vector2(1f, 0f));
                itemName.rectTransform.offsetMax = new Vector2(0f, NameHeight);
                itemName.fontSize = theme.CaptionSize;
                itemName.enableAutoSizing = true;
                itemName.fontSizeMin = theme.TinySize;
                itemName.fontSizeMax = theme.CaptionSize;
                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("icon", icon), ("nameText", itemName), ("amountText", amount), ("tint", tint));

                GameObject saved = UiPrefabs.Save(root, "InventoryCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 메인 화면 아래 탭 위의 큰 판(제목, 탭 막대, 그리드)을 만든다.
        /// </summary>
        /// <param name="cell">그리드의 칸 프리팹.</param>
        private static void BuildScreen(ViewRefs cell) =>
            UiSpec.Sheet("InventoryScreen", ScreenPrefabs.SheetHeight("inventory"))
                .Header()
                .Tabs("tabs")
                .Grid("items", cell, new Vector2(SlotSize, SlotSize + NameHeight), Columns)
                .Save();
    }
}
