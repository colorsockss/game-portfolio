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
        public static readonly GameData Data = new GameData(Hash, Constants(FieldSize), new Zones { Rows = { Town(0, 0) } }, EmptyGrid(FieldSize), Classes, Levels, new Monsters(), new Spawns(), Skills, Effects);

        /// <summary>
        /// 시험용 직업 둘(기사 근접, 마법사 발사체).
        /// </summary>
        public static Classes Classes => new Classes
        {
            Rows =
            {
                new ClassesRow { Id = 1, AttackRange = 2, AttackIntervalMs = 1000, HitDelayMs = 300 },
                new ClassesRow { Id = 2, AttackRange = 12, AttackIntervalMs = 1200, HitDelayMs = 300, ProjectileSpeed = 20 },
            },
        };

        /// <summary>
        /// 시험용 스킬(실제 데이터의 차례와 종류. 계수는 1이나 2이고 쿨다운은 1초, 마나는 10, 타격까지의 시간은 300 ms다).
        /// 기사: 101 단일, 102 기절, 103 방어력 올림, 104 자기 중심 범위(4 m), 105 감속을 거는 단일, 106 공격력 올림.
        /// 마법사: 201 감속을 거는 단일(12 m), 202 대상 중심 범위(4 m, 시전 1.5초), 203 회복(계수 2, 시전 1초), 204 감속을 거는 자기 중심 범위(5 m),
        /// 205 시전하는 단일(시전 2초).
        /// </summary>
        public static Skills Skills => new Skills
        {
            Rows =
            {
                Skill(101, 1, SkillKind.SingleDamage, 2, SkillCenter.Target),
                Skill(102, 1, SkillKind.Debuff, 2, SkillCenter.Target, coefficient: 0, effect: 1),
                Skill(103, 1, SkillKind.Buff, 0, SkillCenter.Self, coefficient: 0, effect: 3, hitDelayMs: 0),
                Skill(104, 1, SkillKind.AreaDamage, 0, SkillCenter.Self, radius: 4),
                Skill(105, 1, SkillKind.SingleDamage, 2, SkillCenter.Target, effect: 2),
                Skill(106, 1, SkillKind.Buff, 0, SkillCenter.Self, coefficient: 0, effect: 4, hitDelayMs: 0),
                Skill(201, 2, SkillKind.SingleDamage, 12, SkillCenter.Target, effect: 2),
                Skill(202, 2, SkillKind.AreaDamage, 12, SkillCenter.Target, radius: 4, castMs: 1500),
                Skill(203, 2, SkillKind.Heal, 0, SkillCenter.Self, coefficient: 2, castMs: 1000),
                Skill(204, 2, SkillKind.AreaDamage, 0, SkillCenter.Self, radius: 5, effect: 2),
                Skill(205, 2, SkillKind.SingleDamage, 12, SkillCenter.Target, castMs: 2000),
            },
        };

        public static SkillsRow Skill(
            uint id, uint characterClass, SkillKind kind, double range, SkillCenter center, double coefficient = 1, double radius = 0, uint castMs = 0, uint effect = 0, uint hitDelayMs = 300)
        {
            var row = new SkillsRow
            {
                Id = id, NameKey = $"skill.{id}", Class = characterClass, Kind = kind, Coefficient = coefficient, Range = range, Center = center, CooldownMs = 1000,
                CastMs = castMs, HitDelayMs = castMs > 0 ? 0 : hitDelayMs, Mp = 10, Level = 1,
            };
            if (radius > 0)
            {
                row.Radius = radius;
            }

            if (effect > 0)
            {
                row.Effect = effect;
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
        /// 시험용 상수. 회복은 5%와 전투 상태의 1%, 치명타는 5%와 1.5배다.
        /// </summary>
        public static Constants Constants(uint fieldSize)
        {
            return new Constants
            {
                FieldSize = fieldSize, CombatDurationMs = 5000, RegenPercent = 5, CombatRegenPercent = 1, CritChance = 0.05, CritMultiplier = 1.5, PlayerRadius = 0.34,
                UnreachableMs = 5000, RepathDistance = 3, ReturnRangeMargin = 4, ReturnRegenPercent = 20, WanderPauseMinMs = 3000, WanderPauseMaxMs = 6000,
                ReviveHpPercent = 30, DeadMonsterMs = 3000,
            };
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
            return new GameData(Hash, Constants(size), table, grid, Classes, Levels, new Monsters(), new Spawns(), Skills, Effects);
        }

        /// <summary>
        /// 글자로 그린 맵(Map) 위에 몬스터를 놓는 데이터. 마을은 맵의 가장 작은 모서리 칸 하나이고 안전 지대가 아니다(부활 지점만 둠).
        /// 안전 지대는 맵의 's' 칸이다.
        /// </summary>
        public static GameData WithMonsters(IEnumerable<SpawnsRow> spawns, params string[] rows)
        {
            return WithMonsters(spawns, rows, null, null, null);
        }

        /// <summary>
        /// WithMonsters에 직업, 상수, 몬스터를 바꾼 데이터. null이면 처음 값이다.
        /// </summary>
        public static GameData WithMonsters(IEnumerable<SpawnsRow> spawns, string[] rows, Classes? classes, Constants? constants, IEnumerable<MonstersRow>? monsters)
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
                Hash, constants ?? Constants(size), table, grid, classes ?? Classes, Levels,
                new Monsters { Rows = { monsters ?? new[] { Monster(1, aggressive: true), Monster(2, aggressive: false) } } }, new Spawns { Rows = { spawns } }, Skills, Effects);
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
