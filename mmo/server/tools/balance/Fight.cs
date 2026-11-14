using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;

namespace PortfolioMmo.Balance
{
    /// <summary>
    /// 공식이 읽는 능력치(공격력, 방어력).
    /// </summary>
    public sealed class Side : IAbilityOwner
    {
        public Side(uint attack, uint defense)
        {
            Attack = attack;
            Defense = defense;
        }

        public uint Attack { get; }

        public uint Defense { get; }

        public double Get(AbilityType type)
        {
            return type == AbilityType.Attack ? Attack : Defense;
        }
    }

    /// <summary>
    /// 싸움 하나의 결과. Hits는 몬스터에게 맞은 기본 공격과 스킬의 수다(잡은 뒤에 날아가던 것은 세지 않음).
    /// </summary>
    public readonly record struct FightResult(bool Won, uint Hits, double Seconds, uint DamageTaken);

    /// <summary>
    /// 플레이어 하나가 몬스터와 하나씩 싸우는 것을 서버의 규칙대로 틱마다 돌린다. 난수는 넘겨받은 Random에서만 뽑고 피해는
    /// 서버의 StatSystem.Damage(공식, 치명타)로 구한다. 연속으로 싸우면 체력, 마나, 쿨다운이 이어진다.
    /// shortcut: 몬스터 한 마리와만 싸우고(선공 몬스터 여럿이 함께 오는 것은 보지 않음), 피해 스킬만 쓰며(강화, 기절, 감속, 회복은 빼서 보수적인 값),
    /// 마법사는 물러서지 않는다. 실제 자동 사냥과 견주는 것은 40이다.
    /// </summary>
    public sealed class Fight
    {
        /// <summary>
        /// 이보다 길면 잡지 못한 것으로 본다.
        /// </summary>
        private const uint MaxTicks = 120 * Units.TicksPerSecond;

        private readonly GameData _data;
        private readonly StatSystem _stats;
        private readonly ClassesRow _class;
        private readonly LevelsRow _level;
        private readonly SkillsRow[] _skills;
        private readonly Dictionary<uint, uint> _cooldownEnd = new Dictionary<uint, uint>();
        private uint _tick;

        public Fight(GameData data, CharacterClass characterClass, uint level, Random random)
        {
            _data = data;
            _stats = new StatSystem(data, random);
            _class = data.Class(characterClass);
            _level = data.Level(characterClass, level);
            // 계수가 큰 피해 스킬부터 쓴다.
            _skills = data.Skills.Rows
                .Where(skill => skill.Class == (uint)characterClass && skill.Level <= level && skill.Coefficient > 0
                    && skill.Kind is SkillKind.SingleDamage or SkillKind.AreaDamage)
                .OrderByDescending(skill => skill.Coefficient)
                .ToArray();
            Hp = _level.MaxHp;
            Mp = _level.MaxMp;
        }

        public uint Hp { get; private set; }

        public uint Mp { get; private set; }

        public uint MaxHp => _level.MaxHp;

