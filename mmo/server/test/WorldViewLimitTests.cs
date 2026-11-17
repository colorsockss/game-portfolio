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
    /// 시야 인원 상한(55). 상한을 작게 둔 월드에서 연결이 받는 다른 플레이어의 수와 다시 고르는 차례를 본다. 다시 고르기는 플레이어마다 1초(20틱)에 한 번이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 상한을 넘으면 멀리 있는 파티원, 나를 공격하는 캐릭터, 내 대상이 가까운 캐릭터보다 먼저 남는다. 고르지 않은 받은 캐릭터는 EntitiesLeave로 나간다.
        /// </summary>
        [Fact]
        public void PartyAttackersAndTargetsOutrankCloserPlayers()
        {
            World world = LimitWorld(3);
            Session observer = Duelist(world, "hero_01", 0, 0);
            Session member = Duelist(world, "hero_02", 20, 0);
            Form(world, observer, member);
            world.Place(member.Player!, Center(200), Center(0));
            Session[] near = { Duelist(world, "hero_03", 2, 0), Duelist(world, "hero_04", 3, 0), Duelist(world, "hero_05", 4, 0) };
            Assert.Equal(Ids(near), PlayersSeen(observer));
            Take(observer);

            world.Place(member.Player!, Center(20), Center(0));
            Session attacker = Duelist(world, "hero_06", 24, 0);
            Session target = Duelist(world, "hero_07", 28, 0);
            StepFor(world, 2);
            Assert.True(observer.Player!.ViewCapped);
            attacker.Player!.AttackTarget = observer.Player!.Id;
            observer.Player!.AttackTarget = target.Player!.Id;
            StepFor(world, Units.TicksPerSecond);

            Assert.Equal(Ids(member, attacker, target), PlayersSeen(observer));
            List<uint> left = Take(observer).Where(packet => packet.EntitiesLeave != null).SelectMany(packet => packet.EntitiesLeave.Ids).ToList();
            Assert.Equal(Ids(near), left.ToHashSet());
        }

        /// <summary>
        /// 이미 받은 캐릭터는 더 가까운 새 후보에게 밀리지 않고, 후보가 상한 언저리에서 움직여도 들어옴과 나감이 되풀이되지 않는다.
        /// </summary>
        [Fact]
        public void ReceivedPlayersStayAndNothingFlickers()
        {
            World world = LimitWorld(2);
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session[] received = { Fighter(world, "hero_02", 15, 0), Fighter(world, "hero_03", 16, 0) };
            Session[] closer = { Fighter(world, "hero_04", 2, 0), Fighter(world, "hero_05", 3, 0) };
            Take(observer);

            var random = new Random(3);
            for (int i = 0; i < 3 * Units.TicksPerSecond; i++)
            {
                foreach (Session session in closer)
                {
                    world.Place(session.Player!, Center(random.Next(-10, 10)), Center(random.Next(-10, 10)));
                }

                world.Step();
                Assert.Equal(Ids(received), PlayersSeen(observer));
            }

            Assert.DoesNotContain(Take(observer), packet => (packet.EntitiesLeave != null) || (packet.EntitiesEnter?.Entities.Any(entity => entity.Kind == EntityKind.Player) == true));
        }

        /// <summary>
        /// 다시 고르기는 1초에 한 번이다: 받지 않은 캐릭터가 나를 공격하기 시작해도 다음 차례 전에는 들어오지 않고, 그 차례에 들어온다.
        /// 틱이 건너뛰어도(지난 틱 수 45) 한 번만 고르고 다음 차례의 위상을 지킨다.
        /// </summary>
        [Fact]
        public void ReselectingWaitsForTheNextSecond()
        {
            World world = LimitWorld(2);
            Session observer = Duelist(world, "hero_01", 0, 0);
            Session[] received = { Duelist(world, "hero_02", 3, 0), Duelist(world, "hero_03", 4, 0) };
            Session attacker = Duelist(world, "hero_04", 10, 0);
            Player self = observer.Player!;
            StepUntil(world, () => self.ViewReselect.Next > world.Tick + 1, Units.TicksPerSecond);
            Assert.True(self.ViewCapped);

            attacker.Player!.AttackTarget = self.Id;
            uint due = self.ViewReselect.Next;
            while (world.Tick < due)
            {
                world.Step();
                Assert.DoesNotContain(attacker.Player!, self.Visible);
            }

            world.Step();
            Assert.Contains(attacker.Player!, self.Visible);

            // 밀린 틱: Step(45)가 건너뛴 차례들은 다음 Step의 틱에 한 번으로 치고, 그 뒤 차례는 처음 위상(번호 % 20)에 둔다.
            Session other = Duelist(world, "hero_05", 12, 0);
            world.Step(elapsedTicks: 45);
            world.Step();
            uint processed = world.Tick - 1;
            Assert.InRange(self.ViewReselect.Next, processed + 1, processed + Units.TicksPerSecond);
            Assert.Equal(self.Id % Units.TicksPerSecond, self.ViewReselect.Next % Units.TicksPerSecond);
            Assert.Equal(2, self.ViewPlayers);
            Assert.DoesNotContain(other.Player!, self.Visible);
        }

        /// <summary>
        /// 받은 캐릭터가 나가 자리가 나면, 다음 차례에 받지 않았던 후보 가운데 가까운 쪽이 들어온다.
        /// </summary>
        [Fact]
        public void AFreedSlotGoesToTheNearestCandidate()
        {
            World world = LimitWorld(2);
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session first = Fighter(world, "hero_02", 15, 0);
            Session second = Fighter(world, "hero_03", 16, 0);
            Session nearer = Fighter(world, "hero_04", 5, 0);
            Session farther = Fighter(world, "hero_05", 10, 0);
            Assert.Equal(Ids(first, second), PlayersSeen(observer));

            world.Disconnect(first);
            StepFor(world, Units.TicksPerSecond + 1);
            Assert.Equal(Ids(second, nearer), PlayersSeen(observer));
            Assert.DoesNotContain(farther.Player!, observer.Player!.Visible);
        }

        /// <summary>
        /// 상한은 다른 플레이어에만 있다: 상한이 1이어도 둘레의 몬스터와 NPC는 모두 받는다.
        /// </summary>
        [Fact]
        public void MonstersAndNpcsHaveNoLimit()
        {
            World world = LimitWorld(1, TestData.Spawn(1, 4, 0, 2, count: 3, scatter: 2));
            uint npc = world.ReservePlacedId();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Fighter(world, "hero_02", 3, 0);
            Fighter(world, "hero_03", -3, 0);
            world.AddEntity(new TestNpc(npc, x: Center(-5), z: Center(0), templateId: 2));
            StepFor(world, Units.TicksPerSecond + 1);

            Assert.Single(PlayersSeen(observer));
            Assert.All(world.Monsters, monster => Assert.Contains(monster, observer.Player!.Visible));
            Assert.Single(observer.Player!.Visible, entity => entity is TestNpc);
        }

        /// <summary>
        /// 상한으로 받지 않은 캐릭터의 사건(24, 83, 41): 그가 내가 받은 몬스터를 치면 AttackSwing과 Damaged가 공격자 번호 0으로 오고, 그가 맞은 사건은 오지 않는다.
        /// 그가 쏜 직선 발사체의 사건과 SkillUsed는 오지 않고 맞은 몬스터의 Damaged만 온다. 그의 주변 채팅은 온다.
        /// </summary>
        [Fact]
        public void EventsOfUnreceivedPlayersFollowTheReceiverRules()
        {
            MonstersRow tough = TestData.Monster(2, aggressive: false);
            tough.MaxHp = 5000;
            World world = LimitWorld(1, new[] { tough }, TestData.Spawn(1, 6, 0, 2));
            Monster monster = world.Monsters[0];
            Session observer = Fighter(world, "hero_01", 0, 0);
            Fighter(world, "hero_02", 1, 1);
            Session knight = Fighter(world, "hero_03", 5, 0);
            Session mage = Fighter(world, "hero_04", 0, 3, CharacterClass.Mage);
            StepFor(world, Units.TicksPerSecond + 1);
            Assert.DoesNotContain(knight.Player!, observer.Player!.Visible);
            Assert.DoesNotContain(mage.Player!, observer.Player!.Visible);
            Assert.Contains(monster, observer.Player!.Visible);
            Take(observer);

            Attack(world, knight, monster.Id);
            monster.Damage.Add(knight.Player!.Id, 1);
            StepFor(world, 30);
            List<Packet> seen = Combat(observer);
            Assert.Contains(Swing(0, monster.Id), seen);
            Assert.Contains(seen, packet => IsDamaged(packet) && (packet.Damaged.TargetId == monster.Id) && (packet.Damaged.AttackerId == 0));
            Assert.Contains(Combat(knight), packet => IsDamaged(packet) && (packet.Damaged.TargetId == knight.Player!.Id));
            Assert.DoesNotContain(seen, packet => (IsSwing(packet) && (packet.AttackSwing.TargetId == knight.Player!.Id)) || (IsDamaged(packet) && (packet.Damaged.TargetId == knight.Player!.Id)));

            Take(observer);
            UseSkill(world, mage, 201, monster.Id);
            StepUntil(world, () => world.Projectiles.Count > 0, 10);
            StepUntil(world, () => world.Projectiles.Count == 0, 20);
            List<Packet> shot = Take(observer);
            Assert.DoesNotContain(shot, packet => packet.BodyCase is Packet.BodyOneofCase.SkillUsed or Packet.BodyOneofCase.ProjectileLaunched or Packet.BodyOneofCase.ProjectileEnded);
            Assert.Contains(shot, packet => IsDamaged(packet) && (packet.Damaged.TargetId == monster.Id) && (packet.Damaged.AttackerId == 0));

            Say(world, knight, ChatChannel.Nearby, "여기");
            world.Step();
            Assert.Contains(Chats(observer), chat => (chat.SenderId == knight.Player!.Id) && (chat.Text == "여기"));
        }

        /// <summary>
        /// 시야 인원 상한을 limit으로 둔 256 m 필드(레벨 12까지. PK가 되는 레벨 10의 캐릭터를 씀).
        /// </summary>
        private static World LimitWorld(uint limit, params SpawnsRow[] spawns)
        {
            return LimitWorld(limit, null, spawns);
        }

        private static World LimitWorld(uint limit, IEnumerable<MonstersRow>? monsters, params SpawnsRow[] spawns)
        {
            Constants constants = TestData.Constants(256);
            constants.ViewPlayerLimit = limit;
            GameData data = TestData.WithMonsters(spawns, TestData.Draw(256), null, constants, monsters, TestData.LevelsUpTo(12));
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
        }

        private static HashSet<uint> PlayersSeen(Session session)
        {
            return session.Player!.Visible.OfType<Player>().Select(player => player.Id).ToHashSet();
        }

        private static HashSet<uint> Ids(params Session[] sessions)
        {
            return sessions.Select(session => session.Player!.Id).ToHashSet();
        }
    }
}
