using System;
using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터 하나의 피해 표: 때린 개체(플레이어나 소환수. 95)마다 준 피해의 합을 든 차례로 둔다(줄의 번호가 PlayerId이지만 소환수의 번호도 든다). 줄의 차례가 "먼저 든 쪽"이다(인식된 틱이나 처음 때린 틱이
    /// 이른 쪽, 같은 틱이면 먼저 든 줄). 합을 견주는 곳은 부른 쪽이 넘긴 편(sideOf. 파티가 있으면 그 파티, 없으면 플레이어 자신. 42)끼리 견준다.
    /// </summary>
    internal sealed class DamageTable
    {
        private readonly List<(uint PlayerId, ulong Damage)> _rows = new List<(uint PlayerId, ulong Damage)>();

        public int Count => _rows.Count;

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
        /// 소환수의 줄을 주인의 줄로 옮긴다(95. 소환수가 죽거나 사라짐): 주인이 표에 없으면 소환수의 자리에 주인으로 들고, 있으면 합을 더해
        /// 둘 가운데 먼저 든 쪽의 자리에 둔다. 소환수가 표에 없으면 아무것도 하지 않는다.
        /// </summary>
        public void Transfer(uint from, uint to)
        {
            int source = _rows.FindIndex(row => row.PlayerId == from);
            if (source < 0)
            {
                return;
            }

            int target = _rows.FindIndex(row => row.PlayerId == to);
            if (target < 0)
            {
                _rows[source] = (to, _rows[source].Damage);
                return;
            }

            ulong sum = _rows[source].Damage + _rows[target].Damage;
            _rows[Math.Min(source, target)] = (to, sum);
            _rows.RemoveAt(Math.Max(source, target));
        }

        /// <summary>
        /// 칠 대상: 합이 큰 편부터(합이 같으면 먼저 든 줄이 앞인 편), 그 편에서 고를 수 있는 줄 가운데 피해가 가장 큰 플레이어
        /// (같으면 먼저 든 줄). 건너뛰는 줄(selectable이 거짓)의 피해도 편의 합에 든다. 고를 줄이 없으면 null.
        /// </summary>
        public uint? Pick(Predicate<uint> selectable, Func<uint, ulong> sideOf)
        {
            uint? best = null;
            ulong bestSum = 0;
            int bestFirst = 0;
            for (int i = 0; i < _rows.Count; i++)
            {
                ulong side = sideOf(_rows[i].PlayerId);
                if (FirstOf(side, sideOf) != i)
                {
                    continue;
                }

                uint? member = null;
                ulong memberDamage = 0;
                ulong sum = 0;
                for (int j = i; j < _rows.Count; j++)
                {
                    if (sideOf(_rows[j].PlayerId) != side)
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
        public ulong? Killer(Func<uint, ulong> sideOf)
        {
            ulong? best = null;
            ulong bestSum = 0;
            for (int i = 0; i < _rows.Count; i++)
            {
                ulong side = sideOf(_rows[i].PlayerId);
                if (FirstOf(side, sideOf) != i)
                {
                    continue;
                }

                ulong sum = 0;
                foreach ((uint playerId, ulong damage) in _rows)
                {
                    sum += sideOf(playerId) == side ? damage : 0;
                }

                if ((best == null) || (sum > bestSum))
                {
                    best = side;
                    bestSum = sum;
                }
            }

            return best;
        }

        private int FirstOf(ulong side, Func<uint, ulong> sideOf)
        {
            return _rows.FindIndex(row => sideOf(row.PlayerId) == side);
        }
    }
}
