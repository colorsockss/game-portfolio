using System;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 능력치와 피해. 능력치는 바뀔 때(월드에 들어옴, 레벨 31, 장비 34, 강화 35, 효과 26)만 다시 구한다.
    /// </summary>
    public sealed class StatSystem
    {
        private readonly GameData _data;
        private readonly Random _random;

        /// <summary>
        /// 공식의 입력. 틱 스레드 하나만 부르므로 하나를 다시 쓴다(피해마다 할당하지 않음).
        /// </summary>
        private readonly FormulaInput _input = new FormulaInput();

        public StatSystem(GameData data, Random random)
        {
            _data = data;
            _random = random;
        }

        /// <summary>
        /// 월드에 들어온 플레이어의 능력치를 구하고 체력과 마나를 가득 채운다(캐릭터 저장 38 전에는 들어올 때마다 가득 참).
        /// </summary>
        public void Enter(Player player)
        {
            Recalculate(player);
            player.Hp = player.MaxHp;
            player.Mp = player.MaxMp;

            // 보는 쪽은 EntityEnter로 지금 체력을 받으므로 EntityVitals에 싣지 않는다.
            player.VitalsChanged = false;
        }

        /// <summary>
        /// 능력치 = 기본값(플레이어는 그 직업과 레벨의 Levels 줄 + 입은 장비(34), 몬스터는 Monsters의 줄) + 효과(공격력·방어력 올림의 값). 강화(35)의 몫은
        /// 그 항목이 더한다. 플레이어 본인에게는 이 틱의 VitalsSystem이 SelfStats를 보낸다.
        /// </summary>
        public void Recalculate(Creature creature)
        {
            Stats stats = creature switch
            {
                Player player => WithEquipment(Of(_data.Level(player.Class, player.Level)), player),
                Monster monster => new Stats(monster.Template.MaxHp, 0, monster.Template.Attack, monster.Template.Defense),
                _ => throw new ArgumentException($"{creature.Kind} has no stats.", nameof(creature)),
            };

            creature.EffectValue(EffectKind.AttackUp, out uint attack);
            creature.EffectValue(EffectKind.DefenseUp, out uint defense);
            creature.SetStats(stats with { Attack = stats.Attack + attack, Defense = stats.Defense + defense });
            if (creature is Player changed)
            {
                changed.StatsChanged = true;
            }
        }

        /// <summary>
        /// 입은 장비의 능력치를 더한다(34). 강화한 장비는 Enchants의 비율을 곱한다(35).
        /// </summary>
        private Stats WithEquipment(Stats stats, Player player)
        {
            foreach (ItemSlot worn in player.Bag.Equipment)
            {
                if ((worn.ItemId != 0) && (_data.Item(worn.ItemId) is ItemsRow item))
                {
                    // 강화한 장비는 Items의 능력치에 그 단계의 비율을 곱한다(소수는 버림. 35).
                    double rate = (worn.Enchant > 0) && (_data.Enchant(worn.Enchant) is EnchantsRow step) ? step.StatRate : 1.0;
                    uint Scaled(uint value) => (uint)Math.Floor(value * rate);
                    stats = new Stats(stats.MaxHp + Scaled(item.MaxHp), stats.MaxMp + Scaled(item.MaxMp), stats.Attack + Scaled(item.Attack), stats.Defense + Scaled(item.Defense));
                }
            }

            return stats;
        }

        private static Stats Of(LevelsRow row)
        {
            return new Stats(row.MaxHp, row.MaxMp, row.Attack, row.Defense);
        }

        /// <summary>
        /// 공격 하나의 피해: 공식(Formulas.Damage, 최소 1과 ±10%의 난수 포함)에 Constants의 확률로 치명타 배수를 곱하고 소수를 버린다.
        /// 난수는 주입받은 Random에서만 뽑는다. 부르는 것은 공격(24)과 스킬(26)이다.
        /// </summary>
        public (uint Damage, bool Critical) Damage(IAbilityOwner attacker, IAbilityOwner target, double coefficient)
        {
            _input.Coefficient = coefficient;
            double damage = Formulas.Damage(attacker, target, _input, _random);
            bool critical = _random.NextDouble() < _data.Constants.CritChance;
            if (critical)
            {
                damage *= _data.Constants.CritMultiplier;
            }

            return ((uint)Math.Floor(damage), critical);
        }
    }
}
