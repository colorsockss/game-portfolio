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
    /// 필드 보스(43). 시험 보스(몬스터 3)는 (0, 0)에 서서 움직이지 않는 선공 보스이고(속도 0이라 범위 공격만 닿음), 범위 공격 901은 대상 중심 반지름 3 m,
    /// 사거리 12 m, 쿨다운 3초(60틱), 예고 1.5초(30틱)다. 맵은 256 m라 100 m 떨어진 연결은 시야 밖이다.
    /// </summary>
    public partial class WorldTests
    {
        private const uint WarnTicks = 30;

        /// <summary>
        /// 대상이 사거리 안에 들어오면 보스를 받은 연결에 AreaWarning(중심은 그 틱의 대상 자리)이 가고, 예고 시간이 지난 틱에 원 안이면 맞는다. 다음 범위 공격은 쿨다운만큼 뒤다.
        /// </summary>
        [Fact]
        public void BossAreasWarnThenHit()
        {
            World world = BossWorld(TestData.Draw(256));
            Session hero = Fighter(world, "hero_01", 6, 0);
            AreaWarning warning = NextWarning(world, hero, out uint warned);
            Assert.Equal((Center(6), Center(0), warned + WarnTicks), (warning.X, warning.Z, warning.HitTick));
            StepTo(world, warned + WarnTicks);
            Assert.False(Hurt(hero));
            world.Step();
            Assert.True(Hurt(hero));

            Take(hero);
            NextWarning(world, hero, out uint again);
            Assert.Equal(warned + 60, again);
        }

        /// <summary>
        /// 예고 뒤에 대상이 옮겨도 중심은 그대로라, 원 안에서 옮기면 맞고 원 밖으로 걸어 나가거나 중심에서 벽 뒤로 가면 맞지 않는다.
        /// </summary>
        [Fact]
        public void BossAreasCanBeDodged()
        {
            foreach ((int X, bool Hit) move in new[] { (8, true), (10, false), (8 + 100, false) })
            {
                // 셋째는 벽이 있는 맵에서 (8, 0)으로 간다(중심 (6, 0)과 사이에 x = 7의 벽).
                bool walled = move.X > 100;
                World world = BossWorld(walled ? TestData.Draw(256, (7, -5, 8, 5, '#')) : TestData.Draw(256));
                Session hero = Fighter(world, "hero_01", 6, 0);
                NextWarning(world, hero, out uint warned);
                world.Place(hero.Player!, Center(walled ? 8 : move.X), Center(0));
                StepTo(world, warned + WarnTicks + 1);
                Assert.Equal(move.Hit, Hurt(hero));
            }
        }

        /// <summary>
        /// 예고한 뒤 보스가 죽거나 복귀를 시작하면 피해가 없다.
        /// </summary>
        [Fact]
        public void DeadOrReturningBossesDoNotHit()
        {
            World dying = BossWorld(TestData.Draw(256));
            Session first = Fighter(dying, "hero_01", 6, 0);
            NextWarning(dying, first, out uint warned);
            Monster boss = dying.Monsters[0];
            boss.Hp = 0;
            boss.Dead = true;
            StepTo(dying, warned + WarnTicks + 1);
            Assert.False(Hurt(first));

            World returning = BossWorld(TestData.Draw(256));
            Session second = Fighter(returning, "hero_01", 6, 0);
            NextWarning(returning, second, out warned);
            // 추적 한계(20 m) 밖으로 옮기면 다음 AI 차례가 복귀를 시작한다. 대상은 따라 옮겨 원 안에 둔다.
            returning.Place(returning.Monsters[0], Center(-30), Center(0));
            StepTo(returning, warned + WarnTicks + 1);
            Assert.Equal(MonsterState.Return, returning.Monsters[0].State);
            Assert.False(Hurt(second));
        }

        /// <summary>
        /// 예고 뒤에 보스가 시야에 들어온 연결은 그 AreaWarning을 받지 않는다.
        /// </summary>
        [Fact]
        public void LateViewersMissTheWarning()
        {
            World world = BossWorld(TestData.Draw(256));
            Session hero = Fighter(world, "hero_01", 6, 0);
            Session late = Fighter(world, "hero_02", 100, 0);
            NextWarning(world, hero, out _);
            world.Place(late.Player!, Center(5), Center(2));
            Take(late);
            world.Step();
            List<Packet> packets = Take(late);
            Assert.Contains(packets, packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter && packet.EntitiesEnter.Entities.Any(entity => entity.Id == world.Monsters[0].Id));
            Assert.DoesNotContain(packets, packet => packet.BodyCase == Packet.BodyOneofCase.AreaWarning);
        }

        /// <summary>
        /// 보스는 기절과 감속을 받지 않는다.
        /// </summary>
        [Fact]
        public void BossesIgnoreStunAndSlow()
        {
            World world = BossWorld(TestData.Draw(256));
            Monster boss = world.Monsters[0];
            world.Effects.Apply(boss, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            world.Effects.Apply(boss, TestData.Effects.Rows.Single(row => row.Id == 2), world.Tick);
            Assert.False(boss.Stunned);
            Assert.Equal(0u, boss.SlowPercent);
            Assert.Empty(boss.Effects);
        }

        /// <summary>
        /// 보스가 나오고 죽을 때 시야 밖의 연결도 FieldNotice를 받고, 다시 나오는 시간이 지나면 같은 개체 번호로 나와 등장을 다시 알린다.
        /// 보스가 나와 있을 때 들어온 연결은 EnterWorldResult 뒤에 "보스가 나와 있음"을, 죽어 있을 때 들어온 연결은 아무것도 받지 않는다.
        /// </summary>
        [Fact]
        public void BossNoticesReachTheWholeField()
        {
            World world = BossWorld(TestData.Draw(256), respawnMs: 1000);
            Session present = Join(world, "hero_01");
            List<Packet> entered = Take(present);
            int result = entered.FindIndex(packet => packet.BodyCase == Packet.BodyOneofCase.EnterWorldResult);
            int notice = entered.FindIndex(packet => packet.BodyCase == Packet.BodyOneofCase.FieldNotice);
            Assert.True(result >= 0 && notice > result);
            Assert.Equal(new FieldNotice { Kind = FieldNoticeKind.BossPresent, TemplateId = 3, X = Center(0), Z = Center(0) }, entered[notice].FieldNotice);

            Session killer = Fighter(world, "hero_02", 1, 0);
            Session far = Fighter(world, "hero_03", 100, 0);
            Monster boss = world.Monsters[0];
            uint id = boss.Id;
            Take(far);
            Kill(world, killer, boss);
            Assert.Equal(FieldNoticeKind.BossDied, Take(far).Single(packet => packet.BodyCase == Packet.BodyOneofCase.FieldNotice).FieldNotice.Kind);

            Session dead = Join(world, "hero_04");
            Assert.DoesNotContain(Take(dead), packet => packet.BodyCase == Packet.BodyOneofCase.FieldNotice);

            StepUntil(world, () => world.Monsters.Any(monster => monster.Id == id && !monster.Dead), 40);
            Assert.Equal(FieldNoticeKind.BossAppeared, Take(far).Single(packet => packet.BodyCase == Packet.BodyOneofCase.FieldNotice).FieldNotice.Kind);
        }

        /// <summary>
        /// 보스의 경험치와 드롭은 일반 몬스터처럼 피해 표에서 합이 가장 큰 파티에 간다.
        /// </summary>
        [Fact]
        public void BossRewardsGoToTheBiggestParty()
        {
            World world = BossWorld(TestData.Draw(256));
            Session a = Fighter(world, "hero_01", 1, 0);
            Session b = Fighter(world, "hero_02", -1, 0);
            Session solo = Fighter(world, "hero_03", 0, 1);
            Form(world, a, b);
            Monster boss = world.Monsters[0];
            boss.Damage.Add(solo.Player!.Id, 50);
            boss.Damage.Add(a.Player!.Id, 30);
            boss.Damage.Add(b.Player!.Id, 30);
            Kill(world, a, boss);
            Assert.Equal((55u, 55u, 0u), (a.Player!.Exp, b.Player!.Exp, solo.Player!.Exp));
            Assert.All(world.GroundItems, item => Assert.Equal(a.Player!.PartyId, item.OwnerPartyId));
        }

        /// <summary>
        /// 쌓인 패킷에 그 플레이어가 맞은 Damaged가 있는가(나머지도 비움). 체력은 자연 회복으로 오르므로 패킷으로 본다.
        /// </summary>
        private static bool Hurt(Session session)
        {
            uint self = session.Player!.Id;
            return Take(session).Any(packet => packet.BodyCase == Packet.BodyOneofCase.Damaged && packet.Damaged.TargetId == self);
        }

        private static World BossWorld(string[] rows, uint respawnMs = 600000)
        {
            MonstersRow boss = TestData.Monster(3, aggressive: true);
            boss.Kind = MonsterKind.Boss;
            boss.Skill = 901;
            boss.Speed = 0;
            boss.MaxHp = 5000;
            boss.Exp = 100;
            boss.DropGroup = 1;
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMonsters(
                new[] { TestData.Spawn(1, 0, 0, 3, respawnMs: respawnMs) }, rows, null, null, new[] { TestData.Monster(1, aggressive: true), TestData.Monster(2, aggressive: false), boss },
                TestData.LevelsUpTo(4)));
        }

        /// <summary>
        /// 다음 AreaWarning이 올 때까지 돌리고, 그것과 그것을 낸 틱을 낸다.
        /// </summary>
        private static AreaWarning NextWarning(World world, Session session, out uint tick)
        {
            for (int i = 0; i < 200; i++)
            {
                tick = world.Tick;
                world.Step();
                if (Take(session).FirstOrDefault(packet => packet.BodyCase == Packet.BodyOneofCase.AreaWarning) is Packet found)
                {
                    return found.AreaWarning;
                }
            }

            throw new InvalidOperationException("No AreaWarning came.");
        }
    }
}
