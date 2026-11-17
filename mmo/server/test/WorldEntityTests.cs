using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 플레이어가 아닌 개체가 같은 시야 규칙을 따르는지, 종류마다 맞는 것을 싣는지, 표시 상태 변화와 개체 번호의 규칙을 확인한다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// NPC도 둘레 3×3칸 안에 있으면 들어오고, 빠지면 나간다. NPC의 EntityEnter는 번호, 종류, 위치와 방향, 템플릿 번호만 싣는다.
        /// </summary>
        [Fact]
        public void OtherKindsFollowTheSameViewRules()
        {
            World world = NewWorld();
            uint near = world.ReservePlacedId();
            uint far = world.ReservePlacedId();
            Session session = Join(world, "hero_01");
            world.Step();
            Take(session);

            var npc = new TestNpc(near, x: 10 * Units.PerMeter, z: 0, templateId: 2);
            world.AddEntity(npc);
            world.AddEntity(new TestNpc(far, x: 200 * Units.PerMeter, z: 0, templateId: 3));
            world.Step();
            Assert.Equal(
                new[] { Enter(world.Tick - 1, new EntityEnter { Id = near, Kind = EntityKind.Npc, X = 10 * Units.PerMeter, TemplateId = 2 }) },
                Take(session));

            world.RemoveEntity(npc);
            world.Step();
            Assert.Equal(new[] { new Packet { EntitiesLeave = new EntitiesLeave { Ids = { near } } } }, Take(session));
        }

        /// <summary>
        /// 표시 상태를 바꾸면 그 개체를 받은 연결과 본인만 EntityState를 한 번 받는다. 같은 틱에 처음 받는 연결은 EntityEnter에 실린
        /// 지금 상태를 받고, 같은 값으로 바꾸면 아무것도 가지 않는다.
        /// </summary>
        [Fact]
        public void DisplayStateChangesReachViewersAndSelfOnce()
        {
            World world = NewWorld();
            Session changer = Join(world, "hero_01");
            Session viewer = Join(world, "hero_02");
            world.Step();
            Session newcomer = Join(world, "hero_03");
            Take(changer);
            Take(viewer);

            changer.Player!.SetDisplayState(level: 5, NameColor.Outlaw, weaponItemId: 1001);
            world.Step();
            var state = new Packet { EntityState = new EntityState { Id = changer.Player.Id, Level = 5, NameColor = NameColor.Outlaw, WeaponItemId = 1001 } };
            Assert.Equal(new[] { state }, Take(changer).Where(p => p.BodyCase != Packet.BodyOneofCase.EntitiesEnter));
            Assert.Equal(new[] { state }, Take(viewer).Where(p => p.BodyCase != Packet.BodyOneofCase.EntitiesEnter));
            EntityEnter seen = Take(newcomer).Where(p => p.BodyCase == Packet.BodyOneofCase.EntitiesEnter)
                .SelectMany(p => p.EntitiesEnter.Entities).Single(e => e.Id == changer.Player.Id);
            Assert.Equal((5u, NameColor.Outlaw, 1001u), (seen.Level, seen.NameColor, seen.WeaponItemId));

            changer.Player.SetDisplayState(level: 5, NameColor.Outlaw, weaponItemId: 1001);
            world.Step();
            Assert.Empty(Take(changer));
            Assert.Empty(Take(viewer));
        }

        /// <summary>
        /// 놓인 점의 번호는 서버가 뜰 때 플레이어보다 먼저 받고, 뺐다가 다시 넣어도 같다. 플레이어가 받은 뒤에는 더 받을 수 없다.
        /// </summary>
        [Fact]
        public void PlacedIdsComeFirstAndStayTheSame()
        {
            World world = NewWorld();
            uint placed = world.ReservePlacedId();
            Assert.Equal(1u, placed);
            var npc = new TestNpc(placed, x: 0, z: 0, templateId: 2);
            world.AddEntity(npc);
            world.RemoveEntity(npc);
            world.AddEntity(new TestNpc(placed, x: 0, z: 0, templateId: 2));

            Session session = Join(world, "hero_01");
            Assert.Equal(2u, session.Player!.Id);
            Assert.Throws<InvalidOperationException>(() => world.ReservePlacedId());
        }

        /// <summary>
        /// 바닥 아이템의 번호는 사라진 지 10초(200틱) 안에는 다시 쓰이지 않고, 지나면 다시 쓰인다. 나간 플레이어의 번호는 다시 쓰지 않는다.
        /// </summary>
        [Fact]
        public void GroundItemIdsComeBackAfterTenSecondsAndPlayerIdsNever()
        {
            World world = NewWorld();
            uint first = world.NextGroundItemId();
            var item = new TestGroundItem(first, itemId: 4);
            world.AddEntity(item);
            world.RemoveEntity(item);

            world.Step(199);
            uint second = world.NextGroundItemId();
            Assert.NotEqual(first, second);
            world.Step();
            Assert.Equal(first, world.NextGroundItemId());

            Session session = Join(world, "hero_01");
            (uint playerId, long characterId) = (session.Player!.Id, session.Player.CharacterId);
            world.Disconnect(session);
            world.Step(10 * Units.TicksPerSecond);
            Session again = LogIn(world, "hero_01");
            Enter(world, again, characterId);
            Assert.NotEqual(playerId, again.Player!.Id);
        }

        /// <summary>
        /// 시험용 NPC. 템플릿 번호만 더 싣는다.
        /// </summary>
        private sealed class TestNpc : Entity
        {
            private readonly uint _templateId;

            public TestNpc(uint id, int x, int z, uint templateId)
                : base(id, EntityKind.Npc, x, z, 0)
            {
                _templateId = templateId;
            }

            protected override void Fill(EntityEnter enter)
            {
                enter.TemplateId = _templateId;
            }
        }

        /// <summary>
        /// 시험용 바닥 아이템.
        /// </summary>
        private sealed class TestGroundItem : Entity
        {
            private readonly uint _itemId;

            public TestGroundItem(uint id, uint itemId)
                : base(id, EntityKind.GroundItem, 0, 0, 0)
            {
                _itemId = itemId;
            }

            protected override void Fill(EntityEnter enter)
            {
                enter.ItemId = _itemId;
            }
        }
    }
}
