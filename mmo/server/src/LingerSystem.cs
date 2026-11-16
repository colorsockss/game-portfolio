using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드에 남는 캐릭터(46). 연결이 캐릭터에서 떨어질 때 전투 상태이거나 선공 표시(44)가 있으면 캐릭터를 빼지 않고 연결만 뗀다(보내는 것을 버리는 떼어진 세션을 붙임).
    /// 남은 캐릭터는 다른 연결에 그대로 보이고 맞고 몬스터의 대상으로 남으며, 전투 상태와 선공 표시가 끝나면(죽으면 다음 틱에) 사본을 넣고 빠진다.
    /// 같은 캐릭터로 다시 들어오면 메모리의 개체에 연결을 붙여 넘겨받는다.
    /// </summary>
    internal sealed class LingerSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly Scheduler _scheduler;
        private readonly ProgressSystem _progress;
        private readonly SaveSystem _save;

        /// <summary>
        /// 남아 있는 캐릭터(저장소의 캐릭터 번호 → 개체).
        /// </summary>
        private readonly Dictionary<long, Player> _lingering = new Dictionary<long, Player>();

        public LingerSystem(EntityTable entities, Grid grid, Scheduler scheduler, ProgressSystem progress, SaveSystem save)
        {
            _entities = entities;
            _grid = grid;
            _scheduler = scheduler;
            _progress = progress;
            _save = save;
        }

        /// <summary>
        /// 남아 있는 캐릭터 수(테스트가 봄).
        /// </summary>
        public int Count => _lingering.Count;

        public Player? Find(long characterId)
        {
            return _lingering.GetValueOrDefault(characterId);
        }

        /// <summary>
        /// 그 계정의 캐릭터가 남아 있는가(같은 계정의 다른 캐릭터는 들어가지 못함).
        /// </summary>
        public bool HasAccount(string loginId)
        {
            return _lingering.Values.Any(player => player.LoginId == loginId);
        }

        /// <summary>
        /// 연결이 떨어진다(파티에서 뺀 뒤): 살아 있고 전투 상태이거나 선공 표시가 있으면 연결을 떼어 남기고 true다. 진행 중인 일을 취소하고 기본 공격을 멈추며
        /// (이미 시작한 타격은 맞음), 전투 상태와 선공 표시가 끝나는 틱 가운데 늦은 쪽에 빼기를 예약한다. 아니면 false다(부르는 쪽이 지금 뺌).
        /// </summary>
        public bool TryStay(Player player, uint tick)
        {
            if (player.Dead || (!player.InCombat(tick) && (player.AggressorEndTick == 0)))
            {
                return false;
            }

            player.Session = Session.Detached();
            _progress.Cancel(player, FailReason.Cancelled);
            player.AttackTarget = 0;
            _lingering[player.CharacterId] = player;
            player.LingerGeneration = _scheduler.NewGeneration();
            Schedule(player, EndTick(player));
            return true;
        }

        /// <summary>
        /// 남아 있던 캐릭터가 죽었다(죽은 차례): 죽는 틱의 사건이 받은 연결에 나간 뒤에 EntitiesLeave가 가도록 다음 틱에 뺀다.
        /// </summary>
        public void Died(Player player, uint tick)
        {
            if (_lingering.ContainsKey(player.CharacterId))
            {
                Schedule(player, tick + 1);
            }
        }

        /// <summary>
        /// 빼기의 예약이 아직 그 남김의 것인가(그 사이에 넘겨받지 않음).
        /// </summary>
        public bool IsEndCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Player player) && player.Session.IsDetached && (player.LingerGeneration == job.Generation);
        }

        /// <summary>
        /// 빼기의 예약을 꺼냈다: 죽었거나 전투 상태와 선공 표시가 다 끝났으면 사본을 넣고 빼고, 그 사이에 늦춰졌으면 새 틱으로 다시 예약한다.
        /// </summary>
        public void End(in ScheduledJob job, uint tick)
        {
            var player = (Player)_entities.Find(job.Owner)!;
            uint end = EndTick(player);
            if (!player.Dead && (end > tick))
            {
                Schedule(player, end);
                return;
            }

            _lingering.Remove(player.CharacterId);
            _entities.Remove(player);
            _grid.Remove(player);
            _save.SaveNow(player);
        }

        /// <summary>
        /// 넘겨받기: 남아 있던 개체에 연결을 붙인다. 개체 번호, 체력, 쿨다운, 효과, 선공 표시는 메모리의 것 그대로이고, 내 개체와 주변 개체와 내 상태는
        /// 다음 시야·회복 차례가 처음 들어올 때처럼 다시 보낸다. 예약된 빼기는 세대 번호가 바뀌어 버려진다.
        /// </summary>
        public void TakeOver(Player player, Session session)
        {
            _lingering.Remove(player.CharacterId);
            player.LingerGeneration = 0;
            player.Session = session;
            session.Player = player;
            player.Ack = 0;
            player.Visible = new HashSet<Entity>();
            player.NextVisible = new HashSet<Entity>();
            player.JustEntered = true;
            player.SentVitals = null;
            player.StatsChanged = true;
        }

        private static uint EndTick(Player player)
        {
            return Math.Max(player.CombatEndTick, player.AggressorEndTick);
        }

        private void Schedule(Player player, uint due)
        {
            _scheduler.Add(due, ScheduledKind.LingerEnd, player.Id, 0, 0, player.LingerGeneration);
        }
    }
}
