using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// TypeScript가 화면 출력을 정하는 문이다(src/unity/bridge.ts). 값은 TypeScript의 설정이 정하고,
    /// 여기서는 Unity에 그대로 넘긴다. 기기의 표시 언어도 여기서 읽는다(언어 설정의 기본값).
    /// </summary>
    [Preserve]
    public static class DisplayFacade
    {
        /// <summary>
        /// 기기의 표시 언어를 ISO 639-1 두 글자(예: ko, en)로 준다. 게임이 그 언어를 고를 수 있는지는 TypeScript가
        /// 문장 테이블의 언어 열로 정한다.
        /// </summary>
        [Preserve]
        public static string Language => ToLanguageCode(Application.systemLanguage);

        /// <summary>
        /// 초당 프레임의 목표를 정한다. 두 품질 레벨 모두 수직 동기화가 꺼져 있어서 이 값을 따른다.
        /// </summary>
        /// <param name="frameRate">초당 프레임.</param>
        [Preserve]
        public static void SetFrameRate(int frameRate) => Application.targetFrameRate = frameRate;

        /// <summary>Unity의 언어를 ISO 639-1 두 글자로 바꾼다. 두 글자 코드가 없는 언어는 빈 글자다.</summary>
        /// <param name="language">Unity가 알아낸 기기 언어.</param>
        /// <returns>ISO 639-1 코드.</returns>
        private static string ToLanguageCode(SystemLanguage language) => language switch
        {
            SystemLanguage.Afrikaans => "af",
            SystemLanguage.Arabic => "ar",
            SystemLanguage.Basque => "eu",
            SystemLanguage.Belarusian => "be",
            SystemLanguage.Bulgarian => "bg",
            SystemLanguage.Catalan => "ca",
            SystemLanguage.Chinese => "zh",
            SystemLanguage.ChineseSimplified => "zh",
            SystemLanguage.ChineseTraditional => "zh",
            SystemLanguage.Czech => "cs",
            SystemLanguage.Danish => "da",
            SystemLanguage.Dutch => "nl",
            SystemLanguage.English => "en",
            SystemLanguage.Estonian => "et",
            SystemLanguage.Faroese => "fo",
            SystemLanguage.Finnish => "fi",
            SystemLanguage.French => "fr",
            SystemLanguage.German => "de",
            SystemLanguage.Greek => "el",
            SystemLanguage.Hebrew => "he",
            SystemLanguage.Hungarian => "hu",
            SystemLanguage.Icelandic => "is",
            SystemLanguage.Indonesian => "id",
            SystemLanguage.Italian => "it",
            SystemLanguage.Japanese => "ja",
            SystemLanguage.Korean => "ko",
            SystemLanguage.Latvian => "lv",
            SystemLanguage.Lithuanian => "lt",
            SystemLanguage.Norwegian => "no",
            SystemLanguage.Polish => "pl",
            SystemLanguage.Portuguese => "pt",
            SystemLanguage.Romanian => "ro",
            SystemLanguage.Russian => "ru",
            SystemLanguage.SerboCroatian => "sh",
            SystemLanguage.Slovak => "sk",
            SystemLanguage.Slovenian => "sl",
            SystemLanguage.Spanish => "es",
            SystemLanguage.Swedish => "sv",
            SystemLanguage.Thai => "th",
            SystemLanguage.Turkish => "tr",
            SystemLanguage.Ukrainian => "uk",
            SystemLanguage.Vietnamese => "vi",
            _ => string.Empty,
        };
    }
}
