using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 파티(42). 파티(번호, 들어온 차례대로의 파티원)와 답을 기다리는 초대(초대받은 플레이어 → 초대한 플레이어, 만료되는 틱)를 가진다.
    /// 파티장은 늘 첫 파티원이라, 파티장이 빠지면 가장 먼저 들어온 파티원이 파티장이 된다. 파티 번호는 1씩 늘려 다시 쓰지 않는다
    /// (없어진 파티가 주인이던 바닥 아이템을 새 파티가 줍지 않게). 파티의 요청은 여러 플레이어가 함께 가진 상태를 고치므로 확인을 모두 마친 뒤에 고치고,
    /// 바뀐 파티의 모두에게 PartyState를 보낸다.
    /// </summary>
    internal sealed class PartySystem
    {
        /// <summary>
        /// 파티의 편 번호에 붙이는 표시(DamageTable의 편). 플레이어 번호와 겹치지 않게 위 32비트에 둔다.
        /// </summary>
        private const ulong PartySideFlag = 1UL << 32;

        private readonly EntityTable _entities;
        private readonly Scheduler _scheduler;
        private readonly uint _inviteTicks;
        private readonly Dictionary<uint, List<Player>> _parties = new Dictionary<uint, List<Player>>();
        private readonly Dictionary<uint, PendingInvite> _invites = new Dictionary<uint, PendingInvite>();
        private readonly Periodic _vitals = new Periodic(Units.TicksPerSecond, Units.TicksPerSecond);
        private uint _nextPartyId = 1;

        public PartySystem(GameData data, EntityTable entities, Scheduler scheduler)
        {
            _entities = entities;
            _scheduler = scheduler;
            _inviteTicks = Units.TicksFromMilliseconds(data.Constants.PartyInviteMs);
        }

        /// <summary>
        /// 파티의 파티원(들어온 차례, 첫째가 파티장). 없는 파티면 빈 목록이다.
        /// </summary>
        public IReadOnlyList<Player> Members(uint partyId)
        {
            return _parties.TryGetValue(partyId, out List<Player>? members) ? members : System.Array.Empty<Player>();
        }

        /// <summary>
        /// 둘이 같은 파티인가(회복과 강화의 대상 42, CanAttack의 플레이어 부분 44).
        /// </summary>
        public static bool SameParty(Player a, Player b)
        {
            return (a.PartyId != 0) && (a.PartyId == b.PartyId);
        }

        /// <summary>
        /// 피해 표의 편: 파티가 있으면 그 파티, 없으면 플레이어 자신이다.
        /// </summary>
        public ulong SideOf(uint playerId)
        {
            // 소환수(95)의 줄은 주인의 편이다.
            Entity? found = _entities.Find(playerId);
            Player? player = found is Summon summon ? summon.Owner : found as Player;
            return player is { PartyId: not 0 } ? PartySideFlag | player.PartyId : player?.Id ?? playerId;
        }

        /// <summary>
        /// 편이 파티면 그 파티 번호, 플레이어면 0이다.
        /// </summary>
        public static uint PartyOfSide(ulong side)
        {
            return (side & PartySideFlag) != 0 ? (uint)side : 0;
        }

        /// <summary>
        /// PartyInvite(입력 차례): 보낸 쪽이 파티가 없거나 파티장이고, 파티가 가득 차지 않았고, 대상이 받은 개체(시야 안)의 다른 플레이어이고,
        /// 대상에게 파티와 답을 기다리는 다른 초대가 없어야 한다. 통과하면 초대를 기록하고 만료를 예약하며 대상에게 PartyInvited를 보낸다.
        /// </summary>
        public FailReason Invite(Player inviter, uint targetId, uint tick)
        {
            if ((inviter.PartyId != 0) && (Members(inviter.PartyId)[0] != inviter))
            {
                return FailReason.NotLeader;
            }

            if (Members(inviter.PartyId).Count >= (int)Constant.MaxPartySize)
            {
                return FailReason.PartyFull;
            }

            if ((_entities.Find(targetId) is not Player target) || (target == inviter) || !inviter.Visible.Contains(target) || target.Session.IsDetached)
            {
                return FailReason.NoTarget;
            }

            if (target.PartyId != 0)
            {
                return FailReason.AlreadyInParty;
            }

            if (_invites.ContainsKey(target.Id))
            {
                return FailReason.InvitePending;
            }

            var invite = new PendingInvite(inviter.Id, tick + _inviteTicks, _scheduler.NewGeneration());
            _invites.Add(target.Id, invite);
            _scheduler.Add(invite.ExpireTick, ScheduledKind.PartyInviteExpire, target.Id, 0, 0, invite.Generation);
            target.Session.Send(new Packet { PartyInvited = new PartyInvited { InviterId = inviter.Id, InviterName = inviter.Name, ExpireTick = invite.ExpireTick } });
            return FailReason.None;
        }

        /// <summary>
        /// 초대의 만료 예약이 아직 그 초대의 것인가(답했거나 지운 초대의 예약은 버린다).
        /// </summary>
        public bool IsInviteCurrent(in ScheduledJob job)
        {
            return _invites.TryGetValue(job.Owner, out PendingInvite invite) && (invite.Generation == job.Generation);
        }

        /// <summary>
        /// 만료되는 틱(예약한 일): 답이 없는 초대를 지운다.
        /// </summary>
        public void ExpireInvite(in ScheduledJob job)
        {
            _invites.Remove(job.Owner);
        }

        /// <summary>
        /// PartyAnswer(입력 차례): 초대를 지우고, 거절이면 초대한 쪽에 "초대를 거절함"을 알린다. 수락이면 그때 다시 본다:
        /// 초대한 쪽이 아직 월드에 있는지, 여전히 파티가 없거나 파티장인지, 파티가 가득 차지 않았는지, 수락한 쪽에 파티가 없는지.
        /// 통과하면 초대한 쪽에 파티가 없을 때는 초대한 쪽을 파티장으로 새 파티를 만들고, 수락한 쪽을 끝에 넣는다.
        /// </summary>
        public FailReason Answer(Player player, bool accept)
        {
            if (!_invites.Remove(player.Id, out PendingInvite invite))
            {
                return FailReason.NoInvite;
            }

            Player? inviter = _entities.Find(invite.InviterId) as Player;
            if (!accept)
            {
                inviter?.Fail(FailReason.InviteDeclined, RequestKind.Party);
                return FailReason.None;
            }

            if (inviter == null)
            {
                return FailReason.NoInvite;
            }

            if ((inviter.PartyId != 0) && (Members(inviter.PartyId)[0] != inviter))
            {
                return FailReason.NotLeader;
            }

            if (Members(inviter.PartyId).Count >= (int)Constant.MaxPartySize)
            {
                return FailReason.PartyFull;
            }

            if (player.PartyId != 0)
            {
                return FailReason.AlreadyInParty;
            }

            if (inviter.PartyId == 0)
            {
                inviter.PartyId = _nextPartyId++;
                _parties.Add(inviter.PartyId, new List<Player> { inviter });
            }

            player.PartyId = inviter.PartyId;
            _parties[inviter.PartyId].Add(player);
            SendState(inviter.PartyId);
            return FailReason.None;
        }

        /// <summary>
        /// PartyLeave(입력 차례): 내 파티에서 떠난다.
        /// </summary>
        public FailReason Leave(Player player)
        {
            if (player.PartyId == 0)
            {
                return FailReason.NoParty;
            }

            Remove(player);
            return FailReason.None;
        }

        /// <summary>
        /// PartyKick(입력 차례): 파티장만 다른 파티원을 뺀다.
        /// </summary>
        public FailReason Kick(Player leader, uint targetId)
        {
            if (leader.PartyId == 0)
            {
                return FailReason.NoParty;
            }

            List<Player> members = _parties[leader.PartyId];
            if (members[0] != leader)
            {
                return FailReason.NotLeader;
            }

            if (members.Find(member => (member.Id == targetId) && (member != leader)) is not Player target)
            {
                return FailReason.NoTarget;
            }

            Remove(target);
            return FailReason.None;
        }

        /// <summary>
        /// 연결이 캐릭터에서 떨어진다(끊김, 로그아웃, LeaveWorld, 재로그인, 예외. 월드에서 빼기 전에 부름): 파티에서 빼고, 그 캐릭터가 받았거나 보낸 초대를 지운다.
        /// </summary>
        public void Leaving(Player player)
        {
            if (player.PartyId != 0)
            {
                Remove(player);
            }

            _invites.Remove(player.Id);
            foreach (uint invited in _invites.Where(pair => pair.Value.InviterId == player.Id).Select(pair => pair.Key).ToList())
            {
                _invites.Remove(invited);
            }
        }

        /// <summary>
        /// 1초마다(틱이 밀려도 한 번만) 파티마다 파티원 모두의 체력과 위치를 파티원에게 보낸다. 시야 밖의 파티원도 싣는다.
        /// </summary>
        public void Step(uint tick)
        {
            if (!_vitals.Due(tick))
            {
                return;
            }

            foreach (List<Player> members in _parties.Values)
            {
                var vitals = new PartyMemberVitals();
                foreach (Player member in members)
                {
                    vitals.Members.Add(new PartyMemberVital { Id = member.Id, Hp = member.Hp, MaxHp = member.MaxHp, X = member.X, Z = member.Z });
                }

                var packet = new Packet { PartyMemberVitals = vitals };
                foreach (Player member in members)
                {
                    member.Session.Send(packet);
                }
            }
        }

        /// <summary>
        /// 파티원 하나를 뺀다. 빠진 쪽에는 빈 PartyState를 보내고, 한 명만 남으면 파티를 없애 남은 쪽에도 빈 것을 보내며, 아니면 남은 모두에게 보낸다.
        /// </summary>
        private void Remove(Player player)
        {
            uint partyId = player.PartyId;
            List<Player> members = _parties[partyId];
            members.Remove(player);
            player.PartyId = 0;
            player.Session.Send(new Packet { PartyState = new PartyState() });
            if (members.Count > 1)
            {
                SendState(partyId);
                return;
            }

            _parties.Remove(partyId);
            foreach (Player last in members)
            {
                last.PartyId = 0;
                last.Session.Send(new Packet { PartyState = new PartyState() });
            }
        }

        private void SendState(uint partyId)
        {
            List<Player> members = _parties[partyId];
            var state = new PartyState { PartyId = partyId, LeaderId = members[0].Id };
            foreach (Player member in members)
            {
                state.Members.Add(new PartyMember { Id = member.Id, Name = member.Name, CharacterClass = member.Class });
            }

            var packet = new Packet { PartyState = state };
            foreach (Player member in members)
            {
                member.Session.Send(packet);
            }
        }

        /// <summary>
        /// 답을 기다리는 초대 하나(초대한 플레이어, 만료되는 틱, 만료 예약과 견주는 세대 번호).
        /// </summary>
        private readonly record struct PendingInvite(uint InviterId, uint ExpireTick, ulong Generation);
    }
}
