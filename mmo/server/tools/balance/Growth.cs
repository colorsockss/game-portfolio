using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;

namespace PortfolioMmo.Balance
{
    /// <summary>
    /// 성장 표의 한 줄: 직업과 레벨의 캐릭터가 사냥할 몬스터, 한 마리에 드는 시간(싸움 + 찾아 걷기 + 쉬기), 분당 경험치, 지금 데이터의 필요 경험치와
    /// 그만큼 쌓는 데 걸리는 분, 목표 시간에서 거꾸로 구한 필요 경험치.
    /// </summary>
    public readonly record struct GrowthRow(
        CharacterClass Class, uint Level, string Monster, uint MonsterLevel, double SecondsPerKill, double ExpPerMinute, uint Exp, double Minutes, uint SuggestedExp);

    /// <summary>
    /// 성장의 길이(31). 레벨마다 사냥할 몬스터는 레벨이 (그 레벨 + 2) 아래이고 쉬지 않고 MinChain마리를 잡는 것 가운데 분당 경험치가 가장 큰 것이다.
    /// 1레벨에서 최대 레벨까지 TargetMinutes가 걸리게, 레벨마다의 목표 시간을 1레벨에서 마지막 레벨까지 세 배로 늘리며 나눈다.
    /// shortcut: 찾아 걷는 시간은 SearchSeconds로 두고, 쉬는 시간은 받은 피해를 전투 상태가 아닐 때의 회복으로 채우는 시간이다.
    /// 자동 사냥(40)이 생기면 실제로 잰 한 마리의 시간과 견줘 SearchSeconds를 고친다.
    /// </summary>
    public static class Growth
    {
        /// <summary>
        /// 1레벨에서 최대 레벨까지의 목표(분).
        /// </summary>
        public const double TargetMinutes = 120;

        /// <summary>
        /// 목표의 위아래(분). 표의 합이 이 안이면 "2시간쯤"이다.
        /// </summary>
        public const double MinMinutes = 105;

        public const double MaxMinutes = 135;

        /// <summary>
        /// 한 마리를 잡은 뒤 다음 대상을 찾아 걷는 시간(초, 어림한 값).
        /// </summary>
        public const double SearchSeconds = 6;

        /// <summary>
        /// 사냥할 몬스터의 레벨이 캐릭터의 레벨보다 높을 수 있는 만큼.
        /// </summary>
        public const uint LevelReach = 2;

        public static List<GrowthRow> Table(GameData data, int runs, int seed)
        {
            var rows = new List<GrowthRow>();
            // 보스(43)는 사냥의 성장 표에 넣지 않는다(파티로 잡는 몬스터).
            MonstersRow[] monsters = data.Spawns.Rows.Where(spawn => spawn.HasMonsterId).Select(spawn => spawn.MonsterId).Distinct().Select(data.Monster).Where(monster => monster.Kind == MonsterKind.Normal).ToArray();
            foreach (CharacterClass characterClass in data.Classes.Rows.Select(row => (CharacterClass)row.Id))
            {
                uint maxLevel = 1;
                while (data.HasLevel(characterClass, maxLevel + 1))
                {
                    maxLevel++;
                }

                for (uint level = 1; level < maxLevel; level++)
                {
                    (MonstersRow Monster, double Seconds, double PerMinute)? best = null;
                    foreach (MonstersRow monster in monsters.Where(monster => monster.Level <= level + LevelReach))
                    {
                        Row fight = Report.Measure(data, characterClass, level, monster, runs, seed);
                        if (fight.Chain < Report.MinChain)
                        {
                            continue;
                        }

                        double seconds = fight.Seconds + SearchSeconds + (fight.DamagePercent / data.Constants.RegenPercent);
                        double perMinute = monster.Exp * 60 / seconds;
                        if ((best == null) || (perMinute > best.Value.PerMinute))
                        {
                            best = (monster, seconds, perMinute);
                        }
                    }

                    if (best is not { } pick)
                    {
                        throw new InvalidOperationException($"{characterClass} {level} has no monster it can hunt.");
                    }

                    uint exp = data.Level(characterClass, level).Exp;
                    uint suggested = (uint)Math.Max(1, Math.Round(pick.PerMinute * TargetFor(level, maxLevel) / 10) * 10);
                    rows.Add(new GrowthRow(characterClass, level, pick.Monster.NameKey, pick.Monster.Level, pick.Seconds, pick.PerMinute, exp, exp / pick.PerMinute, suggested));
                }
            }

            return rows;
        }

        /// <summary>
        /// 레벨의 목표 시간(분): 1레벨의 a에서 마지막 레벨의 3a까지 고르게 늘고 합이 TargetMinutes다.
        /// </summary>
        public static double TargetFor(uint level, uint maxLevel)
        {
            uint count = maxLevel - 1;
            double first = TargetMinutes / (2.0 * count);
            return count == 1 ? TargetMinutes : first * (1 + (2.0 * (level - 1) / (count - 1)));
        }

        /// <summary>
        /// 직업마다 1레벨에서 최대 레벨까지의 합(분).
        /// </summary>
        public static Dictionary<CharacterClass, double> Totals(IEnumerable<GrowthRow> rows)
        {
            return rows.GroupBy(row => row.Class).ToDictionary(group => group.Key, group => group.Sum(row => row.Minutes));
        }

        /// <summary>
        /// 합이 목표의 위아래 밖인 직업의 설명.
        /// </summary>
        public static List<string> Problems(IEnumerable<GrowthRow> rows)
        {
            return Totals(rows)
                .Where(total => total.Value < MinMinutes || total.Value > MaxMinutes)
                .Select(total => $"{total.Key} reaches the max level in {total.Value:0} minutes, expected {MinMinutes}–{MaxMinutes}")
                .ToList();
        }
    }
}
