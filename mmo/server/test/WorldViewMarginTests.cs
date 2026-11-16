using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 시야 경계의 여유(78). 여유는 8 m이고, (5, 5) m에 선 관찰자의 둘레 3×3 시야 칸(32 m)은 x가 −32 m 이상 64 m 미만이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 3×3칸을 벗어나도 여유 안이면 나가지 않고, 되돌아오면 들어옴이 다시 가지 않는다. 여유를 넘으면 나간다. 여유에 있는 동안 움직임이 계속 간다.
        /// 여유에 있는 개체가 월드에서 빠지면 나간다.
        /// </summary>
        [Fact]
        public void ThePlayerAtTheEdgeStaysWithinTheMargin()
        {
            World world = MarginWorld();
            Session observer = Fighter(world, "hero_01", 5, 5);
            Session walker = Fighter(world, "hero_02", 60, 5);
            uint id = walker.Player!.Id;
            world.Step();
            Take(observer);

            world.Place(walker.Player!, Center(66), Center(5));
            world.Step();
            Assert.DoesNotContain(Take(observer), packet => packet.EntitiesLeave != null);
            Move(world, walker, Center(66) + 10, Center(5), walker.Player!.Ack);
            world.Step();
            Assert.Contains(Take(observer), packet => packet.EntityMoves?.Entities.Any(move => move.Id == id) == true);

            world.Place(walker.Player!, Center(60), Center(5));
            world.Step();
            Assert.DoesNotContain(Take(observer), packet => packet.EntitiesEnter != null);

            world.Place(walker.Player!, Center(73), Center(5));
            world.Step();
            Assert.Contains(Take(observer), packet => packet.EntitiesLeave?.Ids.Contains(id) == true);

            world.Place(walker.Player!, Center(60), Center(5));
            world.Step();
            Assert.Contains(Take(observer), packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == id) == true);
            world.Place(walker.Player!, Center(66), Center(5));
            world.Step();
            Take(observer);
            world.Disconnect(walker);
            world.Step();
            Assert.Contains(Take(observer), packet => packet.EntitiesLeave?.Ids.Contains(id) == true);
        }

        /// <summary>
        /// 여유에 있는 몬스터가 맞으면 피해와 체력이 계속 오고(돌아왔을 때 클라이언트가 아는 체력이 맞음), 죽음도 온다.
        /// </summary>
        [Fact]
        public void EventsAndVitalsReachTheMargin()
        {
            World world = MarginWorld(TestData.Spawn(1, 60, 5, 2));
            Session observer = Fighter(world, "hero_01", 5, 5);
            Monster monster = world.Monsters[0];
            Session hunter = Fighter(world, "hero_02", 67, 5);
            world.Place(monster, Center(66), Center(5));
            world.Step();
            Assert.Contains(monster, observer.Player!.Visible);
            TakeVitals(observer);

            monster.Hp = 50;
            monster.VitalsChanged = true;
            StepFor(world, 25);
            Assert.Contains(TakeVitals(observer), packet => packet.EntityVitals?.Entities.Any(vital => vital.Id == monster.Id && vital.Hp == 50) == true);

            monster.Hp = 1;
            Attack(world, hunter, monster.Id);
            StepUntil(world, () => monster.Dead, 40);
            Assert.True(monster.Dead);
            List<Packet> seen = observer.Outbox.ToList();
            Assert.Contains(seen, packet => packet.Damaged?.TargetId == monster.Id);
            Assert.Contains(seen, packet => packet.Died?.Id == monster.Id);
        }

        private static World MarginWorld(params SpawnsRow[] spawns)
        {
            Constants constants = TestData.Constants(256);
            constants.ViewMargin = 8;
            GameData data = TestData.WithMonsters(spawns, TestData.Draw(256), null, constants, null);
            return new World(10, spawnHalfExtent: 0, new System.Random(1), new CharacterStore(":memory:"), data);
        }
    }
}
