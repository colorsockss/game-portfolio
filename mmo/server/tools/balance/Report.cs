using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;

namespace PortfolioMmo.Balance
{
    /// <summary>
    /// 표의 한 줄: 직업과 레벨의 캐릭터가 몬스터 한 종과 싸운 것을 여러 번 돌린 값. Chain은 쉬지 않고 연달아 잡은 수의 가장 작은 값이다(ChainCap이 상한).
    /// </summary>
    public readonly record struct Row(
        CharacterClass Class, uint Level, string Monster, uint MonsterLevel,
        double Hits, double Seconds, double DamagePercent, double WorstDamagePercent, int Deaths, int Chain);

    /// <summary>
    /// 수치의 기준(72)과 그 표. 기준은 MANUAL의 "수치 표"에 같은 말로 있다.
    /// </summary>
    public static class Report
    {
        /// <summary>
        /// 같은 레벨의 몬스터를 잡는 데 든 타격(맞은 기본 공격과 스킬) 수의 범위(중앙값).
        /// </summary>
        public const double MinHits = 4;

        public const double MaxHits = 10;

        /// <summary>
        /// 같은 레벨의 몬스터 하나를 잡는 동안 받는 피해의 위(최대 체력의 %, 평균).
        /// </summary>
        public const double MaxDamagePercent = 35;

        /// <summary>
        /// 쉬지 않고 연달아 잡을 수 있어야 하는 수: 같은 레벨의 몬스터, 그리고 사냥터의 권장 레벨 아래인 캐릭터가 그 사냥터의 가장 약한 몬스터.
        /// </summary>
        public const int MinChain = 3;

        /// <summary>
        /// 연달아 잡는 수를 세는 상한.
        /// </summary>
        public const int ChainCap = 10;

        /// <summary>
        /// 직업마다, 몬스터마다 그 몬스터와 같은 레벨의 캐릭터.
        /// </summary>
        public static List<Row> SameLevel(GameData data, int runs, int seed)
        {
            var rows = new List<Row>();
            foreach (CharacterClass characterClass in Classes(data))
            {
                foreach (MonstersRow monster in Monsters(data))
                {
                    rows.Add(Measure(data, characterClass, monster.Level, monster, runs, seed));
                }
            }

            return rows;
        }

        /// <summary>
        /// 사냥터마다, 직업마다 권장 레벨의 아래인 캐릭터가 그 사냥터에 놓인 몬스터(Spawns의 자리가 구역 안)와 싸운 것.
        /// </summary>
        public static List<Row> ZoneEntry(GameData data, int runs, int seed)
        {
            var rows = new List<Row>();
            foreach (ZonesRow zone in data.Zones.Rows.Where(zone => zone.Kind == ZoneKind.HuntingGround))
            {
                uint[] ids = data.Spawns.Rows
                    .Where(spawn => spawn.X >= zone.MinX && spawn.X < zone.MaxX && spawn.Z >= zone.MinZ && spawn.Z < zone.MaxZ)
                    .Select(spawn => spawn.MonsterId)
                    .Distinct()
                    .ToArray();
                foreach (CharacterClass characterClass in Classes(data))
                {
                    foreach (MonstersRow monster in Monsters(data).Where(monster => ids.Contains(monster.Id)))
                    {
                        rows.Add(Measure(data, characterClass, zone.MinLevel, monster, runs, seed));
                    }
                }
            }

            return rows;
        }

        /// <summary>
        /// 기준에 어긋난 줄의 설명. 비면 데이터가 기준을 지킨다.
        /// </summary>
        public static List<string> Problems(IEnumerable<Row> sameLevel, IEnumerable<Row> zoneEntry)
        {
            var problems = new List<string>();
            foreach (Row row in sameLevel)
            {
                if (row.Hits < MinHits || row.Hits > MaxHits)
                {
                    problems.Add($"{Name(row)}: {row.Hits} hits to kill, expected {MinHits}–{MaxHits}");
                }

                if (row.DamagePercent > MaxDamagePercent)
                {
                    problems.Add($"{Name(row)}: takes {row.DamagePercent:0.#}% of max HP per kill, expected at most {MaxDamagePercent}%");
                }
            }

            // 사냥터마다 권장 레벨의 아래가 달라 (직업, 레벨)이 사냥터 하나다. 그 사냥터에서 가장 약한 몬스터만 본다.
            IEnumerable<Row> weakest = zoneEntry
                .GroupBy(row => (row.Class, row.Level))
                .Select(zone => zone.MinBy(row => row.MonsterLevel));
            foreach (Row row in sameLevel.Concat(weakest).Where(row => row.Chain < MinChain))
            {
                problems.Add($"{Name(row)}: kills {row.Chain} in a row before dying, expected at least {MinChain}");
            }

            return problems;
        }

        public static string Name(Row row)
        {
            return $"{row.Class} {row.Level} vs {row.Monster} {row.MonsterLevel}";
        }

        /// <summary>
        /// 싸움 하나를 runs번(씨앗 seed + i) 돌리고, 따로 쉬지 않고 연달아 싸워 몇 마리를 잡는지 본다.
        /// </summary>
        public static Row Measure(GameData data, CharacterClass characterClass, uint level, MonstersRow monster, int runs, int seed)
        {
            var results = new FightResult[runs];
            int chain = ChainCap;
            uint maxHp = data.Level(characterClass, level).MaxHp;
            for (int run = 0; run < runs; run++)
            {
                results[run] = new Fight(data, characterClass, level, new Random(seed + run)).Against(monster);

                var row = new Fight(data, characterClass, level, new Random(seed + runs + run));
                int kills = 0;
                while (kills < chain && row.Against(monster).Won)
                {
                    kills++;
                }

                chain = Math.Min(chain, kills);
            }

            double[] damage = results.Select(result => 100.0 * result.DamageTaken / maxHp).ToArray();
            return new Row(
                characterClass, level, monster.NameKey, monster.Level,
                Median(results.Select(result => (double)result.Hits)), Median(results.Select(result => result.Seconds)),
                damage.Average(), damage.Max(), results.Count(result => !result.Won), chain);
        }

        private static IEnumerable<CharacterClass> Classes(GameData data)
        {
            return data.Classes.Rows.Select(row => (CharacterClass)row.Id);
        }

        /// <summary>
        /// 놓인 일반 몬스터(레벨 차례). 보스(43)는 파티로 잡는 몬스터라 혼자 잡는 표에 넣지 않는다.
        /// </summary>
        private static IEnumerable<MonstersRow> Monsters(GameData data)
        {
            return data.Spawns.Rows.Select(spawn => spawn.MonsterId).Distinct().Select(data.Monster).Where(monster => monster.Kind == MonsterKind.Normal).OrderBy(monster => monster.Level);
        }

        private static double Median(IEnumerable<double> values)
        {
            double[] sorted = values.OrderBy(value => value).ToArray();
            return sorted[sorted.Length / 2];
        }
    }
}