        /// <summary>
        /// 몬스터 하나와 싸운다. 플레이어는 기본 공격의 사거리에서 치기 시작하고, 몬스터는 처음 맞은 뒤에 다가와 친다.
        /// </summary>
        public FightResult Against(MonstersRow monster)
        {
            var player = new Side(_level.Attack, _level.Defense);
            var enemy = new Side(monster.Attack, monster.Defense);
            var pending = new List<(uint Tick, bool ByPlayer, double Coefficient)>();
            uint start = _tick;
            uint monsterHp = monster.MaxHp;
            uint taken = 0;
            uint hits = 0;
            double distance = _class.AttackRange;
            bool engaged = false;
            uint nextAttack = _tick;
            uint nextMonsterAttack = 0;
            uint castEnd = 0;
            SkillsRow? casting = null;

            for (; _tick - start < MaxTicks; _tick++)
            {
                if (casting != null && _tick >= castEnd)
                {
                    Pay(casting);
                    pending.Add((_tick + Travel(casting.HasProjectileSpeed ? casting.ProjectileSpeed : 0, distance), true, casting.Coefficient));
                    casting = null;
                }

                if (casting == null)
                {
                    if (Ready(distance) is SkillsRow skill)
                    {
                        if (skill.CastMs > 0)
                        {
                            casting = skill;
                            castEnd = _tick + Units.TicksFromMilliseconds(skill.CastMs);
                        }
                        else
                        {
                            Pay(skill);
                            pending.Add((_tick + Units.TicksFromMilliseconds(skill.HitDelayMs) + Travel(skill.HasProjectileSpeed ? skill.ProjectileSpeed : 0, distance), true, skill.Coefficient));
                        }
                    }

                    if (casting == null && nextAttack <= _tick && distance <= _class.AttackRange)
                    {
                        pending.Add((_tick + Units.TicksFromMilliseconds(_class.HitDelayMs) + Travel(_class.HasProjectileSpeed ? _class.ProjectileSpeed : 0, distance), true, 1));
                        nextAttack = _tick + Units.TicksFromMilliseconds(_class.AttackIntervalMs);
                    }
                }

                if (engaged)
                {
                    if (distance > monster.AttackRange)
                    {
                        distance = Math.Max(monster.AttackRange, distance - (monster.Speed / Units.TicksPerSecond));
                    }
                    else if (nextMonsterAttack <= _tick)
                    {
                        pending.Add((_tick + Units.TicksFromMilliseconds(monster.HitDelayMs) + Travel(monster.HasProjectileSpeed ? monster.ProjectileSpeed : 0, distance), false, 1));
                        nextMonsterAttack = _tick + Units.TicksFromMilliseconds(monster.AttackIntervalMs);
                    }
                }

                // 이 틱에 맞는 것을 넣은 차례대로 적용한다. 죽은 쪽이 예약한 타격은 맞지 않는다(서버의 규칙).
                for (int index = 0; index < pending.Count; index++)
                {
                    (uint tick, bool byPlayer, double coefficient) = pending[index];
                    if (tick > _tick)
                    {
                        continue;
                    }

                    pending.RemoveAt(index--);
                    if (byPlayer)
                    {
                        uint damage = _stats.Damage(player, enemy, coefficient).Damage;
                        engaged = true;
                        hits++;
                        if (damage >= monsterHp)
                        {
                            _tick++;
                            return new FightResult(true, hits, (_tick - start) / (double)Units.TicksPerSecond, taken);
                        }

                        monsterHp -= damage;
                    }
                    else
                    {
                        uint damage = _stats.Damage(enemy, player, 1).Damage;
                        taken += damage;
                        if (damage >= Hp)
                        {
                            Hp = 0;
                            _tick++;
                            return new FightResult(false, hits, (_tick - start) / (double)Units.TicksPerSecond, taken);
                        }

                        Hp -= damage;
                    }
                }

                // 싸우는 동안은 전투 상태의 회복(초마다 최대값의 비율)이다.
                if ((_tick + 1) % Units.TicksPerSecond == 0)
                {
                    uint percent = _data.Constants.CombatRegenPercent;
                    Hp = Math.Min(_level.MaxHp, Hp + (_level.MaxHp * percent / 100));
                    Mp = Math.Min(_level.MaxMp, Mp + (_level.MaxMp * percent / 100));
                }
            }

            return new FightResult(false, hits, MaxTicks / (double)Units.TicksPerSecond, taken);
        }

        /// <summary>
        /// 지금 쓸 수 있는 첫 스킬: 쿨다운이 돌았고 마나가 있고, 대상에게 쓰는 것은 사거리, 자기 중심 범위는 범위 안에 대상이 있다.
        /// </summary>
        private SkillsRow? Ready(double distance)
        {
            foreach (SkillsRow skill in _skills)
            {
                double reach = skill.Center == SkillCenter.Self ? skill.Radius : skill.Range;
                if (Mp >= skill.Mp && distance <= reach && _cooldownEnd.GetValueOrDefault(skill.Id) <= _tick)
                {
                    return skill;
                }
            }

            return null;
        }

        private void Pay(SkillsRow skill)
        {
            Mp -= skill.Mp;
            _cooldownEnd[skill.Id] = _tick + Units.TicksFromMilliseconds(skill.CooldownMs);
        }

        private static uint Travel(double speed, double distance)
        {
            return speed > 0 ? (uint)Math.Ceiling(distance / speed * Units.TicksPerSecond) : 0;
        }
    }
}
