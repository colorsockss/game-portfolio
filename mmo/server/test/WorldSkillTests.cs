using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 스킬과 효과(26)를 틱을 손으로 돌려 본다. 시험용 스킬은 TestData.Skills(쿨다운 20틱, 마나 10, 타격까지 6틱)이고, 시전은 202가 30틱, 203이 20틱,
    /// 205가 40틱이다. 효과는 기절 40틱, 감속 50% 60틱, 강화 200틱이다. 시험용 몬스터 2(비선공, 체력 100)를 원점 칸의 가운데에 놓는다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 시전 시간이 없는 스킬은 쓴 틱에 마나와 쿨다운이 빠지고(바뀐 쿨다운 하나만 감), 그 틱에 SkillUsed가 가고 결과는 6틱 뒤다.
        /// 타격까지의 시간이 0인 스킬은 같은 틱에 결과가 난다. 그 자리에서 쓰는 스킬은 대상 없이 쓰이고 SkillUsed의 대상이 시전자다.
        /// </summary>
        [Fact]
        public void AnInstantSkillGoesAtUseAndHitsAfterTheDelay()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            uint id = knight.Player!.Id;
            uint tick = world.Tick;
            UseSkill(world, knight, 101, monster.Id);
            Assert.Equal(40u, knight.Player!.Mp);
            Assert.Equal(new[] { Cooldowns((101, tick + 20)) }, TakeVitals(knight));

            world.Step();
            Assert.Equal(new[] { Used(id, 101, monster.Id) }, Skills(knight));
            for (int i = 1; i < 6; i++)
            {
                world.Step();
                Assert.Empty(Skills(knight));
            }

            world.Step();
            Damaged damaged = Assert.Single(Skills(knight)).Damaged;
            Assert.Equal((id, monster.Id, monster.Hp), (damaged.AttackerId, damaged.TargetId, damaged.Hp));
            Assert.Equal(100 - damaged.Damage, monster.Hp);

            UseSkill(world, knight, 103, monster.Id);
            world.Step();
            Assert.Equal(new[] { Used(id, 103, id), Applied(id, 3, world.Tick - 1 + 200) }, Skills(knight));

            UseSkill(world, knight, 104, 0);
            world.Step();
            Assert.Equal(new[] { Used(id, 104, id) }, Skills(knight));
        }

        /// <summary>
        /// 쿨다운 중, 마나 부족, 다른 직업의 스킬, 사거리 밖, 죽은 대상, 복귀 중인 대상, 사거리 안인데 막힌 대상은 저마다의 이유로 실패하고 끊지 않으며
        /// 마나와 쿨다운이 그대로다. 없는 스킬 번호는 끊는다.
        /// </summary>
        [Fact]
        public void FailedSkillsAnswerWithTheirReasonAndKeepTheCosts()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            Player player = knight.Player!;
            UseSkill(world, knight, 101, monster.Id);
            Take(knight);
            UseSkill(world, knight, 101, monster.Id);
            Assert.Equal(new[] { SkillFailed(FailReason.Cooldown) }, Take(knight));
            Assert.Equal(40u, player.Mp);

            player.Mp = 5;
            AssertFails(world, knight, 105, monster.Id, FailReason.NotEnoughMp);
            player.Mp = 50;
            AssertFails(world, knight, 201, monster.Id, FailReason.NotLearned);
            world.Place(player, Center(4), Center(0));
            AssertFails(world, knight, 105, monster.Id, FailReason.OutOfRange);
            AssertFails(world, knight, 105, 0, FailReason.NoTarget);
            world.Place(player, Center(1), Center(0));
            Return(world, monster);
            world.Place(player, monster.X + M, monster.Z);
            AssertFails(world, knight, 105, monster.Id, FailReason.InvalidTarget);
            monster.Dead = true;
            AssertFails(world, knight, 105, monster.Id, FailReason.NoTarget);
            Assert.Equal((50u, 0u), (player.Mp, player.CooldownEnd(105)));
            Assert.False(knight.IsClosing);

            World walled = CombatWorld(TestData.Draw(64, (1, 0, 2, 1, '#')));
            Session blocked = Fighter(walled, "hero_01", 2, 0);
            AssertFails(walled, blocked, 105, walled.Monsters[0].Id, FailReason.Blocked);

            UseSkill(world, knight, 999, monster.Id);
            Assert.True(knight.IsClosing);
        }

        /// <summary>
        /// 시전 시간이 있는 스킬은 Progress 뒤 끝나는 틱에 SkillUsed와 결과가 함께 가고, 비용은 그때 빠진다. 시전 중의 다른 스킬과 AttackStart는
        /// "진행 중"으로 실패하고, 켜 둔 기본 공격은 시전 중에 쉬었다가 끝나면 이어진다. 시전은 피해로 취소되지 않는다.
        /// </summary>
        [Fact]
        public void ACastFiresAtItsEndWhileAttacksRest()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 3, 0, CharacterClass.Mage);
            Player player = mage.Player!;
            Attack(world, mage, monster.Id);
            world.Step();
            Take(mage);

            uint start = world.Tick;
            UseSkill(world, mage, 205, monster.Id);
            Assert.Equal((120u, 0u), (player.Mp, player.CooldownEnd(205)));
            world.Step();
            Assert.Equal(new[] { Progressing(player.Id, 205, start + 40) }, Skills(mage));
            UseSkill(world, mage, 201, monster.Id);
            Attack(world, mage, monster.Id);
            Assert.Equal(new[] { SkillFailed(FailReason.Busy), Failed(FailReason.Busy) }, Take(mage));

            bool hurt = false;
            for (int i = 1; i < 40; i++)
            {
                world.Step();
                List<Packet> packets = Take(mage);
                Assert.DoesNotContain(packets, packet => IsSwing(packet) && packet.AttackSwing.AttackerId == player.Id);
                Assert.DoesNotContain(packets, packet => packet.BodyCase is Packet.BodyOneofCase.SkillUsed or Packet.BodyOneofCase.ProgressCancelled);
                hurt |= packets.Any(packet => IsDamaged(packet) && packet.Damaged.TargetId == player.Id);
            }

            Assert.True(hurt);
            world.Step();
            List<Packet> fired = Take(mage);
            Assert.Contains(Used(player.Id, 205, monster.Id), fired);
            Assert.Contains(fired, packet => IsDamaged(packet) && packet.Damaged.AttackerId == player.Id && packet.Damaged.TargetId == monster.Id);
            // 전투 상태의 회복(1%)이 같은 틱에 들 수 있다.
            Assert.InRange(player.Mp, 110u, 111u);
            Assert.Equal(start + 60, player.CooldownEnd(205));
            StepUntil(world, () => Take(mage).Any(packet => IsSwing(packet) && packet.AttackSwing.AttackerId == player.Id), 30);
            Assert.True(player.NextAttackTick > start + 40);
        }

        /// <summary>
        /// 시전은 시작한 자리에서 벗어나면 취소되고(방향만 바꾼 Move는 아님) ProgressCancelled("취소됨")가 본인과 받은 연결에 간다.
        /// 마나와 쿨다운은 그대로이고, 시전을 시작한 틱에 든 전투 상태는 남는다. 시작 전에 낸 기본 공격의 타격은 맞는다.
        /// </summary>
        [Fact]
        public void MovingAwayCancelsACast()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 5, 0, CharacterClass.Mage);
            Session observer = Fighter(world, "hero_02", 6, 0);
            Player player = mage.Player!;
            Attack(world, mage, monster.Id);
            world.Step();
            Assert.Contains(mage.Outbox, IsSwing);
            world.Receive(mage, new Packet { AttackStop = new AttackStop() });

            uint start = world.Tick;
            UseSkill(world, mage, 205, monster.Id);
            Assert.Equal(start + 100, player.CombatEndTick);
            world.Step();
            Take(observer);
            Move(world, mage, player.X, player.Z, player.Ack, yaw: 64);
            world.Step();
            Assert.NotNull(player.Progress);
            Move(world, mage, player.X + 10, player.Z, player.Ack);
            world.Step();
            Packet cancelled = Cancelled(player.Id, FailReason.Cancelled);
            Assert.Contains(cancelled, Take(mage));
            Assert.Contains(cancelled, Take(observer));
            Assert.Equal((120u, 0u, start + 100), (player.Mp, player.CooldownEnd(205), player.CombatEndTick));

            StepUntil(world, () => monster.Hp < 100, 20);
            Assert.True(monster.Hp < 100);
            StepFor(world, 40);
            Assert.DoesNotContain(Skills(mage), packet => packet.BodyCase == Packet.BodyOneofCase.SkillUsed);
        }

        /// <summary>
        /// 기절과 죽음은 시전을 취소하고, 월드에서 나가면 시전이 발동하지 않는다. 쿨다운은 죽어도 남는다.
        /// 피해로 취소되는 종류(시험용으로 채집을 씀)는 피해를 받으면 취소된다.
        /// </summary>
        [Fact]
        public void StunDeathAndLeavingEndACast()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 5, 0, CharacterClass.Mage);
            Player player = mage.Player!;
            UseSkill(world, mage, 205, monster.Id);
            world.Step();
            world.Effects.Apply(player, Effect(1), world.Tick);
            world.Step();
            Assert.Contains(Cancelled(player.Id, FailReason.Cancelled), Take(mage));
            Assert.Null(player.Progress);

            StepFor(world, 40);
            UseSkill(world, mage, 201, monster.Id);
            uint cooldown = player.CooldownEnd(201);
            Assert.NotEqual(0u, cooldown);
            StepFor(world, 20);
            // 맞아서 쫓아오는 몬스터는 감속이 걸려 있으므로 곁에 두고 시전한다.
            world.Place(player, monster.X + M, monster.Z);
            UseSkill(world, mage, 205, monster.Id);
            player.Hp = 1;
            StepUntil(world, () => player.Dead, 60);
            Assert.True(player.Dead);
            Assert.Contains(Cancelled(player.Id, FailReason.Cancelled), Take(mage));
            Assert.Equal(cooldown, player.CooldownEnd(201));

            World other = CombatWorld(TestData.Draw(64));
            Session leaving = Fighter(other, "hero_01", 5, 0, CharacterClass.Mage);
            UseSkill(other, leaving, 205, other.Monsters[0].Id);
            other.Step();
            other.Receive(leaving, new Packet { LeaveWorld = new LeaveWorld() });
            StepFor(other, 45);
            Assert.Equal(100u, other.Monsters[0].Hp);

            World gathering = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(gathering, "hero_01", 1, 0);
            gathering.Progress.Start(knight.Player!, ProgressKind.Gather, 1, 0, gathering.Tick + 200);
            gathering.Monsters[0].Damage.Add(knight.Player!.Id, 1);
            StepUntil(gathering, () => knight.Player!.Progress == null, 40);
            Assert.Contains(Cancelled(knight.Player!.Id, FailReason.Cancelled), Take(knight));
        }

        /// <summary>
        /// 시전을 마칠 때 마나가 모자라거나 대상이 죽었거나 사거리 밖이거나 복귀를 시작했으면 그 이유로 ProgressCancelled이고 아무것도 빠지지 않는다.
        /// </summary>
        [Fact]
        public void ACastThatFailsItsEndCheckCostsNothing()
        {
            void Check(Action<World, Player, Monster> change, FailReason reason)
            {
                World world = CombatWorld(TestData.Draw(64));
                Monster monster = world.Monsters[0];
                Session mage = Fighter(world, "hero_01", 5, 0, CharacterClass.Mage);
                Player player = mage.Player!;
                UseSkill(world, mage, 205, monster.Id);
                StepFor(world, 30);
                change(world, player, monster);
                StepFor(world, 11);
                List<Packet> packets = Skills(mage);
                Assert.Contains(Cancelled(player.Id, reason), packets);
                Assert.DoesNotContain(packets, packet => packet.BodyCase == Packet.BodyOneofCase.SkillUsed);
                Assert.Equal(0u, player.CooldownEnd(205));
                Assert.Equal(100u, monster.Hp);
            }

            Check((_, player, _) => player.Mp = 5, FailReason.NotEnoughMp);
            Check((_, _, monster) => monster.Dead = true, FailReason.NoTarget);
            Check((world, _, monster) => world.Place(monster, Center(20), Center(0)), FailReason.OutOfRange);
            Check((world, _, monster) => Return(world, monster), FailReason.InvalidTarget);
        }

        /// <summary>
        /// 결과의 틱에 대상이 죽었거나 시전자가 기절했거나 월드에서 빠졌으면 결과가 없고 비용은 돌아오지 않는다.
        /// </summary>
        [Fact]
        public void NoResultWhenTheTargetOrCasterIsGoneAtTheHit()
        {
            void Check(Action<World, Session, Monster> change)
            {
                World world = CombatWorld(TestData.Draw(64));
                Monster monster = world.Monsters[0];
                Session knight = Fighter(world, "hero_01", 1, 0);
                UseSkill(world, knight, 101, monster.Id);
                world.Step();
                change(world, knight, monster);
                StepFor(world, 6);
                Assert.Equal(100u, monster.Hp);
                Assert.DoesNotContain(Skills(knight), packet => IsDamaged(packet) && packet.Damaged.TargetId == monster.Id);
            }

            Check((_, _, monster) => monster.Dead = true);
            Check((world, knight, _) => world.Effects.Apply(knight.Player!, Effect(1), world.Tick));
            Check((world, knight, _) => LeaveNow(knight, () => world.Receive(knight, new Packet { LeaveWorld = new LeaveWorld() })));
        }

        /// <summary>
        /// 자기 중심 범위 피해는 범위의 경계 안(4 m)의 몬스터만 맞히고, 중심에서 선이 막힌 몬스터, 플레이어, 복귀 중인 몬스터, 죽은 몬스터는 맞히지 않는다
        /// (맞지 않은 몬스터는 피해 표에도 들지 않음). 안전 지대 안에서 쓰면 몬스터를 맞히지 않는다. 감속을 거는 범위 피해는 맞은 대상마다 감속을 붙인다.
        /// </summary>
        [Fact]
        public void AreaSkillsHitOnlyEnemiesInsideAndInSight()
        {
            SpawnsRow[] spawns = Enumerable.Range(1, 5).Select(i => TestData.Spawn((uint)i, 0, i == 4 ? 10 : 0, 2)).ToArray();
            World world = CombatWorld(TestData.Draw(64, (-2, 0, -1, 1, '#')), spawns: spawns);
            Monster edge = world.Monsters[0], beyond = world.Monsters[1], walled = world.Monsters[2], returning = world.Monsters[3], dead = world.Monsters[4];
            Session knight = Fighter(world, "hero_01", 0, 0);
            Session other = Fighter(world, "hero_02", 1, 0);
            Player player = knight.Player!;
            world.Place(edge, player.X + (4 * M), player.Z);
            world.Place(beyond, player.X, player.Z + (4 * M) + 1);
            world.Place(walled, Center(-3), player.Z);
            Return(world, returning);
            world.Place(returning, player.X, player.Z + (2 * M));
            world.Place(dead, player.X - M, player.Z + M);
            dead.Dead = true;
            UseSkill(world, knight, 104, 0);
            StepFor(world, 7);

            Assert.True(edge.Hp < 100);
            Assert.Equal(new uint[] { 100, 100, 100, 100 }, new[] { beyond.Hp, walled.Hp, returning.Hp, dead.Hp });
            Assert.Equal(new[] { 1, 0, 0, 0, 0 }, new[] { edge, beyond, walled, returning, dead }.Select(monster => monster.Damage.Count));
            Assert.Equal(other.Player!.MaxHp, other.Player!.Hp);

            World town = CombatWorld(TestData.Draw(64));
            Session safe = Fighter(town, "hero_01", -32, -32);
            town.Place(town.Monsters[0], Center(-30), Center(-32));
            UseSkill(town, safe, 104, 0);
            StepFor(town, 7);
            Assert.Equal(100u, town.Monsters[0].Hp);

            World cold = CombatWorld(TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 0, 0, 2), TestData.Spawn(2, 2, 0, 2) });
            Session mage = Fighter(cold, "hero_01", 1, 1, CharacterClass.Mage);
            UseSkill(cold, mage, 204, 0);
            StepFor(cold, 7);
            Assert.All(cold.Monsters, monster => Assert.Equal(50u, monster.SlowPercent));
        }

        /// <summary>
        /// 회복과 강화는 대상을 무엇으로 보내든 자기에게 쓰이고 전투 상태를 만들지 않는다. 회복량은 공격력 × 계수이고 최대 체력을 넘지 않는다.
        /// 강화는 붙을 때 능력치가 오르고 끝나는 틱에 돌아오며, 떨어질 때 패킷이 없다.
        /// </summary>
        [Fact]
        public void HealsAndBuffsGoToTheCasterWithoutCombat()
        {
            Constants constants = TestData.Constants(64);
            constants.RegenPercent = 0;
            World world = CombatWorld(TestData.Draw(64), constants: constants);
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 5, 0, CharacterClass.Mage);
            Player player = mage.Player!;
            player.Hp = 50;
            UseSkill(world, mage, 203, monster.Id);
            StepFor(world, 21);
            Assert.Contains(Used(player.Id, 203, player.Id), Take(mage));
            Assert.Equal(50u + 30, player.Hp);
            StepFor(world, 20);
            UseSkill(world, mage, 203, monster.Id);
            StepFor(world, 21);
            Assert.Equal(player.MaxHp, player.Hp);
            Assert.Equal(0u, player.CombatEndTick);

            Session knight = Fighter(world, "hero_02", 1, 0);
            uint tick = world.Tick;
            UseSkill(world, knight, 103, monster.Id);
            world.Step();
            Assert.Contains(Applied(knight.Player!.Id, 3, tick + 200), Take(knight));
            Assert.Equal(15u, knight.Player!.Stats.Defense);
            StepFor(world, 199);
            Assert.Equal(15u, knight.Player!.Stats.Defense);
            world.Step();
            Assert.Equal(10u, knight.Player!.Stats.Defense);
            Assert.Equal(0u, knight.Player!.CombatEndTick);
            Assert.DoesNotContain(Take(knight), packet => packet.BodyCase == Packet.BodyOneofCase.EffectApplied);
        }

        /// <summary>
        /// 피해와 상태 이상 스킬은 SkillUsed가 나간 틱에 시전자의 전투 상태를 만들고, 실패한 UseSkill은 만들지 않는다. 기절만 건 플레이어는 피해 0으로
        /// 피해 표에 들고, 기절한 몬스터는 피해 없이 전투 상태가 되며 움직이지도 치지도 않다가 기절이 끝나면 그 플레이어를 친다.
        /// </summary>
        [Fact]
        public void AStunOnlySkillEngagesAndFreezesTheMonster()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 4, 0);
            Player player = knight.Player!;
            AssertFails(world, knight, 102, monster.Id, FailReason.OutOfRange);
            Assert.Equal(0u, player.CombatEndTick);
            world.Place(player, Center(1), Center(0));
            uint tick = world.Tick;
            UseSkill(world, knight, 102, monster.Id);
            world.Step();
            Assert.Equal(tick + 100, player.CombatEndTick);
            StepFor(world, 6);
            Assert.True(monster.Stunned);
            Assert.Equal(tick + 106, monster.CombatEndTick);
            Assert.Equal(1, monster.Damage.Count);
            Assert.Contains(Applied(monster.Id, 1, tick + 46), Take(knight));

            (int X, int Z) at = (monster.X, monster.Z);
            for (int i = 0; i < 39; i++)
            {
                world.Step();
                Assert.DoesNotContain(Take(knight), packet => IsSwing(packet) && packet.AttackSwing.AttackerId == monster.Id);
            }

            Assert.Equal(at, (monster.X, monster.Z));
            StepUntil(world, () => Take(knight).Any(packet => IsSwing(packet) && packet.AttackSwing.AttackerId == monster.Id), 30);
            Assert.False(monster.Stunned);
            Assert.Equal(player.Id, monster.AttackTarget);
        }

        /// <summary>
        /// 같은 효과를 다시 걸면 끝나는 틱만 새로 되고 옛 끝나는 틱에 떨어지지 않는다. 시간이 다 된 효과와 죽어서 떼인 효과에는 패킷이 없고,
        /// 죽은 개체의 EntityEnter에 효과가 실리지 않는다. 효과가 걸린 개체와 시전 중인 개체는 새로 시야에 든 연결의 EntityEnter에 실린다.
        /// </summary>
        [Fact]
        public void EffectsRefreshExpireQuietlyAndTravelInEntityEnter()
        {
            World world = CombatWorld(TestData.Draw(128));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 5, 0, CharacterClass.Mage);
            uint start = world.Tick;
            world.Effects.Apply(monster, Effect(2), start);
            StepFor(world, 30);
            world.Effects.Apply(monster, Effect(2), world.Tick);
            StepFor(world, 31);
            Assert.Equal(50u, monster.SlowPercent);
            StepFor(world, 30);
            Assert.Equal(0u, monster.SlowPercent);
            Assert.Equal(2, Take(mage).Count(packet => packet.BodyCase == Packet.BodyOneofCase.EffectApplied));

            world.Effects.Apply(monster, Effect(2), world.Tick);
            UseSkill(world, mage, 205, monster.Id);
            world.Step();
            Session late = Fighter(world, "hero_02", -60, 60);
            world.Place(late.Player!, Center(6), Center(0));
            world.Step();
            List<EntityEnter> entered = Take(late).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter).SelectMany(packet => packet.EntitiesEnter.Entities).ToList();
            Assert.Equal(new[] { 2u }, entered.Single(entity => entity.Id == monster.Id).Effects.Select(effect => effect.EffectId));
            Assert.Equal(ProgressKind.Cast, entered.Single(entity => entity.Id == mage.Player!.Id).Progress.Kind);

            monster.Hp = 1;
            StepUntil(world, () => monster.Dead, 60);
            Assert.Empty(monster.Effects);
            Assert.DoesNotContain(Take(late), packet => packet.BodyCase == Packet.BodyOneofCase.EffectApplied);
            Session after = Fighter(world, "hero_03", -60, -60);
            world.Place(after.Player!, Center(4), Center(0));
            world.Step();
            EntityEnter corpse = Take(after).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter).SelectMany(packet => packet.EntitiesEnter.Entities).Single(entity => entity.Id == monster.Id);
            Assert.True(corpse.Dead);
            Assert.Empty(corpse.Effects);
        }

        /// <summary>
        /// 감속 중에는 이동 예산이 줄어 원래 속도의 Move가 되돌려진다. 기절 중에는 Move가 되돌려지고 UseSkill과 AttackStart가 "기절"로 실패하며,
        /// AttackSwing 뒤 타격 전에 기절한 공격자의 타격은 적용되지 않는다. 켜 둔 기본 공격은 기절한 동안 쉬고 끝나면 AttackStart 없이 이어진다.
        /// 마법사의 첫째 스킬(직선 발사체)에 맞은 대상에 감속이 붙는다.
        /// </summary>
        [Fact]
        public void SlowsAndStunsHoldPlayersBack()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session slowed = Fighter(world, "hero_01", -10, 10);
            Session free = Fighter(world, "hero_02", -10, -10);
            world.Effects.Apply(slowed.Player!, Effect(2), world.Tick);
            StepFor(world, 25);
            Take(slowed);
            Move(world, slowed, slowed.Player!.X + 150, slowed.Player!.Z, slowed.Player!.Ack);
            Move(world, free, free.Player!.X + 150, free.Player!.Z, free.Player!.Ack);
            Assert.Contains(slowed.Outbox, packet => packet.BodyCase == Packet.BodyOneofCase.PositionReset);
            Assert.DoesNotContain(free.Outbox, packet => packet.BodyCase == Packet.BodyOneofCase.PositionReset);

            Session knight = Fighter(world, "hero_03", 1, 0);
            Player player = knight.Player!;
            Attack(world, knight, monster.Id);
            world.Step();
            world.Effects.Apply(player, Effect(1), world.Tick);
            Take(knight);
            Move(world, knight, player.X + 10, player.Z, player.Ack);
            UseSkill(world, knight, 101, monster.Id);
            Attack(world, knight, monster.Id);
            List<Packet> answers = Take(knight);
            Assert.Equal(Packet.BodyOneofCase.PositionReset, answers[0].BodyCase);
            Assert.Equal(new[] { SkillFailed(FailReason.Stunned), Failed(FailReason.Stunned) }, answers.Skip(1));
            for (int i = 0; i < 39; i++)
            {
                world.Step();
                Assert.DoesNotContain(Take(knight), packet => (IsSwing(packet) && packet.AttackSwing.AttackerId == player.Id) || (IsDamaged(packet) && packet.Damaged.AttackerId == player.Id));
            }

            Assert.Equal(100u, monster.Hp);
            StepUntil(world, () => monster.Hp < 100, 30);
            Assert.True(monster.Hp < 100);

            World cold = CombatWorld(TestData.Draw(64));
            Session mage = Fighter(cold, "hero_01", 5, 0, CharacterClass.Mage);
            UseSkill(cold, mage, 201, cold.Monsters[0].Id);
            StepUntil(cold, () => cold.Monsters[0].SlowPercent > 0, 20);
            Assert.Equal(50u, cold.Monsters[0].SlowPercent);
        }

        /// <summary>
        /// 스킬의 사건은 대상을 받은 연결과 대상 자신에게만 가고, 시전자를 받지 않은 연결에는 시전자 번호 0으로 간다.
        /// </summary>
        [Fact]
        public void SkillEventsGoToReceiversOfTheTarget()
        {
            World world = CombatWorld(TestData.Draw(128));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", -1, 0);
            Session beyond = Fighter(world, "hero_02", 40, 0);
            Session away = Fighter(world, "hero_03", -60, 0);
            UseSkill(world, knight, 101, monster.Id);
            world.Step();
            Assert.Contains(Used(knight.Player!.Id, 101, monster.Id), Skills(knight));
            Assert.Contains(Used(0, 101, monster.Id), Skills(beyond));
            Assert.Empty(Skills(away));
        }

        /// <summary>
        /// 쿨다운의 비교 벡터(줄마다 쿨다운의 밀리초, 쓴 틱, 묻는 틱 → 쓸 수 있는지, 끝나는 틱)가 커밋된 파일과 같다. MMO_UPDATE_VECTORS=1이면 고쳐 쓴다.
        /// </summary>
        [Fact]
        public void TheCooldownVectorsMatchTheCommittedFile()
        {
            var text = new StringBuilder();
            text.Append("# 쿨다운의 비교 벡터. 서버의 WorldSkillTests가 서버 구현(SkillSystem.CooldownEndTick, Ready)의 답으로 만든다(직접 고치지 않음, MMO_UPDATE_VECTORS=1로 다시 씀).\n");
            text.Append("# 쿨다운(ms)\t쓴 틱\t묻는 틱\t쓸 수 있는지(0, 1)\t끝나는 틱\n");
            foreach (uint cooldownMs in new uint[] { 0, 1, 49, 50, 51, 99, 100, 1000, 1025, 12000 })
            {
                foreach (uint used in new uint[] { 0, 7, 1000003 })
                {
                    uint end = SkillSystem.CooldownEndTick(used, cooldownMs);
                    foreach (uint asked in new[] { used, end - 1, end, end + 1 }.Where(tick => (tick >= used) && (tick <= end + 1)).Distinct())
                    {
                        text.Append($"{cooldownMs}\t{used}\t{asked}\t{(SkillSystem.Ready(end, asked) ? 1 : 0)}\t{end}\n");
                    }
                }
            }

            string path = TestData.Shared("vectors/cooldowns.tsv");
            if (Environment.GetEnvironmentVariable("MMO_UPDATE_VECTORS") == "1")
            {
                File.WriteAllText(path, text.ToString());
            }

            Assert.Equal(text.ToString(), File.ReadAllText(path));
        }

        private static void UseSkill(World world, Session session, uint skillId, uint targetId)
        {
            world.Receive(session, new Packet { UseSkill = new UseSkill { SkillId = skillId, TargetId = targetId } });
        }

        private static void AssertFails(World world, Session session, uint skillId, uint targetId, FailReason reason)
        {
            Take(session);
            UseSkill(world, session, skillId, targetId);
            Assert.Equal(new[] { SkillFailed(reason) }, Take(session));
        }

        private static EffectsRow Effect(uint id)
        {
            return TestData.Effects.Rows.Single(row => row.Id == id);
        }

        /// <summary>
        /// 쌓인 패킷 가운데 스킬과 효과의 사건(SkillUsed, Progress, ProgressCancelled, EffectApplied, Damaged)만 꺼낸다(나머지도 비움).
        /// </summary>
        private static List<Packet> Skills(Session session)
        {
            return Take(session).Where(packet => packet.BodyCase is Packet.BodyOneofCase.SkillUsed or Packet.BodyOneofCase.Progress or Packet.BodyOneofCase.ProgressCancelled
                or Packet.BodyOneofCase.EffectApplied or Packet.BodyOneofCase.Damaged).ToList();
        }

        private static Packet Used(uint casterId, uint skillId, uint targetId)
        {
            return new Packet { SkillUsed = new SkillUsed { CasterId = casterId, SkillId = skillId, TargetId = targetId } };
        }

        private static Packet Applied(uint id, uint effectId, uint endTick)
        {
            return new Packet { EffectApplied = new EffectApplied { Id = id, Effect = new EffectState { EffectId = effectId, EndTick = endTick } } };
        }

        private static Packet Progressing(uint id, uint skillId, uint endTick)
        {
            return new Packet { Progress = new Progress { Id = id, State = new ProgressState { Kind = ProgressKind.Cast, Id = skillId, EndTick = endTick } } };
        }

        private static Packet Cancelled(uint id, FailReason reason)
        {
            return new Packet { ProgressCancelled = new ProgressCancelled { Id = id, Reason = reason } };
        }

        private static Packet SkillFailed(FailReason reason)
        {
            return new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = RequestKind.Skill } };
        }

        private static Packet Cooldowns(params uint[] skillIds)
        {
            return Cooldowns(skillIds.Select(id => (id, 0u)).ToArray());
        }

        private static Packet Cooldowns(params (uint SkillId, uint EndTick)[] entries)
        {
            var cooldowns = new Cooldowns();
            cooldowns.Entries.Add(entries.Select(entry => new Cooldown { SkillId = entry.SkillId, EndTick = entry.EndTick }));
            return new Packet { Cooldowns = cooldowns };
        }
    }
}
