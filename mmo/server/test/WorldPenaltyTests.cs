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
    /// 사망 페널티(45). 시험 맵은 64 m이고 비선공 몬스터 2(공격력 500)가 (6, 0)에 서 있다. 플레이어는 레벨 10이고 필요 경험치는 100이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 일반과 선공은 쌓은 경험치의 5%, 무법자는 10%를 잃고(내림), 몬스터에게 죽어도 플레이어에게 죽어도 같다. 본인은 잃은 양을 음수로 실은 ExpGained를 받는다.
        /// 쌓은 경험치가 0이면 잃는 것이 없고 레벨도 그대로다.
        /// </summary>
        [Fact]
        public void DeathCostsExperienceByState()
        {
            foreach ((int Karma, bool Aggressor, bool ByMonster, uint Exp, uint Lost) row in new[]
            {
                (0, false, false, 80u, 4u), (0, true, true, 80u, 4u), (-1, false, false, 80u, 8u), (-1, false, true, 80u, 8u), (0, false, false, 0u, 0u),
            })
            {
                World world = PenaltyWorld(1);
                Session killer = Duelist(world, "hero_01", 1, 0);
                Session victim = Duelist(world, "hero_02", row.ByMonster ? 5 : 2, 0);
                victim.Player!.Exp = row.Exp;
                victim.Player!.Karma = row.Karma;
                victim.Player!.AggressorEndTick = row.Aggressor ? world.Tick + 1000 : 0;
                TakeVitals(victim);
                if (row.ByMonster)
                {
                    victim.Player!.Hp = 1;
                    Attack(world, victim, world.Monsters[0].Id);
                    StepUntil(world, () => victim.Player!.Dead, 60);
                }
                else
                {
                    Slay(world, killer, victim);
                }

                Assert.True(victim.Player!.Dead);
                Assert.Equal((row.Exp - row.Lost, 10u), (victim.Player!.Exp, victim.Player!.Level));
                List<Packet> vitals = TakeVitals(victim);
                Assert.Equal(row.Lost > 0, vitals.Any(packet => packet.ExpGained?.Amount == -(int)row.Lost && packet.ExpGained.Exp == row.Exp - row.Lost));
            }
        }

        /// <summary>
        /// DeathPenalty는 잃은 경험치와 떨어뜨린 것을 싣고 죽은 본인에게만 간다.
        /// </summary>
        [Fact]
        public void DeathPenaltiesGoOnlyToTheDead()
        {
            World world = PenaltyWorld(1);
            Session killer = Duelist(world, "hero_01", 1, 0);
            Session victim = Duelist(world, "hero_02", 2, 0);
            victim.Player!.Exp = 60;
            Slay(world, killer, victim);
            Assert.Equal(new DeathPenalty { ExpLost = 3 }, Take(victim).Single(packet => packet.BodyCase == Packet.BodyOneofCase.DeathPenalty).DeathPenalty);
            Assert.DoesNotContain(Take(killer), packet => packet.BodyCase == Packet.BodyOneofCase.DeathPenalty);
        }

        /// <summary>
        /// 무법자는 인벤토리(50%)와 입은 장비(10%)를 따로 굴려, 씨앗에 따라 한쪽만, 둘 다, 아무것도 떨어뜨리지 않는다. 인벤토리는 차 있는 칸 하나를 통째로,
        /// 입은 장비는 하나를 떨어뜨리고 창고는 그대로다. 바닥 아이템은 주인이 없고 "플레이어가 떨어뜨림"이 아니며 강화 수치가 남는다. 무기를 떨어뜨리면
        /// 공격력이 줄고 다른 연결이 바뀐 겉모습을 받는다. 일반 플레이어는 아무것도 떨어뜨리지 않는다.
        /// </summary>
        [Fact]
        public void OutlawsDropAnInventorySlotAndAWornItemSeparately()
        {
            var seen = new HashSet<(bool Inventory, bool Worn)>();
            for (int seed = 1; seed <= 60; seed++)
            {
                World world = PenaltyWorld(seed);
                Session killer = Duelist(world, "hero_01", 1, 0);
                Session victim = Duelist(world, "hero_02", 2, 0);
                Player player = victim.Player!;
                world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
                EquipItem(world, victim, SlotOf(player, 1001), 1);
                player.Bag.Equipment[0].Enchant = 2;
                player.Bag.Storage[0].ItemId = 3001;
                player.Bag.Storage[0].Count = 7;
                player.Karma = -1;
                uint attack = player.Stats.Attack;
                Take(killer);
                Dictionary<uint, uint> before = player.Bag.Slots.Where(slot => slot.ItemId != 0).ToDictionary(slot => slot.Index, slot => slot.Count);
                Slay(world, killer, victim);

                DeathPenalty penalty = Take(victim).Single(packet => packet.BodyCase == Packet.BodyOneofCase.DeathPenalty).DeathPenalty;
                ItemSlot? bag = penalty.Items.SingleOrDefault(item => item.Place == ItemPlace.Inventory);
                ItemSlot? worn = penalty.Items.SingleOrDefault(item => item.Place == ItemPlace.Equipment);
                seen.Add((bag != null, worn != null));
                if (bag != null)
                {
                    Assert.Equal(before[bag.Index], bag.Count);
                    Assert.Equal(0u, player.Bag.Slots[bag.Index].ItemId);
                }

                if (worn != null)
                {
                    Assert.Equal((1001u, 2u, 0u), (worn.ItemId, worn.Enchant, player.Bag.Equipment[0].ItemId));
                    Assert.True(player.Stats.Attack < attack);
                    world.Step();
                    Assert.Contains(Take(killer), packet => packet.EntityState?.Id == player.Id && packet.EntityState.WeaponItemId == 0);
                }

                Assert.Equal((3001u, 7u), (player.Bag.Storage[0].ItemId, player.Bag.Storage[0].Count));
                List<GroundItem> ground = world.GroundItems.ToList();
                Assert.Equal(penalty.Items.Count, ground.Count);
                Assert.All(ground, item => Assert.Equal((0u, 0u, false), (item.OwnerPlayerId, item.OwnerPartyId, item.DroppedByPlayer)));
                Assert.Equal(penalty.Items.Select(item => (item.ItemId, item.Count, item.Enchant)).OrderBy(item => item), ground.Select(item => (item.ItemId, item.Count, item.Enchant)).OrderBy(item => item));
            }

            Assert.Equal(new[] { (false, false), (false, true), (true, false), (true, true) }, seen.OrderBy(entry => entry));

            World normal = PenaltyWorld(1);
            Session hunter = Duelist(normal, "hero_01", 1, 0);
            Session plain = Duelist(normal, "hero_02", 2, 0);
            Slay(normal, hunter, plain);
            Assert.Empty(normal.GroundItems);
        }

        /// <summary>
        /// 인벤토리와 장비가 비었으면 무법자도 떨어뜨리지 않고, 벽 옆에서 죽은 무법자의 것은 벽 너머에 놓이지 않는다.
        /// </summary>
        [Fact]
        public void OutlawDropsStayOnTheirSideOfTheWall()
        {
            for (int seed = 1; seed <= 20; seed++)
            {
                World world = PenaltyWorld(seed, (3, -5, 4, 5, '#'));
                Session killer = Duelist(world, "hero_01", 1, 0);
                Session victim = Duelist(world, "hero_02", 2, 0);
                victim.Player!.Karma = -1;
                if (seed == 1)
                {
                    foreach (ItemSlot slot in victim.Player!.Bag.Slots)
                    {
                        (slot.ItemId, slot.Count) = (0u, 0u);
                    }
                }

                Slay(world, killer, victim);
                Assert.True((seed != 1) || !world.GroundItems.Any());
                Assert.All(world.GroundItems, item => Assert.True(item.X < 3 * Units.PerMeter));
            }
        }

        /// <summary>
        /// 무법자가 떨어뜨린 것을 다른 플레이어가 주운 뒤 주운 쪽이 저장되기 전에 서버가 죽어도, 아이템은 두 곳에 있지 않다(떨어뜨린 쪽의 사본이 먼저 쓰임).
        /// </summary>
        [Fact]
        public void OutlawDropsAreNeverInTwoPlaces()
        {
            for (int seed = 1; seed <= 10; seed++)
            {
                using var store = new CharacterStore(":memory:");
                World world = PenaltyWorld(seed, store: store);
                Session picker = Duelist(world, "hero_01", 1, 0);
                Session victim = Duelist(world, "hero_02", 2, 0);
                victim.Player!.Karma = -1;
                uint had = victim.Player!.Bag.CountOf(2001);
                victim.Player!.Hp = 1;
                Slay(world, picker, victim);
                if (world.GroundItems.FirstOrDefault(item => item.ItemId == 2001) is not GroundItem potion)
                {
                    continue;
                }

                uint picked = picker.Player!.Bag.CountOf(2001);
                world.Place(picker.Player!, potion.X, potion.Z);
                PickUp(world, picker, potion.Id, 2);
                Assert.Equal(picked + had, picker.Player!.Bag.CountOf(2001));
                world.CompleteSaves();

                World restarted = PenaltyWorld(seed, store: store);
                Session first = LogIn(restarted, "hero_01");
                Enter(restarted, first, picker.Player!.CharacterId);
                Session second = LogIn(restarted, "hero_02");
                Enter(restarted, second, victim.Player!.CharacterId);
                Assert.Equal(0u, second.Player!.Bag.CountOf(2001));
                Assert.True(first.Player!.Bag.CountOf(2001) <= picked);
                return;
            }

            Assert.Fail("No seed dropped the potions.");
        }

        private static World PenaltyWorld(int seed, (int MinX, int MinZ, int MaxX, int MaxZ, char Cell)? wall = null, CharacterStore? store = null)
        {
            MonstersRow strong = TestData.Monster(2, aggressive: false);
            strong.Attack = 500;
            string[] rows = wall is { } box ? TestData.Draw(64, box) : TestData.Draw(64);
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 6, 0, 2) }, rows, null, null, new[] { TestData.Monster(1, aggressive: true), strong }, TestData.LevelsUpTo(12));
            return new World(10, spawnHalfExtent: 0, new Random(seed), store ?? new CharacterStore(":memory:"), data);
        }

        /// <summary>
        /// killer가 victim을 기본 공격으로 죽인다(체력을 1로 두고).
        /// </summary>
        private static void Slay(World world, Session killer, Session victim)
        {
            victim.Player!.Hp = 1;
            Attack(world, killer, victim.Player!.Id);
            StepUntil(world, () => victim.Player!.Dead, 60);
            world.Receive(killer, new Packet { AttackStop = new AttackStop() });
        }
    }
}
