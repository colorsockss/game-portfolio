using System;
using System.Collections.Generic;
using Microsoft.Data.Sqlite;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 위치 저장. 나간 플레이어는 그 틱 끝에, 움직인 플레이어는 간격마다 한 트랜잭션으로 저장한다.
    /// 틱 스레드에서 동기로 쓰므로 저장과 다시 들어오기가 엇갈리지 않는다.
    /// </summary>
    internal sealed class SaveSystem
    {
        private readonly CharacterStore _store;
        private readonly EntityTable _entities;
        private readonly Periodic _periodic;

        /// <summary>
        /// 월드에서 빠졌지만 아직 위치를 저장하지 못한 플레이어. 캐릭터 번호가 키이고, 다시 들어오면 저장소보다 먼저 본다.
        /// </summary>
        private readonly Dictionary<long, Player> _unsaved = new Dictionary<long, Player>();

        public SaveSystem(CharacterStore store, EntityTable entities, uint intervalTicks)
        {
            _store = store;
            _entities = entities;
            _periodic = new Periodic(intervalTicks, intervalTicks);
        }

        /// <summary>
        /// 플레이어가 월드에서 빠졌다. 다음 Step에서 위치를 저장한다.
        /// </summary>
        public void Left(Player player)
        {
            _unsaved[player.CharacterId] = player;
        }

        /// <summary>
        /// 캐릭터가 이어 갈 위치. 아직 저장하지 못한 나간 플레이어가 있으면 그 위치, 없으면 저장소의 위치다.
        /// </summary>
        public SavedPosition PositionOf(CharacterRecord character)
        {
            return _unsaved.TryGetValue(character.Id, out Player? left) ? new SavedPosition(left.X, left.Z, left.Yaw) : character.Position;
        }

        /// <summary>
        /// 나간 플레이어와(간격이 되었으면) 움직인 플레이어를 저장한다.
        /// </summary>
        public void Step(uint tick)
        {
            bool periodic = _periodic.Due(tick);
            if (periodic || (_unsaved.Count > 0))
            {
                Save(periodic);
            }
        }

        /// <summary>
        /// 나간 플레이어와 움직인 플레이어의 위치를 지금 저장한다. 서버가 내려갈 때 부른다.
        /// </summary>
        public void SaveAll()
        {
            Save(includeOnline: true);
        }

        /// <summary>
        /// 실패하면 그대로 남겨 두고 다음 Step에서 다시 저장한다.
        /// </summary>
        private void Save(bool includeOnline)
        {
            // 나간 플레이어를 먼저 넣는다. 같은 캐릭터로 다시 들어온 플레이어의 위치가 더 새것이라 뒤에 써야 한다.
            var players = new List<Player>(_unsaved.Values);
            if (includeOnline)
            {
                foreach (Player player in _entities.Players)
                {
                    if (player.Dirty)
                    {
                        players.Add(player);
                    }
                }
            }

            if (players.Count == 0)
            {
                return;
            }

            try
            {
                _store.Save(players);
            }
            catch (SqliteException exception)
            {
                // 저장하지 못한 위치는 메모리에 남아 있으니, 틱을 멈추지 않고 다음에 다시 쓴다.
                Console.Error.WriteLine($"Saving {players.Count} players failed: {exception.Message}");
                return;
            }

            _unsaved.Clear();
            foreach (Player player in players)
            {
                player.Dirty = false;
            }
        }
    }
}
