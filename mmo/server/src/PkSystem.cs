using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// PK와 성향(44): 플레이어 사이의 공격할 수 있는지, 선공 표시(붙임, 끝, 죽어서 뗌), 성향(일반 플레이어를 죽이면 내림, 몬스터의 경험치를 받으면 올림),
    /// 이름 색, 부활 지점(무법자는 따로). 일반 플레이어는 선공 표시가 없고 무법자가 아닌 플레이어다.
    /// </summary>
    internal sealed class PkSystem
    {
        private readonly Scheduler _scheduler;
        private readonly FieldMap _field;
        private readonly uint _minLevel;
        private readonly uint _aggressorTicks;
        private readonly int _killPenalty;
        private readonly int _monsterGain;
        private readonly (int X, int Z) _respawn;
        private readonly (int X, int Z) _outlawRespawn;

        public PkSystem(GameData data, FieldMap field, Scheduler scheduler)
        {
            _scheduler = scheduler;
            _field = field;
            Constants constants = data.Constants;
            _minLevel = constants.PkMinLevel;
            _aggressorTicks = Units.TicksFromMilliseconds(constants.AggressorMs);
            _killPenalty = (int)constants.KarmaKillPenalty;
            _monsterGain = (int)constants.KarmaMonsterGain;
            ZonesRow town = data.Zones.Rows.First(zone => zone.Kind == ZoneKind.Town);
            _respawn = (Meters(town.RespawnX), Meters(town.RespawnZ));
            _outlawRespawn = (Meters(town.OutlawRespawnX), Meters(town.OutlawRespawnZ));
        }

        public static bool IsOutlaw(Player player)
        {
            return player.Karma < 0;
        }

        /// <summary>
        /// 일반 플레이어(선공 표시가 없고 무법자가 아님). 경비병이 쫓지 않고, 죽이면 성향이 내려가며, 치면 선공 표시가 붙는 대상이다.
        /// </summary>
        public static bool IsNormal(Player player)
        {
            return (player.AggressorEndTick == 0) && !IsOutlaw(player);
        }

        /// <summary>
        /// 이름 색: 무법자면 빨간색(선공 표시가 함께 있어도), 아니고 선공 표시가 있으면 보라색, 아니면 흰색.
        /// </summary>
        public static NameColor ColorOf(Player player)
        {
            return IsOutlaw(player) ? NameColor.Outlaw : player.AggressorEndTick != 0 ? NameColor.Aggressor : NameColor.Normal;
        }

        /// <summary>
        /// 부활(25), 귀환(32), 죽은 채 빠진 캐릭터가 들어올 때(38)의 자리. 무법자는 무법자의 부활 지점이다.
        /// </summary>
        public (int X, int Z) Respawn(int karma)
        {
            return karma < 0 ? _outlawRespawn : _respawn;
        }

        /// <summary>
        /// 플레이어가 플레이어를 칠 수 있는가: 둘 다 PK 레벨 이상이고 같은 파티가 아니어야 한다. 대상이 일반 플레이어면 둘 다 안전 지대 밖이어야 하고,
        /// 대상이 선공 표시가 있거나 무법자면 안전 지대와 상관없다.
        /// </summary>
        public FailReason PlayerFailure(Player attacker, Player target, (int X, int Z)? at = null)
        {
            if ((attacker == target) || (target.Dead))
            {
                return FailReason.InvalidTarget;
            }

            if ((attacker.Level < _minLevel) || (target.Level < _minLevel))
            {
                return FailReason.PkLevelTooLow;
            }

            if (PartySystem.SameParty(attacker, target))
            {
                return FailReason.PartyMember;
            }

            // 대상의 자리는 맞는 개체의 자리다(소환수면 소환수의 자리. 95).
            (int x, int z) = at ?? (target.X, target.Z);
            if (IsNormal(target) && (_field.IsSafe(attacker.X, attacker.Z) || _field.IsSafe(x, z)))
            {
                return FailReason.InvalidTarget;
            }

            return FailReason.None;
        }

        /// <summary>
        /// 공격을 시작했다(기본 공격의 AttackSwing, 단일 대상 스킬의 SkillUsed와 시전의 시작, 범위·직선 스킬이 맞은 틱): 대상이 일반 플레이어면
        /// 공격자의 선공 표시를 지금부터 새로 센다. 끝을 예약하고(끝나는 틱이 바뀐 옛 예약은 꺼낼 때 버림), 이름 색이 바뀌면 EntityState가 간다.
        /// 끝나는 틱이 바뀌었으므로 이 틱의 VitalsSystem이 본인에게 SelfVitals를 보낸다.
        /// </summary>
        public void Attacked(Creature attacker, Creature target, uint tick)
        {
            // 소환수가 치거나 맞으면 주인으로 본다(95).
            if ((Responsible(attacker) is not Player player) || (Responsible(target) is not Player victim) || (player == victim) || !IsNormal(victim))
            {
                return;
            }

            player.AggressorEndTick = tick + _aggressorTicks;
            _scheduler.Add(player.AggressorEndTick, ScheduledKind.AggressorEnd, player.Id, player.AggressorEndTick, 0);
            Refresh(player);
        }

        /// <summary>
        /// 선공 표시의 끝의 예약이 아직 그 표시의 것인가(그 플레이어가 있고 끝나는 틱이 그대로).
        /// </summary>
        public static bool IsAggressorEndCurrent(EntityTable entities, in ScheduledJob job)
        {
            return (entities.Find(job.Owner) is Player player) && (player.AggressorEndTick == job.A) && (job.A != 0);
        }

        public void EndAggressor(Player player)
        {
            player.AggressorEndTick = 0;
            Refresh(player);
        }

        /// <summary>
        /// 죽인 타격(죽는 순간, 선공 표시를 떼기 전): 죽은 쪽이 일반 플레이어이고 죽인 쪽이 플레이어면 그 한 명의 성향을 내린다(경비병과 몬스터가 죽인 것은 바뀌지 않음).
        /// </summary>
        public void Killed(Creature dead, Creature killer)
        {
            if ((dead is Player victim) && (Responsible(killer) is Player player) && (player != victim) && IsNormal(victim))
            {
                SetKarma(player, player.Karma - _killPenalty);
            }
        }

        /// <summary>
        /// 몬스터의 경험치를 받았다(31, 42): 성향을 올리되 0을 넘지 않는다.
        /// </summary>
        public void Rewarded(Player player)
        {
            if (player.Karma < 0)
            {
                SetKarma(player, System.Math.Min(0, player.Karma + _monsterGain));
            }
        }

        /// <summary>
        /// 죽었다(죽은 차례): 선공 표시를 뗀다. 성향은 남는다.
        /// </summary>
        public void Died(Player player)
        {
            if (player.AggressorEndTick != 0)
            {
                EndAggressor(player);
            }
        }

        /// <summary>
        /// 성향을 바꾼다: 5초 바뀜 표시를 세우고(38) 본인에게 Karma를 보내며, 이름 색이 바뀌면 EntityState가 간다. 같으면 아무것도 하지 않는다.
        /// </summary>
        public void SetKarma(Player player, int karma)
        {
            if (karma == player.Karma)
            {
                return;
            }

            player.Karma = karma;
            player.DirtyFast = true;
            player.Session.Send(new Packet { Karma = new Karma { Karma_ = karma } });
            Refresh(player);
        }

        /// <summary>
        /// 월드에 들어왔다(EnterWorldResult 뒤): 이름 색을 맞추고 성향을 보낸다.
        /// </summary>
        public void Entered(Player player)
        {
            Refresh(player);
            player.Session.Send(new Packet { Karma = new Karma { Karma_ = player.Karma } });
        }

        /// <summary>
        /// 책임지는 플레이어(95): 플레이어면 자기, 소환수면 주인, 아니면 null.
        /// </summary>
        public static Player? Responsible(Creature creature)
        {
            return creature as Player ?? (creature as Summon)?.Owner;
        }

        private static void Refresh(Player player)
        {
            player.SetDisplayState(player.Level, ColorOf(player), player.WeaponItemId);
        }

        private static int Meters(int meters)
        {
            return meters * Units.PerMeter;
        }
    }
}
