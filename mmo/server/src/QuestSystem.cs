using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 퀘스트(50). Quests의 퀘스트를 차례로 하나씩 받는다. 퀘스트 NPC가 하나라 요청에 NPC를 싣지 않는다. 잡기와 제작은 받은 뒤부터 세고(잡기는 그 몬스터의
    /// 경험치를 받은 플레이어. GrowthSystem.Rewarded), 모으기·레벨·장비 입기는 끝낼 때의 상태로 본다. 끝내면 모으기의 재료를 빼고 보상을 넣는다(한 동기 구간).
    /// 상태는 Player.Quest에 두고 바뀌면 QuestState를 본인에게 보내며 5초 바뀜 표시로 저장한다(38).
    /// </summary>
    internal sealed class QuestSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly InventorySystem _inventory;
        private readonly GrowthSystem _growth;
        private readonly Npc? _giver;
        private readonly long _interactRange;

        public QuestSystem(GameData data, FieldMap field, InventorySystem inventory, GrowthSystem growth, Npc? giver)
        {
            _data = data;
            _field = field;
            _inventory = inventory;
            _growth = growth;
            _giver = giver;
            _interactRange = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        /// <summary>
        /// 월드에 들어온 플레이어(넘겨받기 포함. 46): 저장한 상태를 되살리고 QuestState를 보낸다.
        /// </summary>
        public void Enter(Player player, SavedQuest state)
        {
            player.Quest = state;
            Send(player);
        }

        /// <summary>
        /// 다시 붙은 연결에 지금 상태를 보낸다(넘겨받기. 46).
        /// </summary>
        public static void Send(Player player)
        {
            SavedQuest quest = player.Quest;
            player.Session.Send(new Packet { QuestState = new QuestState { Completed = quest.Completed, Accepted = quest.Accepted, Progress = quest.Progress } });
        }

        /// <summary>
        /// 받은 퀘스트. 없으면 null.
        /// </summary>
        public QuestsRow? Current(Player player)
        {
            return player.Quest.Accepted ? _data.Quest(player.Quest.Completed + 1) : null;
        }

        /// <summary>
        /// QuestAccept(입력 차례): NPC 곁(3 m 사거리 밖, 선 막힘), 진행 중인 퀘스트가 없음("진행 중"), 남은 퀘스트가 있음("남은 퀘스트 없음")을 보고 다음 차례를 받는다.
        /// 죽은 동안과 기절한 동안은 World가 먼저 막는다.
        /// </summary>
        public FailReason Accept(Player player)
        {
            FailReason reason = Near(player);
            if (reason != FailReason.None)
            {
                return reason;
            }

            if (player.Quest.Accepted)
            {
                return FailReason.QuestInProgress;
            }

            if (_data.Quest(player.Quest.Completed + 1) == null)
            {
                return FailReason.NoQuestLeft;
            }

            Change(player, player.Quest with { Accepted = true, Progress = 0 });
            return FailReason.None;
        }

        /// <summary>
        /// QuestComplete(입력 차례): NPC 곁, 받은 퀘스트("받은 퀘스트 없음"), 조건("조건을 채우지 않음"), 모으기의 재료를 뺀 뒤 보상 아이템이 들어갈 자리("인벤토리 가득")를
        /// 보고 끝낸다. 어긋나면 아무것도 바꾸지 않는다.
        /// </summary>
        public FailReason Complete(Player player)
        {
            FailReason reason = Near(player);
            if (reason != FailReason.None)
            {
                return reason;
            }

            if (Current(player) is not QuestsRow quest)
            {
                return FailReason.NoQuestAccepted;
            }

            if (!Done(player, quest))
            {
                return FailReason.QuestNotDone;
            }

            Dictionary<int, uint> removal = quest.Kind == QuestKind.Collect ? InventorySystem.Removal(player, new[] { (quest.Target, quest.Count) }) : new Dictionary<int, uint>();
            if (quest.HasRewardItemId && (quest.RewardItemCount > 0) && !_inventory.HasRoomAfter(player, removal, quest.RewardItemId, quest.RewardItemCount))
            {
                return FailReason.InventoryFull;
            }

            _inventory.RemovePlan(player, removal);
            if (quest.RewardGold > 0)
            {
                _inventory.AddGold(player, quest.RewardGold, GainReason.QuestReward);
            }

            if (quest.HasRewardItemId && (quest.RewardItemCount > 0))
            {
                _inventory.Add(player, quest.RewardItemId, quest.RewardItemCount, GainReason.QuestReward);
            }

            Change(player, new SavedQuest(player.Quest.Completed + 1, false, 0));
            if (quest.RewardExp > 0)
            {
                _growth.Gain(player, quest.RewardExp);
            }

            return FailReason.None;
        }

        /// <summary>
        /// 이 틱에 몬스터의 경험치를 받은 플레이어들(GrowthSystem.Rewarded. 파티원 몫과 소환수가 잡은 것이 이미 들어 있음)을 센다.
        /// </summary>
        public void Killed(IEnumerable<(Monster Monster, Player Player)> rewarded)
        {
            foreach ((Monster monster, Player player) in rewarded)
            {
                Count(player, QuestKind.Kill, monster.Template.Id);
            }
        }

        /// <summary>
        /// 제작이 끝났다(CraftSystem.Crafted).
        /// </summary>
        public void Crafted(Player player, RecipesRow recipe)
        {
            Count(player, QuestKind.Craft, recipe.Id);
        }

        /// <summary>
        /// 조건을 채웠는가: 잡기·제작은 센 수, 모으기는 가진 수, 레벨은 지금 레벨, 장비 입기는 그 장비 칸에 입은 것이 있는지.
        /// </summary>
        private static bool Done(Player player, QuestsRow quest)
        {
            return quest.Kind switch
            {
                QuestKind.Kill or QuestKind.Craft => player.Quest.Progress >= quest.Count,
                QuestKind.Collect => player.Bag.CountOf(quest.Target) >= quest.Count,
                QuestKind.Level => player.Level >= quest.Count,
                QuestKind.Equip => (quest.Target >= 1) && (quest.Target <= player.Bag.Equipment.Length) && (player.Bag.Equipment[quest.Target - 1].ItemId != 0),
                _ => false,
            };
        }

        /// <summary>
        /// 받은 퀘스트가 그 종류와 대상이면 하나 센다(수를 넘겨 세지 않음).
        /// </summary>
        private void Count(Player player, QuestKind kind, uint target)
        {
            if ((Current(player) is QuestsRow quest) && (quest.Kind == kind) && (quest.Target == target) && (player.Quest.Progress < quest.Count))
            {
                Change(player, player.Quest with { Progress = player.Quest.Progress + 1 });
            }
        }

        private void Change(Player player, SavedQuest state)
        {
            player.Quest = state;
            player.DirtyFast = true;
            Send(player);
        }

        /// <summary>
        /// 퀘스트 NPC 곁인가. 퀘스트 NPC가 없는 데이터(시험)면 "사거리 밖"이다.
        /// </summary>
        private FailReason Near(Player player)
        {
            return _giver?.Reach(player, _field, _interactRange) ?? FailReason.OutOfRange;
        }
    }
}
