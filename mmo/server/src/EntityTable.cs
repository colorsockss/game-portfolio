using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드의 개체(개체 번호 → 개체)와 번호의 규칙. 번호 공간은 하나이고 작게 둔다(200만을 넘으면 varint가 길어져 개체 하나가 2바이트 늚).
    /// 몬스터와 채집물은 놓인 점마다 서버가 뜰 때 받은 번호를 다시 나올 때도 쓰고, 바닥 아이템은 사라진 지 10초가 지난 번호를 다시 쓰고,
    /// 플레이어의 번호는 다시 쓰지 않는다.
    /// </summary>
    internal sealed class EntityTable
    {
        /// <summary>
        /// 바닥 아이템의 번호를 다시 쓰기까지의 틱(10초). 사라진 개체의 늦은 패킷이 새 개체로 읽히지 않게 한다.
        /// </summary>
        public const uint GroundItemIdReuseTicks = 10 * Units.TicksPerSecond;

        private readonly Dictionary<uint, Entity> _entities = new Dictionary<uint, Entity>();
        private readonly Dictionary<uint, Player> _players = new Dictionary<uint, Player>();

        /// <summary>
        /// 사라진 바닥 아이템의 번호와 사라진 틱. 사라진 차례라 앞이 가장 오래되었다.
        /// </summary>
        private readonly Queue<(uint Id, uint Tick)> _freedGroundItemIds = new Queue<(uint Id, uint Tick)>();

        /// <summary>
        /// 다음 새 번호. 0은 "없음"이라 1부터 쓴다.
        /// </summary>
        private uint _nextId = 1;

        /// <summary>
        /// 놓인 점의 번호만 받았다(뜨는 중). 다른 번호를 하나라도 주면 놓인 점의 번호를 더 받을 수 없다.
        /// </summary>
        private bool _placingOnly = true;

        /// <summary>
        /// 모든 개체. foreach가 할당하지 않도록 값 컬렉션을 그대로 내놓는다.
        /// </summary>
        public Dictionary<uint, Entity>.ValueCollection All => _entities.Values;

        /// <summary>
        /// 월드에 들어온 플레이어(시야를 보는 쪽).
        /// </summary>
        public Dictionary<uint, Player>.ValueCollection Players => _players.Values;

        public int PlayerCount => _players.Count;

        /// <summary>
        /// 놓인 점(몬스터와 채집물의 자리) 하나의 번호. 서버가 뜰 때 플레이어보다 먼저 받는다.
        /// </summary>
        public uint ReservePlacedId()
        {
            if (!_placingOnly)
            {
                throw new InvalidOperationException("Placed ids must be reserved before any other id is given out.");
            }

            return _nextId++;
        }

        /// <summary>
        /// 새 플레이어 번호. 다시 쓰지 않는다.
        /// </summary>
        public uint NextPlayerId()
        {
            _placingOnly = false;
            return _nextId++;
        }

        /// <summary>
        /// 새 바닥 아이템 번호. 사라진 지 GroundItemIdReuseTicks가 지난 번호가 있으면 그것을 다시 쓴다.
        /// </summary>
        public uint NextGroundItemId(uint tick)
        {
            _placingOnly = false;
            if (_freedGroundItemIds.TryPeek(out (uint Id, uint Tick) freed) && (tick - freed.Tick >= GroundItemIdReuseTicks))
            {
                _freedGroundItemIds.Dequeue();
                return freed.Id;
            }

            return _nextId++;
        }

        /// <summary>
        /// 번호의 개체. 없으면 null.
        /// </summary>
        public Entity? Find(uint id)
        {
            return _entities.GetValueOrDefault(id);
        }

        public void Add(Entity entity)
        {
            _entities.Add(entity.Id, entity);
            if (entity is Player player)
            {
                _players.Add(player.Id, player);
            }
        }

        public void Remove(Entity entity)
        {
            _entities.Remove(entity.Id);
            _players.Remove(entity.Id);
        }

        /// <summary>
        /// 사라진 바닥 아이템의 번호를 tick부터 세어 다시 쓴다.
        /// </summary>
        public void FreeGroundItemId(uint id, uint tick)
        {
            _freedGroundItemIds.Enqueue((id, tick));
        }
    }
}
