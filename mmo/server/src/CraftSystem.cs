using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 제작(48). 제작 NPC가 하나라 요청에 NPC를 싣지 않는다. 시작할 때는 아무것도 빼지 않고 진행 중인 일(26)을 시작하며, 끝나는 틱에 시작할 때와 같은 확인
    /// (필요 레벨, 재료, 골드, 재료를 뺀 뒤 결과가 들어갈 자리)을 다시 해 한 동기 구간에서 재료와 골드를 빼고 결과를 넣는다. 장비는 주입한 Random과
    /// 제작법의 확률로 등급을 정하고 강화 +0이다. 바뀐 것은 그 틱의 InventoryChanged 하나로 가고 저장도 그 사본 하나다.
    /// </summary>
    internal sealed class CraftSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly ProgressSystem _progress;
        private readonly InventorySystem _inventory;
        private readonly Npc? _crafter;
        private readonly Random _random;
        private readonly long _interactRange;

        public CraftSystem(GameData data, FieldMap field, ProgressSystem progress, InventorySystem inventory, Npc? crafter, Random random)
        {
            _data = data;
            _field = field;
            _progress = progress;
            _inventory = inventory;
            _crafter = crafter;
            _random = random;
            _interactRange = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        /// <summary>
        /// 제작이 끝났다(플레이어, 제작법). 퀘스트(50)가 받는다.
        /// </summary>
        public Action<Player, RecipesRow>? Crafted { get; set; }

        /// <summary>
        /// Craft(입력 차례). 진행 중인 일("진행 중"), 제작법("아이템 없음"), 제작 NPC 곁(3 m "사거리 밖", 선 "막힘"), 만들 수 있는지를 보고 진행 중인 일
        /// (종류 제작, 번호는 Recipes의 줄)을 시작한다. 죽은 동안과 기절한 동안은 World가 먼저 막는다. 답(RequestResult)은 World가 보낸다.
        /// </summary>
        public FailReason Start(Player player, Craft request, uint tick)
        {
            if (player.Progress != null)
            {
                return FailReason.Busy;
            }

            if (_data.Recipe(request.RecipeId) is not RecipesRow recipe)
            {
                return FailReason.NoItem;
            }

            FailReason reason = _crafter?.Reach(player, _field, _interactRange) ?? FailReason.OutOfRange;
            if (reason == FailReason.None)
            {
                reason = Check(player, recipe);
            }

            if (reason == FailReason.None)
            {
                _progress.Start(player, ProgressKind.Craft, recipe.Id, 0, tick + Units.TicksFromMilliseconds(recipe.CraftMs));
            }

            return reason;
        }

        /// <summary>
        /// 제작의 끝(예약한 일의 차례, 꺼낸 자리). 확인을 다시 해 걸리면 아무것도 바꾸지 않고 그 이유로 취소한다. 통과하면 재료와 골드를 빼고 결과를 넣는다
        /// (새로 얻은 것, 까닭 제작). 제작 NPC와의 거리는 다시 보지 않는다(자리를 벗어나면 이미 취소됨).
        /// </summary>
        public void Finish(Player player)
        {
            RecipesRow recipe = _data.Recipe(player.Progress!.Id)!;
            FailReason reason = Check(player, recipe);
            if (reason != FailReason.None)
            {
                _progress.Cancel(player, reason);
                return;
            }

            player.Progress = null;
            _inventory.RemovePlan(player, Removal(player, recipe));

            player.Bag.Gold -= recipe.Gold;
            player.Bag.GoldChanged = true;
            (uint itemId, uint resultCount) = recipe.Kind == RecipeKind.Item
                ? (recipe.ItemId, recipe.Count)
                : (_data.Equipment(recipe.Family, RollGrade(recipe.GradeChances, _random))!.Id, 1u);
            _inventory.Add(player, itemId, resultCount, GainReason.Craft);
            Crafted?.Invoke(player, recipe);
        }

        /// <summary>
        /// 만들 수 있는가: 필요 레벨("레벨 부족"), 재료("재료 부족"), 골드("골드 부족"), 재료를 뺀 뒤 결과가 들어갈 자리("인벤토리 가득". 물약은 같은 물약이
        /// 남는 칸이나 빈 칸, 장비는 빈 칸)의 차례로 본다. 시작과 끝나는 틱이 함께 쓴다.
        /// </summary>
        public FailReason Check(Player player, RecipesRow recipe)
        {
            if (player.Level < recipe.Level)
            {
                return FailReason.LevelTooLow;
            }

            for (int i = 0; i < recipe.Materials.Count; i++)
            {
                if (player.Bag.CountOf(recipe.Materials[i]) < recipe.MaterialCounts[i])
                {
                    return FailReason.NotEnoughMaterials;
                }
            }

            if (player.Bag.Gold < recipe.Gold)
            {
                return FailReason.NotEnoughGold;
            }

            // 장비는 어느 등급이 나와도 빈 칸 하나라 일반 등급으로 묻는다.
            uint result = recipe.Kind == RecipeKind.Item ? recipe.ItemId : _data.Equipment(recipe.Family, ItemGrade.Common)!.Id;
            return _inventory.HasRoomAfter(player, Removal(player, recipe), result, recipe.Kind == RecipeKind.Item ? recipe.Count : 1) ? FailReason.None : FailReason.InventoryFull;
        }

        /// <summary>
        /// 장비의 등급: 일반·고급·희귀·영웅의 확률(합 1)로 하나를 굴린다. 끝의 반올림이 남기는 몫은 마지막 등급이다.
        /// </summary>
        internal static ItemGrade RollGrade(IReadOnlyList<double> chances, Random random)
        {
            double roll = random.NextDouble();
            for (int i = 0; i < chances.Count; i++)
            {
                roll -= chances[i];
                if (roll < 0)
                {
                    return (ItemGrade)(i + 1);
                }
            }

            return (ItemGrade)chances.Count;
        }

        /// <summary>
        /// 재료를 뺄 계획(InventorySystem.Removal): 재료마다 칸의 차례로 필요한 만큼.
        /// </summary>
        private static Dictionary<int, uint> Removal(Player player, RecipesRow recipe)
        {
            return InventorySystem.Removal(player, recipe.Materials.Zip(recipe.MaterialCounts));
        }
    }
}
