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
    /// 파티(42). 시험 맵은 256 m이고 시야 칸은 32 m라 100 m 떨어진 플레이어는 시야 밖이다. 몬스터 2(비선공)는 (0, 0)에 서고 경험치 100과 드롭 묶음 1(재료 3001 둘과 골드 10)을 준다.
    /// 시험 레벨은 1–4이고 필요 경험치는 100씩이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 초대는 파티장(또는 파티가 없는 사람)이 시야 안의 파티가 없는 플레이어에게만 하고, 답을 기다리는 초대가 있는 대상에게는 못 한다. 수락하면 초대한 쪽이 파티장인 파티가 생긴다.
        /// </summary>
        [Fact]
        public void InvitesNeedALeaderAndAVisibleFreeTarget()
        {
            World world = PartyWorld();
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Session c = Fighter(world, "hero_03", 6, 0);
            Session d = Fighter(world, "hero_04", 8, 0);
            Session far = Fighter(world, "hero_05", 100, 0);
            TakeAll(a, b, c, d, far);

            Invite(world, a, far);
            Assert.Equal(new[] { FailedFor(FailReason.NoTarget, RequestKind.Party) }, Take(a));
            Invite(world, a, b);
            Assert.Equal(new PartyInvited { InviterId = a.Player!.Id, InviterName = "hero01", ExpireTick = world.Tick + 600 }, Take(b).Single().PartyInvited);
            Invite(world, c, b);
            Assert.Equal(new[] { FailedFor(FailReason.InvitePending, RequestKind.Party) }, Take(c));

            AnswerInvite(world, b, true);
            PartyState state = Take(a).Single().PartyState;
            Assert.Equal(state, Take(b).Single().PartyState);
            Assert.Equal(a.Player!.Id, state.LeaderId);
            Assert.Equal(new[] { "hero01", "hero02" }, state.Members.Select(member => member.Name));

            Invite(world, b, c);
            Assert.Equal(new[] { FailedFor(FailReason.NotLeader, RequestKind.Party) }, Take(b));
            Invite(world, d, c);
            AnswerInvite(world, c, true);
            TakeAll(a, b, c, d);
            Invite(world, a, c);
            Assert.Equal(new[] { FailedFor(FailReason.AlreadyInParty, RequestKind.Party) }, Take(a));
        }

        /// <summary>
        /// 다섯 명인 파티의 초대는 "파티가 가득 참"이다. 넷인 파티가 둘을 초대해 둘 다 수락하면 수락할 때 다시 보아 둘째가 실패한다.
        /// </summary>
        [Fact]
        public void PartiesHoldFiveAndAcceptsAreCheckedAgain()
        {
            World world = PartyWorld();
            Session[] heroes = Enumerable.Range(1, 6).Select(n => Fighter(world, $"hero_0{n}", 2 * n, 0)).ToArray();
            Form(world, heroes[0], heroes[1], heroes[2], heroes[3]);
            Invite(world, heroes[0], heroes[4]);
            Invite(world, heroes[0], heroes[5]);
            AnswerInvite(world, heroes[4], true);
            TakeAll(heroes);
            AnswerInvite(world, heroes[5], true);
            Assert.Equal(new[] { FailedFor(FailReason.PartyFull, RequestKind.Party) }, Take(heroes[5]));
            Assert.Equal(5, world.Party.Members(heroes[0].Player!.PartyId).Count);

            Invite(world, heroes[0], heroes[5]);
            Assert.Equal(new[] { FailedFor(FailReason.PartyFull, RequestKind.Party) }, Take(heroes[0]));
        }

        /// <summary>
        /// 답하지 않은 초대는 30초 뒤에 사라져 그 뒤의 수락은 "초대가 없음"이다. 거절하면 초대가 바로 지워지고 초대한 쪽이 "초대를 거절함"을 받는다.
        /// </summary>
        [Fact]
        public void InvitesExpireOrAreDeclined()
        {
            World world = PartyWorld();
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Invite(world, a, b);
            // 만료되는 틱(지금 + 600)을 계산하는 Step까지.
            for (int tick = 0; tick <= 600; tick++)
            {
                world.Step();
            }

            TakeAll(a, b);
            AnswerInvite(world, b, true);
            Assert.Equal(new[] { FailedFor(FailReason.NoInvite, RequestKind.Party) }, Take(b));

            Invite(world, a, b);
            AnswerInvite(world, b, false);
            Assert.Equal(new[] { FailedFor(FailReason.InviteDeclined, RequestKind.Party) }, Take(a));
            AnswerInvite(world, b, true);
            Assert.Equal(FailedFor(FailReason.NoInvite, RequestKind.Party), Take(b).Last());
            Assert.Equal(0u, a.Player!.PartyId);
        }

        /// <summary>
        /// 파티장이 떠나면 가장 먼저 들어온 파티원이 파티장이 되고, 파티원의 내보내기는 "파티장이 아님"이며, 한 명만 남으면 파티가 없어져 둘 다 빈 PartyState를 받는다.
        /// </summary>
        [Fact]
        public void LeadershipPassesAndTheLastOneDisbands()
        {
            World world = PartyWorld();
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Session c = Fighter(world, "hero_03", 6, 0);
            Form(world, a, b, c);

            world.Receive(a, new Packet { PartyLeave = new PartyLeave() });
            Assert.Equal(new PartyState(), Take(a).Single().PartyState);
            Assert.Equal(b.Player!.Id, Take(b).Single().PartyState.LeaderId);
            Take(c);

            world.Receive(c, new Packet { PartyKick = new PartyKick { TargetId = b.Player!.Id } });
            Assert.Equal(new[] { FailedFor(FailReason.NotLeader, RequestKind.Party) }, Take(c));
            world.Receive(b, new Packet { PartyKick = new PartyKick { TargetId = c.Player!.Id } });
            Assert.Equal(new PartyState(), Take(c).Single().PartyState);
            Assert.Equal(new PartyState(), Take(b).Single().PartyState);
            Assert.Equal((0u, 0u), (b.Player!.PartyId, c.Player!.PartyId));
        }

        /// <summary>
        /// LeaveWorld, 끊김, 로그아웃은 그 캐릭터를 파티에서 빼고, 죽은 동안의 파티 요청은 "쓰러짐"으로 답한다.
        /// </summary>
        [Fact]
        public void LeavingTheWorldLeavesTheParty()
        {
            World world = PartyWorld();
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Session c = Fighter(world, "hero_03", 6, 0);
            Session d = Fighter(world, "hero_04", 8, 0);
            Form(world, a, b, c, d);

            world.Receive(b, new Packet { LeaveWorld = new LeaveWorld() });
            Assert.Equal(new[] { "hero01", "hero03", "hero04" }, Take(a).Single(packet => packet.BodyCase == Packet.BodyOneofCase.PartyState).PartyState.Members.Select(member => member.Name));
            world.Disconnect(c);
            world.Receive(d, new Packet { Logout = new Logout() });
            Assert.Equal(new PartyState(), Take(a).Last(packet => packet.BodyCase == Packet.BodyOneofCase.PartyState).PartyState);
            Assert.Equal(0u, a.Player!.PartyId);

            a.Player!.Hp = 0;
            a.Player.Dead = true;
            world.Receive(a, new Packet { PartyLeave = new PartyLeave() });
            Assert.Equal(new[] { FailedFor(FailReason.Dead, RequestKind.Party) }, Take(a));
        }

        /// <summary>
        /// 경험치는 잡은 자리의 둘레 9칸 안의 살아 있는 파티원이 나눈다(밖의 파티원과 죽은 파티원은 받지도 세지도 않음). 2명이면 합이 +10%이고, 4명이면 +30%에 끝수를 버린다.
        /// </summary>
        [Fact]
        public void PartyExpIsSharedWithABonus()
        {
            World world = PartyWorld(exp: 100);
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Session far = Fighter(world, "hero_03", 6, 0);
            Session dead = Fighter(world, "hero_04", 8, 0);
            Form(world, a, b, far, dead);
            world.Place(far.Player!, Center(100), Center(0));
            dead.Player!.Hp = 0;
            dead.Player.Dead = true;
            Kill(world, a, world.Monsters[0]);
            Assert.Equal((55u, 55u, 0u, 0u), (a.Player!.Exp, b.Player!.Exp, far.Player!.Exp, dead.Player.Exp));

            World four = PartyWorld(exp: 50);
            Session[] heroes = Enumerable.Range(1, 4).Select(n => Fighter(four, $"hero_0{n}", 2 * n, 0)).ToArray();
            Form(four, heroes);
            Kill(four, heroes[0], four.Monsters[0]);
            // 50 × 1.3 = 65를 넷이 나눠 16(끝수 버림).
            Assert.All(heroes, hero => Assert.Equal(16u, hero.Player!.Exp));
            Assert.Equal(4, four.Growth.Rewarded.Count);
        }

        /// <summary>
        /// 피해 표의 편: 파티원의 피해를 합쳐 견주고(합이 같으면 먼저 든 편), 칠 대상은 합이 가장 큰 편에서 피해가 가장 큰 고를 수 있는 파티원(같으면 먼저 든 줄)이며,
        /// 그 편에 고를 사람이 없으면 다음 편이다.
        /// </summary>
        [Fact]
        public void TheDamageTableSumsParties()
        {
            var sides = new Dictionary<uint, ulong> { [1] = 100, [2] = 100, [3] = 3, [4] = 4 };
            var table = new DamageTable();
            table.Add(3, 50);
            table.Add(1, 30);
            table.Add(2, 30);
            Assert.Equal(100ul, table.Killer(id => sides[id]));
            Assert.Equal(1u, table.Pick(_ => true, id => sides[id]));
            Assert.Equal(2u, table.Pick(id => id != 1, id => sides[id]));
            Assert.Equal(3u, table.Pick(id => id == 3, id => sides[id]));

            var tie = new DamageTable();
            tie.Add(4, 60);
            tie.Add(1, 20);
            tie.Add(2, 40);
            Assert.Equal(4ul, tie.Killer(id => sides[id]));
            Assert.Equal(4u, tie.Pick(_ => true, id => sides[id]));
        }

        /// <summary>
        /// 두 파티가 한 몬스터를 치면 파티로 합친 피해가 큰 쪽이 경험치와 드롭을 가진다. 주인이 파티인 드롭은 10초 안에는 그 파티의 사람만 줍고(드롭 뒤에 들어온 파티원 포함),
        /// 그 뒤에는 누구나 줍는다. 파티가 있는 사람이 떨어뜨린 아이템은 10초 안에는 본인과 파티원만 줍는다.
        /// </summary>
        [Fact]
        public void PartiesOwnTheirDrops()
        {
            World world = PartyWorld(exp: 100);
            Session a1 = Fighter(world, "hero_01", 1, 0);
            Session a2 = Fighter(world, "hero_02", -1, 0);
            Session b1 = Fighter(world, "hero_03", 0, 1);
            Session b2 = Fighter(world, "hero_04", 0, -1);
            Session late = Fighter(world, "hero_05", 2, 2);
            Form(world, a1, a2);
            Form(world, b1, b2);
            Monster monster = world.Monsters[0];
            monster.Damage.Add(b1.Player!.Id, 50);
            monster.Damage.Add(a1.Player!.Id, 30);
            monster.Damage.Add(a2.Player!.Id, 30);
            Kill(world, a1, monster);
            Assert.Equal((55u, 55u, 0u), (a1.Player!.Exp, a2.Player!.Exp, b1.Player!.Exp));
            List<GroundItem> items = world.GroundItems.ToList();
            Assert.All(items, item => Assert.Equal((0u, a1.Player!.PartyId), (item.OwnerPlayerId, item.OwnerPartyId)));

            Invite(world, a1, late);
            AnswerInvite(world, late, true);
            TakeAll(a1, a2, b1, b2, late);
            PickUp(world, b1, items[0].Id, 1);
            Assert.Equal(new[] { Result(1, FailReason.NotYours) }, Take(b1).Where(IsResult));
            world.Place(late.Player!, items[0].X, items[0].Z);
            PickUp(world, late, items[0].Id, 2);
            Assert.Equal(new[] { Result(2, FailReason.None) }, Take(late).Where(IsResult));
            for (int tick = 0; tick < 200; tick++)
            {
                world.Step();
            }

            world.Place(b1.Player!, items[1].X, items[1].Z);
            TakeAll(b1);
            PickUp(world, b1, items[1].Id, 3);
            Assert.Equal(new[] { Result(3, FailReason.None) }, Take(b1).Where(IsResult));

            Drop(world, a1, SlotOf(a1.Player!, 2001), 1, 4);
            GroundItem dropped = world.GroundItems.Single(item => item.DroppedByPlayer);
            Assert.Equal(a1.Player!.PartyId, dropped.OwnerPartyId);
            world.Place(b2.Player!, dropped.X, dropped.Z);
            world.Place(a2.Player!, dropped.X, dropped.Z);
            TakeAll(b2, a2);
            PickUp(world, b2, dropped.Id, 5);
            PickUp(world, a2, dropped.Id, 6);
            Assert.Equal(new[] { Result(5, FailReason.NotYours) }, Take(b2).Where(IsResult));
            Assert.Equal(new[] { Result(6, FailReason.None) }, Take(a2).Where(IsResult));
        }

        /// <summary>
        /// 회복은 대상이 파티원이면 그 파티원에게, 파티원이 아닌 대상이면 자기에게 쓰이고, 사거리(12 m) 밖의 파티원에게는 "사거리 밖"이다.
        /// </summary>
        [Fact]
        public void HealsReachPartyMembers()
        {
            World world = PartyWorld();
            Session mage = Fighter(world, "hero_01", 2, 0, CharacterClass.Mage);
            Session knight = Fighter(world, "hero_02", 6, 0);
            Session stranger = Fighter(world, "hero_03", 8, 0);
            Form(world, mage, knight);
            // 셋 다 같은 체력에서 시작해 자연 회복은 같으므로, 회복을 받은 쪽만 회복량(공격력 × 2)만큼 앞선다.
            uint heal = (uint)Math.Floor(mage.Player!.Stats.Attack * 2.0);
            knight.Player!.Hp = 10;
            stranger.Player!.Hp = 10;
            mage.Player.Hp = 10;
            Cast(world, mage, 203, knight.Player.Id);
            Assert.Equal(stranger.Player.Hp + heal, knight.Player.Hp);
            Assert.Equal(stranger.Player.Hp, mage.Player.Hp);

            knight.Player.Hp = 10;
            stranger.Player.Hp = 10;
            mage.Player.Hp = 10;
            Cast(world, mage, 203, stranger.Player.Id);
            Assert.Equal(knight.Player.Hp, stranger.Player.Hp);
            Assert.Equal(knight.Player.Hp + heal, mage.Player.Hp);

            world.Place(knight.Player, Center(20), Center(0));
            mage.Player.SetCooldown(203, 0);
            Take(mage);
            world.Receive(mage, new Packet { UseSkill = new UseSkill { SkillId = 203, TargetId = knight.Player.Id } });
            Assert.Equal(new[] { FailedFor(FailReason.OutOfRange, RequestKind.Skill) }, Take(mage));
        }

        /// <summary>
        /// 파티 채팅은 파티원에게만 가고, 시야 밖의 파티원의 체력과 위치도 1초마다 PartyMemberVitals로 온다.
        /// </summary>
        [Fact]
        public void PartyChatAndVitalsReachMembersOnly()
        {
            World world = PartyWorld();
            Session a = Fighter(world, "hero_01", 2, 0);
            Session b = Fighter(world, "hero_02", 4, 0);
            Session stranger = Fighter(world, "hero_03", 6, 0);
            Form(world, a, b);
            world.Place(b.Player!, Center(100), Center(0));
            TakeAll(a, b, stranger);
            Say(world, a, ChatChannel.Party, "파티");
            Assert.Equal("파티", Chats(b).Single().Text);
            Assert.Empty(Chats(stranger));

            for (int tick = 0; tick < Units.TicksPerSecond; tick++)
            {
                world.Step();
            }

            PartyMemberVitals vitals = Take(a).Last(packet => packet.BodyCase == Packet.BodyOneofCase.PartyMemberVitals).PartyMemberVitals;
            Assert.Equal(new PartyMemberVital { Id = b.Player!.Id, Hp = b.Player.Hp, MaxHp = b.Player.MaxHp, X = Center(100), Z = Center(0) }, vitals.Members[1]);
            Assert.DoesNotContain(Take(stranger), packet => packet.BodyCase == Packet.BodyOneofCase.PartyMemberVitals);
        }

        private static World PartyWorld(uint exp = 100)
        {
            MonstersRow giver = TestData.Monster(2, aggressive: false);
            giver.Exp = exp;
            giver.DropGroup = 1;
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMonsters(
                new[] { TestData.Spawn(1, 0, 0, 2) }, TestData.Draw(256), null, null, new[] { TestData.Monster(1, aggressive: true), giver }, TestData.LevelsUpTo(4)));
        }

        private static void Invite(World world, Session from, Session to)
        {
            world.Receive(from, new Packet { PartyInvite = new PartyInvite { TargetId = to.Player!.Id } });
        }

        private static void AnswerInvite(World world, Session session, bool accept)
        {
            world.Receive(session, new Packet { PartyAnswer = new PartyAnswer { Accept = accept } });
        }

        /// <summary>
        /// 첫째를 파티장으로 나머지를 차례로 초대하고 수락해 파티를 만든다. 쌓인 패킷은 비운다.
        /// </summary>
        private static void Form(World world, params Session[] members)
        {
            foreach (Session member in members.Skip(1))
            {
                Invite(world, members[0], member);
                AnswerInvite(world, member, true);
            }

            Assert.All(members, member => Assert.Equal(members[0].Player!.PartyId, member.Player!.PartyId));
            TakeAll(members);
        }

        private static void TakeAll(params Session[] sessions)
        {
            foreach (Session session in sessions)
            {
                session.Outbox.Clear();
            }
        }

        /// <summary>
        /// 스킬을 쓰고 시전이 끝날 때까지 돌린다.
        /// </summary>
        private static void Cast(World world, Session caster, uint skillId, uint targetId)
        {
            caster.Player!.SetCooldown(skillId, 0);
            world.Receive(caster, new Packet { UseSkill = new UseSkill { SkillId = skillId, TargetId = targetId } });
            StepUntil(world, () => caster.Player.Progress == null, 40);
            world.Step();
        }

        /// <summary>
        /// 편이 플레이어 자신인 피해 표(파티가 없을 때).
        /// </summary>
        private static ulong Solo(uint playerId)
        {
            return playerId;
        }
    }
}
