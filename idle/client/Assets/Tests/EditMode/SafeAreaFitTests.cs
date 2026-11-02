using NUnit.Framework;
using UnityEngine;

namespace PortfolioIdleRpg.Facades.Tests
{
    /// <summary>UI 배율과 레이어 앵커 계산(SafeAreaFit)의 테스트.</summary>
    public sealed class SafeAreaFitTests
    {
        /// <summary>UiRoot의 기준 해상도.</summary>
        private static readonly Vector2 s_reference = new Vector2(1080f, 1920f);

        /// <summary>세이프 에어리어가 화면 전체면 배율은 기준 해상도에 맞고 앵커는 화면 전체다.</summary>
        [Test]
        public void FullScreenFillsTheLayers()
        {
            Assert.IsTrue(Fit(new Rect(0f, 0f, 1080f, 1920f), new Vector2(1080f, 1920f), out float scale,
                out Vector2 anchorMin, out Vector2 anchorMax));
            Assert.AreEqual(1f, scale, 1e-6f);
            Assert.AreEqual(Vector2.zero, anchorMin);
            Assert.AreEqual(Vector2.one, anchorMax);
        }

        /// <summary>노치와 홈 인디케이터를 뺀 세이프 에어리어는 앵커로, 좁은 쪽 비율은 배율로 간다.</summary>
        [Test]
        public void NotchedScreenAnchorsToTheSafeArea()
        {
            var screen = new Vector2(1170f, 2532f);
            Assert.IsTrue(Fit(new Rect(0f, 102f, 1170f, 2283f), screen, out float scale, out Vector2 anchorMin,
                out Vector2 anchorMax));
            Assert.AreEqual(Mathf.Min(1170f / 1080f, 2283f / 1920f), scale, 1e-6f);
            Assert.AreEqual(102f / 2532f, anchorMin.y, 1e-6f);
            Assert.AreEqual(2385f / 2532f, anchorMax.y, 1e-6f);
        }

        /// <summary>화면 크기가 0인 프레임(창을 숨김)은 거절한다. 나누면 앵커가 NaN이 된다.</summary>
        [Test]
        public void ZeroScreenIsRejected()
        {
            Assert.IsFalse(Fit(new Rect(0f, 0f, 1080f, 1920f), Vector2.zero, out _, out _, out _));
            Assert.IsFalse(Fit(new Rect(0f, 0f, 1080f, 1920f), new Vector2(1080f, 0f), out _, out _, out _));
        }

        /// <summary>크기가 0이거나 NaN·무한대가 든 세이프 에어리어는 거절한다.</summary>
        [Test]
        public void InvalidSafeAreaIsRejected()
        {
            var screen = new Vector2(1080f, 1920f);
            Assert.IsFalse(Fit(new Rect(0f, 0f, 0f, 1920f), screen, out _, out _, out _));
            Assert.IsFalse(Fit(new Rect(0f, 0f, float.NaN, 1920f), screen, out _, out _, out _));
            Assert.IsFalse(Fit(new Rect(float.NaN, 0f, 1080f, 1920f), screen, out _, out _, out _));
            Assert.IsFalse(Fit(new Rect(0f, 0f, float.PositiveInfinity, 1920f), screen, out _, out _, out _));
            Assert.IsFalse(Fit(new Rect(0f, 0f, 1080f, 1920f), new Vector2(float.NaN, 1920f), out _, out _, out _));
        }

        /// <summary>화면 밖으로 나간 세이프 에어리어는 앵커를 화면 안으로 자른다.</summary>
        [Test]
        public void SafeAreaOutsideTheScreenIsClamped()
        {
            Assert.IsTrue(Fit(new Rect(-10f, -10f, 1100f, 1940f), new Vector2(1080f, 1920f), out _,
                out Vector2 anchorMin, out Vector2 anchorMax));
            Assert.AreEqual(Vector2.zero, anchorMin);
            Assert.AreEqual(Vector2.one, anchorMax);
        }

        /// <summary>기준 해상도로 계산한다.</summary>
        /// <param name="safeArea">세이프 에어리어.</param>
        /// <param name="screen">화면 크기.</param>
        /// <param name="scale">배율.</param>
        /// <param name="anchorMin">왼쪽 아래 앵커.</param>
        /// <param name="anchorMax">오른쪽 위 앵커.</param>
        /// <returns>쓸 수 있는 값이면 true.</returns>
        private static bool Fit(
            Rect safeArea, Vector2 screen, out float scale, out Vector2 anchorMin, out Vector2 anchorMax) =>
            SafeAreaFit.TryFit(safeArea, screen, s_reference, out scale, out anchorMin, out anchorMax);
    }
}
