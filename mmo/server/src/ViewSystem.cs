using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 시야(52). 보는 쪽은 플레이어이고 보이는 쪽은 모든 개체다. 연결이 받은 개체(Player.Visible)와 개체를 받은 연결(Entity.Watchers)을 함께 고친다.
    /// 시야 칸을 옮기지 않은 플레이어는 둘레 3×3 시야 칸에서 이 틱에 들고 난 개체(Grid의 목록)만 보고, 칸을 옮겼거나 막 들어온 플레이어만 둘레를 통째로 다시 본다.
    /// 소환수(95)는 시야 칸으로 찾지 않고 주인에 딸려 들고 난다(내 소환수는 늘). 3×3칸을 벗어난 개체는 바깥 테두리에서 여유(78)를 넘게 멀어져야 나간다. 움직임과 표시 상태는 개체마다 받은 연결의 목록으로 모아, 연결마다
    /// 나간 것 → 들어온 것 → 움직임 → 표시 상태의 차례로 보낸다.
    /// </summary>
    internal sealed class ViewSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly List<Entity> _touched = new List<Entity>();
        private readonly List<Entity> _leaving = new List<Entity>();
        private readonly List<Entity> _moving = new List<Entity>();
        private readonly List<Entity> _stateChanged = new List<Entity>();
        private readonly List<Summon> _summonsNow = new List<Summon>();
        private HashSet<Summon> _summons = new HashSet<Summon>();
        private HashSet<Summon> _summonsNext = new HashSet<Summon>();
        private HashSet<Player> _observers = new HashSet<Player>();
        private HashSet<Player> _observersNext = new HashSet<Player>();
        private readonly List<Summon> _deferred = new List<Summon>();
        private readonly long _marginSquared;

        /// <param name="marginMeters">시야 경계의 여유(m, 78). 0이면 3×3칸을 벗어나는 틱에 나간다.</param>
        public ViewSystem(EntityTable entities, Grid grid, double marginMeters = 0)
        {
            _entities = entities;
            _grid = grid;
            long margin = (long)System.Math.Round(marginMeters * Units.PerMeter);
            _marginSquared = margin * margin;
        }

        /// <summary>
        /// 지난 Step에서 플레이어 하나에게 보인 개체 수의 평균. 부하 측정에 쓴다.
        /// </summary>
        public double AverageVisible
        {
            get
            {
                long total = 0;
                foreach (Player player in _entities.Players)
                {
                    total += player.Visible.Count;
                }

                return _entities.PlayerCount == 0 ? 0 : (double)total / _entities.PlayerCount;
            }
        }

        /// <summary>
        /// 모두에게 이번 틱의 시야를 보내고, 움직임과 표시 상태의 표시와 시야 칸의 들고 난 목록을 내린다.
        /// </summary>
        public void Step(uint tick)
        {
            ForgetDeparted();
            Collect();
            foreach (Player observer in _entities.Players)
            {
                if (observer.JustEntered || (observer.Cell != observer.ViewCell))
                {
                    Rebuild(observer);
                }
                else
                {
                    Update(observer);
                }

                CheckMargin(observer);
                observer.ViewCell = observer.Cell;
            }

            SyncSummons();
            foreach (Entity entity in _moving)
            {
                if (!entity.Moved)
                {
                    continue;
                }

                entity.MoveMessage ??= new EntityMove { Id = entity.Id, X = entity.X, Z = entity.Z, Yaw = entity.Yaw, Teleport = entity.Teleported };
                foreach (Player watcher in entity.Watchers)
                {
                    if (!watcher.ViewEntered.Contains(entity))
                    {
                        (watcher.ViewMoves ??= new EntityMoves { Tick = tick }).Entities.Add(entity.MoveMessage);
                    }
                }
            }

            foreach (Entity entity in _stateChanged)
            {
                foreach (Player watcher in entity.Watchers)
                {
                    if (!watcher.ViewEntered.Contains(entity))
                    {
                        (watcher.ViewChanged ??= new List<Entity>()).Add(entity);
                    }
                }
            }

            foreach (Player observer in _entities.Players)
            {
                Send(observer);
            }

            foreach (Entity entity in _moving)
            {
                entity.Moved = false;
                entity.Teleported = false;
                entity.MoveMessage = null;
            }

            foreach (Entity entity in _stateChanged)
            {
                entity.StateChanged = false;
            }

            _grid.ClearTouched();
        }

        /// <summary>
        /// 지난 차례 뒤에 월드에서 빠진 플레이어를 그가 받은 개체들의 받은 연결 목록에서 뺀다(그 연결로 더 보내지 않음).
        /// </summary>
        private void ForgetDeparted()
        {
            _observersNext.Clear();
            foreach (Player player in _entities.Players)
            {
                _observersNext.Add(player);
            }

            foreach (Player player in _observers)
            {
                if (!_observersNext.Contains(player))
                {
                    foreach (Entity entity in player.Visible)
                    {
                        entity.Watchers.Remove(player);
                    }

                    player.Visible.Clear();
                    player.ViewMargin.Clear();
                    player.ViewCell = long.MinValue;
                }
            }

            (_observers, _observersNext) = (_observersNext, _observers);
        }

        /// <summary>
        /// 움직인 개체, 표시 상태가 바뀐 개체, 월드의 소환수를 한 번에 모은다.
        /// </summary>
        private void Collect()
        {
            _moving.Clear();
            _stateChanged.Clear();
            _summonsNow.Clear();
            foreach (Entity entity in _entities.All)
            {
                if (entity.Moved || entity.Teleported)
                {
                    _moving.Add(entity);
                }

                if (entity.StateChanged)
                {
                    _stateChanged.Add(entity);
                }

                if (entity is Summon summon)
                {
                    _summonsNow.Add(summon);
                }
            }
        }

        /// <summary>
        /// 둘레를 통째로 다시 본다(막 들어왔거나 시야 칸을 옮김): 지금 둘레의 개체와 그 플레이어들의 소환수, 내 소환수를 모아 받은 것과 견준다.
        /// </summary>
        private void Rebuild(Player observer)
        {
            HashSet<Entity> next = observer.NextVisible;
            next.Clear();
            _grid.CollectAround(observer.Cell, next);
            next.Remove(observer);
            next.RemoveWhere(entity => entity is Summon);
            _touched.Clear();
            foreach (Entity entity in next)
            {
                if (entity is Player { Summon: { } summon })
                {
                    _touched.Add(summon);
                }
            }

            if (observer.Summon != null)
            {
                _touched.Add(observer.Summon);
            }

            next.UnionWith(_touched);
            _leaving.Clear();
            foreach (Entity entity in observer.Visible)
            {
                if (!next.Contains(entity))
                {
                    _leaving.Add(entity);
                }
            }

            // 벗어난 개체는 여유(78) 안이면 남기고(소환수는 주인이 남으면 남음), 다시 둘레에 든 개체는 여유에서 뺀다.
            _deferred.Clear();
            foreach (Entity entity in _leaving)
            {
                if (entity is Summon summon)
                {
                    _deferred.Add(summon);
                }
                else if (InWorld(entity) && WithinMargin(observer, entity))
                {
                    observer.ViewMargin.Add(entity);
                }
                else
                {
                    Leave(observer, entity);
                }
            }

            foreach (Summon summon in _deferred)
            {
                if ((summon.Owner != observer) && !observer.Visible.Contains(summon.Owner))
                {
                    Leave(observer, summon);
                }
            }

            observer.ViewMargin.ExceptWith(next);
            if (observer.JustEntered)
            {
                // 처음 받는 EntityEnter가 지금 표시 상태를 실으므로 이 틱의 EntityState는 보내지 않는다.
                observer.ViewEnter = new EntitiesEnter { Entities = { observer.EnterMessage() } };
                observer.JustEntered = false;
            }
            else if (observer.StateChanged)
            {
                (observer.ViewChanged ??= new List<Entity>()).Add(observer);
            }

            foreach (Entity entity in next)
            {
                if (!observer.Visible.Contains(entity))
                {
                    Enter(observer, entity);
                }
            }
        }

        /// <summary>
        /// 시야 칸을 옮기지 않았다: 둘레에서 이 틱에 들고 난 개체만 본다. 보여야 하는지는 월드에 있고 둘레 칸에 있는지이고, 플레이어가 들고 나면 그 소환수도 따른다.
        /// </summary>
        private void Update(Player observer)
        {
            if (observer.StateChanged)
            {
                (observer.ViewChanged ??= new List<Entity>()).Add(observer);
            }

            _touched.Clear();
            _grid.CollectTouchedAround(observer.Cell, _touched);
            foreach (Entity entity in _touched)
            {
                if ((entity == observer) || (entity is Summon))
                {
                    continue;
                }

                bool inWorld = InWorld(entity);
                bool shown = inWorld && Grid.Near(entity.Cell, observer.Cell);
                if (shown && !observer.Visible.Contains(entity))
                {
                    Enter(observer, entity);
                    if ((entity is Player { Summon: { } summon }) && !observer.Visible.Contains(summon))
                    {
                        Enter(observer, summon);
                    }
                }
                else if (shown)
                {
                    // 여유에서 되돌아왔다: 아무것도 보내지 않는다(78).
                    observer.ViewMargin.Remove(entity);
                }
                else if (observer.Visible.Contains(entity))
                {
                    if (inWorld && WithinMargin(observer, entity))
                    {
                        observer.ViewMargin.Add(entity);
                    }
                    else
                    {
                        LeaveWithSummon(observer, entity);
                    }
                }
            }
        }

        /// <summary>
        /// 새로 나온 소환수는 주인과 주인을 받은 연결이 받고, 사라진 소환수는 받은 연결 모두에서 나간다.
        /// </summary>
        private void SyncSummons()
        {
            _summonsNext.Clear();
            foreach (Summon summon in _summonsNow)
            {
                _summonsNext.Add(summon);
                if (_summons.Contains(summon))
                {
                    continue;
                }

                if (!summon.Owner.Visible.Contains(summon) && InWorld(summon.Owner))
                {
                    Enter(summon.Owner, summon);
                }

                foreach (Player watcher in summon.Owner.Watchers)
                {
                    if (!watcher.Visible.Contains(summon))
                    {
                        Enter(watcher, summon);
                    }
                }
            }

            foreach (Summon summon in _summons)
            {
                if (!_summonsNext.Contains(summon))
                {
                    _leaving.Clear();
                    foreach (Player watcher in summon.Watchers)
                    {
                        _leaving.Add(watcher);
                    }

                    foreach (Entity watcher in _leaving)
                    {
                        Leave((Player)watcher, summon);
                    }
                }
            }

            (_summons, _summonsNext) = (_summonsNext, _summons);
        }

        /// <summary>
        /// 여유(78)에 있는 개체를 본다: 월드에서 빠졌거나 3×3칸의 바깥 테두리에서 여유를 넘게 멀어졌으면 나가고, 둘레에 다시 들었으면 여유에서 뺀다.
        /// 틱마다 거리를 재는 것은 여유의 개체뿐이다.
        /// </summary>
        private void CheckMargin(Player observer)
        {
            if (observer.ViewMargin.Count == 0)
            {
                return;
            }

            _leaving.Clear();
            _leaving.AddRange(observer.ViewMargin);
            foreach (Entity entity in _leaving)
            {
                if (!InWorld(entity) || !WithinMargin(observer, entity))
                {
                    LeaveWithSummon(observer, entity);
                }
                else if (Grid.Near(entity.Cell, observer.Cell))
                {
                    observer.ViewMargin.Remove(entity);
                }
            }
        }

        private bool WithinMargin(Player observer, Entity entity)
        {
            return (_marginSquared > 0) && (Grid.DistanceSquaredOutside(observer.Cell, entity.X, entity.Z) <= _marginSquared);
        }

        /// <summary>
        /// 나가게 하고, 플레이어면 그 소환수도(내 것이 아니면) 함께 나가게 한다.
        /// </summary>
        private static void LeaveWithSummon(Player observer, Entity entity)
        {
            Leave(observer, entity);
            if ((entity is Player { Summon: { } summon }) && (summon.Owner != observer) && observer.Visible.Contains(summon))
            {
                Leave(observer, summon);
            }
        }

        private void Enter(Player observer, Entity entity)
        {
            observer.Visible.Add(entity);
            entity.Watchers.Add(observer);
            observer.ViewEntered.Add(entity);
            (observer.ViewEnter ??= new EntitiesEnter()).Entities.Add(entity.EnterMessage());
        }

        private static void Leave(Player observer, Entity entity)
        {
            observer.Visible.Remove(entity);
            observer.ViewMargin.Remove(entity);
            entity.Watchers.Remove(observer);
            (observer.ViewLeave ??= new EntitiesLeave()).Ids.Add(entity.Id);
        }

        private bool InWorld(Entity entity)
        {
            return _entities.Find(entity.Id) == entity;
        }

        private static void Send(Player observer)
        {
            if (observer.ViewLeave != null)
            {
                observer.Session.Send(new Packet { EntitiesLeave = observer.ViewLeave });
            }

            if (observer.ViewEnter != null)
            {
                observer.Session.Send(new Packet { EntitiesEnter = observer.ViewEnter });
            }

            if (observer.ViewMoves != null)
            {
                observer.Session.Send(new Packet { EntityMoves = observer.ViewMoves });
            }

            if (observer.ViewChanged != null)
            {
                foreach (Entity entity in observer.ViewChanged)
                {
                    observer.Session.Send(new Packet { EntityState = entity.StateMessage() });
                }
            }

            observer.ViewLeave = null;
            observer.ViewEnter = null;
            observer.ViewMoves = null;
            observer.ViewChanged = null;
            observer.ViewEntered.Clear();
        }
    }
}
