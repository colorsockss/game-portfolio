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
    /// PK와 성향(44). 시험 맵은 64 m이고 x -10..-5 m가 안전 지대다(z -5..5). 플레이어는 따로 말하지 않으면 레벨 10이다.
    /// 몬스터 2(비선공, 체력 100)는 (6, 0)에 서 있다.
    /// </summary>
    public partial class WorldTests
    {
        private const uint AggressorTicks = 600;

        /// <summary>
        /// 둘 다 안전 지대 밖이고 레벨 10 이상이며 파티원이 아니면 칠 수 있다. 안전 지대 안의 일반 플레이어와 안에서 밖의 일반 플레이어는 "공격할 수 없는 대상",
        /// 레벨 10 미만은 공격하지도 받지도 않고, 파티원은 "파티원"이다. 선공 표시가 있거나 무법자인 플레이어는 안전 지대 안에 있어도 맞고 안의 공격자도 칠 수 있다.
        /// 벽 너머의 플레이어에게 쓴 단일 대상 스킬은 "막힘"이다.
        /// </summary>
        [Fact]
        public void PlayersAttackPlayersOnlyByTheRules()
        {
            World world = PkWorld();
            Session a = Duelist(world, "hero_01", 1, 0);
            Session b = Duelist(world, "hero_02", 2, 0);
            Session low = Duelist(world, "hero_03", 0, 1, level: 9);
            FailReason Try(Session attacker, Session target)
            {
                Attack(world, attacker, target.Player!.Id);
                Packet? failed = Take(attacker).FirstOrDefault(packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed);
                world.Receive(attacker, new Packet { AttackStop = new AttackStop() });
                return failed?.ActionFailed.Reason ?? FailReason.None;
            }

            Assert.Equal(FailReason.None, Try(a, b));
            Assert.Equal(FailReason.PkLevelTooLow, Try(a, low));
            Assert.Equal(FailReason.PkLevelTooLow, Try(low, a));
            world.Place(b.Player!, Center(-6), Center(0));
            Assert.Equal(FailReason.InvalidTarget, Try(a, b));
            world.Place(b.Player!, Center(2), Center(0));
            world.Place(a.Player!, Center(-6), Center(0));
            Assert.Equal(FailReason.InvalidTarget, Try(a, b));

            // 선공 표시가 있는 b는 안전 지대 안에서도 맞고, 안의 a도 칠 수 있다. 무법자도 같다.
            b.Player!.AggressorEndTick = world.Tick + 100;
            world.Place(b.Player!, Center(-7), Center(0));
            Assert.Equal(FailReason.None, Try(a, b));
            b.Player!.AggressorEndTick = 0;
            b.Player!.Karma = -1;
            Assert.Equal(FailReason.None, Try(a, b));
            b.Player!.Karma = 0;

            world.Place(a.Player!, Center(1), Center(0));
            world.Place(b.Player!, Center(2), Center(0));
            Form(world, a, b);
            Assert.Equal(FailReason.PartyMember, Try(a, b));

            World walled = PkWorld((3, -5, 4, 5, '#'));
            Session c = Duelist(walled, "hero_01", 1, 0, CharacterClass.Mage);
            Session d = Duelist(walled, "hero_02", 5, 0);
            UseSkill(walled, c, 205, d.Player!.Id);
            Assert.Contains(Take(c), packet => packet.RequestResult?.Result == FailReason.Blocked || packet.ActionFailed?.Reason == FailReason.Blocked);
        }

        /// <summary>
        /// 치던 일반 플레이어가 안전 지대에 들어가면 걸린 타격이 맞지 않고, 다음 공격 틱에 기본 공격이 실패 알림과 함께 끝난다.
        /// 시전하는 동안 대상 플레이어가 안전 지대에 들어가면 끝나는 틱에 ProgressCancelled("공격할 수 없는 대상")가 가고 마나가 빠지지 않는다.
        /// </summary>
        [Fact]
        public void SafeZonesEndAttacksAndCastsOnPlayers()
        {
            World world = PkWorld();
            Session a = Duelist(world, "hero_01", 1, 0);
            Session b = Duelist(world, "hero_02", 2, 0);
            Attack(world, a, b.Player!.Id);
            world.Step();
            Assert.Contains(Take(a), packet => packet.BodyCase == Packet.BodyOneofCase.AttackSwing);
            world.Place(b.Player!, Center(-6), Center(0));
            StepUntil(world, () => a.Player!.AttackTarget == 0, 40);
            Assert.False(Hurt(b));
            Assert.Contains(Take(a), packet => packet.ActionFailed?.Reason == FailReason.InvalidTarget);

            World casting = PkWorld();
            Session mage = Duelist(casting, "hero_01", 1, 0, CharacterClass.Mage);
            Session target = Duelist(casting, "hero_02", 4, 0);
            uint mp = mage.Player!.Mp;
            UseSkill(casting, mage, 205, target.Player!.Id);
            casting.Step();
            casting.Place(target.Player!, Center(-6), Center(0));
            StepUntil(casting, () => mage.Player!.Progress == null, 60);
            Assert.Contains(Take(mage), packet => packet.ProgressCancelled?.Reason == FailReason.InvalidTarget);
            Assert.Equal(mp, mage.Player!.Mp);
        }

        /// <summary>
        /// 강제 공격 표시 없이 쓴 자기 중심 범위 스킬과 직선 발사체는 플레이어를 지나가고 몬스터만 맞는다. 표시가 있으면 CanAttack을 통과한 플레이어도 맞고
        /// 파티원과 레벨 10 미만은 맞지 않는다. 단일 대상 스킬은 표시 없이도 CanAttack만으로 맞는다.
        /// </summary>
        [Fact]
        public void ForceAttackDecidesWhetherAreasAndLinesHitPlayers()
        {
            foreach (bool force in new[] { false, true })
            {
                World world = PkWorld();
                Session a = Duelist(world, "hero_01", 4, 0);
                Session b = Duelist(world, "hero_02", 5, 1);
                Session member = Duelist(world, "hero_03", 3, 1);
                Session low = Duelist(world, "hero_04", 4, 1, level: 9);
                Form(world, a, member);
                Monster monster = world.Monsters[0];
                uint hp = monster.Hp;
                world.Receive(a, new Packet { UseSkill = new UseSkill { SkillId = 104, TargetId = 0, ForceAttack = force } });
                StepUntil(world, () => monster.Hp < hp, 20);
                world.Step();
                Assert.True(monster.Hp < hp);
                Assert.Equal((force, false, false), (Hurt(b), Hurt(member), Hurt(low)));
            }

            foreach (bool force in new[] { false, true })
            {
                World world = PkWorld();
                Session mage = Duelist(world, "hero_01", 0, 0, CharacterClass.Mage);
                Session b = Duelist(world, "hero_02", 3, 0);
                Monster monster = world.Monsters[0];
                uint hp = monster.Hp;
                world.Receive(mage, new Packet { UseSkill = new UseSkill { SkillId = 201, TargetId = monster.Id, ForceAttack = force } });
                StepUntil(world, () => false, 30);
                Assert.Equal((force, !force), (Hurt(b), monster.Hp < hp));
            }

            World single = PkWorld();
            Session knight = Duelist(single, "hero_01", 1, 0);
            Session victim = Duelist(single, "hero_02", 2, 0);
            UseSkill(single, knight, 101, victim.Player!.Id);
            StepUntil(single, () => victim.Player!.Hp < victim.Player!.MaxHp, 20);
            Assert.True(Hurt(victim));
        }

        /// <summary>
        /// 일반 플레이어에게 기본 공격을 시작한 틱(AttackSwing)과 단일 대상 스킬을 쓴 틱에 30초의 선공 표시가 붙고 이름 색이 보라색이 되며, 받은 연결과 본인이
        /// EntityState를, 본인이 SelfVitals를 받는다. 30초 뒤에 떨어지며 EntityState가 가고, 다시 치면 새로 시작해 옛 끝나는 틱에 떨어지지 않는다.
        /// 선공 표시가 있는 플레이어를 친 쪽에는 붙지 않고, 죽으면 떨어진다.
        /// </summary>
        [Fact]
        public void AttackingNormalPlayersMarksTheAttacker()
        {
            World world = PkWorld();
            Session a = Duelist(world, "hero_01", 1, 0);
            Session b = Duelist(world, "hero_02", 2, 0);
            Attack(world, a, b.Player!.Id);
            uint swung = world.Tick;
            world.Step();
            Assert.Equal((swung + AggressorTicks, NameColor.Aggressor), (a.Player!.AggressorEndTick, a.Player!.NameColor));
            Assert.Contains(Take(b), packet => packet.EntityState?.Id == a.Player!.Id && packet.EntityState.NameColor == NameColor.Aggressor);
            Assert.Contains(TakeVitals(a), packet => packet.SelfVitals?.AggressorEndTick == swung + AggressorTicks);

            // b가 되받아 쳐도 선공 표시가 있는 a를 친 것이라 b에는 붙지 않는다.
            Attack(world, b, a.Player!.Id);
            world.Step();
            Assert.Equal(0u, b.Player!.AggressorEndTick);
            world.Receive(a, new Packet { AttackStop = new AttackStop() });
            world.Receive(b, new Packet { AttackStop = new AttackStop() });

            // 10초 뒤에 다시 치면(단일 대상 스킬) 새로 센다.
            StepTo(world, swung + 200);
            Take(a);
            UseSkill(world, a, 101, b.Player!.Id);
            uint used = world.Tick;
            world.Step();
            Assert.Equal(used + AggressorTicks, a.Player!.AggressorEndTick);
            StepTo(world, swung + AggressorTicks + 1);
            Assert.Equal(NameColor.Aggressor, a.Player!.NameColor);
            Take(b);
            StepTo(world, used + AggressorTicks + 1);
            Assert.Equal((0u, NameColor.Normal), (a.Player!.AggressorEndTick, a.Player!.NameColor));
            Assert.Contains(Take(b), packet => packet.EntityState?.Id == a.Player!.Id && packet.EntityState.NameColor == NameColor.Normal);

            UseSkill(world, a, 101, b.Player!.Id);
            world.Step();
            a.Player!.Hp = 1;
            Attack(world, b, a.Player!.Id);
            StepUntil(world, () => a.Player!.Dead, 40);
            Assert.Equal((0u, NameColor.Normal), (a.Player!.AggressorEndTick, a.Player!.NameColor));
        }

        /// <summary>
        /// 시전 시간이 있는 단일 대상 스킬은 시전을 시작한 틱에 붙고 취소돼도 남는다. 범위 스킬은 일반 플레이어가 맞은 틱에 붙고, 아무도 맞지 않으면 붙지 않는다.
        /// </summary>
        [Fact]
        public void CastsAndAreasMarkAtTheirOwnTicks()
        {
            World world = PkWorld();
            Session mage = Duelist(world, "hero_01", 1, 0, CharacterClass.Mage);
            Session b = Duelist(world, "hero_02", 4, 0);
            UseSkill(world, mage, 205, b.Player!.Id);
            Assert.Equal(world.Tick + AggressorTicks, mage.Player!.AggressorEndTick);
            world.Place(mage.Player!, Center(1), Center(1));
            world.Receive(mage, new Packet { Move = new Move { X = Center(1), Z = Center(2), Ack = mage.Player!.Ack } });
            StepUntil(world, () => mage.Player!.Progress == null, 60);
            Assert.NotEqual(0u, mage.Player!.AggressorEndTick);

            World area = PkWorld();
            Session knight = Duelist(area, "hero_01", 20, 20);
            world = area;
            area.Receive(knight, new Packet { UseSkill = new UseSkill { SkillId = 104, ForceAttack = true } });
            StepUntil(area, () => false, 10);
            Assert.Equal(0u, knight.Player!.AggressorEndTick);

            Session near = Duelist(area, "hero_02", 21, 20);
            StepUntil(area, () => SkillSystem.Ready(knight.Player!.CooldownEnd(104), area.Tick), 40);
            area.Receive(knight, new Packet { UseSkill = new UseSkill { SkillId = 104, ForceAttack = true } });
            uint used = area.Tick;
            StepUntil(area, () => near.Player!.Hp < near.Player!.MaxHp, 20);
            Assert.Equal(used + 6 + AggressorTicks, knight.Player!.AggressorEndTick);
        }

        /// <summary>
        /// 일반 플레이어를 죽인 타격을 준 한 명만 성향이 100 내려가 무법자(빨간색)가 되고, 선공 표시가 함께 있어도 빨간색이다. 선공 표시가 있거나 무법자인
        /// 플레이어를 죽이면 그대로다. 본인은 바뀔 때 Karma를 받는다. 몬스터를 잡으면 경험치를 받은 파티원 모두 5씩 오르고 0에서 멈추며,
        /// 0으로 돌아오면 이름 색이 돌아온다. 다시 들어와도 성향이 남고 들어올 때 Karma를 받는다.
        /// </summary>
        [Fact]
        public void KillingNormalPlayersLowersKarma()
        {
            World world = PkWorld();
            Session a = Duelist(world, "hero_01", 1, 0);
            Session b = Duelist(world, "hero_02", 2, 0);
            Session helper = Duelist(world, "hero_03", 1, 1);
            Attack(world, helper, b.Player!.Id);
            world.Step();
            world.Receive(helper, new Packet { AttackStop = new AttackStop() });
            StepUntil(world, () => Hurt(b), 20);
            b.Player!.Hp = 1;
            Attack(world, a, b.Player!.Id);
            StepUntil(world, () => b.Player!.Dead, 40);
            Assert.Equal((-100, 0), (a.Player!.Karma, helper.Player!.Karma));
            Assert.Equal(NameColor.Outlaw, a.Player!.NameColor);
            Assert.NotEqual(0u, a.Player!.AggressorEndTick);
            Assert.Contains(TakeVitals(a), packet => packet.Karma?.Karma_ == -100);
            world.Receive(a, new Packet { AttackStop = new AttackStop() });

            // 무법자 a를 죽인 b와 선공 표시가 있는 helper를 죽인 b는 그대로다.
            world.Receive(b, new Packet { Revive = new Revive() });
            Fighter(world, "hero_04", 30, 30);
            world.Place(b.Player!, Center(2), Center(0));
            a.Player!.Hp = 1;
            Attack(world, b, a.Player!.Id);
            StepUntil(world, () => a.Player!.Dead, 40);
            helper.Player!.Hp = 1;
            Attack(world, b, helper.Player!.Id);
            StepUntil(world, () => helper.Player!.Dead, 40);
            Assert.Equal((0, -100), (b.Player!.Karma, a.Player!.Karma));

            // 몬스터를 잡으면 5씩 오르고 0에서 멈춘다.
            world.Receive(a, new Packet { Revive = new Revive() });
            world.Receive(helper, new Packet { Revive = new Revive() });
            world.Step();
            a.Player!.Karma = -7;
            Form(world, a, helper);
            world.Place(a.Player!, Center(5), Center(0));
            world.Place(helper.Player!, Center(5), Center(1));
            Kill(world, a, world.Monsters[0]);
            Assert.Equal((-2, 0), (a.Player!.Karma, helper.Player!.Karma));
            Assert.Equal(NameColor.Outlaw, a.Player!.NameColor);
            StepUntil(world, () => (world.Monsters.Count > 0) && !world.Monsters[0].Dead, 800);
            Kill(world, a, world.Monsters[0]);
            Assert.Equal((0, NameColor.Normal), (a.Player!.Karma, a.Player!.NameColor));

            // 다시 들어와도 남는다.
            a.Player!.Karma = -30;
            long id = a.Player!.CharacterId;
            world.Receive(a, new Packet { LeaveWorld = new LeaveWorld() });
            world.CompleteSaves();
            Take(a);
            Enter(world, a, id);
            Assert.Equal(-30, a.Player!.Karma);
            Assert.Contains(TakeVitals(a), packet => packet.Karma?.Karma_ == -30);
            world.Step();
            Assert.Equal(NameColor.Outlaw, a.Player!.NameColor);
        }

        /// <summary>
        /// 경비병은 일반 플레이어를 쫓지 않고, 인식 범위에 든 선공 표시나 무법자를 쫓아가 친다(안전 지대 안까지). 경비병을 대상으로 한 공격은 실패하고,
        /// 경비병이 죽인 것으로는 성향이 바뀌지 않는다. 쫓던 대상의 선공 표시가 끝나면 놓인 점으로 돌아간다.
        /// </summary>
        [Fact]
        public void GuardsChaseAggressorsAndOutlaws()
        {
            World world = GuardWorld();
            Guard guard = world.Guards.Single();
            Session normal = Duelist(world, "hero_01", -7, 3);
            StepUntil(world, () => false, 10);
            Assert.Equal((MonsterState.Idle, guard.Home), (guard.State, (guard.X, guard.Z)));

            Attack(world, normal, guard.Id);
            Assert.Contains(Take(normal), packet => packet.ActionFailed?.Reason == FailReason.InvalidTarget);

            normal.Player!.AggressorEndTick = world.Tick + 100;
            world.Step();
            StepUntil(world, () => Hurt(normal), 80);
            Assert.Equal(normal.Player!.Id, guard.Target);
            Assert.True(PkSystem.IsNormal(normal.Player!) == false);

            normal.Player!.Hp = 1;
            StepUntil(world, () => normal.Player!.Dead, 80);
            Assert.True(normal.Player!.Dead);
            Assert.Equal(0, normal.Player!.Karma);
            StepUntil(world, () => guard.State == MonsterState.Idle, 80);
            Assert.Equal(guard.Home, (guard.X, guard.Z));

            Session outlaw = Duelist(world, "hero_02", -2, 4);
            outlaw.Player!.Karma = -1;
            StepUntil(world, () => guard.Target == outlaw.Player!.Id, 10);
            outlaw.Player!.Karma = 0;
            StepUntil(world, () => guard.State == MonsterState.Return, 10);
            Assert.Equal(0u, guard.Target);
        }

        /// <summary>
        /// 추적 한계를 넘거나, 쫓던 대상이 월드에서 빠지거나, 추적 한계 안에 길이 없으면 경비병은 놓인 점으로 돌아간다. 후보가 둘이면 가까운 쪽을
        /// (거리가 같으면 개체 번호가 작은 쪽) 쫓고, 쫓는 동안 더 가까운 후보가 와도 바꾸지 않는다.
        /// </summary>
        [Fact]
        public void GuardsReturnAndKeepTheirTarget()
        {
            World world = GuardWorld();
            Guard guard = world.Guards.Single();
            // 쫓던 대상이 빠진 뒤에도 둘레에 플레이어가 있어야 경비병이 깨어 있다(56).
            Fighter(world, "hero_09", -20, -20);
            Session runner = Duelist(world, "hero_01", 2, 6);
            runner.Player!.Karma = -1;
            StepUntil(world, () => guard.State == MonsterState.Chase, 10);
            world.Place(runner.Player!, Center(25), Center(6));
            StepUntil(world, () => guard.State == MonsterState.Return, 200);
            Assert.Equal(MonsterState.Return, guard.State);
            StepUntil(world, () => guard.State == MonsterState.Idle, 200);

            world.Place(runner.Player!, Center(2), Center(6));
            StepUntil(world, () => guard.Target == runner.Player!.Id, 10);
            world.Receive(runner, new Packet { LeaveWorld = new LeaveWorld() });
            world.Step();
            Assert.Equal(0u, guard.Target);
            StepUntil(world, () => guard.State == MonsterState.Idle, 200);
            Assert.Equal(guard.Home, (guard.X, guard.Z));

            // 벽에 둘러싸인 대상은 길이 없어 돌아간다.
            World walled = GuardWorld((5, 5, 10, 6, '#'), (5, 9, 10, 10, '#'), (5, 6, 6, 9, '#'), (9, 6, 10, 9, '#'));
            Guard boxed = walled.Guards.Single();
            Session inside = Duelist(walled, "hero_01", 7, 7);
            inside.Player!.Karma = -1;
            boxed.Target = inside.Player!.Id;
            walled.Step();
            Assert.Equal((0u, boxed.Home), (boxed.Target, (boxed.X, boxed.Z)));

            // 둘 다 3 m(같은 거리)면 번호가 작은 쪽, 쫓는 동안 더 가까운 쪽이 와도 그대로.
            World pair = GuardWorld();
            Guard keeper = pair.Guards.Single();
            Session first = Duelist(pair, "hero_01", 0, 3);
            Session second = Duelist(pair, "hero_02", 0, -3);
            first.Player!.Karma = -1;
            second.Player!.Karma = -1;
            StepUntil(pair, () => keeper.Target != 0, 10);
            Assert.Equal(first.Player!.Id, keeper.Target);
            pair.Place(second.Player!, keeper.X + Units.PerMeter, keeper.Z);
            pair.Step();
            Assert.Equal(first.Player!.Id, keeper.Target);
        }

        /// <summary>
        /// 무법자는 무법자의 부활 지점에서 부활하고 귀환한다. 일반 플레이어는 마을의 부활 지점이다.
        /// </summary>
        [Fact]
        public void OutlawsRespawnAtTheirOwnPoint()
        {
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 6, 0, 2) }, TestData.Draw(64, (-10, -5, -5, 5, 's')), null, null, null, TestData.LevelsUpTo(12));
            data.Zones.Rows[0].OutlawRespawnX = -20;
            data.Zones.Rows[0].OutlawRespawnZ = 20;
            var world = new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
            Session outlaw = Duelist(world, "hero_01", 1, 0);
            outlaw.Player!.Karma = -1;
            outlaw.Player!.Hp = 0;
            outlaw.Player!.Dead = true;
            world.Receive(outlaw, new Packet { Revive = new Revive() });
            Assert.Equal((-20 * Units.PerMeter, 20 * Units.PerMeter), (outlaw.Player!.X, outlaw.Player!.Z));

            world.Place(outlaw.Player!, Center(1), Center(0));
            world.Inventory.Add(outlaw.Player!, 2005, 1, GainReason.DevCommand);
            int slot = Array.FindIndex(outlaw.Player!.Bag.Slots, item => item.ItemId == 2005);
            world.Receive(outlaw, new Packet { UseItem = new UseItem { Slot = (uint)slot, RequestId = 1 } });
            StepUntil(world, () => outlaw.Player!.Progress == null, 100);
            Assert.Equal((-20 * Units.PerMeter, 20 * Units.PerMeter), (outlaw.Player!.X, outlaw.Player!.Z));
        }

        /// <summary>
        /// x -10..-5 m(z -5..5)가 안전 지대인 64 m 맵과 (6, 0)의 비선공 몬스터. boxes로 벽을 더한다.
        /// </summary>
        private static World PkWorld(params (int MinX, int MinZ, int MaxX, int MaxZ, char Cell)[] boxes)
        {
            GameData data = TestData.WithMonsters(
                new[] { TestData.Spawn(1, 6, 0, 2) }, TestData.Draw(64, new[] { (-10, -5, -5, 5, 's') }.Concat(boxes).ToArray()), null, null, null, TestData.LevelsUpTo(12));
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
        }

        /// <summary>
        /// 경비병 하나가 안전 지대(-10..-5) 곁의 (0, 0)에 서 있는 맵. 경비병은 공격력 100, 5 m/s, 인식 8 m, 추적 한계 20 m, 사거리 2 m다.
        /// </summary>
        private static World GuardWorld(params (int MinX, int MinZ, int MaxX, int MaxZ, char Cell)[] boxes)
        {
            MonstersRow guard = TestData.Monster(9, aggressive: false);
            guard.Kind = MonsterKind.Guard;
            guard.Speed = 5;
            guard.Attack = 100;
            var npcs = new Npcs { Rows = { new NpcsRow { Id = 1, NameKey = "npc.guard", Role = NpcRole.Guard, X = 0, Z = 0, MonsterId = 9 } } };
            GameData data = TestData.WithMonsters(
                Array.Empty<SpawnsRow>(), TestData.Draw(64, new[] { (-10, -5, -5, 5, 's') }.Concat(boxes).ToArray()), null, null,
                new[] { TestData.Monster(1, aggressive: true), TestData.Monster(2, aggressive: false), guard }, TestData.LevelsUpTo(12), npcs);
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
        }

        /// <summary>
        /// 칸 (x, z)에 선 레벨 level의 캐릭터(직업의 스킬을 모두 배움). 쌓인 패킷은 비운다.
        /// </summary>
        private static Session Duelist(World world, string loginId, int x, int z, CharacterClass characterClass = CharacterClass.Knight, uint level = 10)
        {
            Session session = Fighter(world, loginId, x, z, characterClass);
            world.Growth.SetLevel(session.Player!, level);
            session.Player!.Mp = session.Player!.MaxMp;
            world.Step();
            Take(session);
            return session;
        }
    }
}
