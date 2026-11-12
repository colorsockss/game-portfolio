using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 시야. 플레이어마다 둘레 3×3칸의 개체를 지난 틱과 비교해 나간 것·들어온 것·움직인 것을 보낸다.
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
        /// 모두에게 이번 틱의 시야를 보내고, 움직임 표시를 지운다.
        /// </summary>
        public void Step(uint tick)
        {
            foreach (Player observer in _entities.Players)
            {
                SendView(observer, tick);
            }

            foreach (Player player in _entities.Players)
            {
                player.Moved = false;
                player.MoveMessage = null;
            }
        }

        private void SendView(Player observer, uint tick)
        {
            HashSet<Player> visible = observer.NextVisible;
            visible.Clear();
            _grid.CollectAround(observer.Cell, visible);
            visible.Remove(observer);

            EntitiesLeave? leave = null;
            foreach (Player other in observer.Visible)
            {
                if (!visible.Contains(other))
                {
                    leave ??= new EntitiesLeave();
                    leave.Ids.Add(other.Id);
                }
            }

            EntitiesEnter? enter = null;
            EntityMoves? moves = null;
            if (observer.JustEntered)
            {
                enter = new EntitiesEnter { Entities = { EnterOf(observer) } };
                observer.JustEntered = false;
            }

            foreach (Player other in visible)
            {
                if (!observer.Visible.Contains(other))
                {
                    enter ??= new EntitiesEnter();
                    enter.Entities.Add(EnterOf(other));
                }
                else if (other.Moved)
                {
                    moves ??= new EntityMoves { Tick = tick };
                    other.MoveMessage ??= new EntityMove { Id = other.Id, X = other.X, Z = other.Z, Yaw = other.Yaw };
                    moves.Entities.Add(other.MoveMessage);
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

            observer.NextVisible = observer.Visible;
            observer.Visible = visible;
        }

        /// <summary>
        /// 시야에 들어온 개체를 알리는 원소.
        /// </summary>
        private static EntityEnter EnterOf(Player player)
        {
            return new EntityEnter
            {
                Id = player.Id, X = player.X, Z = player.Z, Yaw = player.Yaw, Name = player.Name, CharacterClass = player.Class,
            };
        }
    }
}
