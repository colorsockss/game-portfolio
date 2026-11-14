using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 경험치와 레벨(31). 시험 데이터는 레벨 1–4(필요 경험치 100씩, 능력치는 TestData.LevelsUpTo)이고 몬스터 2(비선공)가 경험치 50을 준다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 몬스터의 경험치는 죽는 순간 피해의 합이 가장 큰 플레이어가 받고(마지막 타격을 친 쪽이 아님), 본인에게 ExpGained가 가며 받은 사건에 남는다.
        /// </summary>
        [Fact]
        public void ExpGoesToThePlayerWithTheMostDamage()
        {
            World world = GrowthWorld();
            Session finisher = Fighter(world, "hero_01", 1, 0);
            Session helper = Fighter(world, "hero_02", -1, 0);
            Monster monster = world.Monsters[0];
            monster.Damage.Add(finisher.Player!.Id, 1);
            monster.Damage.Add(helper.Player!.Id, 500);
            monster.Hp = 1;
            Attack(world, finisher, monster.Id);
            StepUntil(world, () => monster.Dead, 40);

            Assert.True(monster.Dead);
            Assert.Equal((0u, 50u), (finisher.Player!.Exp, helper.Player!.Exp));
            Assert.Equal((monster, helper.Player!), Assert.Single(world.Growth.Rewarded));
            Assert.Equal(new ExpGained { Amount = 50, Exp = 50 }, Assert.Single(TakeVitals(helper), packet => packet.BodyCase == Packet.BodyOneofCase.ExpGained).ExpGained);
            Assert.DoesNotContain(TakeVitals(finisher), packet => packet.BodyCase == Packet.BodyOneofCase.ExpGained);
        }

        /// <summary>
        /// 필요 경험치를 넘으면 레벨이 오르고 남은 양이 넘어간다. 한 번에 두 레벨이 오를 수 있고, 오른 틱에 능력치가 새 줄로 바뀌고 체력과 마나가 가득 차며,
        /// 본인과 그 개체를 받은 연결이 EntityState로 오른 레벨을 받는다.
        /// </summary>
        [Fact]
        public void LevelsRiseAndCarryTheRest()
        {
            World world = GrowthWorld();
            Session hero = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 3, 0);
            Player player = hero.Player!;
            player.Hp = 1;
            player.Mp = 0;

            world.Growth.Gain(player, 250);
            Assert.Equal((3u, 50u), (player.Level, player.Exp));
            Assert.Equal(new Stats(130, 65, 13, 8), player.Stats);
            Assert.Equal((130u, 65u), (player.Hp, player.Mp));
            world.Step();
            Assert.Equal(new ExpGained { Amount = 250, Exp = 50 }, TakeVitals(hero).Single(packet => packet.BodyCase == Packet.BodyOneofCase.ExpGained).ExpGained);
            Assert.Equal(3u, Assert.Single(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntityState).EntityState.Level);

            world.Growth.Gain(player, 40);
            Assert.Equal((3u, 90u), (player.Level, player.Exp));
        }

        /// <summary>
        /// 최대 레벨에서는 레벨과 경험치가 그대로이고 ExpGained를 보내지 않지만, 몬스터의 경험치를 받은 사건에는 든다. 넘어 최대 레벨에 닿으면 경험치는 0이다.
        /// </summary>
        [Fact]
        public void MaxLevelKeepsNoExpButStillCountsTheKill()
        {
            World world = GrowthWorld();
            Session hero = Fighter(world, "hero_01", 1, 0);
            Player player = hero.Player!;
            world.Growth.Gain(player, 1000);
            Assert.Equal((4u, 0u), (player.Level, player.Exp));
            TakeVitals(hero);

            Monster monster = world.Monsters[0];
            monster.Hp = 1;
            Attack(world, hero, monster.Id);
            StepUntil(world, () => monster.Dead, 40);
            Assert.Equal((4u, 0u), (player.Level, player.Exp));
            Assert.Equal((monster, player), Assert.Single(world.Growth.Rewarded));
            Assert.DoesNotContain(TakeVitals(hero), packet => packet.BodyCase == Packet.BodyOneofCase.ExpGained);
        }

        /// <summary>
        /// 월드에 들어오면 EnterWorldResult 바로 뒤에 얻은 양 0의 ExpGained로 지금 경험치를 받는다.
        /// </summary>
        [Fact]
        public void EnteringSendsTheCurrentExp()
        {
            World world = GrowthWorld();
            Session session = Join(world, "hero_01");
            List<Packet> packets = session.Outbox.ToList();
            int entered = packets.FindIndex(packet => packet.BodyCase == Packet.BodyOneofCase.EnterWorldResult);
            Assert.Equal(new ExpGained { Amount = 0, Exp = 0 }, packets[entered + 1].ExpGained);
        }

        /// <summary>
        /// 개발 명령의 레벨 주기는 평소의 레벨 업처럼 능력치를 다시 구하고 체력을 채우며 EntityState를 보낸다. 경험치는 0이고, 범위 밖의 레벨은 쓸 수 없는 명령이다.
        /// </summary>
        [Fact]
        public void TheLevelCommandLevelsLikeAKill()
        {
            World world = new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), GrowthData(), dev: true);
            Session hero = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 3, 0);
            Player player = hero.Player!;
            world.Growth.Gain(player, 30);
            player.Hp = 1;

            Dev(world, hero, "level 2");
            Assert.Equal((2u, 0u, 120u), (player.Level, player.Exp, player.Hp));
            Assert.Equal(new Stats(120, 60, 12, 7), player.Stats);
            world.Step();
            Assert.Equal(2u, Assert.Single(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntityState).EntityState.Level);

            Take(hero);
            Dev(world, hero, "level 5");
            Dev(world, hero, "level 0");
            Assert.Equal(new[] { DevFailed(FailReason.InvalidCommand), DevFailed(FailReason.InvalidCommand) }, Take(hero));
        }

        private static World GrowthWorld()
        {
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), GrowthData());
        }

        private static GameData GrowthData()
        {
            MonstersRow giver = TestData.Monster(2, aggressive: false);
            giver.Exp = 50;
            return TestData.WithMonsters(
                new[] { TestData.Spawn(1, 0, 0, 2) }, TestData.Draw(64), null, null, new[] { TestData.Monster(1, aggressive: true), giver }, TestData.LevelsUpTo(4));
        }
    }
}
