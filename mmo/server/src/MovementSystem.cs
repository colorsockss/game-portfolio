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
        private readonly FieldMap _field;
        private readonly uint _stopTicks;

        /// <param name="stopTicks">걷는 중인 플레이어에게서 Move가 이만큼 오지 않으면 멈춘 것으로 보는 틱 수(54. Constants.moveStopMs).</param>
        public MovementSystem(EntityTable entities, Grid grid, FieldMap field, uint stopTicks)
        {
            _entities = entities;
            _grid = grid;
            _field = field;
            _stopTicks = stopTicks;
        }

        /// <summary>
        /// Move를 검증하고 받아들인다. 필드 밖(격자 밖)이거나, 쌓인 이동 거리보다 멀거나, 지난 위치에서 곧게 걸을 수 없으면(벽) 되돌린다.
        /// 서버는 캐릭터를 점으로 본다. 패킷이 잘못되었으면(yaw) false다. 받아들인 Move는 걷는 중인지를 정한다(54): 움직이는 중 표시가 켜졌고
        /// 바로 앞의 Move와 다른 자리면 걷고, 아니면(표시가 꺼짐, 막혀 같은 자리) 선다.
        /// </summary>
        public Outcome Move(Player player, Move move)
        {
            if (move.Yaw >= Units.YawSteps)
            {
                return Outcome.Malformed;
            }

            // 되돌림을 받기 전에 보낸 Move다.
            if (move.Ack != player.Ack)
            {
                return Outcome.Done;
            }

            long deltaX = (long)move.X - player.X;
            long deltaZ = (long)move.Z - player.Z;
            double distance = Math.Sqrt((deltaX * deltaX) + (deltaZ * deltaZ));
            // 선 검사는 좌표가 필드 안이고 거리가 짧은 것을 본 뒤에 한다(패킷의 아무 좌표로 긴 선을 세지 않게).
            // 죽은 동안과 기절한 동안의 Move는 모두 되돌린다(25, 26).
            if (player.Dead || player.Stunned || !_field.Contains(move.X, move.Z) || (distance > player.MoveBudget)
                || !_field.CanWalkLine(player.X, player.Z, move.X, move.Z, Walker.Player))
            {
                return Outcome.Reset;
            }

            player.MoveBudget -= distance;
            player.Walking = move.Moving && (distance > 0);
            player.TicksSinceMove = 0;
            player.X = move.X;
            player.Z = move.Z;
            player.Yaw = move.Yaw;
            player.DirtySlow = true;
            _grid.Moved(player);
            return Outcome.Done;
        }

        /// <summary>
        /// 순간 이동(부활 25, 개발 명령 68, 귀환 32): 자리를 바꾸고, 보는 쪽에는 순간 이동 표시가 있는 움직임이, 본인에게는 PositionReset이 간다.
        /// 걸을 수 있는 칸인지는 부르는 쪽이 본다.
        /// </summary>
        public void Teleport(Player player, int x, int z)
        {
            player.X = x;
            player.Z = z;
            player.Teleported = true;
            player.DirtySlow = true;
            player.MoveBudget = 0;
            _grid.Moved(player);
            Reset(player);
        }

        /// <summary>
        /// 플레이어를 서버의 지금 자리로 되돌린다: ack를 올리고 PositionReset을 보낸다. 그 ack를 실은 Move만 다시 받는다.
        /// 서버가 세운 것이라 보는 쪽에는 그 틱에 멈춤이 간다(54).
        /// </summary>
        public void Reset(Player player)
        {
            player.Walking = false;
            player.Ack++;
            player.Session.Send(new Packet
            {
                PositionReset = new PositionReset { X = player.X, Z = player.Z, Ack = player.Ack },
            });
        }

        /// <summary>
        /// 다음 틱까지 지날 틱 수만큼 이동 거리를 채운다. 감속(26)은 차오르는 거리와 쌓아 둘 수 있는 거리를 그 비율만큼 줄인다.
        /// Move가 오지 않은 틱을 세어 그 수가 멈춤의 틱 수에 이르면 걷는 중을 끈다(54. 다음 틱의 시야 차례가 멈춤을 알림).
        /// </summary>
        public void Step(uint elapsedTicks)
        {
            foreach (Player player in _entities.Players)
            {
                double speed = (100 - player.SlowPercent) / 100.0;
                player.MoveBudget = Math.Min(player.MoveBudget + (BudgetPerTick * speed * elapsedTicks), MaxBudget * speed);
                player.TicksSinceMove = Math.Min(player.TicksSinceMove + elapsedTicks, _stopTicks);
                if (player.TicksSinceMove == _stopTicks)
                {
                    player.Walking = false;
                }
            }
        }
    }
}
