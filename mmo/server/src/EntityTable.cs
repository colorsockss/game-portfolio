using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드의 개체(개체 번호 → 개체). 지금 개체는 플레이어뿐이다. 개체 번호는 다시 쓰지 않는다.
    /// </summary>
    internal sealed class EntityTable
    {
        private readonly Dictionary<uint, Player> _players = new Dictionary<uint, Player>();

        /// <summary>
        /// 다음 개체 번호. 0은 "없음"이라 1부터 쓴다.
        /// </summary>
        private uint _nextId = 1;

        /// <summary>
        /// 월드에 들어온 플레이어. foreach가 할당하지 않도록 값 컬렉션을 그대로 내놓는다.
        /// </summary>
        public Dictionary<uint, Player>.ValueCollection Players => _players.Values;

        public int PlayerCount => _players.Count;

        /// <summary>
        /// 새 개체 번호를 받는다.
        /// </summary>
        public uint NextId()
        {
            return _nextId++;
        }

        public void Add(Player player)
        {
            _players.Add(player.Id, player);
        }

        public void Remove(Player player)
        {
            _players.Remove(player.Id);
        }
    }
}
