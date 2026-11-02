using System;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 빌더가 읽는 테마: 색, 글자 크기, 간격, 스프라이트. 빌더는 이 값으로 프리팹을 굽고 런타임은 테마를 모른다. 그림을
    /// 바꾸려면(백로그 55) 이 에셋의 스프라이트를 바꾸고 Tools/UI/Build All Prefabs를 다시 돌린다. 에셋이 없으면 지금
    /// 화면과 같은 기본값으로 만든다.
    /// </summary>
    internal sealed class UiTheme : ScriptableObject
    {
        /// <summary>테마 에셋의 경로.</summary>
        internal const string AssetPath = "Assets/Editor/UI/UiTheme.asset";

        /// <summary>패널, 전환 화면, 메인 화면 아래 패널의 바탕.</summary>
        public Color Panel = new Color(0.105882354f, 0.12156863f, 0.16470589f, 1f);

        /// <summary>보조 버튼, 칸, 메인 화면 위쪽 막대, 입력란의 바탕.</summary>
        public Color Surface = new Color(0.14901961f, 0.17254902f, 0.23137255f, 1f);

        /// <summary>팝업 뒤와 튜토리얼 막의 어두운 바탕.</summary>
        public Color Dim = new Color(0f, 0f, 0f, 0.6f);

        /// <summary>토스트와 로딩 표시의 바탕.</summary>
        public Color Notice = new Color(0f, 0f, 0f, 0.75f);

        /// <summary>탭, 슬라이더 채움. 고른 탭은 이 색 그대로, 나머지는 어둡게 보인다.</summary>
        public Color Accent = new Color(0.25f, 0.42f, 0.75f, 1f);

        /// <summary>주 버튼(다음 스테이지, 로그인).</summary>
        public Color Primary = new Color(0.239f, 0.494f, 0.949f, 1f);

        /// <summary>긍정 버튼(가방, 장비).</summary>
        public Color Positive = new Color(0.27f, 0.55f, 0.38f, 1f);

        /// <summary>위험 버튼(보스 도전).</summary>
        public Color Danger = new Color(0.85f, 0.27f, 0.27f, 1f);

        /// <summary>알림 뱃지(빨간 점).</summary>
        public Color Badge = new Color(0.93f, 0.26f, 0.26f, 1f);

        /// <summary>본문 글자.</summary>
        public Color Text = Color.white;

        /// <summary>이름표, 설명, 안내처럼 흐린 글자.</summary>
        public Color Muted = new Color(0.6627451f, 0.69411767f, 0.7607843f, 1f);

        /// <summary>재화 수량.</summary>
        public Color Gold = new Color(0.9607843f, 0.77254903f, 0.25882354f, 1f);

        /// <summary>경험치, 레벨, 착용 중, FPS처럼 좋은 소식의 초록.</summary>
        public Color Good = new Color(0.4f, 1f, 0.5f, 1f);

        /// <summary>튜토리얼 대상 테두리처럼 눈에 띄어야 하는 노랑.</summary>
        public Color Highlight = new Color(1f, 0.82f, 0.25f, 1f);

        /// <summary>입력란의 바탕과 글자.</summary>
        public Color InputBackground = Color.white;

        /// <summary>입력란의 글자. 안내 글자는 이 색의 반투명이다.</summary>
        public Color InputText = new Color(0.19607843f, 0.19607843f, 0.19607843f, 1f);

        /// <summary>버튼과 탭의 바탕 스프라이트(9-slice). 없으면 사각형이다.</summary>
        public Sprite ButtonSprite;

        /// <summary>패널(팝업, 카드, 대사 창)의 바탕 스프라이트(9-slice). 없으면 사각형이다.</summary>
        public Sprite PanelSprite;

        /// <summary>게이지(경험치, 진행 막대)의 채움 스프라이트. Filled라서 반드시 있어야 한다.</summary>
        public Sprite GaugeSprite;

        /// <summary>알림 뱃지와 슬라이더 손잡이의 동그라미.</summary>
        public Sprite DotSprite;

        /// <summary>토글의 체크 표시.</summary>
        public Sprite CheckSprite;

        /// <summary>입력란의 바탕(9-slice).</summary>
        public Sprite InputSprite;

        /// <summary>제목.</summary>
        public float TitleSize = 56f;

        /// <summary>본문, 버튼 글자.</summary>
        public float BodySize = 44f;

        /// <summary>이름표, 설명.</summary>
        public float LabelSize = 40f;

        /// <summary>안내, 결과 줄 같은 작은 글자.</summary>
        public float SmallSize = 32f;

        /// <summary>메인 화면의 스테이지 이름 같은 큰 글자.</summary>
        public float LargeSize = 76f;

        /// <summary>요소 사이의 간격.</summary>
        public float Spacing = 20f;

        /// <summary>패널 가장자리에서 내용까지의 여백.</summary>
        public float Padding = 30f;

        /// <summary>팝업 머리(제목과 닫기)의 높이.</summary>
        public float HeaderHeight = 140f;

        /// <summary>탭 막대의 높이.</summary>
        public float TabHeight = 100f;

        /// <summary>버튼 색의 변화(누름, 비활성). 고른 탭과 버튼이 같은 규칙이다.</summary>
        public ColorBlock ButtonColors = new ColorBlock
        {
            normalColor = Color.white,
            highlightedColor = new Color(0.9607843f, 0.9607843f, 0.9607843f, 1f),
            pressedColor = new Color(0.78431374f, 0.78431374f, 0.78431374f, 1f),
            selectedColor = Color.white,
            disabledColor = new Color(0.78431374f, 0.78431374f, 0.78431374f, 0.5019608f),
            colorMultiplier = 1f,
            fadeDuration = 0.1f,
        };

        /// <summary>테마를 읽는다. 없으면 기본값과 Unity의 기본 UI 스프라이트로 만든다.</summary>
        /// <returns>테마.</returns>
        internal static UiTheme Load()
        {
            var theme = AssetDatabase.LoadAssetAtPath<UiTheme>(AssetPath);
            if (theme != null)
                return theme;
            theme = CreateInstance<UiTheme>();
            theme.ButtonSprite = Builtin("UI/Skin/UISprite.psd");
            theme.GaugeSprite = Builtin("UI/Skin/UISprite.psd");
            theme.DotSprite = Builtin("UI/Skin/Knob.psd");
            theme.CheckSprite = Builtin("UI/Skin/Checkmark.psd");
            theme.InputSprite = Builtin("UI/Skin/InputFieldBackground.psd");
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
            _ => throw new ArgumentOutOfRangeException(nameof(style)),
        };

        /// <summary>버튼 모양의 바탕색.</summary>
        /// <param name="style">버튼 모양.</param>
        /// <returns>바탕색.</returns>
        internal Color Of(ButtonStyle style) => style switch
        {
            ButtonStyle.Primary => Primary,
            ButtonStyle.Secondary => Surface,
            ButtonStyle.Positive => Positive,
            ButtonStyle.Danger => Danger,
            _ => throw new ArgumentOutOfRangeException(nameof(style)),
        };

        /// <summary>Unity에 들어 있는 기본 UI 스프라이트.</summary>
        /// <param name="path">기본 리소스 경로.</param>
        /// <returns>스프라이트.</returns>
        private static Sprite Builtin(string path) => AssetDatabase.GetBuiltinExtraResource<Sprite>(path);
    }

    /// <summary>글자 모양. 크기와 색은 테마가 정한다.</summary>
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
    }

    /// <summary>버튼 모양. 바탕색은 테마가 정한다.</summary>
    internal enum ButtonStyle
    {
        /// <summary>주 버튼.</summary>
        Primary,

        /// <summary>보조 버튼(닫기, 취소, 로그아웃, 설정).</summary>
        Secondary,

        /// <summary>긍정 버튼(가방, 장비).</summary>
        Positive,

        /// <summary>위험 버튼(보스 도전).</summary>
        Danger,
    }
}
