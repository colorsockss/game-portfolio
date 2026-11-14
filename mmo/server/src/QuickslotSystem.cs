using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 배운 스킬과 퀵슬롯(36). 서버는 퀵슬롯의 값을 기억만 하고, 배운 스킬과 새로 얻은 물약은 퀵슬롯에 없고 빈 자리가 있으면 가장 앞의 빈 자리에 올린다.
    /// 바뀐 퀵슬롯은 시야 차례(Flush)에 Quickslots 하나로 보낸다. 배운 스킬과 퀵슬롯은 저장한다(38).
    /// </summary>
    internal sealed class QuickslotSystem
    {
        private readonly GameData _data;

        public QuickslotSystem(GameData data)
        {
            _data = data;
        }

        /// <summary>
        /// 월드에 들어온 플레이어(Inventory 뒤): 저장한 배운 스킬과 퀵슬롯을 되살리고 LearnedSkills와 Quickslots를 보낸다. 처음 상태는 캐릭터를 만들 때 넣었다(StartQuickslots).
        /// </summary>
        public void Enter(Player player, CharacterSnapshot state)
        {
            player.Skills.Clear();
            player.Skills.UnionWith(state.Skills);
            Array.Clear(player.Quickslots);
            foreach (SavedQuickslot slot in state.Quickslots.Where(slot => slot.Slot < player.Quickslots.Length))
            {
                player.Quickslots[slot.Slot] = (slot.Kind, slot.Id);
            }

            player.QuickslotsChanged = false;
            var learned = new LearnedSkills();
            learned.Skills.Add(player.Skills.OrderBy(skill => skill));
            player.Session.Send(new Packet { LearnedSkills = learned });
            player.Session.Send(new Packet { Quickslots = Whole(player) });
        }

        /// <summary>
        /// 새 캐릭터의 퀵슬롯: 첫 스킬과 처음 상태의 물약을 위의 규칙(빈 자리에 차례로)으로 올린 배치.
        /// </summary>
        public static List<SavedQuickslot> StartQuickslots(GameData data, ClassesRow row)
        {
            var slots = new List<SavedQuickslot>();
            if (row.FirstSkill != 0)
            {
                slots.Add(new SavedQuickslot(0, QuickslotKind.Skill, row.FirstSkill));
            }

            foreach (uint itemId in row.StartItems.Where(itemId => data.Item(itemId) is { Use: ItemUse.HealHp or ItemUse.HealMp }).Distinct())
            {
                if (slots.Count < (int)Constant.QuickslotCount)
                {
                    slots.Add(new SavedQuickslot((uint)slots.Count, QuickslotKind.Item, itemId));
                }
            }

            return slots;
        }

        /// <summary>
        /// 스킬북으로 배울 수 있는지: 직업, 필요 레벨, 이미 배웠는지.
        /// </summary>
        public FailReason CanLearn(Player player, uint skillId)
        {
            SkillsRow skill = _data.Skill(skillId) ?? throw new ArgumentException($"Skills has no row {skillId}.", nameof(skillId));
            if (skill.Class != (uint)player.Class)
            {
                return FailReason.WrongClass;
            }

            if (player.Level < skill.Level)
            {
                return FailReason.LevelTooLow;
            }

            return player.Skills.Contains(skillId) ? FailReason.AlreadyLearned : FailReason.None;
        }

        /// <summary>
        /// 배운다(CanLearn을 통과한 뒤): 배운 스킬에 더하고 본인에게 SkillLearned를 보내며 빈 퀵슬롯에 올린다.
        /// </summary>
        public void Learn(Player player, uint skillId)
        {
            player.Skills.Add(skillId);
            player.DirtyFast = true;
            player.Session.Send(new Packet { SkillLearned = new SkillLearned { Skill = skillId } });
            Place(player, QuickslotKind.Skill, skillId);
        }

        /// <summary>
        /// 새로 얻은 아이템(InventorySystem.Add의 까닭이 있는 것): 물약이면 빈 퀵슬롯에 올린다.
        /// </summary>
        public void Gained(Player player, uint itemId)
        {
            if (IsPotion(itemId))
            {
                Place(player, QuickslotKind.Item, itemId);
            }
        }

        /// <summary>
        /// SetQuickslot(입력 차례). 자리가 범위 밖이거나 모르는 종류면 잘못된 패킷이고, 배우지 않은 스킬이나 물약이 아닌 아이템은 실패다.
        /// 같은 것이 다른 자리에 있으면 그 자리를 비운다(한 스킬이 두 자리를 차지하지 않게).
        /// </summary>
        public Outcome Set(Player player, SetQuickslot request)
        {
            Quickslot slot = request.Slot ?? new Quickslot();
            if ((request.Index >= player.Quickslots.Length) || !Enum.IsDefined(slot.Kind))
            {
                return Outcome.Malformed;
            }

            if (((slot.Kind == QuickslotKind.Skill) && !player.Skills.Contains(slot.Id)) || ((slot.Kind == QuickslotKind.Item) && !IsPotion(slot.Id)))
            {
                return Outcome.Fail(slot.Kind == QuickslotKind.Skill ? FailReason.NotLearned : FailReason.UnusableItem);
            }

            int other = Array.FindIndex(player.Quickslots, entry => (entry.Kind == slot.Kind) && (entry.Id == slot.Id));
            if ((slot.Kind != QuickslotKind.Empty) && (other >= 0))
            {
                player.Quickslots[other] = default;
            }

            player.Quickslots[request.Index] = slot.Kind == QuickslotKind.Empty ? default : (slot.Kind, slot.Id);
            player.QuickslotsChanged = true;
            return Outcome.Done;
        }

        /// <summary>
        /// 시야 차례: 이 틱에 퀵슬롯이 바뀐 플레이어에게 Quickslots를 보낸다.
        /// </summary>
        public void Flush(IEnumerable<Player> players)
        {
            foreach (Player player in players.Where(player => player.QuickslotsChanged))
            {
                player.QuickslotsChanged = false;
                player.DirtyFast = true;
                player.Session.Send(new Packet { Quickslots = Whole(player) });
            }
        }

        /// <summary>
        /// 퀵슬롯에 없고 빈 자리가 있으면 가장 앞의 빈 자리에 올린다.
        /// </summary>
        private static void Place(Player player, QuickslotKind kind, uint id)
        {
            int empty = Array.FindIndex(player.Quickslots, entry => entry.Kind == QuickslotKind.Empty);
            if ((empty < 0) || player.Quickslots.Contains((kind, id)))
            {
                return;
            }

            player.Quickslots[empty] = (kind, id);
            player.QuickslotsChanged = true;
        }

        private static Quickslots Whole(Player player)
        {
            var whole = new Quickslots();
            whole.Slots.Add(player.Quickslots.Select(entry => new Quickslot { Kind = entry.Kind, Id = entry.Id }));
            return whole;
        }

        private bool IsPotion(uint itemId)
        {
            return _data.Item(itemId) is { Use: ItemUse.HealHp or ItemUse.HealMp };
        }
    }
}
