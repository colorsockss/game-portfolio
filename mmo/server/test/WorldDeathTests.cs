using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 죽음과 부활: 죽은 동안의 요청, 부활, 죽은 플레이어를 피해 표에서 뺌, 죽은 몬스터의 사라짐과 리스폰. 맵은 64 m이고 마을(부활 지점)은
    /// 가장 작은 모서리 칸 (-32, -32) m다. 부활할 때의 체력은 30%, 죽은 몬스터가 남는 시간은 3초(60틱)다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 죽은 플레이어의 Move는 되돌려지고 AttackStart는 ActionFailed(죽은 동안)로 답해지며, Ping, LeaveWorld, AttackStop은 실패 없이 받는다. 끊지 않는다.
        /// </summary>
        [Fact]
        public void DeadPlayersOnlyPingLeaveReviveAndStop()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 5, 0);
            Kill(knight.Player!);

            uint ack = knight.Player!.Ack;
            world.Receive(knight, new Packet { Move = new Move { X = Center(5) + 10, Z = Center(0), Ack = ack } });
            Assert.Equal(new[] { new Packet { PositionReset = new PositionReset { X = Center(5), Z = Center(0), Ack = ack + 1 } } }, Take(knight));
            Attack(world, knight, world.Monsters[0].Id);
            Assert.Equal(new[] { new Packet { ActionFailed = new ActionFailed { Reason = FailReason.Dead, Request = RequestKind.Attack } } }, Take(knight));
            world.Receive(knight, new Packet { AttackStop = new AttackStop() });
            world.Receive(knight, new Packet { Ping = new Ping() });
            Assert.Equal(new[] { Packet.BodyOneofCase.Pong }, Take(knight).Select(packet => packet.BodyCase));
            world.Receive(knight, new Packet { LeaveWorld = new LeaveWorld() });
            world.CompleteSaves();
            Assert.Equal(new[] { Packet.BodyOneofCase.CharacterList }, Take(knight).Select(packet => packet.BodyCase));
            Assert.False(knight.IsClosing);
        }

        /// <summary>
        /// Revive는 마을의 부활 지점에 체력 30%로 일으키고 마나는 그대로 둔다. 본인은 PositionReset, Revived, SelfVitals를, 보는 쪽은 순간 이동 표시가 있는
        /// 움직임과 Revived를 받는다. 살아 있으면 ActionFailed(죽지 않았음, 부활)다.
        /// </summary>
        [Fact]
        public void RevivingStandsUpAtTheTownWithThirtyPercent()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", -28, -28);
            Session observer = Fighter(world, "hero_02", -26, -26);
            Take(knight);
            world.Receive(knight, new Packet { Revive = new Revive() });
            Assert.Equal(new[] { new Packet { ActionFailed = new ActionFailed { Reason = FailReason.NotDead, Request = RequestKind.Revive } } }, Take(knight));

            Kill(knight.Player!);
            knight.Player!.Mp = 20;
            world.Step();
            Take(knight);
            Take(observer);
            uint ack = knight.Player!.Ack;
            world.Receive(knight, new Packet { Revive = new Revive() });
            world.Step();

            int respawn = -32 * M;
            Assert.Equal((respawn, respawn, 45u, 20u, false), (knight.Player!.X, knight.Player!.Z, knight.Player!.Hp, knight.Player!.Mp, knight.Player!.Dead));
            List<Packet> mine = knight.Outbox.ToList();
            Assert.Contains(new Packet { PositionReset = new PositionReset { X = respawn, Z = respawn, Ack = ack + 1 } }, mine);
            Assert.Contains(new Packet { Revived = new Revived { Id = knight.Player!.Id, Hp = 45, MaxHp = 150 } }, mine);
            Assert.Contains(mine, packet => packet.BodyCase == Packet.BodyOneofCase.SelfVitals && packet.SelfVitals.Hp == 45 && packet.SelfVitals.Mp == 20);
            List<Packet> seen = observer.Outbox.ToList();
            EntityMove moved = seen.Single(packet => packet.BodyCase == Packet.BodyOneofCase.EntityMoves).EntityMoves.Entities.Single(move => move.Id == knight.Player!.Id);
            Assert.Equal((respawn, respawn, true), (moved.X, moved.Z, moved.Teleport));
            Assert.Contains(new Packet { Revived = new Revived { Id = knight.Player!.Id, Hp = 45, MaxHp = 150 } }, seen);
        }

        /// <summary>
        /// 몬스터에게 죽은 플레이어는 모든 피해 표에서 빠져 몬스터가 다른 대상을 고른다. 죽기 전에 걸어 둔 그 플레이어의 타격은 맞지 않고, 죽은 동안 회복하지 않는다.
        /// </summary>
        [Fact]
        public void KilledPlayersLeaveTablesAndTheirStrikesAreDropped()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session victim = Fighter(world, "hero_01", 1, 0);
            Session other = Fighter(world, "hero_02", 0, 1);
            victim.Player!.Hp = 1;
            monster.Damage.Add(victim.Player!.Id, 100);
            monster.Damage.Add(other.Player!.Id, 1);
            Attack(world, victim, monster.Id);

            StepFor(world, 8);
            Assert.True(victim.Player!.Dead);
            Assert.Equal(100u, monster.Hp);
            Assert.False(monster.Damage.Contains(victim.Player!.Id));
            Assert.Equal(other.Player!.Id, monster.AttackTarget);
            StepFor(world, 40);
            Assert.Equal(0u, victim.Player!.Hp);
        }

        /// <summary>
        /// 죽은 몬스터는 3초 동안 쓰러진 채 남고(새로 보는 연결의 EntityEnter에 "죽었는지"가 실림) EntitiesLeave로 빠지며, 죽은 틱에서 다시 나오는 시간 뒤에
        /// 같은 번호로 놓인 점에 가득 찬 체력과 빈 피해 표로 나온다. 잡은 편이 기록된다.
        /// </summary>
        [Fact]
        public void DeadMonstersLingerThreeSecondsAndRespawn()
        {
            World world = CombatWorld(TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 0, 0, 2, respawnMs: 5000) });
            Monster monster = world.Monsters[0];
            monster.Hp = 1;
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, monster.Id);
            uint died = 0;
            for (int i = 0; i < 10 && died == 0; i++)
            {
                uint tick = world.Tick;
                world.Step();
                died = monster.Dead ? tick : 0;
            }

            Assert.Equal((ulong)knight.Player!.Id, monster.Killer);
            Session late = Join(world, "hero_02");
            world.Step();
            world.Place(late.Player!, Center(3), Center(0));
            world.Step();
            Assert.True(Enter(late).Single(entity => entity.Id == monster.Id).Dead);

            Take(knight);
            StepTo(world, died + 60);
            Assert.DoesNotContain(Take(knight), packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesLeave);
            world.Step();
            Assert.Contains(new Packet { EntitiesLeave = new EntitiesLeave { Ids = { monster.Id } } }, Take(knight));
            Assert.Empty(world.Monsters);

            StepTo(world, died + 100);
            world.Step();
            Monster reborn = Assert.Single(world.Monsters);
            Assert.NotSame(monster, reborn);
            Assert.Equal((monster.Id, monster.Placed.X, monster.Placed.Z, 100u, false, 0), (reborn.Id, reborn.X, reborn.Z, reborn.Hp, reborn.Dead, reborn.Damage.Count));
        }

        /// <summary>
        /// 다시 나오는 시간이 쓰러진 채 남는 시간보다 짧으면 리스폰이 옛 몬스터를 빼고 새 몬스터를 놓고, 옛 몬스터에 걸렸던 예약(사라짐, "닿을 수 없음"의 끝)은
        /// 새 몬스터에 실행되지 않는다.
        /// </summary>
        [Fact]
        public void ReservationsOfTheOldMonsterDoNotTouchTheNewOne()
        {
            World world = CombatWorld(TestData.Draw(64, (8, -3, 13, 3, '#'), (9, -2, 12, 2, '.')), spawns: new[] { TestData.Spawn(1, 0, 0, 2, respawnMs: 1000) });
            Monster monster = world.Monsters[0];
            Session boxed = Fighter(world, "hero_01", 10, 0);
            monster.Damage.Add(boxed.Player!.Id, 1);
            world.Step();
            Assert.True(monster.Unreachable.ContainsKey(boxed.Player!.Id));
            monster.Damage.Clear();

            Session knight = Fighter(world, "hero_02", 1, 0);
            monster.Hp = 1;
            Attack(world, knight, monster.Id);
            StepUntil(world, () => monster.Dead, 10);
            StepFor(world, 25);
            Monster reborn = Assert.Single(world.Monsters);
            Assert.NotSame(monster, reborn);

            StepFor(world, 120);
            Assert.Same(reborn, Assert.Single(world.Monsters));
            Assert.False(reborn.Dead);
            Assert.Empty(reborn.Unreachable);
        }

        private static void Kill(Player player)
        {
            player.Hp = 0;
            player.Dead = true;
        }

        /// <summary>
        /// 쌓인 패킷의 EntitiesEnter에 든 개체들(나머지도 비움).
        /// </summary>
        private static List<EntityEnter> Enter(Session session)
        {
            return Take(session).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter).SelectMany(packet => packet.EntitiesEnter.Entities).ToList();
        }
    }
}
