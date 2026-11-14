using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 경험치와 레벨(31). 죽은 몬스터의 경험치는 죽는 순간 피해 표에서 피해의 합이 가장 큰 편(파티로 합쳐 견줌. 42)이 받는다. 편이 파티면 잡은 자리의 둘레 9개 시야 칸에
    /// 있는 살아 있는 파티원이 (경험치 × (1 + 보너스 × (받는 인원 − 1)))을 받는 인원으로 나눠 받는다(끝수는 버림).
    /// 경험치는 지금 레벨에서 쌓은 양이고, Levels의 필요 경험치 이상이면 그만큼 빼고 레벨을 올리기를 되풀이한다. 최대 레벨에서는 쌓지 않는다.
    /// 레벨이 오르면 능력치를 다시 구하고 체력과 마나를 채우며, 레벨은 EntityState(표시 상태), 능력치와 체력은 VitalsSystem이 보낸다.
    /// </summary>
    internal sealed class GrowthSystem
    {
        private readonly EntityTable _entities;
        private readonly StatSystem _stats;
        private readonly GameData _data;
        private readonly PartySystem _party;
        private readonly List<Player> _sharers = new List<Player>();
        private readonly Dictionary<CharacterClass, uint> _maxLevel;

        public GrowthSystem(EntityTable entities, StatSystem stats, GameData data, PartySystem party)
        {
            _entities = entities;
            _stats = stats;
            _party = party;
            _data = data;
            _maxLevel = data.Classes.Rows.ToDictionary(row => (CharacterClass)row.Id, row => MaxLevelOf(data, (CharacterClass)row.Id));
        }

        /// <summary>
        /// 이 틱에 몬스터의 경험치를 받은 플레이어들(최대 레벨이라 쌓지 않은 플레이어도 든다). 뒤의 항목(성향 44, 퀘스트 50)이 읽고, 틱이 시작할 때 비운다.
        /// </summary>
        public List<(Monster Monster, Player Player)> Rewarded { get; } = new List<(Monster Monster, Player Player)>();

        /// <summary>
        /// 몬스터가 죽었다(죽은 차례). 잡은 편이 플레이어면 아직 월드에 있을 때 경험치를 주고, 파티면 받는 파티원에게 나눠 준다.
        /// </summary>
        public void Killed(Monster monster)
        {
            if (monster.Killer is not ulong side)
            {
                return;
            }

            uint partyId = PartySystem.PartyOfSide(side);
            if (partyId == 0)
            {
                if (_entities.Find((uint)side) is Player player)
                {
                    Rewarded.Add((monster, player));
                    Gain(player, monster.Template.Exp);
                }

                return;
            }

            _sharers.Clear();
            _sharers.AddRange(_party.Members(partyId).Where(member => !member.Dead && Grid.Near(member.Cell, monster.Cell)));
            if (_sharers.Count == 0)
            {
                return;
            }

            ulong total = (ulong)monster.Template.Exp * (100 + (_data.Constants.PartyExpBonusPercent * (ulong)(_sharers.Count - 1)));
            uint share = (uint)(total / (100 * (ulong)_sharers.Count));
            foreach (Player member in _sharers)
            {
                Rewarded.Add((monster, member));
                Gain(member, share);
            }
        }

        /// <summary>
        /// 경험치를 더하고 넘친 만큼 레벨을 올린다. 쌓았으면 본인에게 ExpGained를 보낸다.
        /// </summary>
        public void Gain(Player player, uint amount)
        {
            uint maxLevel = _maxLevel[player.Class];
            if (player.Level >= maxLevel)
            {
                return;
            }

            ulong exp = player.Exp + (ulong)amount;
            uint level = player.Level;
            while ((level < maxLevel) && (exp >= _data.Level(player.Class, level).Exp))
            {
                exp -= _data.Level(player.Class, level).Exp;
                level++;
            }

            player.Exp = level >= maxLevel ? 0 : (uint)exp;
            player.DirtySlow = true;
            SetLevel(player, level);
            player.Session.Send(new Packet { ExpGained = new ExpGained { Amount = (int)Math.Min(amount, int.MaxValue), Exp = player.Exp } });
        }

        /// <summary>
        /// 레벨을 바꾼다(레벨 업과 개발 명령). 바뀌었으면 능력치를 다시 구하고 체력과 마나를 가득 채운다.
        /// </summary>
        public void SetLevel(Player player, uint level)
        {
            if (level == player.Level)
            {
                return;
            }

            player.SetDisplayState(level, player.NameColor, player.WeaponItemId);
            player.DirtyFast = true;
            _stats.Recalculate(player);
            player.Hp = player.MaxHp;
            player.Mp = player.MaxMp;
        }

        /// <summary>
        /// 직업의 최대 레벨(Levels에 있는 가장 높은 레벨).
        /// </summary>
        public uint MaxLevel(CharacterClass characterClass)
        {
            return _maxLevel[characterClass];
        }

        private static uint MaxLevelOf(GameData data, CharacterClass characterClass)
        {
            uint level = 1;
            while (data.HasLevel(characterClass, level + 1))
            {
                level++;
            }

            return level;
        }
    }
}
