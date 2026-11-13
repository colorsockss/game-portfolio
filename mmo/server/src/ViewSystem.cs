using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 시야. 보는 쪽은 플레이어이고 보이는 쪽은 모든 개체다. 플레이어마다 둘레 3×3칸의 개체를 지난 틱과 비교해 나간 것·들어온 것·
    /// 움직인 것과 표시 상태가 바뀐 것을 보낸다.
    /// </summary>
    internal sealed class ViewSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;

        public ViewSystem(EntityTable entities, Grid grid)
        {
            _entities = entities;
            _grid = grid;
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
        /// 모두에게 이번 틱의 시야를 보내고, 움직임과 표시 상태의 표시를 내린다.
        /// </summary>
        public void Step(uint tick)
        {
            foreach (Player observer in _entities.Players)
            {
                SendView(observer, tick);
            }

            foreach (Entity entity in _entities.All)
            {
                entity.Moved = false;
                entity.Teleported = false;
                entity.MoveMessage = null;
                entity.StateChanged = false;
            }
        }

        private void SendView(Player observer, uint tick)
        {
            HashSet<Entity> visible = observer.NextVisible;
            visible.Clear();
            _grid.CollectAround(observer.Cell, visible);
            visible.Remove(observer);

            EntitiesLeave? leave = null;
            foreach (Entity other in observer.Visible)
            {
                if (!visible.Contains(other))
                {
                    leave ??= new EntitiesLeave();
                    leave.Ids.Add(other.Id);
                }
            }

            EntitiesEnter? enter = null;
            EntityMoves? moves = null;
            List<Entity>? changed = null;
            if (observer.JustEntered)
            {
                // 처음 받는 EntityEnter가 지금 표시 상태를 실으므로 이 틱의 EntityState는 보내지 않는다.
                enter = new EntitiesEnter { Entities = { observer.EnterMessage() } };
                observer.JustEntered = false;
            }
            else if (observer.StateChanged)
            {
                (changed ??= new List<Entity>()).Add(observer);
            }

            foreach (Entity other in visible)
            {
                if (!observer.Visible.Contains(other))
                {
                    enter ??= new EntitiesEnter();
                    enter.Entities.Add(other.EnterMessage());
                    continue;
                }

                if (other.Moved)
                {
                    moves ??= new EntityMoves { Tick = tick };
                    other.MoveMessage ??= new EntityMove { Id = other.Id, X = other.X, Z = other.Z, Yaw = other.Yaw, Teleport = other.Teleported };
                    moves.Entities.Add(other.MoveMessage);
                }

                if (other.StateChanged)
                {
                    (changed ??= new List<Entity>()).Add(other);
                }
            }

            if (leave != null)
            {
                observer.Session.Send(new Packet { EntitiesLeave = leave });
            }

            if (enter != null)
            {
                observer.Session.Send(new Packet { EntitiesEnter = enter });
            }

            if (moves != null)
            {
                observer.Session.Send(new Packet { EntityMoves = moves });
            }

            if (changed != null)
            {
                foreach (Entity entity in changed)
                {
                    observer.Session.Send(new Packet { EntityState = entity.StateMessage() });
                }
            }

            observer.NextVisible = observer.Visible;
            observer.Visible = visible;
        }
    }
}
