using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 개발 명령(68). 맵은 한 변 64 m이고 시험용 몬스터 2(비선공)가 원점 칸에 있다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// --dev가 아닌 서버는 개발 명령을 끊지 않고 "쓸 수 없는 명령"(채팅의 실패)으로 답한다. --dev 서버도 모르는 명령과 값이 맞지 않는 명령은 같게 답한다.
        /// </summary>
        [Fact]
        public void DevCommandsFailWithoutTheDevOption()
        {
            World plain = CombatWorld(TestData.Draw(64));
            Session session = Fighter(plain, "hero_01", 1, 0);
            Dev(plain, session, "tp 10 10");
            Assert.Equal(new[] { DevFailed(FailReason.InvalidCommand) }, Take(session));
            Assert.False(session.IsClosing);

            World dev = DevWorld(TestData.Draw(64));
            Session tester = Fighter(dev, "hero_01", 1, 0);
            foreach (string line in new[] { "fly", "tp 10", "tp a b", "spawn x", "spawn 99", "" })
            {
                Dev(dev, tester, line);
                Assert.Equal(new[] { DevFailed(FailReason.InvalidCommand) }, Take(tester));
            }
        }

        /// <summary>
        /// 순간 이동은 본인에게 PositionReset을, 보는 쪽에는 순간 이동 표시가 있는 움직임을 보낸다. 막힌 칸과 필드 밖은 "막힘"으로 실패한다.
        /// 죽은 동안과 기절한 동안에도 실행한다.
        /// </summary>
        [Fact]
        public void TeleportMovesLikeARevive()
        {
            World world = DevWorld(TestData.Draw(64, (10, 10, 11, 11, '#')));
            Session tester = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 3, 0);
            Player player = tester.Player!;
            Take(tester);
            Dev(world, tester, "/tp 5.5 -3");
            Assert.Equal((Center(5), -3 * M), (player.X, player.Z));
            Assert.Equal(new PositionReset { X = player.X, Z = player.Z, Ack = player.Ack }, Assert.Single(Take(tester)).PositionReset);
            world.Step();
            EntityMove moved = Take(watcher).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntityMoves).SelectMany(packet => packet.EntityMoves.Entities).Single(move => move.Id == player.Id);
            Assert.True(moved.Teleport);

            Dev(world, tester, "tp 10.5 10.5");
            Dev(world, tester, "tp 40 0");
            Assert.Equal(new[] { DevFailed(FailReason.Blocked), DevFailed(FailReason.Blocked) }, Take(tester));

            player.Dead = true;
            Dev(world, tester, "tp 2 2");
            Assert.Equal((2 * M, 2 * M), (player.X, player.Z));
            player.Dead = false;
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            Take(tester);
            Dev(world, tester, "tp 4 4");
            Assert.Equal((4 * M, 4 * M), (player.X, player.Z));
            Assert.Equal(Packet.BodyOneofCase.PositionReset, Assert.Single(Take(tester)).BodyCase);
        }

        /// <summary>
        /// 몬스터 부르기는 내 자리나 준 자리에 몬스터를 놓고(막힌 칸이면 실패), 부른 몬스터는 죽으면 다시 나오지 않는다.
        /// </summary>
        [Fact]
        public void SummonedMonstersDoNotRespawn()
        {
            World world = DevWorld(TestData.Draw(64, (10, 10, 11, 11, '#')));
            Session tester = Fighter(world, "hero_01", 5, 5);
            Dev(world, tester, "spawn 2");
            Dev(world, tester, "spawn 1 -8 -8");
            Dev(world, tester, "spawn 2 10.5 10.5");
            Assert.Equal(new[] { DevFailed(FailReason.Blocked) }, Take(tester));
            Assert.Equal(3, world.Monsters.Count);
            Monster near = world.Monsters.Single(monster => monster.X == tester.Player!.X && monster.Z == tester.Player!.Z);
            Assert.Contains(world.Monsters, monster => (monster.X == -8 * M) && (monster.Z == -8 * M) && (monster.Template.Id == 1));
            world.Step();
            Assert.Contains(Take(tester), packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter && packet.EntitiesEnter.Entities.Any(entity => entity.Id == near.Id));

            near.Hp = 1;
            world.Receive(tester, new Packet { UseSkill = new UseSkill { SkillId = 104 } });
            StepUntil(world, () => near.Dead, 20);
            Assert.True(near.Dead);
            // 시험용 무리의 다시 나오는 시간(30초)보다 오래 기다린다.
            StepFor(world, 31 * 20);
            Assert.DoesNotContain(world.Monsters, monster => monster.Id == near.Id);
            Assert.Equal(2, world.Monsters.Count);
        }

        private static World DevWorld(string[] rows)
        {
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMonsters(new[] { TestData.Spawn(1, 0, 0, 2) }, rows), dev: true);
        }

        private static void Dev(World world, Session session, string line)
        {
            world.Receive(session, new Packet { DevCommand = new DevCommand { Line = line } });
        }

        private static Packet DevFailed(FailReason reason)
        {
            return new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = RequestKind.Chat } };
        }
    }
}
