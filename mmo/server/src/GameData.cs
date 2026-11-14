using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 기획 데이터. 서버가 뜰 때 한 번 읽어 바꾸지 않고 시스템에 넘긴다. 데이터를 바꾸려면 서버를 다시 띄운다.
    /// 파일은 data-tool이 mmo/data/의 xlsx에서 낸 mmo/shared/data/files/이고 실행 파일 옆의 data/에 실린다.
    /// 테이블은 그것을 쓰는 항목이 여기에 더한다(protoc가 만든 PortfolioMmo.Data의 파서로 읽음).
    /// 월드와 시스템의 테스트는 파일을 읽지 않고 생성자로 시험용 데이터를 만든다.
    /// </summary>
    public sealed class GameData
    {
        /// <summary>
        /// 데이터 해시 파일의 이름(data-tool의 proto 출력).
        /// </summary>
        public const string HashFile = "data.hash";

        private readonly Dictionary<uint, MonstersRow> _monsters = new Dictionary<uint, MonstersRow>();
        private readonly Dictionary<(uint Class, uint Level), LevelsRow> _levels = new Dictionary<(uint Class, uint Level), LevelsRow>();
        private readonly Dictionary<uint, SkillsRow> _skills = new Dictionary<uint, SkillsRow>();
        private readonly Dictionary<uint, EffectsRow> _effects = new Dictionary<uint, EffectsRow>();

        public GameData(ulong hash, Constants constants, Zones zones, MapGrid grid, Classes classes, Levels levels, Monsters monsters, Spawns spawns, Skills skills, Effects effects)
        {
            Hash = hash;
            Constants = constants;
            Zones = zones;
            Grid = grid;
            Classes = classes;
            Spawns = spawns;
            foreach (MonstersRow row in monsters.Rows)
            {
                _monsters.Add(row.Id, row);
                MaxMonsterRadius = Math.Max(MaxMonsterRadius, row.Radius);
            }

            foreach (LevelsRow row in levels.Rows)
            {
                _levels.Add((row.Class, row.Level), row);
            }

            Skills = skills;
            foreach (SkillsRow row in skills.Rows)
            {
                _skills.Add(row.Id, row);
            }

            foreach (EffectsRow row in effects.Rows)
            {
                _effects.Add(row.Id, row);
            }
        }

        /// <summary>
        /// 생성물 전체의 해시. 클라이언트가 Login.data_hash에 실어 보낸 값과 다르면 로그인을 거절한다.
        /// </summary>
        public ulong Hash { get; }

        /// <summary>
        /// Monsters의 가장 큰 반지름(m). 직선 발사체가 후보를 찾는 넓이에 더한다.
        /// </summary>
        public double MaxMonsterRadius { get; }

        /// <summary>
        /// 밸런스의 수(키-값 테이블).
        /// </summary>
        public Constants Constants { get; }

        /// <summary>
        /// 구역의 사각형. 줄의 차례가 겹친 곳을 정한다(뒤 줄이 이김).
        /// </summary>
        public Zones Zones { get; }

        /// <summary>
        /// 맵 생성기가 낸 1 m 칸 격자(칸마다 막힘). 크기는 Constants의 필드의 크기와 같다.
        /// </summary>
        public MapGrid Grid { get; }

        /// <summary>
        /// 직업마다의 기본 공격과 처음 상태. id가 CharacterClass의 값이다.
        /// </summary>
        public Classes Classes { get; }

        /// <summary>
        /// 직업의 Classes 줄. 없으면 던진다.
        /// </summary>
        public ClassesRow Class(CharacterClass characterClass)
        {
            foreach (ClassesRow row in Classes.Rows)
            {
                if (row.Id == (uint)characterClass)
                {
                    return row;
                }
            }

            throw new KeyNotFoundException($"Classes has no row for {characterClass}.");
        }

        /// <summary>
        /// 직업과 레벨의 Levels 줄(필요 경험치와 기본 능력치). 없으면 던진다(데이터가 그 직업과 레벨을 빠뜨림).
        /// </summary>
        public bool HasLevel(CharacterClass characterClass, uint level)
        {
            return _levels.ContainsKey(((uint)characterClass, level));
        }

        public LevelsRow Level(CharacterClass characterClass, uint level)
        {
            return _levels.TryGetValue(((uint)characterClass, level), out LevelsRow? row)
                ? row
                : throw new KeyNotFoundException($"Levels has no row for {characterClass} level {level}.");
        }

        /// <summary>
        /// 몬스터를 놓는 무리. 줄 하나가 한 무리다.
        /// </summary>
        public Spawns Spawns { get; }

        /// <summary>
        /// Monsters의 줄. 없으면 던진다(Spawns의 ref를 data-tool이 검사하므로 데이터가 맞으면 없을 수 없음).
        /// </summary>
        public MonstersRow? FindMonster(uint id)
        {
            return _monsters.GetValueOrDefault(id);
        }

        public MonstersRow Monster(uint id)
        {
            return _monsters.TryGetValue(id, out MonstersRow? row) ? row : throw new KeyNotFoundException($"Monsters has no row {id}.");
        }

        /// <summary>
        /// 플레이어의 스킬(26).
        /// </summary>
        public Skills Skills { get; }

        /// <summary>
        /// 번호의 스킬. 없는 번호면 null(요청에 실려 온 번호라 끊을지는 부르는 쪽이 정함).
        /// </summary>
        public SkillsRow? Skill(uint id)
        {
            return _skills.GetValueOrDefault(id);
        }

        /// <summary>
        /// 번호의 효과. 스킬이 가리키는 줄이라 데이터 검사(ref)가 있음을 보장한다.
        /// </summary>
        public EffectsRow Effect(uint id)
        {
            return _effects[id];
        }

        /// <summary>
        /// 실행 파일 옆의 데이터 폴더.
        /// </summary>
        public static string DefaultFolder => Path.Combine(AppContext.BaseDirectory, "data");

        /// <summary>
        /// 폴더의 데이터를 모두 읽는다. 파일이 없거나 읽을 수 없으면 던진다(서버가 뜨지 않음).
        /// </summary>
        public static GameData Load(string folder)
        {
            return new GameData(
                ReadHash(folder),
                Constants.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Constants.bytes"))),
                Zones.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Zones.bytes"))),
                MapGrid.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "MapGrid.bytes"))),
                Classes.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Classes.bytes"))),
                Levels.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Levels.bytes"))),
                Monsters.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Monsters.bytes"))),
                Spawns.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Spawns.bytes"))),
                Skills.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Skills.bytes"))),
                Effects.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Effects.bytes"))));
        }

        /// <summary>
        /// 폴더의 데이터 해시(16진수 16자)를 읽는다. 부하 봇도 이것으로 Login에 실을 값을 얻는다.
        /// </summary>
        public static ulong ReadHash(string folder)
        {
            string path = Path.Combine(folder, HashFile);
            string text = File.ReadAllText(path).Trim();
            if ((text.Length != 16) || !ulong.TryParse(text, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong hash))
            {
                throw new InvalidDataException($"{path} must hold 16 hex digits, got '{text}'.");
            }

            return hash;
        }
    }
}
