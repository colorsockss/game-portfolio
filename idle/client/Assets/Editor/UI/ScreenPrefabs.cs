using System.Collections.Generic;
using System.Linq;
using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 화면 레이어의 두 화면(Remote/UI/MainScreen, LoginScreen)과 메인 화면 스킬 바·장착 현황의 칸(SkillBarSlot, LoadoutSlot)을 테마와 부품으로
    /// 처음부터 만든다. 메인 화면은 위에서부터 HUD(레벨, 이름, 경험치, 재화, 설정), 스테이지 막대(이름과 화살표, 웨이브 진행과
    /// 보스 해골 버튼), 그 아래로 비치는 전투, 아래쪽의 영웅 띠(HP, 공격, 치명, 장착 스킬과 재사용 대기), 어두운 아래 영역과
    /// 장착 현황 판, 아래 탭(강화, 스킬, 장비, 가방, 환생)이다. 탭을 누르면 그 화면이 아래 탭 위의 판(UiSpec.Sheet)으로 열리고,
    /// 영웅 띠와 그 아래 어두운 바탕은 열린 판(탭을 모두 끄면 장착 현황 판) 바로 위로 옮겨 간다. 로그인 화면은 가운데 카드(제목, ID 입력란, 로그인 버튼, 상태 문구)다. 바탕과 띠는
    /// 세이프 에어리어 밖까지 늘이고, 고정 글자는 비워 ViewRefs 항목(…Label)으로 내놓는다. 재화 바를 품으므로 위젯 빌더
    /// 다음에 돈다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.ScreenPrefabs.Build
    /// </code>
    /// </summary>
    public static class ScreenPrefabs
    {
        /// <summary>위쪽 HUD의 높이.</summary>
        internal const float HudHeight = 150f;

        /// <summary>
        /// HUD 아래 스테이지 막대(이름과 화살표, 웨이브 진행, 보스 해골)의 높이. 전투 띠(BattleFrame)의 천장이 그 아래
        /// 가장자리다.
        /// </summary>
        internal const float StageBarHeight = 160f;

        /// <summary>아래 탭 막대의 높이. 아래 판은 이 위에 붙는다(UiSpec.Sheet).</summary>
        internal const float NavHeight = 180f;

        /// <summary>작은 판(강화, 장착 현황)의 높이.</summary>
        private const float HalfSheetHeight = 580f;

        /// <summary>큰 판(스킬, 장비, 가방, 환생)의 높이. 전투의 아래쪽까지 올라온다.</summary>
        private const float TallSheetHeight = 1000f;

        /// <summary>영웅 띠의 높이.</summary>
        private const float StripHeight = 110f;

        /// <summary>아래 탭 하나의 너비. 다섯 개와 틈이 기준 너비(1080)에 들어간다.</summary>
        private const float TabWidth = 200f;

        /// <summary>아래 탭 사이의 틈.</summary>
        private const float TabGap = 12f;

        /// <summary>장착 현황 판 칸(등급·속성 색 칸)의 한 변.</summary>
        private const float LoadoutSize = 150f;

        /// <summary>장착 현황 판 칸 아래 이름 줄의 높이.</summary>
        private const float LoadoutNameHeight = 42f;

        /// <summary>스킬 바 칸의 한 변.</summary>
        private const float SkillSize = 96f;

        /// <summary>오른쪽 위 설정 버튼(아이콘만)의 한 변.</summary>
        private const float SettingsButtonSize = 110f;

        /// <summary>설정 버튼과 오른쪽 가장자리 사이의 틈.</summary>
        private const float SettingsButtonInset = 20f;

        /// <summary>
        /// 설정 버튼이 오른쪽 가장자리에서 차지하는 너비. 위쪽에 뜨는 튜토리얼 대사 창(TutorialPrefabs)이 이만큼 오른쪽을 비운다.
        /// </summary>
        internal const float SettingsButtonReach = SettingsButtonInset + SettingsButtonSize;

        /// <summary>아래 탭의 순서: 오브젝트 이름의 앞, 항목 이름(TS의 MainTab)의 앞이자 아이콘 이름의 뒤, 그 탭이 여는 판의 높이.</summary>
        private static readonly (string Object, string Name, float Sheet)[] s_tabs =
        {
            ("Upgrade", "upgrade", HalfSheetHeight), ("Skills", "skills", TallSheetHeight),
            ("Equipment", "equipment", TallSheetHeight), ("Inventory", "inventory", TallSheetHeight),
            ("Rebirth", "rebirth", TallSheetHeight),
        };

        /// <summary>아래 탭 <paramref name="tab"/>이 여는 판의 높이. 판 빌더가 UiSpec.Sheet에 넘긴다.</summary>
        /// <param name="tab">항목 이름의 앞(예: "skills").</param>
        /// <returns>판의 높이.</returns>
        internal static float SheetHeight(string tab) => s_tabs.First(entry => entry.Name == tab).Sheet;

        /// <summary>
        /// 높이가 <paramref name="sheet"/>인 판 위에 얹은 영웅 띠의 아래 가장자리: 아래 탭과 판의 위. 판은 틈 없이 아래 탭과
        /// 영웅 띠 사이를 채운다(UiParts.AddSheet). 전투는 이 위와 스테이지 막대 사이에 보이고, 월드 카메라(CameraFraming)가 그 가운데(BattleFrame)에
        /// 배우를 세운다.
        /// </summary>
        /// <param name="sheet">판의 높이.</param>
        /// <returns>아래 가장자리의 높이.</returns>
        private static float StripBottom(float sheet) => NavHeight + sheet;

        /// <summary>스킬 바의 칸, 메인 화면, 로그인 화면을 만든다.</summary>
        [MenuItem("Tools/UI/Build Screen Prefabs")]
        public static void Build()
        {
            UiTheme theme = UiTheme.Load();
            BuildMainScreen(theme, BuildSkillBarSlot(theme), BuildLoadoutSlot(theme));
            BuildLoginScreen(theme);
            AssetDatabase.SaveAssets();
            Debug.Log($"[UI] Built the main and login screens in {UiPrefabs.Folder}");
        }

        /// <summary>
        /// 스킬 바의 칸 하나: 속성 색 칸 안의 아이콘과, 그 위를 시계처럼 덮는 재사용 대기(어두운 Filled 이미지)와 남은 초.
        /// ViewRefs 항목은 icon, tint, cooldownFill, cooldownText이다.
        /// </summary>
        /// <param name="theme">테마.</param>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildSkillBarSlot(UiTheme theme)
        {
            var root = new GameObject("SkillBarSlot", typeof(RectTransform), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(SkillSize, SkillSize);
                var element = root.GetComponent<LayoutElement>();
                element.preferredWidth = SkillSize;
                element.preferredHeight = SkillSize;
                Image tile = UiParts.AddFrame(root.transform, "Tile", theme.SlotSprite, theme.Elements[0]);
                UiPrefabs.Stretch(tile.rectTransform, Vector2.zero, Vector2.zero);
                TintView tint = UiParts.AddTint(tile, theme.Elements);
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(12f, 10f), new Vector2(-12f, -16f));
                // 재사용 대기: 남은 비율만큼 위에서부터 시계 방향으로 덮인다.
                Image cooldown = UiPrefabs.AddImage(tile.transform, "Cooldown", new Color(0.1f, 0.08f, 0.18f, 0.7f));
                cooldown.raycastTarget = false;
                cooldown.sprite = theme.TileSprite;
                cooldown.type = Image.Type.Filled;
                cooldown.fillMethod = Image.FillMethod.Radial360;
                cooldown.fillOrigin = (int)Image.Origin360.Top;
                cooldown.fillClockwise = false;
                cooldown.fillAmount = 0f;
                UiPrefabs.Stretch(cooldown.rectTransform, new Vector2(6f, 6f), new Vector2(-6f, -6f));
                TMP_Text seconds = UiPrefabs.AddText(tile.transform, "Seconds", theme.LabelSize, Vector2.zero, Vector2.one);

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("icon", icon), ("tint", tint), ("cooldownFill", cooldown),
                    ("cooldownText", seconds));
                return UiPrefabs.Save(root, "SkillBarSlot");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 장착 현황 판의 칸 하나(LoadoutSlot): 칸 전체가 버튼(누르면 그 메뉴를 엶)인 볼록한 등급·속성 색 칸, 안의 아이콘과 왼쪽 위
        /// 단계, 칸 아래 이름. ViewRefs 항목은 tint, icon, levelText, nameText, openButton이다.
        /// </summary>
        /// <param name="theme">테마.</param>
        /// <returns>저장한 프리팹.</returns>
        private static GameObject BuildLoadoutSlot(UiTheme theme)
        {
            var root = new GameObject("LoadoutSlot", typeof(RectTransform), typeof(LayoutElement), typeof(ViewRefs));
            try
            {
                ((RectTransform)root.transform).sizeDelta = new Vector2(LoadoutSize, LoadoutSize + LoadoutNameHeight);
                var element = root.GetComponent<LayoutElement>();
                element.preferredWidth = LoadoutSize;
                element.preferredHeight = LoadoutSize + LoadoutNameHeight;
                Image tile = UiParts.AddFrame(root.transform, "Tile", theme.TileSprite, theme.Grades[0]);
                UiPrefabs.Place(tile, new Vector2(0.5f, 1f), Vector2.zero, new Vector2(LoadoutSize, LoadoutSize));
                tile.raycastTarget = true;
                TintView tint = UiParts.AddTint(tile, theme.Grades);
                var button = tile.gameObject.AddComponent<Button>();
                button.targetGraphic = tile;
                button.colors = theme.ButtonColors;
                IconView icon = UiIcons.Add(tile.transform, "Icon");
                UiPrefabs.Stretch((RectTransform)icon.transform, new Vector2(24f, 34f), new Vector2(-24f, -18f));
                TMP_Text level = UiPrefabs.AddText(tile.transform, "Level", theme.SmallSize, new Vector2(0f, 1f), Vector2.one);
                level.rectTransform.offsetMin = new Vector2(12f, -46f);
                level.rectTransform.offsetMax = new Vector2(-8f, -4f);
                level.alignment = TextAlignmentOptions.TopLeft;
                TMP_Text name = UiPrefabs.AddText(root.transform, "Name", TextStyle.InkSmall, Vector2.zero, Vector2.right);
                name.rectTransform.offsetMax = new Vector2(0f, LoadoutNameHeight);
                name.color = theme.Ink;
                name.enableAutoSizing = true;
                name.fontSizeMin = theme.TinySize;
                name.fontSizeMax = theme.SmallSize;

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(), ("tint", tint), ("icon", icon), ("levelText", level), ("nameText", name),
                    ("openButton", button));
                return UiPrefabs.Save(root, "LoadoutSlot");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>메인 화면을 만든다. 전투 월드가 뒤에 비치도록 루트 바탕은 투명하다.</summary>
        /// <param name="theme">테마.</param>
        /// <param name="skillSlot">스킬 바의 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        /// <param name="loadoutSlot">장착 현황 판의 칸 프리팹. 꺼 둔 틀로 넣는다.</param>
        private static void BuildMainScreen(UiTheme theme, GameObject skillSlot, GameObject loadoutSlot)
        {
            var root = new GameObject("MainScreen", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                UiPrefabs.Stretch((RectTransform)root.transform, Vector2.zero, Vector2.zero);
                root.GetComponent<Image>().color = Color.clear;
                var refs = new List<(string Name, Object Target)>();
                DockView strip = AddStripDock(root.transform, theme);
                refs.Add(("heroStrip", strip));
                refs.AddRange(AddHomePanel(root.transform, theme, loadoutSlot));
                refs.AddRange(AddHud(root.transform, theme));
                refs.AddRange(AddStageBar(root.transform, theme));
                refs.AddRange(AddStrip(strip.transform, theme, skillSlot));
                refs.AddRange(AddNav(root.transform, theme));
                AddBattleFrame(root, strip);
                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), refs.ToArray());
                UiPrefabs.Save(root, "MainScreen");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 전투 띠(BattleFrame)를 루트에 둔다. 천장은 스테이지 막대 자리의 빈 칸(StageBarArea)이고 바닥은 영웅 띠의
        /// 자리라서, 띠가 판을 따라 올라가면 전투도 따라 올라간다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="strip">영웅 띠의 자리.</param>
        private static void AddBattleFrame(GameObject root, DockView strip)
        {
            var ceiling = new GameObject("StageBarArea", typeof(RectTransform));
            ceiling.transform.SetParent(root.transform, false);
            var rect = (RectTransform)ceiling.transform;
            rect.anchorMin = Vector2.up;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(0f, -(HudHeight + StageBarHeight));
            rect.offsetMax = new Vector2(0f, -HudHeight);
            var frame = root.AddComponent<BattleFrame>();
            var serialized = new SerializedObject(frame);
            serialized.FindProperty("_ceiling").objectReferenceValue = rect;
            serialized.FindProperty("_floor").objectReferenceValue = strip.transform;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// 위쪽 HUD: 남색 띠 위에 왼쪽의 레벨 별(안에 레벨), 이름과 그 아래 경험치 막대(안에 비율), 오른쪽의 재화 바와 설정
        /// 버튼. 띠는 위와 양옆으로 세이프 에어리어 밖까지 늘이고, 내용은 루트에 붙여 늘이지 않는다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddHud(Transform root, UiTheme theme)
        {
            Image bar = UiParts.AddFrame(root, "TopBar", theme.BandSprite, theme.Bar);
            bar.rectTransform.anchorMin = new Vector2(0f, 1f);
            bar.rectTransform.anchorMax = Vector2.one;
            bar.rectTransform.offsetMin = new Vector2(-UiPrefabs.BleedMargin, -HudHeight);
            bar.rectTransform.offsetMax = new Vector2(UiPrefabs.BleedMargin, 0f);
            // 띠 위쪽의 외곽선까지 덮어 노치 쪽으로 같은 색이 이어진다.
            Image bleed = UiPrefabs.AddImage(bar.transform, "TopBleed", theme.Bar);
            bleed.raycastTarget = false;
            bleed.rectTransform.anchorMin = Vector2.up;
            bleed.rectTransform.anchorMax = Vector2.one;
            bleed.rectTransform.offsetMin = new Vector2(0f, -12f);
            bleed.rectTransform.offsetMax = new Vector2(0f, UiPrefabs.BleedMargin);

            Image star = UiIcons.AddFixed(root, "LevelBadge", UiIcons.Get("ui_level"));
            UiPrefabs.Place(star, Vector2.up, new Vector2(12f, -16f), new Vector2(118f, 118f));
            TMP_Text level = UiPrefabs.AddText(star.transform, "Level", theme.LabelSize, Vector2.zero, Vector2.one);
            level.rectTransform.offsetMin = new Vector2(0f, 4f);

            TMP_Text name = UiPrefabs.AddText(root, "Name", theme.LabelSize, Vector2.zero, Vector2.one);
            UiPrefabs.Place(name, Vector2.up, new Vector2(140f, -14f), new Vector2(340f, 60f));
            name.alignment = TextAlignmentOptions.MidlineLeft;
            name.enableAutoSizing = true;
            name.fontSizeMin = theme.TinySize;
            name.fontSizeMax = theme.LabelSize;
            (Image track, Image fill) = UiParts.AddGauge(root, "ExpBar");
            UiPrefabs.Place(track, Vector2.up, new Vector2(140f, -80f), new Vector2(340f, 46f));
            TMP_Text exp = UiPrefabs.AddText(track.transform, "ExpText", theme.CaptionSize, Vector2.zero, Vector2.one);
            exp.rectTransform.offsetMin = new Vector2(0f, 3f);

            var currencyBar = (GameObject)PrefabUtility.InstantiatePrefab(
                AssetDatabase.LoadAssetAtPath<GameObject>($"{UiPrefabs.Folder}/CurrencyBar.prefab"), root);
            UiPrefabs.Place(
                currencyBar.transform, Vector2.one, new Vector2(-(SettingsButtonReach + 14f), -(HudHeight - 84f) / 2f),
                new Vector2(330f, 84f));

            Button settings = UiParts.AddButton(root, "SettingsButton", ButtonStyle.Secondary);
            UiPrefabs.Place(
                settings, Vector2.one, new Vector2(-SettingsButtonInset, -(HudHeight - SettingsButtonSize) / 2f),
                new Vector2(SettingsButtonSize, SettingsButtonSize));
            UiPrefabs.LabelOf(settings).gameObject.SetActive(false);
            Image gear = UiIcons.AddFixed(settings.transform, "Icon", UiIcons.Get("main_settings"));
            UiPrefabs.Stretch(gear.rectTransform, new Vector2(14f, 22f), new Vector2(-14f, -10f));

            return new (string Name, Object Target)[]
            {
                ("levelText", level), ("nameText", name), ("expBar", fill), ("expText", exp),
                ("currencyBar", currencyBar.GetComponent<ViewRefs>()), ("settingsButton", settings),
            };
        }

        /// <summary>
        /// HUD 아래의 스테이지 막대: 가운데 스테이지 이름 알약과 양옆의 이전·다음 스테이지 화살표, 그 아래 가운데의 웨이브 진행
        /// 막대(안에 "2/3")와 그 오른쪽 끝에 붙은 보스 해골 버튼, 보스 중의 남은 시간. 해골은 도전할 수 있을 때만 눌리고, 그동안 뒤에서 빛살(bossGlow)이
        /// 돈다. 바탕 없이 전투 위에 뜬다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddStageBar(Transform root, UiTheme theme)
        {
            var top = new Vector2(0.5f, 1f);
            Image pill = UiParts.AddFrame(root, "StagePill", theme.PillSprite, theme.Pill);
            UiPrefabs.Place(pill, top, new Vector2(0f, -(HudHeight + 8f)), new Vector2(460f, 72f));
            TMP_Text stage = UiPrefabs.AddText(pill.transform, "Stage", theme.LabelSize, Vector2.zero, Vector2.one);
            stage.rectTransform.offsetMin = new Vector2(24f, 2f);
            stage.rectTransform.offsetMax = new Vector2(-24f, 0f);
            stage.enableAutoSizing = true;
            stage.fontSizeMin = theme.TinySize;
            stage.fontSizeMax = theme.LabelSize;
            Button prev = AddIconButton(root, "PrevStageButton", "ui_prev", top, new Vector2(-280f, -(HudHeight + 6f)));
            Button next = AddIconButton(root, "NextStageButton", "ui_next", top, new Vector2(280f, -(HudHeight + 6f)));

            // 진행 막대는 이름 알약 아래 가운데에 두고, 해골은 막대의 오른쪽 끝에 붙여 막대의 높이 가운데에 세운다. 해골 그림(ui_boss)은
            // 왼쪽에 칸 너비의 16%가 투명해서 그만큼 막대 쪽으로 당겨야 그림이 막대에 닿는다. 막대 폭은 해골 칸이 다음 스테이지
            // 화살표(x 238부터)에 닿지 않을 만큼이다.
            const float skullSize = 96f;
            const float skullInset = 16f;
            var trackSize = new Vector2(300f, 40f);
            float trackTop = HudHeight + 90f;
            (Image track, Image fill) = UiParts.AddGauge(root, "StageProgress");
            fill.color = theme.Special;
            UiPrefabs.Place(track, top, new Vector2(0f, -trackTop), trackSize);
            TMP_Text waves = UiPrefabs.AddText(track.transform, "Waves", theme.CaptionSize, Vector2.zero, Vector2.one);
            waves.rectTransform.offsetMin = new Vector2(0f, 3f);
            // 빛살은 해골보다 먼저 놓아 뒤에 그리고 탭은 받지 않는다.
            var skullCenter = new Vector2(((trackSize.x + skullSize) / 2f) - skullInset, -(trackTop + (trackSize.y / 2f)));
            Image glow = UiParts.AddFrame(root, "BossGlow", theme.RaysSprite, theme.Special);
            glow.rectTransform.anchorMin = top;
            glow.rectTransform.anchorMax = top;
            glow.rectTransform.anchoredPosition = skullCenter;
            glow.rectTransform.sizeDelta = new Vector2(170f, 170f);
            var spinner = glow.gameObject.AddComponent<Spinner>();
            var serialized = new SerializedObject(spinner);
            serialized.FindProperty("_degreesPerSecond").floatValue = 60f;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            glow.gameObject.SetActive(false);
            Image skull = UiIcons.AddFixed(root, "BossButton", UiIcons.Get("ui_boss"));
            skull.rectTransform.anchorMin = top;
            skull.rectTransform.anchorMax = top;
            skull.rectTransform.anchoredPosition = skullCenter;
            skull.rectTransform.sizeDelta = new Vector2(skullSize, skullSize);
            skull.raycastTarget = true;
            var boss = skull.gameObject.AddComponent<Button>();
            boss.targetGraphic = skull;
            // 도전할 수 없을 때는 비활성 색으로 흐려서, 밝은 해골과 빛살이 누를 때를 알린다.
            boss.colors = theme.ButtonColors;
            TMP_Text bossTime = UiPrefabs.AddText(root, "BossTime", theme.LabelSize, Vector2.zero, Vector2.one);
            UiPrefabs.Place(bossTime, top, new Vector2(330f, -(HudHeight + 80f)), new Vector2(160f, 60f));
            bossTime.color = theme.Gold;

            return new (string Name, Object Target)[]
            {
                ("stageText", stage), ("prevStageButton", prev), ("nextStageButton", next), ("stageProgress", fill),
                ("wavesText", waves), ("bossTimeText", bossTime), ("bossButton", boss), ("bossGlow", glow.gameObject),
            };
        }

        /// <summary>
        /// 영웅 띠의 자리(heroStrip): 띠의 내용(AddStrip)과, 띠 아래로 화면 밖까지 깔아 판 사이로 전투가 비치지 않게 하는 어두운
        /// 바탕을 품는다. 열린 판의 바로 위로 옮겨 가도록(DockView) 탭 이름마다 그 판 위의 높이를, 빈 이름(탭이 모두 꺼짐)에는
        /// 장착 현황 판 위의 높이를 넣는다. 바탕이 장착 현황 판의 뒤에 오도록 루트의 맨 앞에 둔다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>띠의 자리.</returns>
        private static DockView AddStripDock(Transform root, UiTheme theme)
        {
            var strip = new GameObject("HeroStrip", typeof(RectTransform), typeof(DockView));
            strip.transform.SetParent(root, false);
            var rect = (RectTransform)strip.transform;
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.right;
            rect.pivot = new Vector2(0.5f, 0f);
            rect.offsetMin = new Vector2(0f, StripBottom(HalfSheetHeight));
            rect.offsetMax = new Vector2(0f, StripBottom(HalfSheetHeight) + StripHeight);

            float[] bottoms = s_tabs.Select(tab => StripBottom(tab.Sheet)).Prepend(StripBottom(HalfSheetHeight)).ToArray();
            Image backdrop = UiPrefabs.AddImage(strip.transform, "Backdrop", theme.Backdrop);
            backdrop.rectTransform.anchorMin = Vector2.zero;
            backdrop.rectTransform.anchorMax = Vector2.right;
            backdrop.rectTransform.offsetMin = new Vector2(-UiPrefabs.BleedMargin, -(bottoms.Max() + UiPrefabs.BleedMargin));
            backdrop.rectTransform.offsetMax = new Vector2(UiPrefabs.BleedMargin, 0f);

            var dock = strip.GetComponent<DockView>();
            var serialized = new SerializedObject(dock);
            SerializedProperty keys = serialized.FindProperty("_keys");
            SerializedProperty positions = serialized.FindProperty("_positions");
            keys.arraySize = positions.arraySize = bottoms.Length;
            for (var i = 0; i < bottoms.Length; i++)
            {
                keys.GetArrayElementAtIndex(i).stringValue = (i == 0) ? "" : s_tabs[i - 1].Name;
                positions.GetArrayElementAtIndex(i).floatValue = bottoms[i];
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return dock;
        }

        /// <summary>
        /// 탭을 모두 껐을 때 아래 탭 위에 보이는 장착 현황 판(homePanel). 작은 판과 같은 자리이고 위에서부터 장비
        /// 줄(loadoutEquipment)과 스킬 줄(loadoutSkills)이며, 칸을 누르면 그 메뉴가 열린다(슬레이어 키우기는 메뉴를 닫으면 아래에
        /// 장착 스킬 덱을 보인다).
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <param name="loadoutSlot">장착 현황 판의 칸 프리팹.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddHomePanel(Transform root, UiTheme theme, GameObject loadoutSlot)
        {
            RectTransform panel = UiParts.AddSheet(root, theme, "HomePanel", HalfSheetHeight);
            ViewList equipment = AddLoadoutRow(panel.transform, theme, "Equipment", 0f, loadoutSlot);
            ViewList skills = AddLoadoutRow(panel.transform, theme, "Skills", 1f, loadoutSlot);
            return new (string Name, Object Target)[]
            {
                ("homePanel", panel.gameObject), ("loadoutEquipment", equipment), ("loadoutSkills", skills),
                ("loadoutEquipmentLabel", equipment.transform.parent.Find("Label").GetComponent<TMP_Text>()),
                ("loadoutSkillsLabel", skills.transform.parent.Find("Label").GetComponent<TMP_Text>()),
            };
        }

        /// <summary>
        /// 장착 현황 판의 한 줄: 왼쪽 위의 이름표(…Label)와 가운데에 칸을 늘어놓는 ViewList. 판의 위쪽 절반이나 아래쪽 절반을
        /// 채운다.
        /// </summary>
        /// <param name="panel">장착 현황 판.</param>
        /// <param name="theme">테마.</param>
        /// <param name="name">줄의 오브젝트 이름.</param>
        /// <param name="half">0이면 위쪽 절반, 1이면 아래쪽 절반.</param>
        /// <param name="slot">칸 프리팹.</param>
        /// <returns>칸을 늘어놓는 목록.</returns>
        private static ViewList AddLoadoutRow(Transform panel, UiTheme theme, string name, float half, GameObject slot)
        {
            RectTransform row = UiPrefabs.AddRect(panel, $"{name}Row");
            row.anchorMin = new Vector2(0f, 0.5f - (half * 0.5f));
            row.anchorMax = new Vector2(1f, 1f - (half * 0.5f));
            row.offsetMin = new Vector2(theme.Padding, 10f);
            row.offsetMax = new Vector2(-theme.Padding, -16f);
            TMP_Text label = UiPrefabs.AddText(row, "Label", TextStyle.Ink, new Vector2(0f, 1f), Vector2.one);
            label.rectTransform.offsetMin = new Vector2(8f, -48f);
            label.alignment = TextAlignmentOptions.MidlineLeft;

            var go = new GameObject("Slots", typeof(RectTransform), typeof(HorizontalLayoutGroup), typeof(ViewList));
            go.transform.SetParent(row, false);
            UiPrefabs.Stretch((RectTransform)go.transform, Vector2.zero, new Vector2(0f, -52f));
            var layout = go.GetComponent<HorizontalLayoutGroup>();
            layout.spacing = 70f;
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = false;
            var template = (GameObject)PrefabUtility.InstantiatePrefab(slot, go.transform);
            template.SetActive(false);
            var list = go.GetComponent<ViewList>();
            UiPrefabs.SetField(list, "_template", template.GetComponent<ViewRefs>());
            return list;
        }

        /// <summary>글자 대신 아이콘을 넣은 보조 버튼을 놓는다(스테이지 화살표).</summary>
        /// <param name="root">부모.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="icon">아이콘 이름.</param>
        /// <param name="anchor">앵커이자 피벗.</param>
        /// <param name="position">앵커에서의 자리.</param>
        /// <returns>버튼.</returns>
        private static Button AddIconButton(Transform root, string name, string icon, Vector2 anchor, Vector2 position)
        {
            Button button = UiParts.AddButton(root, name, ButtonStyle.Secondary);
            UiPrefabs.Place(button, anchor, position, new Vector2(84f, 76f));
            UiPrefabs.LabelOf(button).gameObject.SetActive(false);
            Image image = UiIcons.AddFixed(button.transform, "Icon", UiIcons.Get(icon));
            UiPrefabs.Stretch(image.rectTransform, new Vector2(16f, 20f), new Vector2(-16f, -10f));
            return button;
        }

        /// <summary>
        /// 아래 판 위의 영웅 띠(나무색): 왼쪽 위의 HP 막대(하트와 "1.02K / 1.38K"), 그 아래 공격과 치명 알약, 오른쪽의 장착 스킬
        /// 칸(재사용 대기). 띠는 양옆으로 세이프 에어리어 밖까지 늘이고, 내용은 띠 자리의 아래에 붙인다.
        /// </summary>
        /// <param name="root">띠의 자리(AddStripDock).</param>
        /// <param name="theme">테마.</param>
        /// <param name="skillSlot">스킬 바의 칸 프리팹.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddStrip(Transform root, UiTheme theme, GameObject skillSlot)
        {
            Image band = UiParts.AddFrame(root, "Band", theme.BandSprite, theme.Wood);
            UiPrefabs.Stretch(band.rectTransform, new Vector2(-UiPrefabs.BleedMargin, 0f), new Vector2(UiPrefabs.BleedMargin, 0f));

            (Image hpTrack, Image hpFill) = UiParts.AddGauge(root, "HpBar");
            hpFill.color = theme.Hp;
            UiPrefabs.Place(hpTrack, Vector2.zero, new Vector2(70f, 58f), new Vector2(560f, 42f));
            TMP_Text hp = UiPrefabs.AddText(hpTrack.transform, "HpText", theme.CaptionSize, Vector2.zero, Vector2.one);
            hp.rectTransform.offsetMin = new Vector2(0f, 3f);
            Image heart = UiIcons.AddFixed(root, "HpIcon", UiIcons.Get("stat_maxHp"));
            UiPrefabs.Place(heart, Vector2.zero, new Vector2(20f, 46f), new Vector2(66f, 66f));

            TMP_Text attack = AddStatPill(root, theme, "Attack", "stat_attack", 70f);
            attack.color = theme.Gold;
            TMP_Text crit = AddStatPill(root, theme, "Crit", "stat_critChance", 380f);

            var skills = new GameObject("Skills", typeof(RectTransform), typeof(HorizontalLayoutGroup), typeof(ViewList));
            skills.transform.SetParent(root, false);
            UiPrefabs.Place(
                skills.transform, Vector2.right, new Vector2(-20f, 7f),
                new Vector2((3f * SkillSize) + (2f * 14f), SkillSize));
            var layout = skills.GetComponent<HorizontalLayoutGroup>();
            layout.spacing = 14f;
            layout.childAlignment = TextAnchor.MiddleRight;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = false;
            var template = (GameObject)PrefabUtility.InstantiatePrefab(skillSlot, skills.transform);
            template.SetActive(false);
            var list = skills.GetComponent<ViewList>();
            UiPrefabs.SetField(list, "_template", template.GetComponent<ViewRefs>());

            return new (string Name, Object Target)[]
            {
                ("hpBar", hpFill), ("hpText", hp), ("attackText", attack), ("critText", crit), ("skills", list),
            };
        }

        /// <summary>영웅 띠 아래 줄의 능력치 알약 하나(왼쪽에 걸친 아이콘, 오른쪽 정렬 수치)를 놓는다.</summary>
        /// <param name="root">띠의 자리.</param>
        /// <param name="theme">테마.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="icon">아이콘 이름.</param>
        /// <param name="x">알약의 왼쪽 가장자리.</param>
        /// <returns>수치 글자.</returns>
        private static TMP_Text AddStatPill(Transform root, UiTheme theme, string name, string icon, float x)
        {
            Image pill = UiParts.AddFrame(root, $"{name}Pill", theme.PillSprite, theme.Pill);
            UiPrefabs.Place(pill, Vector2.zero, new Vector2(x, 10f), new Vector2(250f, 42f));
            TMP_Text value = UiPrefabs.AddText(pill.transform, name, theme.SmallSize, Vector2.zero, Vector2.one);
            value.rectTransform.offsetMin = new Vector2(40f, 3f);
            value.rectTransform.offsetMax = new Vector2(-18f, 0f);
            value.alignment = TextAlignmentOptions.MidlineRight;
            Image image = UiIcons.AddFixed(root, $"{name}Icon", UiIcons.Get(icon));
            UiPrefabs.Place(image, Vector2.zero, new Vector2(x - 46f, 2f), new Vector2(58f, 58f));
            return value;
        }

        /// <summary>
        /// 아래 탭 막대: 남색 띠 위에 탭 다섯(강화, 스킬, 장비, 가방, 환생). 탭은 투명한 버튼 위의 아이콘과 이름이고, 고른 탭은
        /// 뒤에 노란 판(…Selected)이 켜진다. 장비 탭에는 더 좋은 장비의 알림 뱃지가 있다. 항목은 탭마다 …Button, …Label,
        /// …Selected이다.
        /// </summary>
        /// <param name="root">메인 화면의 루트.</param>
        /// <param name="theme">테마.</param>
        /// <returns>ViewRefs 항목.</returns>
        private static IEnumerable<(string Name, Object Target)> AddNav(Transform root, UiTheme theme)
        {
            Image band = UiParts.AddFrame(root, "Nav", theme.BandSprite, theme.Bar);
            band.raycastTarget = true;
            band.rectTransform.anchorMin = Vector2.zero;
            band.rectTransform.anchorMax = Vector2.right;
            band.rectTransform.offsetMin = new Vector2(-UiPrefabs.BleedMargin, -UiPrefabs.BleedMargin);
            band.rectTransform.offsetMax = new Vector2(UiPrefabs.BleedMargin, NavHeight);

            var refs = new List<(string Name, Object Target)>();
            float left = (1080f - ((s_tabs.Length * TabWidth) + ((s_tabs.Length - 1) * TabGap))) / 2f;
            for (var i = 0; i < s_tabs.Length; i++)
            {
                (string objectName, string name, _) = s_tabs[i];
                var tab = new GameObject($"{objectName}Button", typeof(RectTransform), typeof(Image), typeof(Button));
                tab.transform.SetParent(root, false);
                var hit = tab.GetComponent<Image>();
                hit.color = Color.clear;
                var button = tab.GetComponent<Button>();
                button.transition = Selectable.Transition.None;
                UiPrefabs.Place(button, Vector2.zero, new Vector2(left + (i * (TabWidth + TabGap)), 4f), new Vector2(TabWidth, NavHeight - 12f));

                Image selected = UiParts.AddFrame(tab.transform, "Selected", theme.ButtonSprite, theme.Special);
                // 아래 판이 아래 탭 바로 위에서 시작하고 판이 메인 화면 위에 그려지므로, 띠 위로 솟지 않고 띠 안에 둔다.
                UiPrefabs.Place(selected, new Vector2(0.5f, 0f), new Vector2(0f, 2f), new Vector2(TabWidth, NavHeight - 14f));
                selected.gameObject.SetActive(false);
                Image icon = UiIcons.AddFixed(tab.transform, "Icon", UiIcons.Get($"main_{name}"));
                UiPrefabs.Place(icon, new Vector2(0.5f, 0f), new Vector2(0f, 58f), new Vector2(110f, 110f));
                TMP_Text label = UiPrefabs.AddText(tab.transform, "Label", theme.SmallSize, Vector2.zero, Vector2.right);
                label.rectTransform.offsetMin = new Vector2(0f, 12f);
                label.rectTransform.offsetMax = new Vector2(0f, 58f);

                refs.Add(($"{name}Button", button));
                refs.Add(($"{name}Label", label));
                refs.Add(($"{name}Selected", selected.gameObject));
                if (name == "equipment")
                    refs.Add(("equipmentBadge", UiParts.AddBadge(tab.transform)));
            }
            return refs;
        }

        /// <summary>로그인 화면을 만든다: 세이프 에어리어 밖까지 덮는 어두운 바탕, 그 위의 제목, 가운데 크림색 카드.</summary>
        /// <param name="theme">테마.</param>
        private static void BuildLoginScreen(UiTheme theme)
        {
            var root = new GameObject("LoginScreen", typeof(RectTransform), typeof(Image), typeof(ViewRefs));
            try
            {
                UiPrefabs.Bleed((RectTransform)root.transform);
                root.GetComponent<Image>().color = theme.Backdrop;

                Image card = UiParts.AddFrame(root.transform, "Card", theme.PanelSprite, theme.Panel);
                card.raycastTarget = true;
                card.rectTransform.sizeDelta = new Vector2(880f, 600f);

                TMP_Text title = UiPrefabs.AddText(card.transform, "Title", theme.DisplaySize, Vector2.zero, Vector2.one);
                title.textWrappingMode = TextWrappingModes.Normal;
                title.rectTransform.anchorMin = new Vector2(0.5f, 1f);
                title.rectTransform.anchorMax = new Vector2(0.5f, 1f);
                title.rectTransform.anchoredPosition = new Vector2(0f, 130f);
                title.rectTransform.sizeDelta = new Vector2(960f, 160f);

                TMP_InputField input = UiParts.AddInput(card.transform, "IdInput");
                ((RectTransform)input.transform).anchoredPosition = new Vector2(0f, 150f);
                input.characterLimit = 16;
                input.textComponent.fontSize = theme.TitleSize;
                var placeholder = (TMP_Text)input.placeholder;
                placeholder.fontSize = theme.TitleSize;

                Button login = UiParts.AddButton(card.transform, "LoginButton", ButtonStyle.Positive);
                UiPrefabs.Place(login, new Vector2(0.5f, 0.5f), new Vector2(0f, -10f), new Vector2(760f, 140f));

                TMP_Text status = UiPrefabs.AddText(card.transform, "Status", TextStyle.InkLabel, Vector2.zero, Vector2.one);
                status.textWrappingMode = TextWrappingModes.Normal;
                status.rectTransform.anchorMin = new Vector2(0.5f, 0.5f);
                status.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
                status.rectTransform.anchoredPosition = new Vector2(0f, -185f);
                status.rectTransform.sizeDelta = new Vector2(760f, 140f);

                UiPrefabs.SetRefs(
                    root.GetComponent<ViewRefs>(),
                    ("idInput", input), ("loginButton", login), ("statusText", status), ("titleLabel", title),
                    ("loginLabel", UiPrefabs.LabelOf(login)), ("idPlaceholder", placeholder));
                UiPrefabs.Save(root, "LoginScreen");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }
    }
}
