using System;
using System.Collections.Generic;
using System.Globalization;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;

namespace PortfolioMmo.Balance
{
    /// <summary>
    /// 수치 표를 Markdown으로 찍는다. 기준에 어긋난 줄이 있으면 그것을 적고 1로 끝난다.
    /// 인자: --runs(줄마다 돌리는 수, 기본 200), --growth-runs(성장 표의 줄마다 돌리는 수, 기본 40), --seed(첫 씨앗, 기본 1), --data(데이터 폴더, 기본 실행 파일 옆의 data/).
    /// </summary>
    public static class Program
    {
        public static int Main(string[] args)
        {
            int runs = 200;
            int growthRuns = 40;
            int seed = 1;
            string folder = GameData.DefaultFolder;
            for (int index = 0; index + 1 < args.Length; index += 2)
            {
                switch (args[index])
                {
                    case "--runs":
                        runs = int.Parse(args[index + 1], CultureInfo.InvariantCulture);
                        break;
                    case "--growth-runs":
                        growthRuns = int.Parse(args[index + 1], CultureInfo.InvariantCulture);
                        break;
                    case "--seed":
                        seed = int.Parse(args[index + 1], CultureInfo.InvariantCulture);
                        break;
                    case "--data":
                        folder = args[index + 1];
                        break;
                    default:
                        Console.Error.WriteLine($"Unknown option {args[index]}. Options: --runs 200 --growth-runs 40 --seed 1 --data <folder>");
                        return 2;
                }
            }

            GameData data = GameData.Load(folder);
            List<Row> sameLevel = Report.SameLevel(data, runs, seed);
            List<Row> zoneEntry = Report.ZoneEntry(data, runs, seed);
            Console.WriteLine($"## Same level (runs {runs}, hits {Report.MinHits}–{Report.MaxHits}, damage ≤ {Report.MaxDamagePercent}%)");
            Print(sameLevel);
            Console.WriteLine();
            Console.WriteLine($"## Recommended minimum level of each hunting zone (chain ≥ {Report.MinChain}, cap {Report.ChainCap})");
            Print(zoneEntry);

            List<GrowthRow> growth = Growth.Table(data, growthRuns, seed);
            Console.WriteLine();
            Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                $"## Growth (runs {growthRuns}, search {Growth.SearchSeconds} s per kill, target {Growth.TargetMinutes} minutes, {Growth.MinMinutes}–{Growth.MaxMinutes})"));
            Console.WriteLine("| class | level | monster | monster level | seconds per kill | exp per minute | exp | minutes | suggested exp |");
            Console.WriteLine("| --- | --: | --- | --: | --: | --: | --: | --: | --: |");
            foreach (GrowthRow row in growth)
            {
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                    $"| {row.Class} | {row.Level} | {row.Monster} | {row.MonsterLevel} | {row.SecondsPerKill:0.0} | {row.ExpPerMinute:0} | {row.Exp} | {row.Minutes:0.0} | {row.SuggestedExp} |"));
            }

            foreach ((CharacterClass characterClass, double minutes) in Growth.Totals(growth))
            {
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture, $"Total {characterClass}: {minutes:0} minutes"));
            }

            List<string> problems = Report.Problems(sameLevel, zoneEntry);
            problems.AddRange(Growth.Problems(growth));
            foreach (string problem in problems)
            {
                Console.Error.WriteLine(problem);
            }

            return problems.Count == 0 ? 0 : 1;
        }

        private static void Print(List<Row> rows)
        {
            Console.WriteLine("| class | level | monster | monster level | hits | seconds | damage % (mean) | damage % (worst) | deaths | chain |");
            Console.WriteLine("| --- | --: | --- | --: | --: | --: | --: | --: | --: | --: |");
            foreach (Row row in rows)
            {
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                    $"| {row.Class} | {row.Level} | {row.Monster} | {row.MonsterLevel} | {row.Hits} | {row.Seconds:0.0} | {row.DamagePercent:0.0} | {row.WorstDamagePercent:0.0} | {row.Deaths} | {row.Chain} |"));
            }
        }
    }
}
