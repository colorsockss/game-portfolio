using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 체험 캐릭터(94). 시험의 기사는 체험용 처음 상태가 레벨 3, 입은 투구 1003(강화 +3), 체력 물약 7개, 골드 500, 나와 있는 펫 1이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// --demo가 꺼진 서버는 LoginResult에 만들 수 없다고 싣고 체험 캐릭터의 CreateCharacter를 "체험 캐릭터를 만들 수 없는 서버"로 거절한다.
        /// </summary>
        [Fact]
        public void DemoCharactersNeedADemoServer()
        {
            World world = DemoWorld(demo: false);
            var session = new Session();
            world.Receive(session, LoginPacket("hero_01"));
            world.CompleteSaves();
            Assert.False(Take(session).Single(packet => packet.BodyCase == Packet.BodyOneofCase.LoginResult).LoginResult.DemoAvailable);
            world.Receive(session, new Packet { CreateCharacter = new CreateCharacter { Name = "Trial", CharacterClass = CharacterClass.Knight, Demo = true } });
            world.CompleteSaves();
            Assert.Contains(Created(CreateCharacterResultCode.DemoUnavailable), Take(session));
        }

        /// <summary>
        /// --demo 서버에서 만든 체험 캐릭터는 체험용 처음 상태(레벨, 입은 장비와 강화, 아이템, 골드, 직업의 스킬 모두와 그 퀵슬롯, 나와 있는 펫)로 들어오고 다시 들어와도 남는다.
        /// 표시가 없는 CreateCharacter는 그 서버에서도 레벨 1이다.
        /// </summary>
        [Fact]
        public void DemoServersMakeReadyCharacters()
        {
            World world = DemoWorld(demo: true);
            var session = new Session();
            world.Receive(session, LoginPacket("hero_01"));
            world.CompleteSaves();
            Assert.True(Take(session).Single(packet => packet.BodyCase == Packet.BodyOneofCase.LoginResult).LoginResult.DemoAvailable);
            world.Receive(session, new Packet { CreateCharacter = new CreateCharacter { Name = "Trial", CharacterClass = CharacterClass.Knight, Demo = true } });
            world.CompleteSaves();
            long id = (long)Take(session).Last(packet => packet.BodyCase == Packet.BodyOneofCase.CharacterList).CharacterList.Characters.Single(c => c.Name == "Trial").Id;
            long plain = CreateCharacter(world, session, "Plain");

            for (int round = 0; round < 2; round++)
            {
                Enter(world, session, id);
                Player player = session.Player!;
                Assert.Equal((3u, 500ul, 7u, 1u, true), (player.Level, player.Bag.Gold, player.Bag.CountOf(2001), player.PetId, player.PetOut));
                Assert.Equal((1003u, 3u), (player.Bag.Equipment[1].ItemId, player.Bag.Equipment[1].Enchant));
                Assert.Equal(TestData.Skills.Rows.Where(skill => skill.Class == 1).Select(skill => skill.Id).Order(), player.Skills.Order());
                Assert.Equal((QuickslotKind.Skill, 101u), player.Quickslots[0]);
                Assert.Equal(player.MaxHp, player.Hp);
                world.Receive(session, new Packet { LeaveWorld = new LeaveWorld() });
                world.CompleteSaves();
                Take(session);
            }

            Enter(world, session, plain);
            Assert.Equal((1u, 0u), (session.Player!.Level, session.Player!.PetId));
        }

        private static World DemoWorld(bool demo)
        {
            Classes classes = TestData.Classes;
            ClassesRow knight = classes.Rows.Single(row => row.Id == 1);
            knight.DemoLevel = 3;
            knight.DemoEquipment.Add(1003);
            knight.DemoEnchant = 3;
            knight.DemoItems.Add(2001);
            knight.DemoCounts.Add(7);
            knight.DemoGold = 500;
            knight.DemoPet = 1;
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 30, 30, 2) }, TestData.Draw(64), classes, null, null, TestData.LevelsUpTo(4));
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data, demo: demo);
        }
    }
}
