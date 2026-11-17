using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using Google.Protobuf;
using PortfolioMmo.Data;
using PortfolioMmo.Server;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 월드와 시스템의 테스트가 쓰는 시험용 기획 데이터. 파일을 읽지 않고 코드로 만든다(로더의 테스트만 생성물을 읽음).
    /// </summary>
    internal static class TestData
    {
        public const ulong Hash = 0x0123456789abcdef;

        /// <summary>
        /// 필드의 크기(m). 실제 데이터와 같은 600 m다(-300 m 이상 300 m 미만).
        /// </summary>
        public const uint FieldSize = 600;

        // 정적 필드는 적은 차례로 채워지므로 Data보다 먼저 둔다.
        /// <summary>
        /// 1레벨의 능력치: 기사 (150, 50, 12, 10), 마법사 (100, 120, 15, 6).
        /// </summary>
        public static readonly Stats KnightLevel1 = new Stats(150, 50, 12, 10);
        public static readonly Stats MageLevel1 = new Stats(100, 120, 15, 6);

        /// <summary>
        /// 벽이 없는 600 m 필드와 원점에 부활 지점을 둔 마을 하나의 데이터. 새 캐릭터가 원점에서 시작한다.
        /// 구역과 벽의 규칙은 FieldMapTests가 FieldMap으로 직접 보고, 벽에 막히는 월드는 WithMap으로 만든다.
        /// </summary>
        public static readonly GameData Data = new GameData(Hash, Constants(FieldSize), new Zones { Rows = { Town(0, 0) } }, EmptyGrid(FieldSize), Classes, Levels, new Monsters(), new Spawns(), Skills, Effects, Items);

        /// <summary>
        /// 시험용 아이템(32): 2001 체력 물약(50, 쿨다운 10초), 2002 상급 체력 물약(100, 같은 쿨다운), 2003 마나 물약(40), 2005 귀환 주문서(3초),
        /// 3001 겹치는 재료, 4001 골드, 장비 1001 기사의 검(공격력 5), 1002 마법사의 지팡이(6), 1003 공용 투구(방어력 3), 1004 레벨 2의 갑옷(방어력 6, 최대 체력 20), 2006 강화 주문서, 스킬북 2102(기사 102), 2106(기사 106, 레벨 3), 2202(마법사 202), 펫 아이템 2301(펫 1), 2302(펫 2. 96). 상점에 파는 값은 2001이 5, 3001이 2이고 나머지는 없다. 직업은 모두 체력 물약 3개와 마나 물약 2개로 시작한다.
        /// </summary>
        public static Items Items => new Items
        {
            Rows =
            {
                new ItemsRow { Id = 2001, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.HealHp, UseValue = 50, CooldownMs = 10000, SellPrice = 5 },
                new ItemsRow { Id = 2002, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Uncommon, Stackable = true, Use = ItemUse.HealHp, UseValue = 100, CooldownMs = 10000 },
                new ItemsRow { Id = 2003, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.HealMp, UseValue = 40, CooldownMs = 10000 },
                new ItemsRow { Id = 2005, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.Recall, UseMs = 3000 },
                new ItemsRow { Id = 3001, NameKey = "item.test", Kind = ItemKind.Material, Grade = ItemGrade.Common, Stackable = true, SellPrice = 2 },
                new ItemsRow { Id = 1001, NameKey = "item.test", Kind = ItemKind.Equipment, Grade = ItemGrade.Common, Family = 1, Slot = EquipSlot.Weapon, Class = 1, Level = 1, Attack = 5 },
                new ItemsRow { Id = 1002, NameKey = "item.test", Kind = ItemKind.Equipment, Grade = ItemGrade.Common, Family = 2, Slot = EquipSlot.Weapon, Class = 2, Level = 1, Attack = 6 },
                new ItemsRow { Id = 1003, NameKey = "item.test", Kind = ItemKind.Equipment, Grade = ItemGrade.Common, Family = 3, Slot = EquipSlot.Helmet, Level = 1, Defense = 3 },
                new ItemsRow { Id = 1004, NameKey = "item.test", Kind = ItemKind.Equipment, Grade = ItemGrade.Common, Family = 4, Slot = EquipSlot.Armor, Level = 2, Defense = 6, MaxHp = 20 },
                new ItemsRow { Id = 4001, NameKey = "item.test", Kind = ItemKind.Gold, Grade = ItemGrade.Common, Stackable = true },
                new ItemsRow { Id = 2006, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Uncommon, Stackable = true, Use = ItemUse.Enchant },
                new ItemsRow { Id = 2102, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.LearnSkill, UseValue = 102 },
                new ItemsRow { Id = 2106, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.LearnSkill, UseValue = 106 },
                new ItemsRow { Id = 2202, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Common, Stackable = true, Use = ItemUse.LearnSkill, UseValue = 202 },
                new ItemsRow { Id = 2301, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Uncommon, Stackable = true, Use = ItemUse.GetPet, UseValue = 1 },
                new ItemsRow { Id = 2302, NameKey = "item.test", Kind = ItemKind.Consumable, Grade = ItemGrade.Epic, Stackable = true, Use = ItemUse.GetPet, UseValue = 2 },
            },
        };

        /// <summary>
        /// 시험용 강화 단계(35): +1–+3과 +5–+9는 늘 성공하고 +4는 늘 실패한다(결과를 씨앗과 상관없이 정함). 비율은 단계마다 0.1씩 오른다.
        /// </summary>
        public static Enchants Enchants
        {
            get
            {
                var table = new Enchants();
                for (uint level = 1; level <= 9; level++)
                {
                    table.Rows.Add(new EnchantsRow { Id = level, Chance = level == 4 ? 0.0 : 1.0, StatRate = 1.0 + (0.1 * level) });
                }

                return table;
            }
        }

        /// <summary>
        /// 시험용 드롭 묶음(33): 1은 재료 3001 둘과 골드 10을 늘 떨어뜨린다.
        /// </summary>
        /// <summary>
        /// 시험용 펫(96): 1은 줍는 거리 3 m, 2는 6 m.
        /// </summary>
        public static Pets Pets => new Pets
        {
            Rows = { new PetsRow { Id = 1, NameKey = "pet.test", PickRange = 3 }, new PetsRow { Id = 2, NameKey = "pet.test", PickRange = 6 } },
        };

        public static DropGroups DropGroups => new DropGroups
        {
            Rows = { new DropGroupsRow { Id = 1, Items = { 3001 }, Chances = { 1.0 }, MinCounts = { 2 }, MaxCounts = { 2 }, GoldChance = 1.0, GoldMin = 10, GoldMax = 10 } },
        };

        /// <summary>
        /// 시험용 직업 둘(기사 근접, 마법사 발사체).
        /// </summary>
        public static Classes Classes => new Classes
        {
            Rows =
            {
                new ClassesRow { Id = 1, AttackRange = 2, AttackIntervalMs = 1000, HitDelayMs = 300, FirstSkill = 101, StartItems = { 2001, 2003 }, StartCounts = { 3, 2 } },
                new ClassesRow { Id = 2, AttackRange = 12, AttackIntervalMs = 1200, HitDelayMs = 300, ProjectileSpeed = 20, FirstSkill = 201, StartItems = { 2001, 2003 }, StartCounts = { 3, 2 } },
            },
        };

        /// <summary>
        /// 시험용 스킬(실제 데이터의 차례와 종류. 계수는 1이나 2이고 쿨다운은 1초, 마나는 10, 타격까지의 시간은 300 ms, 필요 레벨은 1(106만 3)이다). 201은 20 m/s(틱마다 1 m)의 직선 발사체다.
        /// 기사: 101 단일, 102 기절, 103 방어력 올림, 104 자기 중심 범위(4 m), 105 감속을 거는 단일, 106 공격력 올림.
        /// 마법사: 201 감속을 거는 단일(12 m), 202 대상 중심 범위(4 m, 시전 1.5초), 203 회복(계수 2, 시전 1초), 204 감속을 거는 자기 중심 범위(5 m),
        /// 205 시전하는 단일(시전 2초), 206 소환(시전 없음, 소환수 5를 10초. 95).
        /// </summary>
        public static Skills Skills => new Skills
        {
            Rows =
            {
                Skill(101, 1, SkillKind.SingleDamage, 2, SkillCenter.Target),
                Skill(102, 1, SkillKind.Debuff, 2, SkillCenter.Target, coefficient: 0, effect: 1),
                Skill(103, 1, SkillKind.Buff, 8, SkillCenter.Self, coefficient: 0, effect: 3, hitDelayMs: 0),
                Skill(104, 1, SkillKind.AreaDamage, 0, SkillCenter.Self, radius: 4),
                Skill(105, 1, SkillKind.SingleDamage, 2, SkillCenter.Target, effect: 2),
                Skill(106, 1, SkillKind.Buff, 8, SkillCenter.Self, coefficient: 0, effect: 4, hitDelayMs: 0, level: 3),
                Skill(201, 2, SkillKind.SingleDamage, 12, SkillCenter.Target, effect: 2, projectileSpeed: 20),
                Skill(202, 2, SkillKind.AreaDamage, 12, SkillCenter.Target, radius: 4, castMs: 1500),
                Skill(203, 2, SkillKind.Heal, 12, SkillCenter.Self, coefficient: 2, castMs: 1000),
                Skill(204, 2, SkillKind.AreaDamage, 0, SkillCenter.Self, radius: 5, effect: 2),
                Skill(205, 2, SkillKind.SingleDamage, 12, SkillCenter.Target, castMs: 2000),
                SummonSpirit(),
                BossSlam(),
            },
        };

        /// <summary>
        /// 마법사의 소환(95): 시전 없이 소환수(몬스터 5)를 10초(200틱) 부른다. 쿨다운은 1초다.
        /// </summary>
        public static SkillsRow SummonSpirit()
        {
            SkillsRow row = Skill(206, 2, SkillKind.Summon, 0, SkillCenter.Self, coefficient: 0, hitDelayMs: 0);
            row.SummonMonster = 5;
            row.SummonMs = 10000;
            return row;
        }

        /// <summary>
        /// 시험용 소환수(95): 체력 300, 공격력 30, 7 m/s, 사거리 2 m, 공격 간격 1초.
        /// </summary>
        public static MonstersRow Spirit()
        {
            MonstersRow row = Monster(5, aggressive: false);
            row.Kind = MonsterKind.Summon;
            row.MaxHp = 300;
            row.Attack = 30;
            row.Speed = 7;
            return row;
        }

        /// <summary>
        /// 보스의 범위 공격(43): 직업이 없고, 대상 중심 반지름 3 m, 사거리 12 m, 쿨다운 3초, 예고 1.5초(30틱).
        /// </summary>
        public static SkillsRow BossSlam()
        {
            SkillsRow row = Skill(901, 0, SkillKind.AreaDamage, 12, SkillCenter.Target, radius: 3, hitDelayMs: 0);
            row.ClearClass();
            row.CooldownMs = 3000;
            row.WarnMs = 1500;
            row.Mp = 0;
            return row;
        }

        public static SkillsRow Skill(
            uint id, uint characterClass, SkillKind kind, double range, SkillCenter center, double coefficient = 1, double radius = 0, uint castMs = 0, uint effect = 0, uint hitDelayMs = 300,
            double projectileSpeed = 0, uint level = 1)
        {
            var row = new SkillsRow
            {
                Id = id, NameKey = $"skill.{id}", Class = characterClass, Kind = kind, Coefficient = coefficient, Range = range, Center = center, CooldownMs = 1000,
                CastMs = castMs, HitDelayMs = castMs > 0 ? 0 : hitDelayMs, Mp = 10, Level = level,
            };
            if (radius > 0)
            {
                row.Radius = radius;
            }

            if (effect > 0)
            {
                row.Effect = effect;
            }

            if (projectileSpeed > 0)
            {
                row.ProjectileSpeed = projectileSpeed;
            }

            return row;
        }

        /// <summary>
        /// 시험용 효과: 1 기절 2초, 2 감속 50% 3초, 3 방어력 +5 10초, 4 공격력 +5 10초.
        /// </summary>
        public static Effects Effects => new Effects
        {
            Rows =
            {
                new EffectsRow { Id = 1, Kind = EffectKind.Stun, DurationMs = 2000 },
                new EffectsRow { Id = 2, Kind = EffectKind.Slow, Value = 50, DurationMs = 3000 },
                new EffectsRow { Id = 3, Kind = EffectKind.DefenseUp, Value = 5, DurationMs = 10000 },
                new EffectsRow { Id = 4, Kind = EffectKind.AttackUp, Value = 5, DurationMs = 10000 },
            },
        };

        /// <summary>
        /// 직업마다 1–2레벨. 2레벨은 최대값이 줄어드는 경우를 보려고 1레벨보다 최대 체력과 최대 마나가 낮다.
        /// </summary>
        public static Levels Levels => new Levels
        {
            Rows =
            {
                Level(1, 1, KnightLevel1),
                Level(1, 2, new Stats(120, 40, 14, 11)),
                Level(2, 1, MageLevel1),
                Level(2, 2, new Stats(90, 100, 17, 7)),
            },
        };

        /// <summary>
        /// 시험용 상수. 회복은 5%와 전투 상태의 1%, 치명타는 5%와 1.5배, 빈도 제한은 실제 값(토큰 40, 초당 30, 끊기 3초, 다시 세기 1초)이고 PK(44)와 사망 페널티(45),
        /// 이동 알림(54. 방향 8칸, 방향 간격 4틱, 확인·멈춤·다음 점 간격 10틱)과 시야 인원 상한(55. 200)은 실제 값이다.
        /// </summary>
        public static Constants Constants(uint fieldSize)
        {
            return new Constants
            {
                FieldSize = fieldSize, CombatDurationMs = 5000, RegenPercent = 5, CombatRegenPercent = 1, CritChance = 0.05, CritMultiplier = 1.5, PlayerRadius = 0.34,
                UnreachableMs = 5000, RepathDistance = 3, ReturnRangeMargin = 4, ReturnRegenPercent = 20, WanderPauseMinMs = 3000, WanderPauseMaxMs = 6000,
                ReviveHpPercent = 30, DeadMonsterMs = 3000, InventorySlots = 60, StorageSlots = 3, DropLifetimeMs = 60000, OwnerOnlyMs = 10000, DropScatter = 1.5, InteractRange = 3, RateLimitTokens = 40, RateLimitRefillPerSecond = 30, RateLimitKickMs = 3000, RateLimitResetMs = 1000,
                ChatMaxBytes = 180, ChatPerSecond = 2, PartyExpBonusPercent = 10, PartyInviteMs = 30000,
                SummonFollowDistance = 2, SummonLeashDistance = 20, AggressorMs = 30000, PkMinLevel = 10, KarmaKillPenalty = 100, KarmaMonsterGain = 5,
                PetPickIntervalMs = 1000, DeathExpPercent = 5, OutlawDeathExpPercent = 10, OutlawDropInventoryPercent = 50, OutlawDropEquipmentPercent = 10,
                MoveTurnYaw = 8, MoveTurnMs = 200, MoveConfirmMs = 500, MoveStopMs = 500, MoveGoalMs = 500, ViewPlayerLimit = 200,
            };
        }

        /// <summary>
        /// 두 직업의 레벨 1–max. 필요 경험치는 모두 100이고 능력치는 레벨마다 (100 + 10L, 50 + 5L, 10 + L, 5 + L)이다(성장 31의 시험).
        /// </summary>
        public static Levels LevelsUpTo(uint max)
        {
            var levels = new Levels();
            for (uint characterClass = 1; characterClass <= 2; characterClass++)
            {
                for (uint level = 1; level <= max; level++)
                {
                    levels.Rows.Add(Level(characterClass, level, new Stats(100 + (10 * level), 50 + (5 * level), 10 + level, 5 + level)));
                }
            }

            return levels;
        }

        private static LevelsRow Level(uint characterClass, uint level, Stats stats)
        {
            return new LevelsRow
            {
                Id = (characterClass * 100) + level, Class = characterClass, Level = level, Exp = 100,
                MaxHp = stats.MaxHp, MaxMp = stats.MaxMp, Attack = stats.Attack, Defense = stats.Defense,
            };
        }

        /// <summary>
        /// 원점 둘레 80 m의 안전한 마을. 부활 지점은 (x, z) m다.
        /// </summary>
        public static ZonesRow Town(int x, int z)
        {
            return new ZonesRow { Id = 1, Kind = ZoneKind.Town, MinX = -40, MinZ = -40, MaxX = 40, MaxZ = 40, Safe = true, RespawnX = x, RespawnZ = z, OutlawRespawnX = x, OutlawRespawnZ = z };
        }

        /// <summary>
        /// 막힌 칸이 없는 격자.
        /// </summary>
        public static MapGrid EmptyGrid(uint size)
        {
            return new MapGrid { Width = size, Depth = size, OriginX = -(int)size / 2, OriginZ = -(int)size / 2, Cells = ByteString.CopyFrom(new byte[size * size]) };
        }

        /// <summary>
        /// 글자로 그린 작은 맵의 격자와 구역. 줄마다 z가 한 칸이고 첫 줄이 가장 큰 z(북쪽), 글자마다 x가 한 칸이고 첫 글자가 가장 작은 x다.
        /// 줄 수와 글자 수가 같은 짝수여야 하고 원점이 가운데다. '#'은 벽, 's'는 안전 지대(구역 1)의 칸, '.'은 빈 칸이다.
        /// </summary>
        public static (uint Size, MapGrid Grid, ZonesRow[] Zones) Map(params string[] rows)
        {
            uint size = (uint)rows.Length;
            int min = -(int)size / 2;
            var cells = new byte[size * size];
            var zones = new List<ZonesRow>();
            for (int row = 0; row < rows.Length; row++)
            {
                int cellZ = min + rows.Length - 1 - row;
                for (int column = 0; column < rows[row].Length; column++)
                {
                    int cellX = min + column;
                    if (rows[row][column] == '#')
                    {
                        cells[((cellZ - min) * size) + (cellX - min)] = 1;
                    }
                    else if (rows[row][column] == 's')
                    {
                        zones.Add(new ZonesRow { Id = 1, MinX = cellX, MinZ = cellZ, MaxX = cellX + 1, MaxZ = cellZ + 1, Safe = true });
                    }
                }
            }

            return (size, new MapGrid { Width = size, Depth = size, OriginX = min, OriginZ = min, Cells = ByteString.CopyFrom(cells) }, zones.ToArray());
        }

        /// <summary>
        /// 글자로 그린 맵(Map)의 데이터. 마을의 부활 지점은 (respawnX, respawnZ) m다.
        /// </summary>
        public static GameData WithMap(int respawnX, int respawnZ, params string[] rows)
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = Map(rows);
            var table = new Zones { Rows = { Town(respawnX, respawnZ) } };
            table.Rows.Add(zones);
            return new GameData(Hash, Constants(size), table, grid, Classes, Levels, new Monsters(), new Spawns(), Skills, Effects, Items);
        }

        /// <summary>
        /// 저장소에 바로 만드는 캐릭터의 상태(38): 자리 (x, z), 레벨 1, 기사의 가득 찬 체력·마나, 빈 인벤토리.
        /// </summary>
        public static CharacterSnapshot Saved(int x, int z)
        {
            return new CharacterSnapshot(0, new SavedPosition(x, z, 0), 1, 0, KnightLevel1.MaxHp, KnightLevel1.MaxMp, 0, 0, new SavedItem[0], new uint[0], new SavedQuickslot[0]);
        }

        /// <summary>
        /// 시험용 상점(37): 2001 체력 물약 20골드, 2002 상급 체력 물약 30골드, 2005 귀환 주문서 50골드, 1003 공용 투구(겹치지 않음) 100골드.
        /// </summary>
        public static Shops Shops => new Shops
        {
            Rows =
            {
                new ShopsRow { Id = 1, ItemId = 2001, Price = 20 },
                new ShopsRow { Id = 2, ItemId = 2002, Price = 30 },
                new ShopsRow { Id = 3, ItemId = 2005, Price = 50 },
                new ShopsRow { Id = 4, ItemId = 1003, Price = 100 },
            },
        };

        /// <summary>
        /// 글자로 그린 맵(Map) 위에 몬스터를 놓는 데이터. 마을은 맵의 가장 작은 모서리 칸 하나이고 안전 지대가 아니다(부활 지점만 둠).
        /// 안전 지대는 맵의 's' 칸이다.
        /// </summary>
        public static GameData WithMonsters(IEnumerable<SpawnsRow> spawns, params string[] rows)
        {
            return WithMonsters(spawns, rows, null, null, null);
        }

        /// <summary>
        /// WithMonsters에 직업, 상수, 몬스터, 레벨, NPC를 바꾼 데이터. null이면 처음 값이다(NPC는 없음, 상점은 Shops).
        /// </summary>
        public static GameData WithMonsters(IEnumerable<SpawnsRow> spawns, string[] rows, Classes? classes, Constants? constants, IEnumerable<MonstersRow>? monsters, Levels? levels = null, Npcs? npcs = null, GatherNodes? gatherNodes = null, Recipes? recipes = null, Quests? quests = null)
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = Map(rows);
            int min = -(int)size / 2;
            var table = new Zones
            {
                Rows =
                {
                    new ZonesRow
                    {
                        Id = 2, Kind = ZoneKind.Town, MinX = min, MinZ = min, MaxX = min + 1, MaxZ = min + 1, RespawnX = min, RespawnZ = min, OutlawRespawnX = min, OutlawRespawnZ = min,
                    },
                },
            };
            table.Rows.Add(zones);
            return new GameData(
                Hash, constants ?? Constants(size), table, grid, classes ?? Classes, levels ?? Levels,
                new Monsters { Rows = { monsters ?? new[] { Monster(1, aggressive: true), Monster(2, aggressive: false) } } }, new Spawns { Rows = { spawns } }, Skills, Effects, Items, DropGroups, Enchants, npcs, Shops, Pets, gatherNodes ?? GatherNodes, recipes ?? Recipes, quests ?? Quests);
        }

        /// <summary>
        /// 시험용 몬스터: 체력 100, 3 m/s, 인식 8 m, 추적 한계 20 m, 사거리 2 m. 1은 선공, 2는 비선공이다.
        /// </summary>
        public static MonstersRow Monster(uint id, bool aggressive)
        {
            return new MonstersRow
            {
                Id = id, NameKey = "monster.test", Kind = MonsterKind.Normal, Level = 1, MaxHp = 100, Attack = 10, Defense = 5, Speed = 3, Radius = 0.5,
                DetectRange = 8, ChaseLimit = 20, AttackRange = 2, AttackIntervalMs = 1000, HitDelayMs = 300, Aggressive = aggressive,
            };
        }

        /// <summary>
        /// 무리 하나. 자리는 미터이고 흩는 반경과 배회 반경의 처음 값은 0이다(놓인 점에 서서 배회하지 않음).
        /// </summary>
        public static SpawnsRow Spawn(uint id, int x, int z, uint monsterId, uint count = 1, double scatter = 0, double wander = 0, uint respawnMs = 30000)
        {
            return new SpawnsRow { Id = id, X = x, Z = z, MonsterId = monsterId, Count = count, ScatterRadius = scatter, RespawnMs = respawnMs, WanderRadius = wander };
        }

        /// <summary>
        /// 채집물의 무리 하나(47). 자리는 미터이고 흩는 반경의 처음 값은 0이다.
        /// </summary>
        public static SpawnsRow GatherSpawn(uint id, int x, int z, uint nodeId, uint count = 1, double scatter = 0, uint respawnMs = 30000)
        {
            return new SpawnsRow { Id = id, X = x, Z = z, GatherNodeId = nodeId, Count = count, ScatterRadius = scatter, RespawnMs = respawnMs };
        }

        /// <summary>
        /// 시험용 퀘스트(50): 1 몬스터 2를 둘 잡기(10골드, 2001 둘, 경험치 5), 2 재료 3001 셋 모으기(1001 하나), 3 제작법 1 하나, 4 레벨 2(7골드),
        /// 5 투구 칸에 입기(경험치 1000).
        /// </summary>
        public static Quests Quests => new Quests
        {
            Rows =
            {
                new QuestsRow { Id = 1, NameKey = "quest.test", DescriptionKey = "quest.test", Kind = QuestKind.Kill, Target = 2, Count = 2, RewardGold = 10, RewardItemId = 2001, RewardItemCount = 2, RewardExp = 5 },
                new QuestsRow { Id = 2, NameKey = "quest.test", DescriptionKey = "quest.test", Kind = QuestKind.Collect, Target = 3001, Count = 3, RewardItemId = 1001, RewardItemCount = 1 },
                new QuestsRow { Id = 3, NameKey = "quest.test", DescriptionKey = "quest.test", Kind = QuestKind.Craft, Target = 1, Count = 1 },
                new QuestsRow { Id = 4, NameKey = "quest.test", DescriptionKey = "quest.test", Kind = QuestKind.Level, Count = 2, RewardGold = 7 },
                new QuestsRow { Id = 5, NameKey = "quest.test", DescriptionKey = "quest.test", Kind = QuestKind.Equip, Target = 2, Count = 1, RewardExp = 1000 },
            },
        };

        /// <summary>
        /// 시험용 제작법(48): 1은 재료 3001 셋과 50골드로 2002를 둘(2초, 레벨 1), 2는 레벨 2가 필요한 갑옷(종 4), 3은 재료 3001 둘로 투구(종 3, 늘 일반 등급, 2초, 레벨 1).
        /// </summary>
        public static Recipes Recipes => new Recipes
        {
            Rows =
            {
                new RecipesRow { Id = 1, Kind = RecipeKind.Item, ItemId = 2002, Count = 2, Materials = { 3001 }, MaterialCounts = { 3 }, Gold = 50, CraftMs = 2000, Level = 1 },
                new RecipesRow { Id = 2, Kind = RecipeKind.Equipment, Family = 4, GradeChances = { 1, 0, 0, 0 }, Materials = { 3001 }, MaterialCounts = { 1 }, CraftMs = 2000, Level = 2 },
                new RecipesRow { Id = 3, Kind = RecipeKind.Equipment, Family = 3, GradeChances = { 1, 0, 0, 0 }, Materials = { 3001 }, MaterialCounts = { 2 }, CraftMs = 2000, Level = 1 },
            },
        };

        /// <summary>
        /// 시험용 채집물(47): 1은 재료 3001을 하나씩 주고 3초, 횟수 2, 레벨 1. 2는 레벨 5가 필요하다.
        /// </summary>
        public static GatherNodes GatherNodes => new GatherNodes
        {
            Rows =
            {
                new GatherNodesRow { Id = 1, NameKey = "gather.test", Kind = GatherKind.Wood, ItemId = 3001, Count = 1, GatherMs = 3000, Uses = 2, Level = 1 },
                new GatherNodesRow { Id = 2, NameKey = "gather.test", Kind = GatherKind.Ore, ItemId = 3001, Count = 1, GatherMs = 3000, Uses = 2, Level = 5 },
            },
        };

        /// <summary>
        /// 한 변 size m의 빈 맵에 사각형(칸, 작은 모서리 포함·큰 모서리 제외)을 글자로 칠한다. 원점이 가운데다.
        /// </summary>
        public static string[] Draw(int size, params (int MinX, int MinZ, int MaxX, int MaxZ, char Cell)[] boxes)
        {
            int min = -size / 2;
            var rows = new char[size][];
            for (int row = 0; row < size; row++)
            {
                int cellZ = min + size - 1 - row;
                rows[row] = new char[size];
                for (int column = 0; column < size; column++)
                {
                    int cellX = min + column;
                    rows[row][column] = '.';
                    foreach ((int minX, int minZ, int maxX, int maxZ, char cell) in boxes)
                    {
                        if ((cellX >= minX) && (cellX < maxX) && (cellZ >= minZ) && (cellZ < maxZ))
                        {
                            rows[row][column] = cell;
                        }
                    }
                }
            }

            return System.Array.ConvertAll(rows, row => new string(row));
        }

        /// <summary>
        /// 저장소의 mmo/shared/ 아래 경로. 생성물과 비교 벡터를 읽고 쓴다.
        /// </summary>
        public static string Shared(string relative, [CallerFilePath] string here = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "../../shared", relative));
        }
    }
}
