using PortfolioIdleRpg.Views;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// TypeScript가 전투 월드(src/unity/world.ts)에 도형 배우와 글자를 올리는 문이다. 인스턴스는 루트에
    /// ViewRefs가 붙은 프리팹의 인스턴스이고, 무엇을 언제 보일지는 TypeScript가 정한다. 월드의
    /// 루트와 카메라(흔들림과 히트스톱의 HitFeel)는 WorldRoot가 가진다.
    /// </summary>
    [Preserve]
    public static class WorldFacade
    {
        /// <summary>불러온 프리팹의 새 인스턴스를 전투 월드 루트 아래에 만든다.</summary>
        /// <param name="assetId">ResourceFacade.Load가 돌려준, 다 불러온 프리팹의 로드 id.</param>
        /// <returns>인스턴스 루트의 ViewRefs.</returns>
        [Preserve]
        public static ViewRefs Create(int assetId) =>
            ResourceFacade.Instantiate(assetId, WorldRoot.Get());

        /// <summary>인스턴스를 보이거나 숨긴다. 이미 없어졌으면 아무것도 하지 않는다.</summary>
        /// <param name="view">Create가 돌려준 ViewRefs.</param>
        /// <param name="active">보이려면 true.</param>
        [Preserve]
        public static void SetActive(ViewRefs view, bool active)
        {
            if (view != null)
                view.gameObject.SetActive(active);
        }

        /// <summary>Create로 만든 인스턴스를 없앤다. 이미 없어졌으면 아무것도 하지 않는다.</summary>
        /// <param name="view">Create가 돌려준 ViewRefs.</param>
        [Preserve]
        public static void Destroy(ViewRefs view)
        {
            if (view != null)
                UiRoot.Discard(view.gameObject);
        }

        /// <summary>월드 카메라를 흔든다. 흔들리는 중이면 지금보다 센 흔들림만 받는다.</summary>
        /// <param name="strength">처음 흔들림의 크기(유닛). 남은 시간에 비례해 줄어든다.</param>
        /// <param name="seconds">흔들리는 시간(초).</param>
        [Preserve]
        public static void Shake(float strength, float seconds) => WorldRoot.Feel.Shake(strength, seconds);

        /// <summary>월드를 잠깐 멈춘다(히트스톱). 멈춘 동안이나 지난 멈춤 직후에는 받지 않는다.</summary>
        /// <param name="seconds">멈추는 시간(초). 0.3초를 넘으면 0.3초다.</param>
        [Preserve]
        public static void HitStop(float seconds) => WorldRoot.Feel.Stop(seconds);

        /// <summary>전투 월드와 모든 인스턴스를 없앤다. 스크립트 환경이 사라지면 인스턴스도 함께 사라진다.</summary>
        internal static void DestroyAll() => WorldRoot.DestroyAll();
    }
}
