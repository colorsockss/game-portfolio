using System;
using System.Globalization;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 개발 명령(68). --dev로 띄운 서버만 DevCommand를 실행한다. 명령마다 평소의 시스템 함수를 불러 평소와 같은 패킷이 나간다.
    /// 지금의 명령은 순간 이동("tp x z", m), 몬스터 부르기("spawn 몬스터번호 [x z]", m), 레벨 주기("level n". 경험치는 0)이고, 아이템·골드·성향은 32, 44가 더한다.
    /// </summary>
    internal sealed class DevSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly MovementSystem _movement;
        private readonly ProgressSystem _progress;
        private readonly SpawnSystem _spawn;
        private readonly GrowthSystem _growth;

        public DevSystem(GameData data, FieldMap field, EntityTable entities, Grid grid, MovementSystem movement, ProgressSystem progress, SpawnSystem spawn, GrowthSystem growth)
        {
            _data = data;
            _field = field;
            _entities = entities;
            _grid = grid;
            _movement = movement;
            _progress = progress;
            _spawn = spawn;
            _growth = growth;
        }

        /// <summary>
        /// 명령 한 줄을 실행한다. 모르는 명령과 값이 맞지 않는 명령은 "쓸 수 없는 명령", 막힌 칸이나 필드 밖은 "막힘"으로 실패한다.
        /// </summary>
        public Outcome Run(Player player, string line)
        {
            string[] words = line.TrimStart('/').Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length == 0)
            {
                return Outcome.Fail(FailReason.InvalidCommand);
            }

            switch (words[0].ToLowerInvariant())
            {
                case "tp" when (words.Length == 3) && TryMeters(words[1], out int x) && TryMeters(words[2], out int z):
                    return Teleport(player, x, z);
                case "spawn" when ((words.Length == 2) || (words.Length == 4)) && uint.TryParse(words[1], NumberStyles.None, CultureInfo.InvariantCulture, out uint monsterId):
                    int spawnX = player.X;
                    int spawnZ = player.Z;
                    if ((words.Length == 4) && !(TryMeters(words[2], out spawnX) && TryMeters(words[3], out spawnZ)))
                    {
                        return Outcome.Fail(FailReason.InvalidCommand);
                    }

                    return Spawn(monsterId, spawnX, spawnZ);
                case "level" when (words.Length == 2) && uint.TryParse(words[1], NumberStyles.None, CultureInfo.InvariantCulture, out uint level)
                    && (level >= 1) && (level <= _growth.MaxLevel(player.Class)):
                    // 평소의 레벨 업처럼 능력치를 다시 구하고 EntityState를 보낸다. 경험치는 새 레벨의 0으로 둔다.
                    player.Exp = 0;
                    _growth.SetLevel(player, level);
                    player.Session.Send(new Packet { ExpGained = new ExpGained { Exp = 0 } });
                    return Outcome.Done;
                default:
                    return Outcome.Fail(FailReason.InvalidCommand);
            }
        }

        /// <summary>
        /// 순간 이동: 걸을 수 있는 칸이면 옮기고, 보는 쪽에는 순간 이동 표시가 있는 움직임을, 본인에게는 PositionReset을 보낸다(부활과 같은 방식).
        /// 진행 중인 일은 자리를 벗어난 것으로 취소된다.
        /// </summary>
        private Outcome Teleport(Player player, int x, int z)
        {
            if (!_field.Contains(x, z) || !_field.CanWalk(x, z, Walker.Player))
            {
                return Outcome.Fail(FailReason.Blocked);
            }

            player.X = x;
            player.Z = z;
            player.Moved = true;
            player.Teleported = true;
            player.Dirty = true;
            player.MoveBudget = 0;
            _grid.Moved(player);
            _movement.Reset(player);
            _progress.Moved(player);
            return Outcome.Done;
        }

        /// <summary>
        /// 몬스터 부르기: 부른 자리가 놓인 점인 몬스터 하나를 놓는다(배회하지 않고, 죽으면 다시 나오지 않음).
        /// </summary>
        private Outcome Spawn(uint monsterId, int x, int z)
        {
            if (_data.FindMonster(monsterId) is not MonstersRow template)
            {
                return Outcome.Fail(FailReason.InvalidCommand);
            }

            if (!_field.Contains(x, z) || !_field.CanWalk(x, z, Walker.Monster))
            {
                return Outcome.Fail(FailReason.Blocked);
            }

            var spawn = new SpawnsRow { X = x / Units.PerMeter, Z = z / Units.PerMeter, MonsterId = monsterId, Count = 1 };
            _spawn.Respawn(new PlacedPoint(_entities.NextSummonId(), x, z, spawn, template, summoned: true));
            return Outcome.Done;
        }

        /// <summary>
        /// m(소수 가능) → 좌표(1/32 m, 반올림). 패킷의 한도를 넘으면 false다.
        /// </summary>
        private static bool TryMeters(string text, out int units)
        {
            units = 0;
            if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out double meters) || (Math.Abs(meters) > Units.MapHalfExtent / Units.PerMeter))
            {
                return false;
            }

            units = (int)Math.Round(meters * Units.PerMeter);
            return true;
        }
    }
}
