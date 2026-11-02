using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// UI가 있는 동안 앱에 든 한글 글꼴(Noto Sans KR, SIL OFL 1.1, Resources/Fonts)을 TextMeshPro의 대체 글꼴에 넣고, 끝나면
    /// 뺀다. 기기마다 다른 OS 글꼴에 기대지 않으므로 어느 기기에서나 같은 한글이 나온다.
    /// </summary>
    internal static class KoreanFontFallback
    {
        /// <summary>번들한 한글 글꼴의 Resources 경로.</summary>
        private const string FontPath = "Fonts/NotoSansKR-Regular";

        /// <summary>대체 글꼴에 넣은 한글 글꼴. 넣지 않았으면 null이다.</summary>
        private static TMP_FontAsset s_koreanFallback;

        /// <summary>
        /// 번들한 글꼴로 동적 글꼴 에셋을 만들어 대체 글꼴 목록에 넣는다. 에셋은 실행 중에만 있어서 쓰는 글자가 아틀라스에
        /// 그려져도 프로젝트의 파일은 바뀌지 않는다. 글꼴이 없으면 경고를 남긴다.
        /// </summary>
        internal static void Add()
        {
            List<TMP_FontAsset> fallbacks = TMP_Settings.fallbackFontAssets;
            if (fallbacks == null)
                return;
            var font = Resources.Load<Font>(FontPath);
            if (font == null)
            {
                Debug.LogWarning($"[UI] No Korean font at Resources/{FontPath}; Hangul will not show.");
                return;
            }
            s_koreanFallback = TMP_FontAsset.CreateFontAsset(font);
            fallbacks.Add(s_koreanFallback);
        }

        /// <summary>넣은 한글 글꼴을 대체 글꼴 목록에서 빼고 폐기한다.</summary>
        internal static void Remove()
        {
            if (s_koreanFallback == null)
                return;
            TMP_Settings.fallbackFontAssets?.Remove(s_koreanFallback);
            UiRoot.Discard(s_koreanFallback);
            s_koreanFallback = null;
        }
    }
}
