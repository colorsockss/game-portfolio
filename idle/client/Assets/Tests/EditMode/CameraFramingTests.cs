using NUnit.Framework;

namespace PortfolioIdleRpg.Facades.Tests
{
    /// <summary>월드 카메라를 전투 띠에 맞추는 계산(CameraFraming.CenterY)의 테스트.</summary>
    public sealed class CameraFramingTests
    {
        /// <summary>화면 가운데에 보일 점이면 카메라가 그 점에 선다.</summary>
        [Test]
        public void ScreenCenterPutsTheCameraOnTheTarget()
        {
            Assert.AreEqual(0.45f, CameraFraming.CenterY(0.45f, 960f, 1920f, 5f), 1e-5f);
        }

        /// <summary>화면 위 가장자리에 보일 점이면 카메라는 보이는 세로의 절반만큼 아래에 선다.</summary>
        [Test]
        public void TopEdgePutsTheCameraHalfAViewBelow()
        {
            Assert.AreEqual(0.45f - 6.09f, CameraFraming.CenterY(0.45f, 2532f, 2532f, 6.09f), 1e-5f);
        }

        /// <summary>
        /// 기준 화면(1080×1920)에서 전투 띠가 스테이지 막대 아래(1610)와 작은 판 위 영웅 띠의 위(870) 사이면, 카메라는 예전의
        /// 고정값 -1.1에 가까운 -1.0쯤이다. 큰 판 위(1290)로 올라가면 띠의 가운데가 올라간 만큼 카메라가 내려가 배우가 따라
        /// 올라간다.
        /// </summary>
        [Test]
        public void TallSheetRaisesTheBattleWithTheStrip()
        {
            float half = CameraFraming.CenterY(0.45f, (1610f + 870f) / 2f, 1920f, 5f);
            float tall = CameraFraming.CenterY(0.45f, (1610f + 1290f) / 2f, 1920f, 5f);
            Assert.AreEqual(-1.0f, half, 0.05f);
            Assert.AreEqual(-(1290f - 870f) / 2f / 192f, tall - half, 1e-5f);
        }
    }
}
