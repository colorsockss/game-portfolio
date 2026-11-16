using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 능력치, 회복, 내 상태(SelfStats, SelfVitals)와 개체의 체력(EntityVitals)의 알림을 틱을 손으로 돌려 본다.
    /// 피해(24)가 없으므로 체력과 전투 상태는 테스트가 바꾼다. 회복은 20틱(틱 번호가 20의 배수)마다 한 번이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 들어온 연결은 EnterWorldResult 뒤에 자기 직업의 쿨다운 전체(26)와, 성향(44)과, 자기 직업과 레벨의 Levels 줄과 같은 SelfStats와, 가득 찬 SelfVitals를 받는다.
        /// </summary>
        [Fact]
        public void EnteringSendsStatsAndFullVitalsOfTheClassRow()
        {
            World world = NewWorld();
            Session knight = Join(world, "hero_01");
            Session mage = Join(world, "hero_02", CharacterClass.Mage);
            world.Step();

            var exp = new Packet { ExpGained = new ExpGained() };
            var karma = new Packet { Karma = new Karma() };
            List<Packet> knightPackets = knight.Outbox.Take(9).ToList();
            Assert.Equal(new[] { Packet.BodyOneofCase.Inventory, Packet.BodyOneofCase.LearnedSkills, Packet.BodyOneofCase.Quickslots }, knightPackets.Skip(3).Take(3).Select(packet => packet.BodyCase));
            knightPackets.RemoveRange(3, 3);
            Assert.Equal(new[] { Entered(1), exp, Cooldowns(101, 102, 103, 104, 105, 106), karma, SelfStats(TestData.KnightLevel1), SelfVitals(150, 50) }, knightPackets);
            Assert.Equal(
                new[] { exp, Cooldowns(201, 202, 203, 204, 205), karma, SelfStats(TestData.MageLevel1), SelfVitals(100, 120) },
                TakeVitals(mage).Where(packet => packet.BodyCase is not (Packet.BodyOneofCase.Inventory or Packet.BodyOneofCase.LearnedSkills or Packet.BodyOneofCase.Quickslots)));
            Assert.Equal(TestData.MageLevel1, mage.Player!.Stats);
        }

        /// <summary>
        /// 최대값이 줄면(시험용 2레벨) 지금 체력과 마나가 최대값으로 줄고, 본인에게 둘 다 간다.
        /// </summary>
        [Fact]
        public void LoweredMaximumsClampTheCurrentValues()
        {
            var stats = new StatSystem(TestData.Data, new System.Random(1));
            Session session = new Session();
            var player = new Player(1, new CharacterRecord(1, "hero_01", "hero01", CharacterClass.Knight, TestData.Saved(0, 0)), session, default);
            stats.Enter(player);
            Assert.Equal((150u, 50u), (player.Hp, player.Mp));

            player.SetDisplayState(2, NameColor.Normal, 0);
            stats.Recalculate(player);
            Assert.Equal((120u, 40u, 120u, 40u), (player.Hp, player.Mp, player.MaxHp, player.MaxMp));
            Assert.True(player.StatsChanged);
            Assert.True(player.VitalsChanged);
        }

        /// <summary>
        /// 20틱마다 한 번, 전투 상태가 아니면 최대값의 5%, 전투 상태면 1%(소수는 버림)가 차고 최대값을 넘지 않는다.
        /// </summary>
        [Fact]
        public void RegenerationFillsFivePercentOrOnePercentInCombatEverySecond()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            Player player = session.Player!;
            world.Step();
            player.Hp = 100;
            player.Mp = 0;

            StepTo(world, 20);
            Assert.Equal((100u, 0u), (player.Hp, player.Mp));
            world.Step();
            Assert.Equal((107u, 2u), (player.Hp, player.Mp));

            player.CombatEndTick = 100;
            StepTo(world, 40);
            world.Step();
            Assert.Equal((108u, 2u), (player.Hp, player.Mp));

            player.Hp = 149;
            StepTo(world, 100);
            world.Step();
            Assert.Equal(150u, player.Hp);
        }

        /// <summary>
        /// 틱 번호가 건너뛰어도(21 → 66) 그 사이의 회복은 한 번이고, 다음은 원래 위상(80)이다.
        /// </summary>
        [Fact]
        public void SkippedTicksRegenerateOnce()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            Player player = session.Player!;
            StepTo(world, 21);
            player.Hp = 10;

            world.Step(45);
            Assert.Equal(66u, world.Tick);
            Assert.Equal(10u, player.Hp);
            world.Step();
            Assert.Equal(17u, player.Hp);
            StepTo(world, 80);
            Assert.Equal(17u, player.Hp);
            world.Step();
            Assert.Equal(24u, player.Hp);
        }

        /// <summary>
        /// SelfVitals는 체력, 마나, 전투 상태가 끝나는 틱 가운데 하나가 바뀐 틱에만 본인에게 간다.
        /// </summary>
        [Fact]
        public void SelfVitalsGoOnlyWhenSomethingChanged()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            Player player = session.Player!;
            world.Step();
            TakeVitals(session);

            world.Step();
            Assert.Empty(TakeVitals(session));

            player.Mp = 30;
            world.Step();
            Assert.Equal(new[] { SelfVitals(150, 30) }, TakeVitals(session));

            player.CombatEndTick = 50;
            world.Step();
            Assert.Equal(new[] { SelfVitals(150, 30, combatEndTick: 50) }, TakeVitals(session));
            world.Step();
            Assert.Empty(TakeVitals(session));
        }

        /// <summary>
        /// 회복한 개체의 체력은 그 개체를 받은 다른 연결에 1초에 한 번 EntityVitals 하나로 모여 가고, 바뀌지 않은 개체는 실리지 않는다.
        /// 본인은 EntityVitals가 아니라 SelfVitals로 받는다.
        /// </summary>
        [Fact]
        public void RegeneratedHpGoesToObserversOncePerSecond()
        {
            World world = NewWorld();
            Session hurt = Join(world, "hero_01");
            Session full = Join(world, "hero_02");
            Session observer = Join(world, "hero_03");
            world.Step();
            TakeVitals(hurt);
            TakeVitals(full);
            hurt.Player!.Hp = 100;

            StepTo(world, 20);
            Assert.DoesNotContain(TakeVitals(observer), packet => packet.BodyCase == Packet.BodyOneofCase.EntityVitals);
            Assert.Equal(new[] { SelfVitals(100, 50) }, TakeVitals(hurt));
            world.Step();
            var expected = new Packet { EntityVitals = new EntityVitals { Entities = { new EntityVital { Id = 1, Hp = 107, MaxHp = 150 } } } };
            Assert.Equal(new[] { expected }, TakeVitals(observer));
            Assert.Equal(new[] { expected }, TakeVitals(full));
            Assert.Equal(new[] { SelfVitals(107, 50) }, TakeVitals(hurt));

            StepTo(world, 40);
            world.Step();
            Assert.Equal(new[] { new Packet { EntityVitals = new EntityVitals { Entities = { new EntityVital { Id = 1, Hp = 114, MaxHp = 150 } } } } }, TakeVitals(observer));
        }

        /// <summary>
        /// 틱 번호가 tick이 될 때까지 한 틱씩 돌린다(그 틱의 Step은 돌리지 않음). 쌓인 패킷은 그대로 둔다.
        /// </summary>
        private static void StepTo(World world, uint tick)
        {
            while (world.Tick < tick)
            {
                world.Step();
            }
        }

        private static Packet SelfStats(Stats stats)
        {
            return new Packet { SelfStats = new SelfStats { MaxHp = stats.MaxHp, MaxMp = stats.MaxMp, Attack = stats.Attack, Defense = stats.Defense } };
        }

        private static Packet SelfVitals(uint hp, uint mp, uint combatEndTick = 0)
        {
            return new Packet { SelfVitals = new SelfVitals { Hp = hp, Mp = mp, CombatEndTick = combatEndTick } };
        }
    }
}
