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
        private const float SlotHeight = 210f;

        /// <summary>목록 칸의 높이.</summary>
        private const float CellHeight = 170f;

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
        /// 슬롯 줄의 칸 하나: 칸 전체가 고르는 버튼이고 위에서부터 슬롯 이름, 장착한 스킬, 레벨이며 고른 슬롯이면 아래에 밑줄이
        /// 켜진다. ViewRefs 항목은 labelText, nameText, levelText, selectedMark, selectButton이다.
        /// </summary>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildSlot()
        {
            UiTheme theme = UiTheme.Load();
            var root = new GameObject("SkillSlot", typeof(RectTransform), typeof(Image), typeof(Button), typeof(ViewRefs));
            try
            {
                var background = root.GetComponent<Image>();
                background.color = theme.Surface;
                var button = root.GetComponent<Button>();
                button.targetGraphic = background;

                TMP_Text label = UiPrefabs.AddText(root.transform, "Label", 30f, new Vector2(0f, 0.7f), Vector2.one);
                label.color = theme.Muted;
                TMP_Text skillName = UiPrefabs.AddText(
                    root.transform, "Name", 38f, new Vector2(0f, 0.35f), new Vector2(1f, 0.7f));
                skillName.fontStyle = FontStyles.Bold;
                TMP_Text level = UiPrefabs.AddText(root.transform, "Level", 30f, new Vector2(0f, 0.1f), new Vector2(1f, 0.35f));
                level.color = theme.Muted;
                Image selected = UiPrefabs.AddImage(root.transform, "SelectedMark", theme.Good);
                selected.raycastTarget = false;
                selected.rectTransform.anchorMin = Vector2.zero;
                selected.rectTransform.anchorMax = new Vector2(1f, 0f);
                selected.rectTransform.pivot = new Vector2(0.5f, 0f);
                selected.rectTransform.offsetMin = Vector2.zero;
                selected.rectTransform.offsetMax = new Vector2(0f, 10f);

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("labelText", label), ("nameText", skillName), ("levelText", level),
                    ("selectedMark", selected.gameObject), ("selectButton", button));
                return UiPrefabs.Save(root, "SkillSlot");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 스킬 목록의 칸 프리팹. 칸 왼쪽에 이름과 레벨, 가운데에 상태와 다음 비용, 오른쪽에 동작 버튼(배우기·장착·해제가 같은
        /// 자리에 겹쳐 하나만 보임)과 레벨업 버튼이 있다.
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
                background.color = theme.Surface;
                var cell = root.GetComponent<ViewRefs>();

                TMP_Text skillName = UiPrefabs.AddText(
                    background.transform, "Name", 42f, new Vector2(0f, 0.5f), new Vector2(0.4f, 1f));
                skillName.rectTransform.offsetMin = new Vector2(30f, 0f);
                skillName.alignment = TextAlignmentOptions.BottomLeft;
                skillName.fontStyle = FontStyles.Bold;
                TMP_Text level = UiPrefabs.AddText(
                    background.transform, "Level", 32f, Vector2.zero, new Vector2(0.4f, 0.5f));
                level.rectTransform.offsetMin = new Vector2(30f, 0f);
                level.alignment = TextAlignmentOptions.TopLeft;
                level.color = theme.Muted;
                TMP_Text state = UiPrefabs.AddText(
                    background.transform, "State", 32f, new Vector2(0.4f, 0.5f), new Vector2(0.62f, 1f));
                state.alignment = TextAlignmentOptions.BottomLeft;
                state.color = theme.Good;
                TMP_Text cost = UiPrefabs.AddText(
                    background.transform, "Cost", 30f, new Vector2(0.4f, 0f), new Vector2(0.62f, 0.5f));
                cost.alignment = TextAlignmentOptions.TopLeft;
                cost.color = theme.Muted;

                // 오른쪽 끝이 레벨업, 그 왼쪽이 동작 버튼 자리다.
                Button levelUp = AddButton(background.transform, "LevelUpButton", ButtonStyle.Primary, 0);
                Button learn = AddButton(background.transform, "LearnButton", ButtonStyle.Primary, 1);
                Button equip = AddButton(background.transform, "EquipButton", ButtonStyle.Positive, 1);
                Button unequip = AddButton(background.transform, "UnequipButton", ButtonStyle.Secondary, 1);

                UiPrefabs.SetRefs(
                    cell, ("nameText", skillName), ("levelText", level), ("stateText", state), ("costText", cost),
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
            float x = -20f - (column * (ButtonWidth + 16f));
            UiPrefabs.Place(button, new Vector2(1f, 0.5f), new Vector2(x, 0f), new Vector2(ButtonWidth, 110f));
            return button;
        }

        /// <summary>화면을 덮는 어두운 바탕 위에 제목, 닫기 버튼, 슬롯 줄, 스킬 목록을 담은 패널을 둔 팝업 프리팹을 만든다.</summary>
        /// <param name="slot">슬롯 줄의 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="cell">스킬 목록의 칸 프리팹.</param>
        private static void BuildScreen(GameObject slot, ViewRefs cell) =>
            UiSpec.Popup("SkillScreen", 960f, 1500f)
                .Header()
                .Row("slots", slot, SlotHeight)
                .List("skills", cell)
                .Save();
    }
}
