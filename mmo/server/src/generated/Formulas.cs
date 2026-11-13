// 자동 생성된 파일 — 직접 수정하지 마세요. 프로젝트: portfolio-mmo
using System;
using AbilityType = PortfolioMmo.Server.AbilityType;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 공식이 능력치를 읽는 개체.
    /// </summary>
    public interface IAbilityOwner
    {
        double Get(AbilityType type);
    }

    /// <summary>
    /// 공식을 부르는 쪽이 넘기는 입력. 공식이 읽는 입력을 넘기지 않으면 던진다.
    /// </summary>
    public sealed class FormulaInput
    {
        /// <summary>
        /// 공격의 계수 (기본 공격 1, Skills의 계수)
        /// </summary>
        public double? Coefficient { get; set; }
    }

    /// <summary>
    /// 공식. 난수는 넘겨받은 random에서만 뽑는다.
    /// </summary>
    public static class Formulas
    {
        /// <summary>
        /// 피해에서 빼는 방어력의 비율
        /// </summary>
        private const double DefenseRate = 0.5;

        /// <summary>
        /// 방어력이 커도 들어가는 최소 피해
        /// </summary>
        private const double MinDamage = 1.0;

        /// <summary>
        /// 치명타 전의 피해. 서버가 치명타의 배수를 곱하고 소수를 버린다
        /// </summary>
        public static double Damage(IAbilityOwner caster, IAbilityOwner target, FormulaInput input, Random random) =>
            Math.Max(MinDamage, (((caster.Get(AbilityType.Attack) * Given(input.Coefficient, "coefficient")) - (target.Get(AbilityType.Defense) * DefenseRate)) * Rand(random, 0.9, 1.1)));

        private static double Given(double? value, string key) =>
            value ?? throw new ArgumentException($"Formula input '{key}' was not given.", nameof(value));

        // rand() → [0,1), rand(a) → [0,a), rand(a,b) → [a,b). 툴의 시뮬레이션과 같다.
        private static double Rand(Random random) => random.NextDouble();
        private static double Rand(Random random, double a) => random.NextDouble() * a;
        private static double Rand(Random random, double a, double b) => a + (random.NextDouble() * (b - a));
    }
}
