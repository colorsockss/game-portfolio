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
    /// 펫(96). 시험 맵은 64 m이고 펫 1은 3 m, 펫 2는 6 m 안의 바닥 아이템을 1초(20틱)에 하나씩 줍는다. 아이템 2301이 펫 1, 2302가 펫 2를 준다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 펫 아이템을 쓰면 하나 줄고 펫이 나와 있으며 본인이 PetState를, 주변이 EntityState(나와 있는 펫)를 받는다. 같은 펫의 아이템은 "이미 가진 펫"이고 그대로이며,
        /// 다른 펫의 아이템은 가진 펫을 바꾼다. 펫이 없을 때의 SetPetOut은 "펫이 없음"이고, 넣으면 EntityState의 펫이 0이 된다.
        /// </summary>
        [Fact]
        public void PetItemsGiveAndReplacePets()
        {
            World world = PetWorld();
            Session owner = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 2, 0);
            world.Receive(owner, new Packet { SetPetOut = new SetPetOut { Out = true } });
            Assert.Contains(Take(owner), packet => packet.ActionFailed is { Reason: FailReason.NoPet, Request: RequestKind.Pet });

            world.Inventory.Add(owner.Player!, 2301, 2, GainReason.Unspecified);
            UseItemAt(world, owner, 2301, 1);
            world.Step();
            Assert.Equal((1u, true, 1u), (owner.Player!.PetId, owner.Player!.PetOut, owner.Player!.Bag.CountOf(2301)));
            Assert.Contains(owner.Outbox, packet => packet.PetState is { PetId: 1, Out: true });
            Assert.Contains(Take(watcher), packet => packet.EntityState?.Id == owner.Player!.Id && packet.EntityState.PetId == 1);
            Take(owner);

            UseItemAt(world, owner, 2301, 2);
            Assert.Contains(Take(owner), packet => packet.RequestResult is { RequestId: 2, Result: FailReason.AlreadyHavePet });
            Assert.Equal(1u, owner.Player!.Bag.CountOf(2301));
            world.Inventory.Add(owner.Player!, 2302, 1, GainReason.Unspecified);
            UseItemAt(world, owner, 2302, 3);
            Assert.Equal(2u, owner.Player!.PetId);

            world.Receive(owner, new Packet { SetPetOut = new SetPetOut { Out = false } });
            world.Step();
            Assert.Contains(Take(watcher), packet => packet.EntityState?.Id == owner.Player!.Id && packet.EntityState.PetId == 0);
            Assert.False(owner.Player!.PetOut);
        }

        /// <summary>
        /// 나와 있는 펫은 줍는 거리 안의 내 드롭을 1초에 하나씩 가까운 것부터 줍고, 새로 얻은 것에 까닭 줍기로 실린다. 거리 밖·벽 너머·주인만 줍는 시간 안의 남의 드롭·
        /// 플레이어가 떨어뜨린 것은 줍지 않고, 주인만 줍는 시간이 지난 남의 드롭은 줍는다. 넣으면 줍지 않는다.
        /// </summary>
        [Fact]
        public void PetsPickUpWhatTheyMay()
        {
            World world = PetWorld((4, -10, 5, 10, '#'));
            Session owner = Fighter(world, "hero_01", 0, 0);
            Session other = Fighter(world, "hero_02", 20, 20);
            GivePet(world, owner, 1);
            GroundItem near = Drop(world, 1, 0, 3001, 2, owner: owner.Player!.Id);
            GroundItem nearer = Drop(world, 0, 0, 3001, 1);
            GroundItem far = Drop(world, 0, -5, 3001, 1);
            GroundItem walled = Drop(world, 5, 0, 3001, 1);
            GroundItem others = Drop(world, -1, 0, 3001, 1, owner: other.Player!.Id, ownerEnd: world.Tick + 1000);
            GroundItem thrown = Drop(world, -1, 1, 3001, 1, dropped: true);
            Take(owner);
            StepUntil(world, () => !world.GroundItems.Contains(nearer), 40);
            Assert.DoesNotContain(nearer, world.GroundItems);
            Assert.Contains(near, world.GroundItems);
            Assert.Contains(owner.Outbox, packet => packet.InventoryChanged?.Gains.Any(gain => gain.Reason == GainReason.PickUp) == true);
            StepUntil(world, () => !world.GroundItems.Contains(near), 40);
            Assert.DoesNotContain(near, world.GroundItems);
            StepUntil(world, () => false, 60);
            Assert.Equal(new[] { far, walled, others, thrown }.OrderBy(item => item.Id), world.GroundItems.OrderBy(item => item.Id));

            World late = PetWorld();
            Session finder = Fighter(late, "hero_01", 0, 0);
            Session loser = Fighter(late, "hero_02", 20, 20);
            GivePet(late, finder, 1);
            GroundItem expired = Drop(late, 1, 0, 3001, 1, owner: loser.Player!.Id, ownerEnd: late.Tick + 10);
            StepUntil(late, () => !late.GroundItems.Contains(expired), 80);
            Assert.DoesNotContain(expired, late.GroundItems);

            late.Receive(finder, new Packet { SetPetOut = new SetPetOut { Out = false } });
            GroundItem left = Drop(late, 1, 1, 3001, 1);
            StepUntil(late, () => false, 60);
            Assert.Contains(left, late.GroundItems);
        }

        /// <summary>
        /// 가득 찬 인벤토리에서는 골드만 줍고, 죽었거나 연결이 떨어져 남은 동안은 줍지 않는다. 틱이 건너뛰어도 한 번만 줍는다. 가진 펫과 나와 있는지는 다시 들어와도 남는다.
        /// </summary>
        [Fact]
        public void PetsPickUpOnlyWhenTheyCan()
        {
            using var store = new CharacterStore(":memory:");
            World world = PetWorld(store: store);
            Session owner = Fighter(world, "hero_01", 0, 0);
            GivePet(world, owner, 2);
            foreach (ItemSlot slot in owner.Player!.Bag.Slots)
            {
                (slot.ItemId, slot.Count) = (3001u, 1u);
            }

            owner.Player!.Bag.Slots[0].ItemId = 2003;
            GroundItem material = Drop(world, 1, 0, 1003, 1);
            GroundItem gold = Drop(world, 2, 0, 4001, 50);
            StepUntil(world, () => !world.GroundItems.Contains(gold), 60);
            Assert.DoesNotContain(gold, world.GroundItems);
            StepUntil(world, () => false, 40);
            Assert.Contains(material, world.GroundItems);

            foreach (ItemSlot slot in owner.Player!.Bag.Slots)
            {
                (slot.ItemId, slot.Count) = (0u, 0u);
            }

            owner.Player!.Hp = 0;
            owner.Player!.Dead = true;
            StepUntil(world, () => false, 40);
            Assert.Contains(material, world.GroundItems);
            owner.Player!.Dead = false;
            owner.Player!.Hp = 10;

            Drop(world, 1, 1, 3001, 1);
            Drop(world, 1, -1, 3001, 1);
            int before = world.GroundItems.Count();
            owner.Player!.NextPetPickTick = world.Tick;
            world.Step(elapsedTicks: 100);
            Assert.Equal(before - 1, world.GroundItems.Count());

            long id = owner.Player!.CharacterId;
            world.Receive(owner, new Packet { LeaveWorld = new LeaveWorld() });
            world.CompleteSaves();
            Take(owner);
            Enter(world, owner, id);
            Assert.Equal((2u, true), (owner.Player!.PetId, owner.Player!.PetOut));
            Assert.Contains(owner.Outbox, packet => packet.PetState is { PetId: 2, Out: true });
        }

        private static World PetWorld((int MinX, int MinZ, int MaxX, int MaxZ, char Cell)? wall = null, CharacterStore? store = null)
        {
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 30, -30, 2) }, wall is { } box ? TestData.Draw(64, box) : TestData.Draw(64), null, null, null);
            return new World(10, spawnHalfExtent: 0, new Random(1), store ?? new CharacterStore(":memory:"), data);
        }

        private static void GivePet(World world, Session session, uint petId)
        {
            uint itemId = petId == 1 ? 2301u : 2302u;
            world.Inventory.Add(session.Player!, itemId, 1, GainReason.Unspecified);
            UseItemAt(world, session, itemId, 99);
        }

        private static void UseItemAt(World world, Session session, uint itemId, uint requestId)
        {
            int slot = Array.FindIndex(session.Player!.Bag.Slots, item => item.ItemId == itemId);
            world.Receive(session, new Packet { UseItem = new UseItem { Slot = (uint)slot, RequestId = requestId } });
        }

        private static uint nextGround = 9000;

        /// <summary>
        /// 칸 (x, z) m의 가운데에 바닥 아이템을 놓는다(주인이 있으면 ownerEnd까지 그만 줍는다).
        /// </summary>
        private static GroundItem Drop(World world, int x, int z, uint itemId, uint count, uint owner = 0, uint ownerEnd = 0, bool dropped = false)
        {
            var item = new GroundItem(nextGround++, Center(x), Center(z), itemId, count, 0, owner, 0, owner != 0 ? ownerEnd == 0 ? world.Tick + 1000 : ownerEnd : 0, dropped, 0);
            world.AddEntity(item);
            return item;
        }
    }
}
