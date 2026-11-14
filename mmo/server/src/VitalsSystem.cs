using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 회복과 체력·마나의 알림(틱의 다섯째 차례, 회복과 효과). 1초마다 살아 있는 플레이어를 채우고, 피해가 아닌 까닭으로 체력이 바뀐 개체를
    /// 그 개체를 받은 연결에 EntityVitals 하나로 모아 보낸다. 틱마다 본인의 SelfStats(다시 구했으면)와 SelfVitals(바뀌었으면)를 보낸다.
    /// </summary>
    internal sealed class VitalsSystem
    {
        private readonly EntityTable _entities;
        private readonly uint _regenPercent;
        private readonly uint _combatRegenPercent;

        /// <summary>
        /// 1초마다. 틱이 밀려도 한 번만 채우고 위상을 지킨다.
        /// </summary>
        private readonly Periodic _second = new Periodic(Units.TicksPerSecond, Units.TicksPerSecond);

        private readonly List<EntityVital> _changed = new List<EntityVital>();
        private readonly List<Creature> _changedCreatures = new List<Creature>();

        public VitalsSystem(EntityTable entities, GameData data)
        {
            _entities = entities;
            _regenPercent = data.Constants.RegenPercent;
            _combatRegenPercent = data.Constants.CombatRegenPercent;
        }

        public void Step(uint tick)
        {
            if (_second.Due(tick))
            {
                Regenerate(tick);
                SendEntityVitals();
            }

            foreach (Player player in _entities.Players)
            {
                SendSelf(player);
            }
        }

        /// <summary>
        /// 살아 있는 플레이어의 체력과 마나를 최대값의 비율만큼 채운다(전투 상태가 아니면 regenPercent, 전투 상태면 combatRegenPercent).
        /// 몬스터는 자연 회복이 없다(복귀 중의 회복은 23).
        /// </summary>
        private void Regenerate(uint tick)
        {
            foreach (Player player in _entities.Players)
            {
                if (player.Dead)
                {
                    continue;
                }

                ulong percent = player.InCombat(tick) ? _combatRegenPercent : _regenPercent;
                player.Restore((uint)(player.MaxHp * percent / 100), (uint)(player.MaxMp * percent / 100));
            }
        }

        /// <summary>
        /// 체력이 바뀐 개체를 지난 틱의 시야(Visible)에 그 개체가 든 연결마다 EntityVitals 하나로 보내고 표시를 내린다.
        /// 본인에게는 SelfVitals가 가므로 자기 개체는 Visible에 없다. 시야에 새로 드는 연결은 EntityEnter로 지금 체력을 받는다.
        /// </summary>
        private void SendEntityVitals()
        {
            _changed.Clear();
            _changedCreatures.Clear();
            foreach (Entity entity in _entities.All)
            {
                if (entity is Creature { VitalsChanged: true } creature)
                {
                    creature.VitalsChanged = false;
                    _changedCreatures.Add(creature);
                    _changed.Add(new EntityVital { Id = creature.Id, Hp = creature.Hp, MaxHp = creature.MaxHp });
                }
            }

            if (_changed.Count == 0)
            {
                return;
            }

            foreach (Player observer in _entities.Players)
            {
                EntityVitals? vitals = null;
                for (int i = 0; i < _changedCreatures.Count; i++)
                {
                    if (observer.Visible.Contains(_changedCreatures[i]))
                    {
                        (vitals ??= new EntityVitals()).Entities.Add(_changed[i]);
                    }
                }

                if (vitals != null)
                {
                    observer.Session.Send(new Packet { EntityVitals = vitals });
                }
            }
        }

        /// <summary>
        /// 다시 구한 능력치와, 마지막으로 보낸 것과 다른 체력·마나·전투 상태가 끝나는 틱을 본인에게 보낸다. 월드에 들어온 틱에는 둘 다 간다(EnterWorldResult 뒤).
        /// </summary>
        private static void SendSelf(Player player)
        {
            if (player.StatsChanged)
            {
                player.StatsChanged = false;
                Stats stats = player.Stats;
                player.Session.Send(new Packet
                {
                    SelfStats = new SelfStats { MaxHp = stats.MaxHp, MaxMp = stats.MaxMp, Attack = stats.Attack, Defense = stats.Defense },
                });
            }

            SelfVitals? sent = player.SentVitals;
            if ((sent != null) && (sent.Hp == player.Hp) && (sent.Mp == player.Mp) && (sent.CombatEndTick == player.CombatEndTick))
            {
                return;
            }

            // 체력과 마나가 바뀌면 60초 표시를 세운다(38. 전투 상태만 바뀐 것은 저장하지 않지만 함께 세워도 사본은 같음).
            player.DirtySlow = true;
            var vitals = new SelfVitals { Hp = player.Hp, Mp = player.Mp, CombatEndTick = player.CombatEndTick };
            player.SentVitals = vitals;
            player.Session.Send(new Packet { SelfVitals = vitals });
        }
    }
}
