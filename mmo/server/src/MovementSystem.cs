using System;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 이동 검증. 플레이어마다 틱이 지난 만큼 이동 거리가 차오르고, 받아들인 Move가 그 거리를 쓴다.
    /// </summary>
    internal sealed class MovementSystem
    {
        /// <summary>
        /// 틱마다 차오르는 이동 거리(칸). 클라이언트 시계가 조금 빨라도 거절하지 않게 10% 여유를 둔다.
        /// </summary>
        private const double BudgetPerTick = Units.MaxSpeedMetersPerSecond * 1.1 * Units.PerMeter / Units.TicksPerSecond;

        /// <summary>
        /// 쌓아 둘 수 있는 이동 거리(칸). TCP가 1초까지 몰아서 전한 Move를 받아 준다.
        /// </summary>
        private const double MaxBudget = BudgetPerTick * Units.TicksPerSecond;

        private readonly EntityTable _entities;
        private readonly Grid _grid;

        public MovementSystem(EntityTable entities, Grid grid)
        {
            _entities = entities;
            _grid = grid;
        }

        /// <summary>
        /// Move를 검증하고 받아들인다. 맵 밖이거나 쌓인 이동 거리보다 멀면 되돌린다. 패킷이 잘못되었으면(yaw) false다.
        /// </summary>
        public bool Move(Player player, Move move)
        {
            if (move.Yaw >= Units.YawSteps)
            {
                return false;
            }

            // 되돌림을 받기 전에 보낸 Move다.
            if (move.Ack != player.Ack)
            {
                return true;
            }

            long deltaX = (long)move.X - player.X;
            long deltaZ = (long)move.Z - player.Z;
            double distance = Math.Sqrt((deltaX * deltaX) + (deltaZ * deltaZ));
            if (!InsideMap(move.X) || !InsideMap(move.Z) || (distance > player.MoveBudget))
            {
                player.Ack++;
                player.Session.Send(new Packet
                {
                    PositionReset = new PositionReset { X = player.X, Z = player.Z, Ack = player.Ack },
                });
                return true;
            }

            player.MoveBudget -= distance;
            player.X = move.X;
            player.Z = move.Z;
            player.Yaw = move.Yaw;
            player.Moved = true;
            player.Dirty = true;
            _grid.Moved(player);
            return true;
        }

        /// <summary>
        /// 다음 틱까지 지날 틱 수만큼 이동 거리를 채운다.
        /// </summary>
        public void Step(uint elapsedTicks)
        {
            foreach (Player player in _entities.Players)
            {
                player.MoveBudget = Math.Min(player.MoveBudget + (BudgetPerTick * elapsedTicks), MaxBudget);
            }
        }

        /// <summary>
        /// 좌표 하나가 맵 안이다.
        /// </summary>
        private static bool InsideMap(int coordinate)
        {
            return Math.Abs((long)coordinate) <= Units.MapHalfExtent;
        }
    }
}
