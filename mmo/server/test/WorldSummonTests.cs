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
    /// 소환수(95). 시험 맵은 128 m이고 x −10..−5 m(z −5..5)가 안전 지대다. 몬스터 2(비선공, 체력 5000, 경험치 20)가 (10, 0)에 서 있다.
    /// 소환은 마법사의 206(시전 없음, 소환수 5를 10초)이고 플레이어는 레벨 10이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 발동하는 틱에 소환수가 주인의 자리에 가득 찬 체력으로 나오고 주인 본인과 주인을 받은 연결이 EntityEnter(주인, 사라지는 틱)를 받으며, 주인을 받지 않은 연결은
        /// 받지 않는다. 다시 부르면 앞의 것이 빠지고, 사라진 번호는 10초 안에는 다시 쓰이지 않는다. 남는 시간이 끝나면 빠진다.
        /// </summary>
        [Fact]
        public void CallingPlacesAFullSummonAtTheOwner()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", -50, -50, CharacterClass.Mage);
            Session watcher = Duelist(world, "hero_02", -48, -50);
            Session far = Duelist(world, "hero_03", 50, 50);
            Summon first = Call(world, mage);
            Assert.Equal((mage.Player!.X, mage.Player!.Z, first.MaxHp, 300u), (first.X, first.Z, first.Hp, first.MaxHp));
            world.Step();
            foreach (Session session in new[] { mage, watcher })
            {
                Assert.Contains(Take(session), packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == first.Id && entity.Kind == EntityKind.Summon
                    && entity.SummonOwnerId == mage.Player!.Id && entity.SummonEndTick == first.EndTick && entity.TemplateId == 5) == true);
            }

            Assert.DoesNotContain(Take(far), packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == first.Id) == true);
            StepUntil(world, () => SkillSystem.Ready(mage.Player!.CooldownEnd(206), world.Tick), 40);
            Summon second = Call(world, mage);
            Assert.NotEqual(first.Id, second.Id);
            Assert.DoesNotContain(world.Summons(), summon => summon == first);
            world.Step();
            Assert.Contains(Take(watcher), packet => packet.EntitiesLeave?.Ids.Contains(first.Id) == true);

            StepTo(world, second.EndTick + 1);
            Assert.Empty(world.Summons());
            Assert.Null(mage.Player!.Summon);
        }

        /// <summary>
        /// 주인이 걸으면 소환수가 2 m 안까지 따라오고, 20 m 넘게 떨어지면 주인의 자리로 순간 이동한다. 주인 둘레에 주인까지의 길이 없어도 순간 이동한다.
        /// </summary>
        [Fact]
        public void SummonsFollowTheirOwner()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 0, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            world.Place(mage.Player!, Center(8), Center(0));
            StepUntil(world, () => Distance(summon, mage.Player!) <= 2 * Units.PerMeter, 60);
            Assert.InRange(Distance(summon, mage.Player!), 0, 2 * Units.PerMeter);
            Assert.False(summon.Teleported);

            world.Place(mage.Player!, Center(40), Center(0));
            world.Step();
            Assert.Equal((mage.Player!.X, mage.Player!.Z), (summon.X, summon.Z));

            World walled = SummonWorld((20, -2, 30, -1, '#'), (20, 2, 30, 3, '#'), (20, -1, 21, 2, '#'), (29, -1, 30, 2, '#'));
            Session boxed = Duelist(walled, "hero_01", 0, 0, CharacterClass.Mage);
            Summon pet = Call(walled, boxed);
            walled.Place(boxed.Player!, Center(25), Center(0));
            walled.Step();
            walled.Step();
            Assert.Equal((boxed.Player!.X, boxed.Player!.Z), (pet.X, pet.Z));
        }

        /// <summary>
        /// 소환수는 주인이 기본 공격이나 단일 대상 스킬을 시작한 대상을 치고(범위 스킬의 대상은 치지 않음), 소환수가 친 틱에 주인의 전투 상태가 새로 시작한다.
        /// 주인의 AttackStop(기절한 동안 보낸 것도) 뒤에는 대상을 버리고, 주인이 안전 지대 안이면 치지 않는다.
        /// </summary>
        [Fact]
        public void SummonsFightWhatTheirOwnerAttacks()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 7, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            Monster monster = world.Monsters[0];
            world.Receive(mage, new Packet { UseSkill = new UseSkill { SkillId = 204, ForceAttack = false } });
            world.Step();
            Assert.Equal(0u, summon.Target);

            UseSkill(world, mage, 201, monster.Id);
            world.Step();
            Assert.Equal(monster.Id, summon.Target);
            mage.Player!.CombatEndTick = 0;
            StepUntil(world, () => Take(mage).Any(packet => packet.AttackSwing?.AttackerId == summon.Id), 80);
            Assert.True(mage.Player!.CombatEndTick > world.Tick);
            StepUntil(world, () => monster.Damage.Contains(summon.Id), 20);
            Assert.True(monster.Damage.Contains(summon.Id));

            world.Receive(mage, new Packet { AttackStop = new AttackStop() });
            Assert.Equal(0u, summon.Target);
            StepUntil(world, () => SkillSystem.Ready(mage.Player!.CooldownEnd(201), world.Tick), 40);
            UseSkill(world, mage, 201, monster.Id);
            world.Step();
            Assert.Equal(monster.Id, summon.Target);
            world.Effects.Apply(mage.Player!, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            world.Receive(mage, new Packet { AttackStop = new AttackStop() });
            Assert.Equal(0u, summon.Target);

            World safe = SummonWorld();
            Session inside = Duelist(safe, "hero_01", -7, 0, CharacterClass.Mage);
            Summon guarded = Call(safe, inside);
            guarded.Target = safe.Monsters[0].Id;
            safe.Step();
            Assert.Equal(0u, guarded.Target);
        }

        /// <summary>
        /// 소환수의 피해는 소환수의 줄에 쌓이고 주인의 편으로 합쳐진다: 소환수가 더 많이 때렸으면 몬스터가 소환수를 친다. 소환수만 때린 몬스터를 잡아도 경험치는 주인이 받고,
        /// 소환수가 사라지면 그 줄이 주인의 줄로 옮겨진다. 주인이 죽어 사라질 때는 옮기지 않는다.
        /// </summary>
        [Fact]
        public void SummonDamageCountsForTheOwnersSide()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 9, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            Monster monster = world.Monsters[0];
            monster.Damage.Add(mage.Player!.Id, 10);
            monster.Damage.Add(summon.Id, 40);
            world.Step();
            Assert.Equal(summon.Id, monster.AttackTarget);
            Assert.Equal(PartySideOf(world, mage.Player!), world.Party.SideOf(summon.Id));

            StepTo(world, summon.EndTick + 1);
            Assert.Empty(world.Summons());
            Assert.True(monster.Damage.Contains(mage.Player!.Id) && !monster.Damage.Contains(summon.Id));

            World solo = SummonWorld();
            Session hunter = Duelist(solo, "hero_01", 9, 0, CharacterClass.Mage);
            Summon helper = Call(solo, hunter);
            Monster prey = solo.Monsters[0];
            prey.Hp = 1;
            helper.Target = prey.Id;
            uint exp = hunter.Player!.Exp;
            StepUntil(solo, () => prey.Dead, 80);
            Assert.True(prey.Dead);
            Assert.True(hunter.Player!.Exp > exp);

            World fallen = SummonWorld();
            Session owner = Duelist(fallen, "hero_01", 9, 0, CharacterClass.Mage);
            Summon orphan = Call(fallen, owner);
            Monster other = fallen.Monsters[0];
            other.Damage.Add(orphan.Id, 30);
            owner.Player!.Hp = 1;
            other.Damage.Add(owner.Player!.Id, 50);
            fallen.Place(other, owner.Player!.X + Units.PerMeter, owner.Player!.Z);
            StepUntil(fallen, () => owner.Player!.Dead, 120);
            Assert.True(owner.Player!.Dead);
            Assert.Empty(fallen.Summons());
            Assert.False(other.Damage.Contains(owner.Player!.Id) || other.Damage.Contains(orphan.Id));
        }

        /// <summary>
        /// 소환수는 몬스터에게 맞아 체력이 줄고, 0이 되면 Died가 가고 3초 뒤에 빠지며 경험치와 드롭이 없다. 회복을 소환수에게 쓰면 자기에게 쓰인다.
        /// </summary>
        [Fact]
        public void SummonsAreHitAndDie()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 9, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            Monster monster = world.Monsters[0];
            monster.Damage.Add(summon.Id, 100);
            world.Place(summon, monster.X + Units.PerMeter, monster.Z);
            summon.Target = 0;
            StepUntil(world, () => summon.Hp < summon.MaxHp, 80);
            Assert.True(summon.Hp < summon.MaxHp);

            summon.Hp = 1;
            StepUntil(world, () => summon.Dead, 80);
            Assert.True(summon.Dead);
            uint died = world.Tick;
            Assert.Contains(Take(mage), packet => packet.Died?.Id == summon.Id);
            Assert.Empty(world.GroundItems);
            StepTo(world, died + 59);
            Assert.Contains(summon, world.Summons());
            StepTo(world, died + 62);
            Assert.DoesNotContain(summon, world.Summons());

            Summon healed = Call(world, mage);
            healed.Hp = 10;
            mage.Player!.Hp = mage.Player!.MaxHp / 2;
            uint hp = mage.Player!.Hp;
            UseSkill(world, mage, 203, healed.Id);
            StepUntil(world, () => mage.Player!.Progress == null, 40);
            world.Step();
            Assert.Equal(10u, healed.Hp);
            Assert.True(mage.Player!.Hp > hp);
        }

        /// <summary>
        /// 다른 플레이어는 강제 공격을 켠 범위 스킬과 CanAttack으로 남의 소환수를 친다: 자기 소환수, 파티원의 소환수, 레벨 10 미만인 주인의 소환수는 치지 못하고,
        /// 일반 플레이어의 소환수를 치면 선공 표시가 붙으며, 소환수를 죽여도 성향은 그대로다. 소환수가 맞아도 주인의 전투 상태는 시작하지 않는다.
        /// </summary>
        [Fact]
        public void PlayersCanAttackOtherSummonsByThePkRules()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 30, 30, CharacterClass.Mage);
            Session rival = Duelist(world, "hero_02", 31, 30);
            Summon summon = Call(world, mage);
            world.Step();
            Take(rival);
            mage.Player!.CombatEndTick = 0;

            Assert.Equal(FailReason.InvalidTarget, AttackFailure(world, mage, summon));
            Attack(world, rival, summon.Id);
            Assert.DoesNotContain(Take(rival), packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed);
            StepUntil(world, () => summon.Hp < summon.MaxHp, 60);
            Assert.NotEqual(0u, rival.Player!.AggressorEndTick);
            Assert.False(mage.Player!.InCombat(world.Tick));
            summon.Hp = 1;
            StepUntil(world, () => summon.Dead, 60);
            Assert.Equal(0, rival.Player!.Karma);

            World party = SummonWorld();
            Session caller = Duelist(party, "hero_01", 30, 30, CharacterClass.Mage);
            Session friend = Duelist(party, "hero_02", 31, 30);
            Session low = Duelist(party, "hero_03", 32, 30, CharacterClass.Mage, level: 9);
            Summon ally = Call(party, caller);
            Summon weak = Call(party, low);
            Form(party, caller, friend);
            Assert.Equal(FailReason.PartyMember, AttackFailure(party, friend, ally));
            Assert.Equal(FailReason.PkLevelTooLow, AttackFailure(party, friend, weak));

            World areas = SummonWorld();
            Session target = Duelist(areas, "hero_01", 30, 30, CharacterClass.Mage);
            Session knight = Duelist(areas, "hero_02", 33, 30);
            Summon struck = Call(areas, target);
            areas.Place(target.Player!, Center(25), Center(30));
            areas.Place(struck, Center(32), Center(30));
            foreach (bool force in new[] { false, true })
            {
                StepUntil(areas, () => SkillSystem.Ready(knight.Player!.CooldownEnd(104), areas.Tick), 40);
                areas.Place(struck, Center(32), Center(30));
                uint before = struck.Hp;
                areas.Receive(knight, new Packet { UseSkill = new UseSkill { SkillId = 104, ForceAttack = force } });
                StepUntil(areas, () => false, 10);
                Assert.Equal(force, struck.Hp < before);
            }
        }

        /// <summary>
        /// 주인의 연결이 떨어지면 소환수는 바로 빠지고 걸린 타격은 맞지 않는다. 경비병은 소환수를 치지 않는다.
        /// </summary>
        [Fact]
        public void SummonsLeaveWithTheirOwner()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 9, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            Monster monster = world.Monsters[0];
            summon.Target = monster.Id;
            StepUntil(world, () => world.Monsters[0].Hp < 100 || summon.NextAttackTick > world.Tick, 60);
            uint hp = monster.Hp;
            mage.Player!.CombatEndTick = 0;
            world.Disconnect(mage);
            Assert.Empty(world.Summons());
            StepUntil(world, () => false, 20);
            Assert.True(monster.Hp >= hp);
        }

        private static World SummonWorld(params (int MinX, int MinZ, int MaxX, int MaxZ, char Cell)[] boxes)
        {
            MonstersRow prey = TestData.Monster(2, aggressive: false);
            prey.Exp = 20;
            prey.MaxHp = 5000;
            GameData data = TestData.WithMonsters(
                new[] { TestData.Spawn(1, 10, 0, 2) }, TestData.Draw(128, new[] { (-10, -5, -5, 5, 's') }.Concat(boxes).ToArray()), null, null,
                new[] { TestData.Monster(1, aggressive: true), prey, TestData.Spirit() }, TestData.LevelsUpTo(12));
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
        }

        /// <summary>
        /// 마법사가 소환을 쓰고 그 틱의 소환수를 낸다.
        /// </summary>
        private static Summon Call(World world, Session mage)
        {
            UseSkill(world, mage, 206, 0);
            world.Step();
            return mage.Player!.Summon!;
        }

        private static long Distance(Entity a, Entity b)
        {
            return (long)Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Z - b.Z, 2));
        }

        private static ulong PartySideOf(World world, Player player)
        {
            return world.Party.SideOf(player.Id);
        }

        private static FailReason AttackFailure(World world, Session attacker, Creature target)
        {
            Attack(world, attacker, target.Id);
            FailReason reason = Take(attacker).FirstOrDefault(packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed)?.ActionFailed.Reason ?? FailReason.None;
            world.Receive(attacker, new Packet { AttackStop = new AttackStop() });
            return reason;
        }
    }
}
