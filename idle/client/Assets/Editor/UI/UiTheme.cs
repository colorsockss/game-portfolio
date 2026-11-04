using System;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 빌더가 읽는 테마: 색, 글자 크기, 간격, 스프라이트, 글꼴 재질. 빌더는 이 값으로 프리팹을 굽고 런타임은 테마를 모른다
    /// (등급·속성 색표는 빌더가 TintView에 넣는다). 그림체는 짙은 외곽선과 두 단 면이고, 회색조 그림(버튼, 칸, 띠, 게이지, 점)에
    /// 테마 색이 곱해지며 크림색 판과 줄, 알약은 색을 넣어 그린 그림이라 흰색을 곱한다(idle/art/source/ui-kit/draw.py). 그림을
    /// 바꾸려면 이 에셋의 스프라이트를 바꾸고 Tools/UI/Build All Prefabs를 다시 돌린다. 에셋이 없으면 기본값으로 만든다.
    /// </summary>
    internal sealed class UiTheme : ScriptableObject
    {
        /// <summary>테마 에셋의 경로.</summary>
        internal const string AssetPath = "Assets/Editor/UI/UiTheme.asset";

        /// <summary>로그인·전환 화면처럼 화면 전체를 덮는 어두운 바탕.</summary>
        public Color Backdrop = new Color(0.106f, 0.114f, 0.2f, 1f);

        /// <summary>위쪽 HUD와 아래 탭 막대(띠 그림)의 남색.</summary>
        public Color Bar = new Color(0.204f, 0.227f, 0.408f, 1f);

        /// <summary>메인 화면 영웅 띠(띠 그림)의 나무색.</summary>
        public Color Wood = new Color(0.69f, 0.455f, 0.275f, 1f);

        /// <summary>판(팝업, 아래 판, 대사 창)에 곱하는 색. 판 그림이 크림색이라 흰색이다.</summary>
        public Color Panel = Color.white;

        /// <summary>
        /// 아래 판(UiParts.AddSheet)의 면. 테두리 카드 없이 아래 탭과 영웅 띠 사이를 채우는 크림색이고, 판 그림의 안쪽 색과
        /// 같다.
        /// </summary>
        public Color Sheet = new Color32(246, 234, 210, 255);

        /// <summary>판 안의 줄과 칸(줄 그림)에 곱하는 색.</summary>
        public Color Cell = Color.white;

        /// <summary>재화·능력치 알약과 게이지 바탕(알약 그림)에 곱하는 색.</summary>
        public Color Pill = Color.white;

        /// <summary>팝업 뒤와 튜토리얼 막의 어두운 바탕.</summary>
        public Color Dim = new Color(0.05f, 0.04f, 0.1f, 0.65f);

        /// <summary>토스트와 로딩 표시의 바탕.</summary>
        public Color Notice = new Color(0.106f, 0.114f, 0.2f, 0.88f);

        /// <summary>고른 탭과 슬라이더 채움의 주황.</summary>
        public Color Accent = new Color(1f, 0.54f, 0.24f, 1f);

        /// <summary>주 버튼(장착, 로그인).</summary>
        public Color Primary = new Color(0.36f, 0.71f, 1f, 1f);

        /// <summary>보조 버튼(닫기, 취소, 설정).</summary>
        public Color Secondary = new Color(0.72f, 0.76f, 0.84f, 1f);

        /// <summary>긍정 버튼(강화, 레벨업, 배우기).</summary>
        public Color Positive = new Color(0.5f, 0.9f, 0.31f, 1f);

        /// <summary>위험 버튼(환생).</summary>
        public Color Danger = new Color(1f, 0.39f, 0.47f, 1f);

        /// <summary>강조 버튼(보스 도전, 합성)과 고른 아래 탭의 노랑.</summary>
        public Color Special = new Color(1f, 0.82f, 0.25f, 1f);

        /// <summary>알림 뱃지(빨간 점).</summary>
        public Color Badge = new Color(1f, 0.3f, 0.37f, 1f);

        /// <summary>어두운 바탕 위의 글자. 기본 글꼴 재질의 외곽선과 그림자가 함께 그려진다.</summary>
        public Color Text = Color.white;

        /// <summary>어두운 바탕 위의 흐린 글자(이름표, 안내).</summary>
        public Color Muted = new Color(0.69f, 0.72f, 0.84f, 1f);

        /// <summary>크림색 판 위의 글자(외곽선 없는 재질).</summary>
        public Color Ink = new Color(0.35f, 0.24f, 0.17f, 1f);

        /// <summary>크림색 판 위의 흐린 글자.</summary>
        public Color InkMuted = new Color(0.6f, 0.52f, 0.41f, 1f);

        /// <summary>판의 머리와 내용 사이 구분선.</summary>
        public Color Rule = new Color(0.6f, 0.52f, 0.41f, 0.4f);

        /// <summary>재화 수량.</summary>
        public Color Gold = new Color(1f, 0.88f, 0.29f, 1f);

        /// <summary>어두운 바탕 위의 좋은 소식(경험치, 레벨업, 착용 중)의 초록.</summary>
        public Color Good = new Color(0.62f, 1f, 0.42f, 1f);

        /// <summary>크림색 판 위의 좋은 소식(다음 수치)의 초록.</summary>
        public Color GoodInk = new Color(0.23f, 0.65f, 0.16f, 1f);

        /// <summary>튜토리얼 대상 테두리처럼 눈에 띄어야 하는 노랑.</summary>
        public Color Highlight = new Color(1f, 0.82f, 0.25f, 1f);

        /// <summary>영웅 HP 막대의 채움.</summary>
        public Color Hp = new Color(1f, 0.36f, 0.43f, 1f);

        /// <summary>입력란의 바탕.</summary>
        public Color InputBackground = Color.white;

        /// <summary>입력란의 글자. 안내 글자는 이 색의 반투명이다.</summary>
        public Color InputText = new Color(0.23f, 0.18f, 0.16f, 1f);

        /// <summary>장비 등급 칸의 색. 번호가 Items.grade이고 0번은 등급이 없는 것이다.</summary>
        public Color[] Grades =
        {
            new Color(0.62f, 0.66f, 0.76f, 1f),
            new Color(0.76f, 0.79f, 0.84f, 1f),
            new Color(0.56f, 0.87f, 0.37f, 1f),
            new Color(0.39f, 0.72f, 1f, 1f),
            new Color(0.77f, 0.51f, 1f, 1f),
            new Color(1f, 0.76f, 0.25f, 1f),
        };

        /// <summary>
        /// 스킬 칸의 속성 색. 번호는 SkillElement의 선언 순서(Enums.xlsx: 물리, 독, 불, 얼음, 신성)에 1을 더한 것이고 0번은
        /// 잠긴 스킬이다(presentation/view-models/skills.ts의 elementTint).
        /// </summary>
        public Color[] Elements =
        {
            new Color(0.35f, 0.37f, 0.49f, 1f),
            new Color(0.62f, 0.69f, 0.8f, 1f),
            new Color(0.68f, 0.5f, 0.95f, 1f),
            new Color(1f, 0.6f, 0.3f, 1f),
            new Color(0.45f, 0.82f, 1f, 1f),
            new Color(1f, 0.85f, 0.35f, 1f),
        };

        /// <summary>버튼, 탭, 고른 아래 탭(9-slice, 아래 턱). 누르는 것에만 쓴다.</summary>
        public Sprite ButtonSprite;

        /// <summary>팝업, 아래 판, 대사 창의 크림색 판(9-slice, 아래 그림자).</summary>
        public Sprite PanelSprite;

        /// <summary>누르는 칸(9-slice, 위 밝고 아래 어두운 두 단): 장비 칸, 스킬 슬롯.</summary>
        public Sprite TileSprite;

        /// <summary>
        /// 보기만 하는 칸(9-slice, 위쪽 안에 그림자가 진 오목한 칸): 강화·스킬 줄의 아이콘, 영웅 띠의 스킬, 가방. 누르는 칸은 볼록한
        /// <see cref="TileSprite"/>라서 둘이 구별된다.
        /// </summary>
        public Sprite SlotSprite;

        /// <summary>세그먼트 탭의 고른 칸(9-slice, 아래 턱 없이 납작함). 탭 막대가 주황을 입힌다.</summary>
        public Sprite ChipSprite;

        /// <summary>활성 효과의 빛살(도는 그림). 도전할 수 있는 보스 해골 뒤에 돈다.</summary>
        public Sprite RaysSprite;

        /// <summary>판 안의 줄(9-slice, 연한 갈색 테두리의 크림색).</summary>
        public Sprite CellSprite;

        /// <summary>위쪽 HUD, 아래 탭 막대, 영웅 띠(위아래 외곽선의 두 단, 세로 9-slice).</summary>
        public Sprite BandSprite;

        /// <summary>재화·능력치 알약과 게이지 바탕(9-slice, 어두운 보라).</summary>
        public Sprite PillSprite;

        /// <summary>게이지(경험치, 진행 막대)의 채움 스프라이트. Filled라서 반드시 있어야 한다.</summary>
        public Sprite GaugeSprite;

        /// <summary>알림 뱃지와 슬라이더 손잡이, 진행 점의 동그라미.</summary>
        public Sprite DotSprite;

        /// <summary>토글의 체크 표시.</summary>
        public Sprite CheckSprite;

        /// <summary>입력란의 바탕(9-slice).</summary>
        public Sprite InputSprite;

        /// <summary>
        /// 크림색 판 위의 글자 재질(외곽선과 그림자 없음). 기본 재질(외곽선과 아래 그림자)은 글꼴 에셋의 것이라 따로 두지 않는다.
        /// <see cref="UiFont"/>가 만든다.
        /// </summary>
        public Material InkMaterial;

        /// <summary>제목.</summary>
        public float TitleSize = 56f;

        /// <summary>본문, 버튼 글자.</summary>
        public float BodySize = 44f;

        /// <summary>이름표, 설명.</summary>
        public float LabelSize = 38f;

        /// <summary>안내, 결과 줄 같은 작은 글자.</summary>
        public float SmallSize = 32f;

        /// <summary>큰 글자.</summary>
        public float LargeSize = 76f;

        /// <summary>로그인 제목처럼 화면을 대표하는 가장 큰 글자.</summary>
        public float DisplaySize = 96f;

        /// <summary>막대 안의 수치, 칸 아래 이름 같은 작은 글자.</summary>
        public float CaptionSize = 28f;

        /// <summary>가장 작은 글자. 개수와 자동 크기 조절의 하한.</summary>
        public float TinySize = 22f;

        /// <summary>요소 사이의 간격.</summary>
        public float Spacing = 16f;

        /// <summary>패널 가장자리에서 내용까지의 여백.</summary>
        public float Padding = 30f;

        /// <summary>팝업 머리(제목과 닫기)의 높이.</summary>
        public float HeaderHeight = 110f;

        /// <summary>탭 막대의 높이.</summary>
        public float TabHeight = 90f;

        /// <summary>버튼 색의 변화(누름, 비활성). 비활성은 회색으로 바래게 해 살 수 없는 줄이 한눈에 보인다.</summary>
        public ColorBlock ButtonColors = new ColorBlock
        {
            normalColor = Color.white,
            highlightedColor = new Color(0.96f, 0.96f, 0.96f, 1f),
            pressedColor = new Color(0.8f, 0.8f, 0.8f, 1f),
            selectedColor = Color.white,
            disabledColor = new Color(0.62f, 0.62f, 0.66f, 1f),
            colorMultiplier = 1f,
            fadeDuration = 0.08f,
        };

        /// <summary>테마를 읽는다. 없으면 기본값으로 만든다(스프라이트는 비어 사각형이 된다).</summary>
        /// <returns>테마.</returns>
        internal static UiTheme Load()
        {
            var theme = AssetDatabase.LoadAssetAtPath<UiTheme>(AssetPath);
            if (theme != null)
                return theme;
            theme = CreateInstance<UiTheme>();
            AssetDatabase.CreateAsset(theme, AssetPath);
            AssetDatabase.SaveAssets();
            return theme;
        }

        /// <summary>글자 모양의 크기와 색.</summary>
        /// <param name="style">글자 모양.</param>
        /// <returns>크기와 색.</returns>
        internal (float Size, Color Color) Of(TextStyle style) => style switch
        {
            TextStyle.Title => (TitleSize, Text),
            TextStyle.Body => (BodySize, Text),
            TextStyle.Label => (LabelSize, Muted),
            TextStyle.Small => (SmallSize, Muted),
            TextStyle.Large => (LargeSize, Text),
            TextStyle.Ink => (BodySize, Ink),
            TextStyle.InkLabel => (LabelSize, InkMuted),
            TextStyle.InkSmall => (SmallSize, InkMuted),
            _ => throw new ArgumentOutOfRangeException(nameof(style)),
        };

        /// <summary>크림색 판 위의 글자 모양인지. 그러면 외곽선 없는 재질을 쓴다.</summary>
        /// <param name="style">글자 모양.</param>
        /// <returns>판 위의 글자면 true.</returns>
        internal static bool IsInk(TextStyle style) =>
            (style == TextStyle.Ink) || (style == TextStyle.InkLabel) || (style == TextStyle.InkSmall);

        /// <summary>버튼 모양의 바탕색.</summary>
        /// <param name="style">버튼 모양.</param>
        /// <returns>바탕색.</returns>
        internal Color Of(ButtonStyle style) => style switch
        {
            ButtonStyle.Primary => Primary,
            ButtonStyle.Secondary => Secondary,
            ButtonStyle.Positive => Positive,
            ButtonStyle.Danger => Danger,
            ButtonStyle.Special => Special,
            _ => throw new ArgumentOutOfRangeException(nameof(style)),
        };

        /// <summary>글자를 크림색 판 위의 글자로 바꾼다: 외곽선 없는 재질과 그 색.</summary>
        /// <param name="text">글자.</param>
        /// <param name="color">색. 보통 <see cref="Ink"/>나 <see cref="InkMuted"/>다.</param>
        internal void Inked(TMP_Text text, Color color)
        {
            text.fontSharedMaterial = InkMaterial;
            text.color = color;
        }
    }

    /// <summary>글자 모양. 크기와 색은 테마가 정한다. Ink로 시작하는 것은 크림색 판 위의 글자다.</summary>
    internal enum TextStyle
    {
        /// <summary>팝업 제목.</summary>
        Title,

        /// <summary>본문.</summary>
        Body,

        /// <summary>흐린 이름표.</summary>
        Label,

        /// <summary>흐린 작은 글자.</summary>
        Small,

        /// <summary>큰 글자.</summary>
        Large,

        /// <summary>판 위의 본문.</summary>
        Ink,

        /// <summary>판 위의 흐린 이름표.</summary>
        InkLabel,

        /// <summary>판 위의 흐린 작은 글자.</summary>
        InkSmall,
    }

    /// <summary>버튼 모양. 바탕색은 테마가 정한다.</summary>
    internal enum ButtonStyle
    {
        /// <summary>주 버튼(장착, 로그인).</summary>
        Primary,

        /// <summary>보조 버튼(닫기, 취소, 설정).</summary>
        Secondary,

        /// <summary>긍정 버튼(강화, 레벨업).</summary>
        Positive,

        /// <summary>위험 버튼(환생).</summary>
        Danger,

        /// <summary>강조 버튼(보스 도전, 합성).</summary>
        Special,
    }
}
