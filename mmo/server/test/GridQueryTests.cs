using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 시야 격자의 원 질의: 칸의 경계, 큰 원과 반지름 0, 음수 좌표와 필드 끝, 원의 경계, 조건, 벽, 결과 목록의 재사용.
    /// </summary>
    public class GridQueryTests
    {
        /// <summary>
        /// 1 m의 좌표 단위 수.
        /// </summary>
        private const int M = Units.PerMeter;

        private readonly Grid _grid = new Grid();
        private readonly List<Entity> _result = new List<Entity>();
        private uint _nextId = 1;

        /// <summary>
        /// 시야 칸의 경계(x = 32 m)에 걸친 원이 양쪽 칸의 개체를 모두 찾는다.
        /// </summary>
        [Fact]
        public void ACircleAcrossACellBorderFindsBothSides()
        {
            Entity west = Add(30 * M, 0);
            Entity east = Add(33 * M, 0);
            Add(34 * M, 0);

            Assert.Equal(new[] { west, east }, Query(31 * M, 0, 2 * M));
        }

        /// <summary>
        /// 시야 칸(32 m)보다 큰 원은 여러 칸을 넘어 찾고, 반지름 0의 원은 중심에 있는 것만 찾는다.
        /// </summary>
        [Fact]
        public void LargeAndZeroRadii()
        {
            Entity center = Add(0, 0);
            Entity farWest = Add(-49 * M, 0);
            Entity farNorth = Add(0, 50 * M);
            Add(51 * M, 0);
            Add(36 * M, 36 * M);
            Entity oneUnit = Add(1, 0);

            Assert.Equal(new[] { farWest, center, oneUnit, farNorth }, Query(0, 0, 50 * M));
            Assert.Equal(new[] { center }, Query(0, 0, 0));
        }

        /// <summary>
        /// 음수 좌표의 원과 필드의 끝(−300 m, 300 m 바로 앞)에 걸친 원.
        /// </summary>
        [Fact]
        public void NegativeCoordinatesAndFieldEdges()
        {
            Entity corner = Add(-300 * M, -300 * M);
            Entity near = Add(-296 * M, -299 * M);
            Add(-293 * M, -299 * M);
            Assert.Equal(new[] { corner, near }, Query(-299 * M, -299 * M, 5 * M));

            Entity edge = Add((300 * M) - 1, 0);
            Entity inside = Add(299 * M, 0);
            Assert.Equal(new[] { edge, inside }, Query((300 * M) - 1, 0, 1 * M));

            // 경계를 넘는 원(중심 −1 m, 반지름 2 m)은 음수 칸과 0의 칸을 함께 본다.
            Entity minusHalf = Add(-M / 2, 0);
            Entity plusHalf = Add(M / 2, 0);
            Assert.Equal(new[] { minusHalf, plusHalf }, Query(-1 * M, 0, 2 * M));
        }

        /// <summary>
        /// 거리가 반지름과 같은 개체는 들고(3-4-5), 한 좌표 단위 밖은 빠진다.
        /// </summary>
        [Fact]
        public void TheRimIsInsideAndJustOutsideIsNot()
        {
            Entity rim = Add(3 * M, 4 * M);
            Add(-3 * M, (-4 * M) - 1);

            Assert.Equal(new[] { rim }, Query(0, 0, 5 * M));
        }

        [Fact]
        public void TheFilterPicksKinds()
        {
            Entity npc = Add(0, 0, EntityKind.Npc);
            Add(1 * M, 0, EntityKind.GroundItem);

            _grid.Query(0, 0, 5 * M, entity => entity.Kind == EntityKind.Npc, _result);
            Assert.Equal(new[] { npc }, _result);
        }

        /// <summary>
        /// 원 안이면 벽 너머의 개체도 든다. 선은 부르는 쪽이 FieldMap.HasLine으로 본다.
        /// </summary>
        [Fact]
        public void EntitiesBehindAWallAreStillFound()
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = TestData.Map(
                "....",
                "..#.",
                "..#.",
                "....");
            var field = new FieldMap(size, zones, grid);
            Entity behind = Add((M * 3) / 2, M / 2);

            Assert.Equal(new[] { behind }, Query(-M / 2, M / 2, 3 * M));
            Assert.False(field.HasLine(-M / 2, M / 2, behind.X, behind.Z));
        }

        /// <summary>
        /// 같은 결과 목록을 다시 넘기면 앞의 결과를 비우고 담는다.
        /// </summary>
        [Fact]
        public void AReusedResultListHoldsOnlyTheLastQuery()
        {
            Entity west = Add(-10 * M, 0);
            Entity east = Add(10 * M, 0);

            Assert.Equal(new[] { west }, Query(-10 * M, 0, 1 * M));
            Assert.Equal(new[] { east }, Query(10 * M, 0, 1 * M));
            Assert.Empty(Query(0, 0, 1 * M));
        }

        private Entity Add(int x, int z, EntityKind kind = EntityKind.Npc)
        {
            var entity = new TestEntity(_nextId++, kind, x, z);
            _grid.Add(entity);
            return entity;
        }

        private List<Entity> Query(int x, int z, int radius)
        {
            _grid.Query(x, z, radius, _ => true, _result);
            return _result;
        }

        private sealed class TestEntity : Entity
        {
            public TestEntity(uint id, EntityKind kind, int x, int z)
                : base(id, kind, x, z, 0)
            {
            }

            protected override void Fill(EntityEnter enter)
            {
            }
        }
    }
}
