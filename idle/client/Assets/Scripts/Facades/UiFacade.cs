using PortfolioIdleRpg.Views;
using UnityEngine.InputSystem;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// TypeScript가 뷰를 올리는 캔버스(src/unity/ui.ts)로, 뷰 종류마다 레이어 하나와 그 위의 차단막
    /// 하나로 이뤄진다. 뷰는 루트에 ViewRefs가 붙은 프리팹의 인스턴스이고, 어떤 뷰를 열지와
    /// 무엇을 보여 줄지는 TypeScript가 정한다.
    /// </summary>
    [Preserve]
    public static class UiFacade
    {
        /// <summary>화면 레이어. 맨 아래에 있다.</summary>
        [Preserve]
        public const int Screen = 0;

        /// <summary>팝업 레이어. 화면 위에 있다.</summary>
        [Preserve]
        public const int Popup = 1;

        /// <summary>안내 레이어(튜토리얼). 팝업 위, 오버레이 아래라서 토스트와 로딩 표시가 튜토리얼 막 위에 보인다.</summary>
        [Preserve]
        public const int Guide = 2;

        /// <summary>오버레이 레이어(전환 화면, 토스트, 로딩 표시). 안내 레이어 위에 있다.</summary>
        [Preserve]
        public const int Overlay = 3;

        /// <summary>디버그 레이어. 차단막보다도 위의 맨 위라서, 튜토리얼이나 전환 화면이 막는 동안에도 눌린다.</summary>
        [Preserve]
        public const int Debug = 4;

        /// <summary>불러온 프리팹의 새 인스턴스를 <paramref name="layer"/> 맨 위에 올린다.</summary>
        /// <param name="assetId">ResourceFacade.Load가 돌려준, 다 불러온 프리팹의 로드 id.</param>
        /// <param name="layer">Screen, Popup, Guide, Overlay, Debug 중 하나.</param>
        /// <returns>인스턴스 루트의 ViewRefs.</returns>
        [Preserve]
        public static ViewRefs Create(int assetId, int layer) =>
            ResourceFacade.Instantiate(assetId, UiRoot.Layer(layer));

        /// <summary>Create로 올린 뷰를 없앤다. 이미 없어졌으면 아무것도 하지 않는다.</summary>
        /// <param name="view">Create가 돌려준 ViewRefs.</param>
        [Preserve]
        public static void Destroy(ViewRefs view)
        {
            if (view != null)
                UiRoot.Discard(view.gameObject);
        }

        /// <summary>
        /// 뷰에 닫는 연출(팝업 틀의 PopupMotion)이 있으면 시작하고 그 컴포넌트를 돌려준다. TypeScript는 그 Finished를
        /// 듣고 나서 Destroy를 부른다. 연출이 없거나 돌릴 수 없으면(꺼짐, 첫 프레임 전이라 보인 것이 없음) null이고, 그때는
        /// 바로 Destroy를 부른다.
        /// </summary>
        /// <param name="view">Create가 돌려준 ViewRefs.</param>
        /// <returns>시작한 연출, 또는 null.</returns>
        [Preserve]
        public static PopupMotion Close(ViewRefs view)
        {
            PopupMotion motion = (view != null) ? view.GetComponentInChildren<PopupMotion>() : null;
            return ((motion != null) && motion.Close()) ? motion : null;
        }

        /// <summary>모든 뷰 위에서 탭을 전부 받는 투명 레이어를 보이거나 숨긴다.</summary>
        /// <param name="blocking">보이려면 true.</param>
        [Preserve]
        public static void SetBlocking(bool blocking) => UiRoot.SetBlocking(blocking);

        /// <summary>
        /// 이번 프레임에 뒤로 가기가 눌렸는지 돌려준다. Input System은 안드로이드의 뒤로 가기를 Esc로
        /// 보고한다.
        /// </summary>
        /// <returns>눌렸으면 true.</returns>
        [Preserve]
        public static bool BackPressed() =>
            (Keyboard.current != null) && Keyboard.current.escapeKey.wasPressedThisFrame;

        /// <summary>
        /// 모든 뷰와 한글 대체 글꼴을 없앤다. 스크립트 환경이 사라지면(재시작, 종료) 그 뷰도 함께
        /// 사라진다.
        /// </summary>
        internal static void DestroyAll()
        {
            UiRoot.DestroyAll();
            KoreanFontFallback.Remove();
        }
    }
}
