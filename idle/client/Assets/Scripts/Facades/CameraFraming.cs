using PortfolioIdleRpg.Views;
using UnityEngine;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 전투 월드 카메라의 받침(카메라의 부모)을 프레임마다 화면과 전투 띠에 맞춘다. 직교 크기와 x는 화면 비율로 정하고, y는
    /// 배우 무리의 가운데가 메인 화면의 전투 띠(BattleFrame) 가운데에 오게 한다. 띠는 화면 픽셀로 재므로 해상도, 세이프
    /// 에어리어, 판에 따라 옮겨 가는 영웅 띠를 따로 맞추지 않는다. 메인 화면이 없으면 배우를 화면 가운데에 둔다. 흔들림(HitFeel)은
    /// 카메라를 받침 안에서 옮기므로 이것과 부딪치지 않는다. 화면 값 둘과 모서리 둘을 읽는 계산뿐이라 프레임마다 한다.
    /// </summary>
    [DisallowMultipleComponent]
    internal sealed class CameraFraming : MonoBehaviour
    {
        /// <summary>기준 해상도(UiRoot.s_referenceResolution)의 화면에서 보이는 세로의 절반(월드 단위).</summary>
        private const float ReferenceOrthographicSize = 5f;

        /// <summary>
        /// 배우 무리(영웅 줄 0, 적 줄 ±0.9, 머리 위 HP 막대)의 가운데 월드 y. 전투 띠의 가운데에 온다. 작은 판을 연 기준
        /// 화면에서 카메라 y가 이전의 고정값 -1.1에 가까운 -1.0쯤이 되는 값이다.
        /// </summary>
        private const float ActorsCenterY = 0.45f;

        /// <summary>받침 아래의 월드 카메라.</summary>
        private Camera _camera;

        /// <summary>받침 아래의 카메라를 맞추기 시작한다.</summary>
        /// <param name="camera">월드 카메라.</param>
        internal void Frame(Camera camera)
        {
            _camera = camera;
            LateUpdate();
        }

        /// <summary>
        /// 월드 y <paramref name="target"/>가 화면 높이 <paramref name="pixel"/>에 보이게 하는 카메라 가운데의 y.
        /// </summary>
        /// <param name="target">맞출 월드 y.</param>
        /// <param name="pixel">그것이 보일 화면 높이(픽셀, 아래가 0).</param>
        /// <param name="screenHeight">화면 높이(픽셀).</param>
        /// <param name="orthographicSize">카메라의 직교 크기(보이는 세로의 절반).</param>
        /// <returns>카메라 가운데의 월드 y.</returns>
        internal static float CenterY(float target, float pixel, float screenHeight, float orthographicSize) =>
            target - ((pixel - (screenHeight / 2f)) * 2f * orthographicSize / screenHeight);

        /// <summary>
        /// 기준 해상도의 화면에서 보이는 영역이 어느 화면 비율에서나 다 보이게 한다. 더 길쭉한 화면은 가로(배우 사이)를 그대로
        /// 두고 위아래를 더 보이며, 더 넓은 화면은 세로와 오른쪽 끝을 그대로 두고 왼쪽을 더 보인다. 월드는 화면 전체에 그리므로
        /// 세이프 에어리어가 아니라 화면의 비율을 쓴다. 그다음 배우 무리를 전투 띠의 가운데에 세운다. UI가 옮겨 간 뒤에 재도록
        /// LateUpdate에서 한다.
        /// </summary>
        private void LateUpdate()
        {
            if ((_camera == null) || (Screen.height <= 0))
                return;
            float aspect = (float)Screen.width / Screen.height;
            float reference = UiRoot.s_referenceResolution.x / UiRoot.s_referenceResolution.y;
            _camera.orthographicSize = ReferenceOrthographicSize * Mathf.Max(1f, reference / aspect);
            // 더 넓은 화면은 늘어난 폭을 모두 왼쪽(영웅 뒤)에 보인다. 오른쪽 끝이 기준 화면과 같아서, 영웅 앞의 화면 밖에서
            // 나오는 몬스터가 어느 비율에서나 화면 밖에서 나온다.
            float extra = (aspect > reference) ? ReferenceOrthographicSize * (aspect - reference) : 0f;
            BattleFrame frame = BattleFrame.Active;
            float pixel = (frame != null) ? frame.CenterPixel : Screen.height / 2f;
            transform.localPosition = new Vector3(
                -extra, CenterY(ActorsCenterY, pixel, Screen.height, _camera.orthographicSize), 0f);
        }
    }
}
