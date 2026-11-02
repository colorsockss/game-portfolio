using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 장비 화면의 프리팹(Remote/UI/EquipmentScreen, EquipmentCell)을 테마, 부품, 팝업 명세로 만든다. 메인 화면의 장비
    /// 버튼은 ScreenPrefabs가 만든다. 능력치 칸은 위젯의 CurrencySlot을 쓰므로 Tools/UI/Build Widget Prefabs 다음에 실행한다.
    /// 다시 실행하면 같은 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.EquipmentPrefabs.Build
    /// </code>
    /// </summary>
    public static class EquipmentPrefabs
    {
        /// <summary>능력치 칸으로 쓰는 위젯(이름표와 굴러가는 수).</summary>
        private const string StatSlotPath = UiPrefabs.Folder + "/CurrencySlot.prefab";

        /// <summary>목록 칸의 높이.</summary>
        private const float CellHeight = 150f;

        /// <summary>줄 왼쪽 아이콘의 한 변.</summary>
        private const float IconSize = 110f;

        /// <summary>줄의 이름과 스탯 글자가 시작하는 자리(아이콘 오른쪽).</summary>
        private const float TextLeft = 150f;

        /// <summary>아래쪽 강화·합성 패널의 높이.</summary>
        private const float ForgeHeight = 320f;

        /// <summary>칸과 패널의 오른쪽 버튼 너비.</summary>
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
        /// 누를 수 있는 목록 칸 프리팹을 만든다. 칸의 ViewRefs 항목은 이름(왼쪽 위), 설명(왼쪽 아래),
        /// 상태(가운데 오른쪽), 칸 전체의 버튼(입기·벗기)과 오른쪽 끝의 강화 버튼(아래 패널에 고르기)이다.
        /// </summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject(
                "EquipmentCell", typeof(RectTransform), typeof(Image), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(0f, CellHeight);
                root.GetComponent<LayoutElement>().preferredHeight = CellHeight;

                var background = root.GetComponent<Image>();
                background.color = theme.Surface;
                var button = background.gameObject.AddComponent<Button>();
                button.targetGraphic = background;
                var cell = root.GetComponent<ViewRefs>();

                IconView icon = UiIcons.Add(background.transform, "Icon");
                UiPrefabs.Place(icon, new Vector2(0f, 0.5f), new Vector2(20f, 0f), new Vector2(IconSize, IconSize));
                TMP_Text itemName = UiPrefabs.AddText(
                    background.transform, "Name", 44f, new Vector2(0f, 0.5f), new Vector2(0.6f, 1f));
                itemName.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                itemName.alignment = TextAlignmentOptions.BottomLeft;
                itemName.fontStyle = FontStyles.Bold;
                TMP_Text detail = UiPrefabs.AddText(
                    background.transform, "Detail", 34f, Vector2.zero, new Vector2(0.6f, 0.5f));
                detail.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                detail.alignment = TextAlignmentOptions.TopLeft;
                // 스탯이 많거나 영어면 길어서, 한 줄로 두고 오른쪽의 상태 글자에 닿지 않게 줄인다.
                detail.textWrappingMode = TextWrappingModes.NoWrap;
                detail.enableAutoSizing = true;
                detail.fontSizeMin = 24f;
                detail.fontSizeMax = 34f;
                detail.color = theme.Muted;
                TMP_Text state = UiPrefabs.AddText(
                    background.transform, "State", 36f, new Vector2(0.6f, 0f), Vector2.one);
                state.rectTransform.offsetMax = new Vector2(-(ButtonWidth + 40f), 0f);
                state.alignment = TextAlignmentOptions.MidlineRight;
                state.color = theme.Good;
                // 칸 전체의 버튼 위에 놓인 버튼이라 누르면 이것만 받는다.
                Button forge = UiParts.AddButton(background.transform, "ForgeButton", ButtonStyle.Secondary);
                UiPrefabs.Place(forge, new Vector2(1f, 0.5f), new Vector2(-20f, 0f), new Vector2(ButtonWidth, 100f));

                UiPrefabs.SetRefs(
                    cell, ("icon", icon), ("nameText", itemName), ("detailText", detail), ("stateText", state), ("selectButton", button),
                    ("forgeButton", forge), ("forgeLabel", UiPrefabs.LabelOf(forge)));

                GameObject saved = UiPrefabs.Save(root, "EquipmentCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 화면을 덮는 어두운 바탕 위에 제목, 닫기 버튼, 능력치 줄, 슬롯 탭, 장비 목록, 아래쪽 강화·합성 패널을 담은 패널을 둔
        /// 팝업 프리팹을 만든다. 바탕이 터치를 받아 메인 화면의 버튼이 눌리지 않는다. 능력치 칸(공격, 방어, HP)의 수는
        /// TypeScript가 정한다.
        /// </summary>
        /// <param name="cell">목록의 칸 프리팹.</param>
        /// <param name="statSlot">능력치 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        private static void BuildScreen(ViewRefs cell, GameObject statSlot)
        {
            UiSpec spec = UiSpec.Popup("EquipmentScreen", 960f, 1500f)
                .Header()
                .Row("stats", statSlot, 120f)
                .Tabs("tabs");
            spec.Dock("forgePanel", ForgeHeight, dock => AddForge(spec, dock))
                .List("items", cell)
                .Save();
        }

        /// <summary>
        /// 고른 장비의 강화·합성 패널을 채운다. 위에서부터 이름과 단계, 스탯, 강화 비용과 강화 버튼, 합성 줄(재료 수, 결과,
        /// 합성 버튼)이다. 합성 줄은 다음 등급이 있을 때만 켜지는 mergeRow다.
        /// </summary>
        /// <param name="spec">항목을 더할 명세.</param>
        /// <param name="dock">채울 판.</param>
        private static void AddForge(UiSpec spec, RectTransform dock)
        {
            UiTheme theme = spec.Theme;
            Image background = UiPrefabs.AddImage(dock, "Background", theme.Surface);
            UiPrefabs.Stretch(background.rectTransform, Vector2.zero, Vector2.zero);

            TMP_Text forgeName = UiPrefabs.AddText(dock, "ForgeName", 42f, new Vector2(0f, 0.75f), new Vector2(0.65f, 1f));
            forgeName.rectTransform.offsetMin = new Vector2(30f, 0f);
            forgeName.alignment = TextAlignmentOptions.MidlineLeft;
            forgeName.fontStyle = FontStyles.Bold;
            TMP_Text step = UiPrefabs.AddText(dock, "ForgeStep", 34f, new Vector2(0.65f, 0.75f), Vector2.one);
            step.rectTransform.offsetMax = new Vector2(-30f, 0f);
            step.alignment = TextAlignmentOptions.MidlineRight;
            step.color = theme.Muted;
            TMP_Text detail = UiPrefabs.AddText(dock, "ForgeDetail", 32f, new Vector2(0f, 0.55f), new Vector2(1f, 0.75f));
            detail.rectTransform.offsetMin = new Vector2(30f, 0f);
            detail.alignment = TextAlignmentOptions.MidlineLeft;
            detail.color = theme.Muted;

            // 강화 줄: 왼쪽에 다음 단계의 골드(굴러가는 수), 오른쪽에 강화 버튼.
            TMP_Text cost = UiPrefabs.AddText(dock, "EnhanceCost", 40f, new Vector2(0f, 0.3f), new Vector2(0.6f, 0.55f));
            cost.rectTransform.offsetMin = new Vector2(30f, 0f);
            cost.text = "0";
            cost.alignment = TextAlignmentOptions.MidlineLeft;
            cost.color = theme.Gold;
            var rolling = cost.gameObject.AddComponent<RollingText>();
            UiPrefabs.SetField(rolling, "_label", cost);
            Button enhance = UiParts.AddButton(dock, "EnhanceButton", ButtonStyle.Primary);
            UiPrefabs.Place(enhance, new Vector2(1f, 0.425f), new Vector2(-20f, 0f), new Vector2(ButtonWidth, 90f));

            // 합성 줄.
            RectTransform merge = UiPrefabs.AddRect(dock, "MergeRow");
            merge.anchorMin = Vector2.zero;
            merge.anchorMax = new Vector2(1f, 0.3f);
            merge.offsetMin = Vector2.zero;
            merge.offsetMax = Vector2.zero;
            TMP_Text mergeCount = UiPrefabs.AddText(merge, "MergeCount", 32f, Vector2.zero, new Vector2(0.35f, 1f));
            mergeCount.rectTransform.offsetMin = new Vector2(30f, 0f);
            mergeCount.alignment = TextAlignmentOptions.MidlineLeft;
            TMP_Text mergeInto = UiPrefabs.AddText(merge, "MergeInto", 32f, new Vector2(0.35f, 0f), new Vector2(0.75f, 1f));
            mergeInto.alignment = TextAlignmentOptions.MidlineLeft;
            mergeInto.color = theme.Muted;
            Button mergeButton = UiParts.AddButton(merge, "MergeButton", ButtonStyle.Positive);
            UiPrefabs.Place(mergeButton, new Vector2(1f, 0.5f), new Vector2(-20f, 0f), new Vector2(ButtonWidth, 90f));

            spec.Ref("forgeNameText", forgeName).Ref("forgeStepText", step).Ref("forgeDetailText", detail)
                .Ref("enhanceCostText", rolling).Ref("enhanceButton", enhance).Ref("enhanceLabel", UiPrefabs.LabelOf(enhance))
                .Ref("mergeRow", merge.gameObject).Ref("mergeCountText", mergeCount).Ref("mergeIntoText", mergeInto)
                .Ref("mergeButton", mergeButton).Ref("mergeLabel", UiPrefabs.LabelOf(mergeButton));
        }
    }
}
