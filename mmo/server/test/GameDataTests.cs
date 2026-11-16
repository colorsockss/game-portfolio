using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 생성한 기획 데이터가 빌드에 실려 읽히는지, 파일이 없으면 서버가 뜨지 않는지, 밀리초를 틱으로 올림하는지 확인한다.
    /// </summary>
    public class GameDataTests
    {
        /// <summary>
        /// 실행 파일 옆의 data/에 생성물이 실리고, 해시가 생성한 파일(mmo/shared/data/files/data.hash)과 같다.
        /// </summary>
        [Fact]
        public void LoadsTheGeneratedDataNextToTheExecutable()
        {
            string generated = File.ReadAllText(TestData.Shared(Path.Combine("data/files", GameData.HashFile))).Trim();
            GameData data = GameData.Load(GameData.DefaultFolder);
            Assert.Equal(generated, data.Hash.ToString("x16"));

            // 클라이언트의 엔진 없는 테스트(GameDataTest)가 같은 생성물에서 같은 값을 읽는다.
            Assert.Equal(600u, data.Constants.FieldSize);
            Assert.Equal(new uint[] { 1, 2, 3, 4, 5, 6 }, data.Zones.Rows.Select(zone => zone.Id));
            ZonesRow town = data.Zones.Rows[0];
            Assert.Equal(("zone.town", ZoneKind.Town, true, -40, 40), (town.NameKey, town.Kind, town.Safe, town.MinX, town.MaxX));
            Assert.Equal((0, -10), (town.RespawnX, town.RespawnZ));
            Assert.False(data.Zones.Rows[1].HasRespawnX);

            // 맵 생성기의 격자가 필드와 같은 크기로 읽히고 FieldMap이 받아들인다.
            Assert.Equal((600u, 600u, -300, -300, 360_000), (data.Grid.Width, data.Grid.Depth, data.Grid.OriginX, data.Grid.OriginZ, data.Grid.Cells.Length));
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            Assert.True(field.IsWall(-300 * Units.PerMeter, 0));
            Assert.True(field.CanWalk(town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter, Walker.Player));
        }

        /// <summary>
        /// 장비(34)는 84줄이고 종마다 등급 넷이다. 1단계(필요 레벨 1) 장비는 사냥터 1의 몬스터(묶음 1–3), 2단계(10)는 사냥터 2와 3의 몬스터(4–9)의
        /// 드롭 묶음에만 있고 3단계(20)는 어느 묶음에도 없다(제작 48). 직업의 기본 무기는 그 직업의 1단계 일반 등급 무기다.
        /// </summary>
        [Fact]
        public void EquipmentRowsAndDropsFollowTheirTiers()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            ItemsRow[] equipment = Enumerable.Range(1000, 1000).Select(id => data.Item((uint)id)).OfType<ItemsRow>().Where(item => item.Kind == ItemKind.Equipment).ToArray();
            Assert.Equal(84, equipment.Length);
            Assert.All(equipment.GroupBy(item => item.Family), family => Assert.Equal(new[] { ItemGrade.Common, ItemGrade.Uncommon, ItemGrade.Rare, ItemGrade.Epic }, family.Select(item => item.Grade).OrderBy(grade => grade)));
            for (uint group = 1; group <= 9; group++)
            {
                uint tier = group <= 3 ? 1u : 10u;
                Assert.All(data.DropGroup(group)!.Items.Select(id => data.Item(id)!).Where(item => item.Kind == ItemKind.Equipment), item => Assert.Equal(tier, item.Level));
            }

            foreach (ClassesRow row in data.Classes.Rows)
            {
                ItemsRow weapon = data.Item(row.StartWeapon)!;
                Assert.Equal((EquipSlot.Weapon, row.Id, 1u, ItemGrade.Common), (weapon.Slot, weapon.Class, weapon.Level, weapon.Grade));
            }
        }

        /// <summary>
        /// 스킬북(36)은 직업마다 첫 스킬을 뺀 스킬의 책이고(10줄) 직업과 필요 레벨의 열을 비운다. 넷째와 다섯째 스킬의 책은 사냥터 2와 3의 몬스터의 묶음(4–9)마다,
        /// 여섯째 스킬의 책(기사, 마법사의 소환 95)은 사냥터 3의 묶음(7–9)마다 있고 그 밖의 묶음에는 없다. 둘째와 셋째 스킬의 책은 어느 묶음에도 없다(상점 37).
        /// </summary>
        [Fact]
        public void SkillBooksTeachTheLaterSkillsAndDropByZone()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            ItemsRow[] books = Enumerable.Range(2000, 1000).Select(id => data.Item((uint)id)).OfType<ItemsRow>().Where(item => item.Use == ItemUse.LearnSkill).ToArray();
            uint[] firstSkills = data.Classes.Rows.Select(row => row.FirstSkill).ToArray();
            // 몬스터의 스킬(직업 없음. 보스 43)은 배우지 않아 책이 없다.
            Assert.Equal(data.Skills.Rows.Where(skill => skill.HasClass).Select(skill => skill.Id).Except(firstSkills).Order(), books.Select(book => book.UseValue).Order());
            Assert.All(books, book => Assert.False(book.HasClass || book.HasLevel));
            for (uint group = 1; group <= 9; group++)
            {
                uint[] dropped = data.DropGroup(group)!.Items.Where(id => data.Item(id)!.Use == ItemUse.LearnSkill).Select(id => data.Item(id)!.UseValue).Order().ToArray();
                uint[] expected = group < 4 ? new uint[0] : group < 7 ? new uint[] { 104, 105, 204, 205 } : new uint[] { 104, 105, 106, 204, 205, 206 };
                Assert.Equal(expected, dropped);
            }
        }

        /// <summary>
        /// 상점(37)은 9줄(1단계 체력·마나 물약, 귀환 주문서, 강화 주문서, 직업마다 둘째와 셋째 스킬의 책, 첫째 펫의 아이템 96)이고, 사는 값이 파는 값보다 커서 사고팔아 골드가 늘지 않는다.
        /// 상점 NPC와 창고 NPC(75)는 하나씩이고 마을 안에 선다.
        /// </summary>
        [Fact]
        public void TheShopSellsTheStarterGoodsFromTheTownMerchant()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            Assert.Equal(new uint[] { 2001, 2003, 2005, 2006, 2102, 2103, 2202, 2203, 2301 }, data.Shops.Rows.Select(row => row.ItemId));
            Assert.All(data.Shops.Rows, row => Assert.True(row.Price > data.Item(row.ItemId)!.SellPrice));
            ZonesRow town = data.Zones.Rows.Single(zone => zone.Kind == ZoneKind.Town);
            foreach (NpcRole role in new[] { NpcRole.Shop, NpcRole.Storage })
            {
                NpcsRow npc = Assert.Single(data.Npcs.Rows, row => row.Role == role);
                Assert.InRange(npc.X, town.MinX, town.MaxX - 1);
                Assert.InRange(npc.Z, town.MinZ, town.MaxZ - 1);
            }
        }

        /// <summary>
        /// 직업은 2줄, 레벨은 직업 2 × 레벨 1–30의 60줄이고, 같은 레벨에서 기사는 최대 체력과 방어력이, 마법사는 최대 마나와 공격력이 높다.
        /// 마법사만 기본 공격의 발사체가 있다.
        /// </summary>
        [Fact]
        public void ClassesAndLevelsCoverBothClassesUpToThirty()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            Assert.Equal(new uint[] { 1, 2 }, data.Classes.Rows.Select(row => row.Id));
            Assert.False(data.Classes.Rows[0].HasProjectileSpeed);
            Assert.True(data.Classes.Rows[1].HasProjectileSpeed);
            Assert.Equal(430u, data.Classes.Rows[0].HitDelayMs);

            for (uint level = 1; level <= 30; level++)
            {
                LevelsRow knight = data.Level(CharacterClass.Knight, level);
                LevelsRow mage = data.Level(CharacterClass.Mage, level);
                Assert.Equal((100 + level, 200 + level), (knight.Id, mage.Id));
                Assert.True(knight.MaxHp > mage.MaxHp);
                Assert.True(knight.Defense > mage.Defense);
                Assert.True(mage.MaxMp > knight.MaxMp);
                Assert.True(mage.Attack > knight.Attack);
            }

            Assert.Throws<System.Collections.Generic.KeyNotFoundException>(() => data.Level(CharacterClass.Knight, 31));
        }

        /// <summary>
        /// 몬스터는 일반 9종이고 사냥터 1은 비선공 3, 사냥터 2는 비선공 2와 선공 1(원거리), 사냥터 3은 비선공 1과 선공 2다.
        /// 무리는 사냥터마다 12무리 60마리(종마다 4무리)이고 채집지에 사냥터 1의 비선공 한 종이 4무리다.
        /// </summary>
        [Fact]
        public void TheBossStandsAloneInItsLair()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            MonstersRow boss = Assert.Single(data.Spawns.Rows.Where(row => row.HasMonsterId).Select(row => data.Monster(row.MonsterId)).Distinct(), monster => monster.Kind == MonsterKind.Boss);
            SpawnsRow spawn = Assert.Single(data.Spawns.Rows, row => row.HasMonsterId && (row.MonsterId == boss.Id));
            Assert.Equal(1u, spawn.Count);
            Assert.Equal(ZoneKind.BossArea, data.Zones.Rows.Single(zone => zone.Id == field.ZoneAt(spawn.X * Units.PerMeter, spawn.Z * Units.PerMeter)).Kind);
            Assert.True(field.CanWalk((spawn.X * Units.PerMeter) + (Units.PerMeter / 2), (spawn.Z * Units.PerMeter) + (Units.PerMeter / 2), Walker.Monster));
            SkillsRow slam = data.Skill(boss.Skill)!;
            Assert.Equal((SkillKind.AreaDamage, SkillCenter.Target, false, 1500u), (slam.Kind, slam.Center, slam.HasClass, slam.WarnMs));
            uint[] books = data.DropGroup(boss.DropGroup)!.Items.Where(id => data.Item(id)!.Use == ItemUse.LearnSkill).Select(id => data.Item(id)!.UseValue).Order().ToArray();
            Assert.Equal(new uint[] { 104, 105, 106, 204, 205, 206 }, books);
        }

        /// <summary>
        /// 체험 캐릭터(94)의 처음 상태: 두 직업 모두 레벨 20, 입은 장비는 칸마다 하나이고 그 직업이 입을 수 있는 레벨 20 이하의 장비이며, 아이템과 수의 차례가 같고, 펫이 있다.
        /// </summary>
        [Fact]
        public void DemoCharactersStartReady()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            foreach (ClassesRow row in data.Classes.Rows)
            {
                Assert.Equal(20u, row.DemoLevel);
                ItemsRow[] worn = row.DemoEquipment.Select(id => data.Item(id)!).ToArray();
                Assert.Equal(worn.Length, worn.Select(item => item.Slot).Distinct().Count());
                Assert.All(worn, item => Assert.True(item.Kind == ItemKind.Equipment && item.Level <= row.DemoLevel && (!item.HasClass || item.Class == row.Id)));
                Assert.Equal(row.DemoItems.Count, row.DemoCounts.Count);
                Assert.NotNull(data.Pet(row.DemoPet));
            }
        }

        /// <summary>
        /// 경비병(44)은 마을 안의 4명이고 모두 종류가 경비병인 Monsters의 한 줄을 가리킨다. 무법자의 부활 지점은 안전 지대 밖이고 모든 경비병의 인식 범위 밖이다
        /// (맵 툴의 검증과 같은 조건).
        /// </summary>
        [Fact]
        public void GuardsStandInTheTownAwayFromTheOutlawRespawn()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            NpcsRow[] guards = data.Npcs.Rows.Where(row => row.Role == NpcRole.Guard).ToArray();
            Assert.Equal(4, guards.Length);
            MonstersRow stats = data.Monster(Assert.Single(guards.Select(row => row.MonsterId).Distinct()));
            Assert.Equal(MonsterKind.Guard, stats.Kind);
            ZonesRow town = data.Zones.Rows.Single(zone => zone.Kind == ZoneKind.Town);
            Assert.All(guards, guard => Assert.True(field.IsSafe(guard.X * Units.PerMeter, guard.Z * Units.PerMeter)));
            Assert.False(field.IsSafe(town.OutlawRespawnX * Units.PerMeter, town.OutlawRespawnZ * Units.PerMeter));
            Assert.All(guards, guard => Assert.True(Math.Sqrt(Math.Pow(town.OutlawRespawnX - guard.X, 2) + Math.Pow(town.OutlawRespawnZ - guard.Z, 2)) > stats.DetectRange));
        }

        /// <summary>
        /// 놓인 일반 몬스터의 양(72): 사냥터마다 12무리 60마리, 채집지는 한 종류.
        /// </summary>
        [Fact]
        public void MonstersAndSpawnsFollowTheContentPlan()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            // 보스(43)의 줄은 TheBossStandsAloneInItsLair가 본다.
            SpawnsRow[] spawns = data.Spawns.Rows.Where(spawn => spawn.HasMonsterId && (data.Monster(spawn.MonsterId).Kind == MonsterKind.Normal)).ToArray();
            Assert.Equal(40, spawns.Length);
            var byZone = spawns.GroupBy(spawn => field.ZoneAt(spawn.X * Units.PerMeter, spawn.Z * Units.PerMeter)).ToDictionary(group => group.Key, group => group.ToList());
            Assert.Equal(new uint[] { 2, 3, 4, 5 }, byZone.Keys.OrderBy(zone => zone));
            foreach (uint hunting in new uint[] { 2, 3, 4 })
            {
                List<SpawnsRow> groups = byZone[hunting];
                Assert.Equal((12, 60L), (groups.Count, groups.Sum(group => (long)group.Count)));
                Assert.All(groups.GroupBy(group => group.MonsterId), species => Assert.Equal(4, species.Count()));
                Assert.Equal(3, groups.Select(group => group.MonsterId).Distinct().Count());
            }

            int Aggressive(uint zone) => byZone[zone].Select(group => group.MonsterId).Distinct().Count(id => data.Monster(id).Aggressive);
            Assert.Equal((0, 1, 2), (Aggressive(2), Aggressive(3), Aggressive(4)));
            Assert.All(byZone[5], group => Assert.False(data.Monster(group.MonsterId).Aggressive));
            Assert.Single(byZone[5].Select(group => group.MonsterId).Distinct());
            Assert.Contains(byZone[5][0].MonsterId, byZone[2].Select(group => group.MonsterId));

            List<MonstersRow> monsters = Enumerable.Range(1, 9).Select(id => data.Monster((uint)id)).ToList();
            Assert.All(monsters, monster => Assert.Equal(MonsterKind.Normal, monster.Kind));
            MonstersRow ranged = Assert.Single(monsters, monster => monster.HasProjectileSpeed);
            Assert.True(ranged.Aggressive);
            Assert.Contains(ranged.Id, byZone[3].Select(group => group.MonsterId));
            Assert.True(ranged.AttackRange > monsters.Where(monster => monster != ranged).Max(monster => monster.AttackRange));
        }

        /// <summary>
        /// 채집물(47)은 나무·광석·약초 × 2단계의 6종이고, Spawns의 채집물 줄은 종마다 4무리, 무리마다 3개로 24줄 72개이며 모두 채집지 안이다.
        /// 재료는 채집물마다 다른 재료(Items의 재료)다.
        /// </summary>
        [Fact]
        public void GatherNodesFollowTheContentPlan()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            GatherNodesRow[] nodes = Enumerable.Range(1, 6).Select(id => data.GatherNode((uint)id)).ToArray();
            Assert.Equal(new[] { GatherKind.Wood, GatherKind.Ore, GatherKind.Herb }, nodes.Select(node => node.Kind).Distinct());
            Assert.All(nodes.GroupBy(node => node.Kind), kind => Assert.Equal(2, kind.Select(node => node.Level).Distinct().Count()));
            Assert.Equal(6, nodes.Select(node => node.ItemId).Distinct().Count());
            Assert.All(nodes, node => Assert.Equal(ItemKind.Material, data.Item(node.ItemId)!.Kind));

            SpawnsRow[] spawns = data.Spawns.Rows.Where(row => row.HasGatherNodeId).ToArray();
            Assert.Equal((24, 72L), (spawns.Length, spawns.Sum(row => (long)row.Count)));
            Assert.All(spawns.GroupBy(row => row.GatherNodeId), kind => Assert.Equal(4, kind.Count()));
            Assert.All(spawns, row => Assert.Equal(ZoneKind.GatheringGround, data.Zones.Rows.Single(zone => zone.Id == field.ZoneAt(row.X * Units.PerMeter, row.Z * Units.PerMeter)).Kind));
        }

        /// <summary>
        /// 제작법(48)은 16개: 2단계 물약 2(체력, 마나)와 2·3단계 장비 14(무기 2종과 방어구 다섯 칸, 종마다 등급 넷이 Items에 있음)이다. 장비 제작법의 확률은 넷이고
        /// 합이 1이며, 2단계 물약과 3단계 장비는 Shops와 DropGroups에 없다. 재료는 모두 채집물이나 몬스터의 드롭에서 나온다.
        /// </summary>
        [Fact]
        public void RecipesFollowTheContentPlan()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            RecipesRow[] recipes = data.Recipes.Rows.ToArray();
            Assert.Equal(16, recipes.Length);
            Assert.Equal(new uint[] { 2002, 2004 }, recipes.Where(row => row.Kind == RecipeKind.Item).Select(row => row.ItemId).OrderBy(id => id));
            uint[] families = recipes.Where(row => row.Kind == RecipeKind.Equipment).Select(row => row.Family).OrderBy(family => family).ToArray();
            Assert.Equal(new uint[] { 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21 }, families);
            Assert.All(recipes.Where(row => row.Kind == RecipeKind.Equipment), row =>
            {
                Assert.Equal(4, row.GradeChances.Count);
                Assert.Equal(1.0, row.GradeChances.Sum(), 6);
                Assert.All(new[] { ItemGrade.Common, ItemGrade.Uncommon, ItemGrade.Rare, ItemGrade.Epic }, grade => Assert.NotNull(data.Equipment(row.Family, grade)));
            });
            Assert.All(recipes.Where(row => row.Kind == RecipeKind.Item), row => Assert.Empty(row.GradeChances));

            var craftedOnly = new HashSet<uint> { 2002, 2004 };
            craftedOnly.UnionWith(families.Where(family => family % 3 == 0)
                .SelectMany(family => new[] { ItemGrade.Common, ItemGrade.Uncommon, ItemGrade.Rare, ItemGrade.Epic }.Select(grade => data.Equipment(family, grade)!.Id)));
            Assert.DoesNotContain(data.Shops.Rows, row => craftedOnly.Contains(row.ItemId));
            Assert.DoesNotContain(data.AllDropGroups.SelectMany(row => row.Items), craftedOnly.Contains);

            var sources = new HashSet<uint>(Enumerable.Range(1, 6).Select(id => data.GatherNode((uint)id).ItemId));
            sources.UnionWith(data.AllDropGroups.SelectMany(row => row.Items));
            Assert.All(recipes.SelectMany(row => row.Materials), material => Assert.Contains(material, sources));
        }

        /// <summary>
        /// 퀘스트(50)는 10개이고 번호가 1부터 이어지며, 조건의 대상은 종류마다 있는 줄(잡기는 Monsters, 모으기는 Items, 제작은 Recipes, 장비 입기는 장비 칸)이고
        /// 보상 아이템도 있는 줄이다. 사냥 → 장비 → 채집 → 제작의 차례로 처음 나오는 단계가 이어진다.
        /// </summary>
        [Fact]
        public void QuestsFollowTheContentPlan()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            QuestsRow[] quests = data.Quests.Rows.ToArray();
            Assert.Equal(Enumerable.Range(1, 10).Select(id => (uint)id), quests.Select(row => row.Id));
            Assert.All(quests, row =>
            {
                switch (row.Kind)
                {
                    case QuestKind.Kill:
                        Assert.NotNull(data.FindMonster(row.Target));
                        break;
                    case QuestKind.Collect:
                        Assert.NotNull(data.Item(row.Target));
                        break;
                    case QuestKind.Craft:
                        Assert.NotNull(data.Recipe(row.Target));
                        break;
                    case QuestKind.Equip:
                        Assert.InRange(row.Target, 1u, 6u);
                        break;
                    default:
                        Assert.Equal(QuestKind.Level, row.Kind);
                        break;
                }

                Assert.True(!row.HasRewardItemId || ((data.Item(row.RewardItemId) != null) && (row.RewardItemCount > 0)));
            });
            // 채집 단계는 채집 재료를 모으는 퀘스트다(사냥 단계의 모으기는 몬스터 부산물).
            var gathered = new HashSet<uint>(Enumerable.Range(1, 6).Select(id => data.GatherNode((uint)id).ItemId));
            int First(Func<QuestsRow, bool> match) => Array.FindIndex(quests, row => match(row));
            int hunt = First(row => row.Kind == QuestKind.Kill);
            int gear = First(row => row.Kind == QuestKind.Equip);
            int gather = First(row => (row.Kind == QuestKind.Collect) && gathered.Contains(row.Target));
            int craft = First(row => row.Kind == QuestKind.Craft);
            Assert.True((hunt >= 0) && (hunt < gear) && (gear < gather) && (gather < craft));
        }

        /// <summary>
        /// 플레이어의 스킬 12줄(직업마다 여섯)의 차례와 종류가 설계의 표와 같고, 필요 레벨은 1, 5, 10, 14, 17, 20이다. 마법사의 여섯째는 소환(95)이다.
        /// 시전 시간은 마법사의 대상 중심 범위 피해, 회복, 시전하는 단일 피해, 소환에만 있고 그 줄의 타격까지의 시간은 0이다. 거는 효과는 Effects의 줄이고,
        /// Classes의 첫 스킬은 직업의 첫째 스킬이다.
        /// </summary>
        [Fact]
        public void SkillsFollowTheClassTables()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            List<SkillsRow> knight = data.Skills.Rows.Where(skill => skill.Class == 1).OrderBy(skill => skill.Id).ToList();
            List<SkillsRow> mage = data.Skills.Rows.Where(skill => skill.Class == 2).OrderBy(skill => skill.Id).ToList();
            Assert.Equal(12, data.Skills.Rows.Count(skill => skill.HasClass));
            EffectKind? Effect(SkillsRow skill) => skill.HasEffect ? data.Effect(skill.Effect).Kind : null;
            Assert.Equal(
                new (SkillKind, SkillCenter, EffectKind?)[]
                {
                    (SkillKind.SingleDamage, SkillCenter.Target, null), (SkillKind.Debuff, SkillCenter.Target, EffectKind.Stun), (SkillKind.Buff, SkillCenter.Self, EffectKind.DefenseUp),
                    (SkillKind.AreaDamage, SkillCenter.Self, null), (SkillKind.SingleDamage, SkillCenter.Target, EffectKind.Slow), (SkillKind.Buff, SkillCenter.Self, EffectKind.AttackUp),
                },
                knight.Select(skill => (skill.Kind, skill.Center, Effect(skill))));
            Assert.Equal(
                new (SkillKind, SkillCenter, EffectKind?)[]
                {
                    (SkillKind.SingleDamage, SkillCenter.Target, EffectKind.Slow), (SkillKind.AreaDamage, SkillCenter.Target, null), (SkillKind.Heal, SkillCenter.Self, null),
                    (SkillKind.AreaDamage, SkillCenter.Self, EffectKind.Slow), (SkillKind.SingleDamage, SkillCenter.Target, null), (SkillKind.Summon, SkillCenter.Self, null),
                },
                mage.Select(skill => (skill.Kind, skill.Center, Effect(skill))));
            Assert.Equal(new uint[] { 1, 5, 10, 14, 17, 20 }, knight.Select(skill => skill.Level));
            Assert.Equal(new uint[] { 1, 5, 10, 14, 17, 20 }, mage.Select(skill => skill.Level));
            Assert.Equal(new uint[] { 1500, 1000, 2000, 2000 }, data.Skills.Rows.Where(skill => skill.CastMs > 0).Select(skill => skill.CastMs));
            Assert.Equal(new[] { mage[1], mage[2], mage[4], mage[5] }, data.Skills.Rows.Where(skill => skill.CastMs > 0));
            Assert.Equal((MonsterKind.Summon, 180000u), (data.Monster(mage[5].SummonMonster).Kind, mage[5].SummonMs));
            Assert.All(data.Skills.Rows.Where(skill => skill.CastMs > 0), skill => Assert.Equal(0u, skill.HitDelayMs));
            Assert.True(mage[4].Coefficient > mage[0].Coefficient);
            Assert.Equal((knight[0].Id, mage[0].Id), (data.Class(CharacterClass.Knight).FirstSkill, data.Class(CharacterClass.Mage).FirstSkill));
        }

        /// <summary>
        /// 해시 파일이 없거나 16진수 16자가 아니면 읽지 못한다. 테이블의 파일이 없어도 읽지 못한다.
        /// </summary>
        [Fact]
        public void RejectsAMissingOrBrokenHash()
        {
            string folder = Directory.CreateTempSubdirectory("mmo-data-").FullName;
            try
            {
                Assert.Throws<FileNotFoundException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c442\n");
                Assert.Throws<InvalidDataException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c1g\n");
                Assert.Throws<InvalidDataException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c14\n");
                Assert.Equal(0xe3b0c44298fc1c14, GameData.ReadHash(folder));
                Assert.Throws<FileNotFoundException>(() => GameData.Load(folder));
            }
            finally
            {
                Directory.Delete(folder, recursive: true);
            }
        }

        /// <summary>
        /// 데이터 폴더를 읽지 못하면 서버가 포트를 열기 전에 1로 끝난다.
        /// </summary>
        [Fact]
        public async Task TheServerDoesNotStartWithoutData()
        {
            string folder = Path.Combine(Path.GetTempPath(), $"mmo-no-data-{Guid.NewGuid():N}");
            Assert.Equal(1, await Program.Main(new[] { "--data", folder, "--port", "0", "--database", ":memory:" }));
        }

        /// <summary>
        /// 밀리초 → 틱은 올림이다(틱 하나 50 ms).
        /// </summary>
        [Theory]
        [InlineData(0u, 0u)]
        [InlineData(1u, 1u)]
        [InlineData(50u, 1u)]
        [InlineData(51u, 2u)]
        [InlineData(uint.MaxValue, 85899346u)]
        public void MillisecondsRoundUpToTicks(uint milliseconds, uint ticks)
        {
            Assert.Equal(ticks, Units.TicksFromMilliseconds(milliseconds));
        }
    }
}
