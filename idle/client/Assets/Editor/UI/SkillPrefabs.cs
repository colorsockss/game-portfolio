using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 스킬 화면의 프리팹(Remote/UI/SkillScreen, SkillSlot, SkillCell)을 테마, 부품, 팝업 명세로 만든다. 메인 화면의 스킬
    /// 버튼은 ScreenPrefabs가 만든다. 다시 실행하면 같은 경로를 덮어쓰므로 GUID와 fileID가 그대로다. 배치 모드에서는 다음을
    /// 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.SkillPrefabs.Build
    /// </code>
    /// </summary>
    public static class SkillPrefabs
    {
        /// <summary>슬롯 줄의 높이.</summary>
        private const float SlotHeight = 230f;

        /// <summary>목록 칸의 높이.</summary>
        private const float CellHeight = 160f;

        /// <summary>칸 왼쪽 아이콘 칸의 한 변.</summary>
        private const float TileSize = 128f;

        /// <summary>칸의 글자가 시작하는 자리(아이콘 칸 오른쪽).</summary>
        private const float TextLeft = 166f;

        /// <summary>칸 오른쪽 버튼 하나의 너비.</summary>
        private const float ButtonWidth = 170f;

        /// <summary>SkillSlot.prefab, SkillCell.prefab과 그것을 쓰는 SkillScreen.prefab을 만든다.</summary>
        [MenuItem("Tools/UI/Build Skill Prefabs")]
        public static void Build()
        {
            BuildScreen(BuildSlot(), BuildCell());
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the skill prefabs in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 슬롯 줄의 칸 하나: 칸 전체가 고르는 버튼이고, 속성 색 칸 안에 장착한 스킬의 아이콘과 레벨, 칸 위에 슬롯 이름, 아래에
        /// 스킬 이름이 있으며 고른 슬롯이면 주황 테두리가 켜진다. ViewRefs 항목은 labelText, nameText, levelText, icon, tint,
        /// selectedMark, selectButton이다.
        /// </summary>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildSlot()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject("SkillSlot", typeof(RectTransform), typeof(Image), typeof(Button), typeof(ViewRefs));
            try
            {
                // 칸 전체가 누르는 자리라 투명한 바탕이 탭을 받는다.
                var background = root.GetComponent<Image>();
                background.color = Color.clear;
                var button = root.GetComponent<Button>();

                TMP_Text label = UiPrefabs.AddText(root.transform, "Label", TextStyle.InkSmall, new Vector2(0f, 1f), Vector2.one);
                label.rectTransform.offsetMin = new Vector2(0f, -40f);
                Image selected = UiParts.AddFrame(root.transform, "SelectedMark", theme.TileSprite, theme.Accent);
                UiPrefabs.Place(selected, new Vector2(0.5f, 1f), new Vector2(0f, -36f), new Vector2(TileSize + 20f, TileSize + 20f));
                Image tile = UiParts.AddFrame(root.transform, "Tile", theme.TileSprite, theme.Elements[0]);
                UiPrefabs.Place(tile, new Vector2(0.5f, 1f), new Vector2(0f, -46f), new Vector2(TileSize, TileSize));
                TintView tint = UiParts.AddTint(tile, theme.Elements);
                button.targetGraphic = tile;
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(18f, 22f), new Vector2(-18f, -14f));
                TMP_Text level = UiPrefabs.AddText(tile.transform, "Level", theme.CaptionSize, new Vector2(0f, 1f), Vector2.one);
                level.rectTransform.offsetMin = new Vector2(10f, -40f);
                level.alignment = TextAlignmentOptions.TopLeft;
                TMP_Text skillName = UiPrefabs.AddText(root.transform, "Name", TextStyle.Ink, Vector2.zero, new Vector2(1f, 0f));
                skillName.rectTransform.offsetMax = new Vector2(0f, 50f);
                skillName.fontSize = theme.SmallSize;
                skillName.enableAutoSizing = true;
                skillName.fontSizeMin = theme.TinySize;
                skillName.fontSizeMax = theme.SmallSize;

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("labelText", label), ("nameText", skillName), ("levelText", level),
                    ("icon", icon), ("tint", tint), ("selectedMark", selected.gameObject), ("selectButton", button));
                return UiPrefabs.Save(root, "SkillSlot");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 스킬 목록의 칸 프리팹(크림색 줄). 왼쪽에 속성 색 아이콘 칸, 그 오른쪽에 이름과 레벨, 상태와 다음 비용, 오른쪽 끝에 동작
        /// 버튼(배우기·장착·해제가 같은 자리에 겹쳐 하나만 보임)과 레벨업 버튼이 있다.
        /// </summary>
        /// <returns>저장한 프리팹의 ViewRefs.</returns>
        private static ViewRefs BuildCell()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject(
                "SkillCell", typeof(RectTransform), typeof(Image), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(0f, CellHeight);
                root.GetComponent<LayoutElement>().preferredHeight = CellHeight;

                var background = root.GetComponent<Image>();
                UiParts.Paint(background, theme.CellSprite, theme.Cell);
                var cell = root.GetComponent<ViewRefs>();

                Image tile = UiParts.AddFrame(background.transform, "Tile", theme.SlotSprite, theme.Elements[0]);
                UiPrefabs.Place(tile, new Vector2(0f, 0.5f), new Vector2(16f, 0f), new Vector2(TileSize, TileSize));
                TintView tint = UiParts.AddTint(tile, theme.Elements);
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(18f, 22f), new Vector2(-18f, -14f));
                TMP_Text skillName = UiPrefabs.AddText(
                    background.transform, "Name", TextStyle.Ink, new Vector2(0f, 0.5f), new Vector2(0.48f, 1f));
                skillName.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                skillName.alignment = TextAlignmentOptions.BottomLeft;
                skillName.fontSize = theme.LabelSize;
                TMP_Text level = UiPrefabs.AddText(
                    background.transform, "Level", TextStyle.InkSmall, Vector2.zero, new Vector2(0.48f, 0.5f));
                level.rectTransform.offsetMin = new Vector2(TextLeft, 0f);
                level.alignment = TextAlignmentOptions.TopLeft;
                TMP_Text state = UiPrefabs.AddText(
                    background.transform, "State", TextStyle.InkSmall, new Vector2(0.48f, 0.5f), new Vector2(0.66f, 1f));
                state.alignment = TextAlignmentOptions.BottomLeft;
                state.color = theme.GoodInk;
                TMP_Text cost = UiPrefabs.AddText(
                    background.transform, "Cost", TextStyle.InkSmall, new Vector2(0.48f, 0f), new Vector2(0.66f, 0.5f));
                cost.alignment = TextAlignmentOptions.TopLeft;

                // 오른쪽 끝이 레벨업, 그 왼쪽이 동작 버튼 자리다.
                Button levelUp = AddButton(background.transform, "LevelUpButton", ButtonStyle.Positive, 0);
                Button learn = AddButton(background.transform, "LearnButton", ButtonStyle.Positive, 1);
                Button equip = AddButton(background.transform, "EquipButton", ButtonStyle.Primary, 1);
                Button unequip = AddButton(background.transform, "UnequipButton", ButtonStyle.Secondary, 1);

                UiPrefabs.SetRefs(
                    cell, ("icon", icon), ("tint", tint), ("nameText", skillName), ("levelText", level), ("stateText", state),
                    ("costText", cost),
                    ("learnButton", learn), ("learnLabel", UiPrefabs.LabelOf(learn)),
                    ("equipButton", equip), ("equipLabel", UiPrefabs.LabelOf(equip)),
                    ("unequipButton", unequip), ("unequipLabel", UiPrefabs.LabelOf(unequip)),
                    ("levelUpButton", levelUp), ("levelUpLabel", UiPrefabs.LabelOf(levelUp)));

                GameObject saved = UiPrefabs.Save(root, "SkillCell");
                return saved.GetComponent<ViewRefs>();
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>칸의 오른쪽 끝에서 <paramref name="column"/>번째 자리에 버튼을 둔다.</summary>
        /// <param name="parent">칸.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="style">버튼 종류.</param>
        /// <param name="column">오른쪽 끝에서 몇째 자리인지(0부터).</param>
        /// <returns>만든 버튼.</returns>
        private static Button AddButton(Transform parent, string name, ButtonStyle style, int column)
        {
            Button button = UiParts.AddButton(parent, name, style);
            float x = -16f - (column * (ButtonWidth + 12f));
            UiPrefabs.Place(button, new Vector2(1f, 0.5f), new Vector2(x, 0f), new Vector2(ButtonWidth, 100f));
            return button;
        }

        /// <summary>메인 화면 아래 탭 위의 큰 판(제목, 슬롯 줄, 스킬 목록)을 만든다.</summary>
        /// <param name="slot">슬롯 줄의 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="cell">스킬 목록의 칸 프리팹.</param>
        private static void BuildScreen(GameObject slot, ViewRefs cell) =>
            UiSpec.Sheet("SkillScreen", ScreenPrefabs.SheetHeight("skills"))
                .Header()
                .Row("slots", slot, SlotHeight)
                .List("skills", cell)
                .Save();
    }
}
