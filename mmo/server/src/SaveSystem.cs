using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 저장의 차례(38). 메모리가 원본이고, 틱은 플레이어의 사본을 만들어 저장 스레드의 큐(SaveQueue)에 넣기만 한다. 플레이어마다 두 바뀜 표시가 있다:
    /// 5초 표시(DirtyFast: 아이템, 골드, 스킬, 퀵슬롯, 레벨)와 60초 표시(DirtySlow: 위치, 체력, 마나, 경험치). 5초마다 5초 표시가 선 플레이어들의, 60초마다
    /// 60초 표시가 선 플레이어들의 사본을 한 묶음으로 넣고, 사본을 넣으면 두 표시를 함께 내린다. 아이템을 내놓는 일과 월드에서 빠지는 틱에는 SaveNow로 바로 넣는다.
    /// </summary>
    internal sealed class SaveSystem
    {
        /// <summary>
        /// 5초 표시와 60초 표시의 주기(틱).
        /// </summary>
        public const uint FastIntervalTicks = 5 * Units.TicksPerSecond;

        public const uint SlowIntervalTicks = 60 * Units.TicksPerSecond;

        private readonly SaveQueue _queue;
        private readonly EntityTable _entities;
        private readonly Periodic _fast = new Periodic(FastIntervalTicks, FastIntervalTicks);
        private readonly Periodic _slow = new Periodic(SlowIntervalTicks, SlowIntervalTicks);

        public SaveSystem(SaveQueue queue, EntityTable entities)
        {
            _queue = queue;
            _entities = entities;
        }

        /// <summary>
        /// 저장 차례: 주기가 된 표시가 선 플레이어들의 사본을 한 묶음으로 넣는다. 틱이 건너뛰어도 주기마다 한 번만 넣는다(Periodic).
        /// </summary>
        public void Step(uint tick)
        {
            bool fast = _fast.Due(tick);
            bool slow = _slow.Due(tick);
            if (!fast && !slow)
            {
                return;
            }

            List<CharacterSnapshot> batch = _entities.Players.Where(player => (fast && player.DirtyFast) || (slow && player.DirtySlow)).Select(Take).ToList();
            if (batch.Count > 0)
            {
                _queue.Enqueue(new WriteJob(batch));
            }
        }

        /// <summary>
        /// 그 플레이어의 사본 하나짜리 묶음을 지금 넣는다(아이템을 내놓음, 월드에서 빠짐).
        /// </summary>
        public void SaveNow(Player player)
        {
            _queue.Enqueue(new WriteJob(new[] { Take(player) }));
        }

        /// <summary>
        /// 접속한 모두의 사본을 한 묶음으로 넣는다(내려갈 때).
        /// </summary>
        public void SaveAll()
        {
            List<CharacterSnapshot> batch = _entities.Players.Select(Take).ToList();
            if (batch.Count > 0)
            {
                _queue.Enqueue(new WriteJob(batch));
            }
        }

        /// <summary>
        /// 플레이어의 저장할 상태 전부의 사본(까닭이 무엇이든 전부를 담음. 창고 75 포함). 성향은 44, 퀘스트 진행은 50, 펫은 96이 더한다.
        /// </summary>
        public static CharacterSnapshot Snapshot(Player player)
        {
            Bag bag = player.Bag;
            var items = new List<SavedItem>();
            items.AddRange(bag.Slots.Where(slot => slot.ItemId != 0).Select(slot => new SavedItem(ItemPlace.Inventory, slot.Index, slot.ItemId, slot.Count, slot.Enchant)));
            items.AddRange(bag.Equipment.Where(slot => slot.ItemId != 0).Select(slot => new SavedItem(ItemPlace.Equipment, slot.Index, slot.ItemId, slot.Count, slot.Enchant)));
            // 창고(75)도 담는다. 빠뜨리면 items의 그 주인 줄을 지우고 다시 넣을 때 창고가 지워진다.
            items.AddRange(bag.Storage.Where(slot => slot.ItemId != 0).Select(slot => new SavedItem(ItemPlace.Storage, slot.Index, slot.ItemId, slot.Count, slot.Enchant)));
            List<SavedQuickslot> quickslots = player.Quickslots.Select((entry, index) => new SavedQuickslot((uint)index, entry.Kind, entry.Id))
                .Where(entry => entry.Kind != QuickslotKind.Empty).ToList();
            return new CharacterSnapshot(
                player.CharacterId, new SavedPosition(player.X, player.Z, player.Yaw), player.Level, player.Exp, player.Hp, player.Mp, bag.Gold, 0,
                items, player.Skills.OrderBy(skill => skill).ToList(), quickslots);
        }

        private static CharacterSnapshot Take(Player player)
        {
            player.DirtyFast = false;
            player.DirtySlow = false;
            return Snapshot(player);
        }

        /// <summary>
        /// 쓰기 묶음 하나(한 트랜잭션).
        /// </summary>
        private sealed class WriteJob : StoreJob
        {
            private readonly IReadOnlyList<CharacterSnapshot> _batch;

            public WriteJob(IReadOnlyList<CharacterSnapshot> batch)
            {
                _batch = batch;
            }

            public override bool IsWrite => true;

            public override void Run(CharacterStore store)
            {
                store.Write(_batch);
            }
        }
    }
}
