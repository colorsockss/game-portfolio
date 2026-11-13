using System;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 피해 공식(formula-tool이 낸 Formulas.Damage)과 치명타를 고정한 씨앗으로 본다. 식: max(1, (공격력 × 계수 − 방어력 × 0.5) × 난수(0.9–1.1)).
    /// </summary>
    public class DamageTests
    {
        [Fact]
        public void DamageStaysWithinTenPercentAndDropsTheFraction()
        {
            StatSystem stats = Stats(critChance: 0, seed: 7);
            var reference = new Random(7);
            for (int i = 0; i < 1000; i++)
            {
                (uint damage, bool critical) = stats.Damage(Owner(100, 0), Owner(0, 20), 1);
                double roll = 0.9 + (reference.NextDouble() * 0.2);
                reference.NextDouble();
                Assert.False(critical);
                Assert.InRange(damage, 81u, 98u);
                Assert.Equal((uint)Math.Floor(90 * roll), damage);
            }
        }

        [Fact]
        public void HighDefenseStillDealsOne()
        {
            StatSystem stats = Stats(critChance: 0, seed: 1);
            for (int i = 0; i < 100; i++)
            {
                Assert.Equal(1u, stats.Damage(Owner(10, 0), Owner(0, 1000), 1).Damage);
            }
        }

        /// <summary>
        /// 같은 씨앗이면 계수 2의 피해는 계수 1의 두 배다(소수를 버리므로 1 안쪽의 차이).
        /// </summary>
        [Fact]
        public void DamageScalesWithTheCoefficient()
        {
            StatSystem single = Stats(critChance: 0, seed: 3);
            StatSystem twice = Stats(critChance: 0, seed: 3);
            for (int i = 0; i < 100; i++)
            {
                uint one = single.Damage(Owner(50, 0), Owner(0, 0), 1).Damage;
                uint two = twice.Damage(Owner(50, 0), Owner(0, 0), 2).Damage;
                Assert.InRange(two, 2 * one, (2 * one) + 1);
            }
        }

        /// <summary>
        /// 치명타의 확률이 0이면 나지 않고, 1이면 늘 나며 배수(1.5)를 곱한 뒤 소수를 버린다.
        /// </summary>
        [Fact]
        public void CriticalHitsFollowTheChanceAndMultiply()
        {
            StatSystem never = Stats(critChance: 0, seed: 5);
            StatSystem always = Stats(critChance: 1, seed: 5);
            var reference = new Random(5);
            for (int i = 0; i < 100; i++)
            {
                Assert.False(never.Damage(Owner(100, 0), Owner(0, 20), 1).Critical);
                (uint damage, bool critical) = always.Damage(Owner(100, 0), Owner(0, 20), 1);
                double roll = 0.9 + (reference.NextDouble() * 0.2);
                reference.NextDouble();
                Assert.True(critical);
                Assert.Equal((uint)Math.Floor(90 * roll * 1.5), damage);
            }
        }

        private static StatSystem Stats(double critChance, int seed)
        {
            Constants constants = TestData.Constants(TestData.FieldSize);
            constants.CritChance = critChance;
            var data = new GameData(TestData.Hash, constants, new Zones(), TestData.EmptyGrid(TestData.FieldSize), TestData.Classes, TestData.Levels);
            return new StatSystem(data, new Random(seed));
        }

        private static IAbilityOwner Owner(double attack, double defense)
        {
            return new FixedOwner(attack, defense);
        }

        private sealed record FixedOwner(double Attack, double Defense) : IAbilityOwner
        {
            public double Get(AbilityType type)
            {
                return type == AbilityType.Attack ? Attack : Defense;
            }
        }
    }
}
