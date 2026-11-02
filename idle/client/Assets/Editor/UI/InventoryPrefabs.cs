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
        private const int Columns = 4;

        /// <summary>칸의 너비와 높이.</summary>
        private const float SlotSize = 210f;

        /// <summary>칸 위쪽 아이콘의 한 변.</summary>
        private const float IconSize = 110f;

        /// <summary>InventoryCell.prefab을 만든 뒤 그것을 쓰는 InventoryScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Inventory Prefabs")]
        public static void Build()
        {
            ViewRefs cell = BuildCell();
            BuildScreen(cell);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the inventory prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>그리드의 칸 프리팹을 만든다. 칸의 ViewRefs 항목은 아이콘, 이름, 수량이다.</summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            var root = new GameObject("InventoryCell", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(SlotSize, SlotSize);
                root.GetComponent<Image>().color = UiTheme.Load().Surface;
                // 위에 아이콘, 그 아래에 이름과 수량. 장비 그림이 생기기 전에는 같은 슬롯의 장비가 같은 아이콘이라 이름이 가른다.
                IconView icon = UiIcons.Add(root.transform, "Icon");
                UiPrefabs.Place(icon, new Vector2(0.5f, 1f), new Vector2(0f, -12f), new Vector2(IconSize, IconSize));
                TMP_Text itemName = UiPrefabs.AddText(
                    root.transform, "Name", 30f, new Vector2(0f, 0.22f), new Vector2(1f, 0.42f));
                TMP_Text amount = UiPrefabs.AddText(root.transform, "Amount", 36f, Vector2.zero, new Vector2(1f, 0.22f));
                amount.fontStyle = FontStyles.Bold;
                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("icon", icon), ("nameText", itemName), ("amountText", amount));

                GameObject saved = UiPrefabs.Save(root, "InventoryCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 화면을 덮는 어두운 바탕 위에 제목, 닫기 버튼, 탭 막대, 그리드를 담은 패널을 둔 팝업 프리팹을 만든다.
        /// 바탕이 터치를 받아 메인 화면의 버튼이 눌리지 않는다.
        /// </summary>
        /// <param name="cell">그리드의 칸 프리팹.</param>
        private static void BuildScreen(ViewRefs cell) =>
            UiSpec.Popup("InventoryScreen", 960f, 1400f)
                .Header()
                .Tabs("tabs")
                .Grid("items", cell, new Vector2(SlotSize, SlotSize), Columns)
                .Save();
    }
}
