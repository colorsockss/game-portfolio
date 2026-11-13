using System;
using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터 하나의 피해 표: 플레이어마다 준 피해의 합을 든 차례로 둔다. 줄의 차례가 "먼저 든 쪽"이다(인식된 틱이나 처음 때린 틱이
    /// 이른 쪽, 같은 틱이면 먼저 든 줄). 합을 견주는 곳은 SideOf가 답한 편끼리 견준다.
    /// </summary>
    internal sealed class DamageTable
    {
        private readonly List<(uint PlayerId, ulong Damage)> _rows = new List<(uint PlayerId, ulong Damage)>();

        public int Count => _rows.Count;

        /// <summary>
        /// 플레이어의 편. 파티가 없어 그 플레이어 자신이다. 42가 파티로 잇는다.
        /// </summary>
        public static uint SideOf(uint playerId)
        {
            return playerId;
        }

        public bool Contains(uint playerId)
        {
            return _rows.FindIndex(row => row.PlayerId == playerId) >= 0;
        }

        /// <summary>
        /// 피해를 더한다. 표에 없으면 맨 뒤에 든다(인식은 0을 더함).
        /// </summary>
        public void Add(uint playerId, ulong damage)
        {
            int index = _rows.FindIndex(row => row.PlayerId == playerId);
            if (index < 0)
            {
                _rows.Add((playerId, damage));
                return;
            }

            _rows[index] = (playerId, _rows[index].Damage + damage);
        }

        /// <summary>
        /// 조건에 맞는 줄을 지운다(월드에서 빠졌거나 죽은 플레이어). 남은 줄의 차례는 그대로다.
        /// </summary>
        public void RemoveWhere(Predicate<uint> remove)
        {
            _rows.RemoveAll(row => remove(row.PlayerId));
        }

        public void Clear()
        {
            _rows.Clear();
        }

        /// <summary>
        /// 칠 대상: 합이 큰 편부터(합이 같으면 먼저 든 줄이 앞인 편), 그 편에서 고를 수 있는 줄 가운데 피해가 가장 큰 플레이어
        /// (같으면 먼저 든 줄). 건너뛰는 줄(selectable이 거짓)의 피해도 편의 합에 든다. 고를 줄이 없으면 null.
        /// </summary>
        public uint? Pick(Predicate<uint> selectable)
        {
            uint? best = null;
            ulong bestSum = 0;
            int bestFirst = 0;
            for (int i = 0; i < _rows.Count; i++)
            {
                uint side = SideOf(_rows[i].PlayerId);
                if (FirstOf(side) != i)
                {
                    continue;
                }

                uint? member = null;
                ulong memberDamage = 0;
                ulong sum = 0;
                for (int j = i; j < _rows.Count; j++)
                {
                    if (SideOf(_rows[j].PlayerId) != side)
                    {
                        continue;
                    }

                    sum += _rows[j].Damage;
                    if (selectable(_rows[j].PlayerId) && ((member == null) || (_rows[j].Damage > memberDamage)))
                    {
                        member = _rows[j].PlayerId;
                        memberDamage = _rows[j].Damage;
                    }
                }

                if ((member != null) && ((best == null) || (sum > bestSum) || ((sum == bestSum) && (i < bestFirst))))
                {
                    best = member;
                    bestSum = sum;
                    bestFirst = i;
                }
            }

            return best;
        }

        /// <summary>
        /// 잡은 편: 합이 가장 큰 편(같으면 먼저 든 줄이 앞인 편). 표가 비었으면 null. 경험치(31)와 드롭의 주인(33)이 쓴다.
        /// </summary>
        public uint? Killer()
        {
            uint? best = null;
            ulong bestSum = 0;
            for (int i = 0; i < _rows.Count; i++)
            {
                uint side = SideOf(_rows[i].PlayerId);
                if (FirstOf(side) != i)
                {
                    continue;
                }

                ulong sum = 0;
                foreach ((uint playerId, ulong damage) in _rows)
                {
                    sum += SideOf(playerId) == side ? damage : 0;
                }

                if ((best == null) || (sum > bestSum))
                {
                    best = side;
                    bestSum = sum;
                }
            }

            return best;
        }

        private int FirstOf(uint side)
        {
            return _rows.FindIndex(row => SideOf(row.PlayerId) == side);
        }
    }
}
