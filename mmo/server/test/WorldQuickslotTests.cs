using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 스킬 배우기와 퀵슬롯(36). 시험 직업의 첫 스킬은 101(기사)과 201(마법사)이고, 스킬북은 2102(기사 102), 2106(기사 106, 레벨 3), 2202(마법사 202)다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 들어온 캐릭터는 첫 스킬만 배운 채이고(LearnedSkills), 퀵슬롯은 첫 스킬과 처음 상태의 물약이 차례로 오른 배치다. 배우지 않은 스킬의 UseSkill은 ActionFailed다.
        /// </summary>
        [Fact]
        public void EnteringKnowsOnlyTheFirstSkill()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Join(world, "hero_01");
            Assert.Equal(new uint[] { 101 }, session.Outbox.Single(packet => packet.BodyCase == Packet.BodyOneofCase.LearnedSkills).LearnedSkills.Skills);
            Assert.Equal(Slots(Skill(101), Item(2001), Item(2003)), session.Outbox.Single(packet => packet.BodyCase == Packet.BodyOneofCase.Quickslots).Quickslots.Slots);

            Session knight = Fighter(world, "hero_02", 1, 0, learnAll: false);
            UseSkill(world, knight, 102, world.Monsters[0].Id);
            Assert.Equal(new[] { SkillFailed(FailReason.NotLearned) }, Take(knight));
        }

        /// <summary>
        /// 다른 직업의 스킬북, 레벨이 모자란 스킬북, 이미 배운 스킬의 책은 실패하고 책이 그대로다. 배우면 책이 하나 줄고 SkillLearned가 가며, 그 스킬이 빈 퀵슬롯에 오르고
        /// 바로 쓸 수 있다.
        /// </summary>
        [Fact]
        public void SkillBooksTeachTheirClassSkill()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 1, 0, learnAll: false);
            Player player = knight.Player!;
            world.Inventory.Add(player, 2102, 2, GainReason.Unspecified);
            world.Inventory.Add(player, 2106, 1, GainReason.Unspecified);
            world.Inventory.Add(player, 2202, 1, GainReason.Unspecified);
            Use(world, knight, SlotOf(player, 2202), 1);
            Use(world, knight, SlotOf(player, 2106), 2);
            Use(world, knight, SlotOf(player, 2102), 3);
            Use(world, knight, SlotOf(player, 2102), 4);
            List<Packet> packets = knight.Outbox.ToList();
            Assert.Equal(
                new[] { Result(1, FailReason.WrongClass), Result(2, FailReason.LevelTooLow), Result(3, FailReason.None), Result(4, FailReason.AlreadyLearned) },
                packets.Where(IsResult));
            Assert.Equal(new SkillLearned { Skill = 102 }, packets.Single(packet => packet.BodyCase == Packet.BodyOneofCase.SkillLearned).SkillLearned);
            Assert.Equal((1u, 1u, 1u), (player.Bag.CountOf(2102), player.Bag.CountOf(2106), player.Bag.CountOf(2202)));
            Assert.Equal(new uint[] { 101, 102 }, player.Skills.OrderBy(skill => skill));

            Take(knight);
            world.Step();
            Assert.Equal(Slots(Skill(101), Item(2001), Item(2003), Skill(102)), TakeVitals(knight).Single(packet => packet.BodyCase == Packet.BodyOneofCase.Quickslots).Quickslots.Slots);
            UseSkill(world, knight, 102, world.Monsters[0].Id);
            Assert.DoesNotContain(Take(knight), packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed);
        }

        /// <summary>
        /// 새로 얻은 물약은 퀵슬롯에 없으면 가장 앞의 빈 자리에 오르고, 이미 있는 물약은 자리가 늘지 않으며, 퀵슬롯이 가득이면 오르지 않는다. 한 틱의 변화는 Quickslots 하나다.
        /// </summary>
        [Fact]
        public void GainedPotionsFillTheFirstEmptyQuickslot()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 1, 0);
            Player player = knight.Player!;
            world.Inventory.Add(player, 2002, 1, GainReason.PickUp);
            world.Inventory.Add(player, 2001, 1, GainReason.PickUp);
            world.Step();
            Assert.Equal(Slots(Skill(101), Item(2001), Item(2003), Item(2002)), QuickslotChanges(knight).Single().Slots);

            for (uint index = 3; index < 8; index++)
            {
                SetSlot(world, knight, index, Skill(102 + index - 3));
            }

            world.Inventory.Add(player, 2002, 1, GainReason.PickUp);
            world.Step();
            Assert.Equal(Slots(Skill(101), Item(2001), Item(2003), Skill(102), Skill(103), Skill(104), Skill(105), Skill(106)), QuickslotChanges(knight).Single().Slots);
        }

        /// <summary>
        /// SetQuickslot은 배우지 않은 스킬과 물약이 아닌 아이템을 ActionFailed(퀵슬롯)로 거절한다. 다른 자리에 있던 것을 올리면 그 자리가 비고, 비우기를 받으며,
        /// 범위 밖의 자리는 끊는다.
        /// </summary>
        [Fact]
        public void SetQuickslotChecksWhatItPlaces()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 1, 0, learnAll: false);
            SetSlot(world, knight, 0, Skill(102));
            SetSlot(world, knight, 0, Item(3001));
            Assert.Equal(
                new[]
                {
                    new Packet { ActionFailed = new ActionFailed { Reason = FailReason.NotLearned, Request = RequestKind.Quickslot } },
                    new Packet { ActionFailed = new ActionFailed { Reason = FailReason.UnusableItem, Request = RequestKind.Quickslot } },
                },
                Take(knight));

            SetSlot(world, knight, 5, Skill(101));
            SetSlot(world, knight, 1, new Quickslot());
            world.Step();
            Assert.Equal(Slots(new Quickslot(), new Quickslot(), Item(2003), new Quickslot(), new Quickslot(), Skill(101)), QuickslotChanges(knight).Single().Slots);

            SetSlot(world, knight, 8, new Quickslot());
            Assert.True(knight.IsClosing);
        }

        private static void SetSlot(World world, Session session, uint index, Quickslot slot)
        {
            world.Receive(session, new Packet { SetQuickslot = new SetQuickslot { Index = index, Slot = slot } });
        }

        private static Quickslot Skill(uint id)
        {
            return new Quickslot { Kind = QuickslotKind.Skill, Id = id };
        }

        private static Quickslot Item(uint id)
        {
            return new Quickslot { Kind = QuickslotKind.Item, Id = id };
        }

        /// <summary>
        /// 앞의 자리를 채우고 나머지는 빈 퀵슬롯 8자리.
        /// </summary>
        private static List<Quickslot> Slots(params Quickslot[] front)
        {
            return front.Concat(Enumerable.Range(0, 8 - front.Length).Select(_ => new Quickslot())).ToList();
        }

        private static List<Quickslots> QuickslotChanges(Session session)
        {
            return TakeVitals(session).Where(packet => packet.BodyCase == Packet.BodyOneofCase.Quickslots).Select(packet => packet.Quickslots).ToList();
        }
    }
}
