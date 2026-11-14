using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 요청의 결과와 빈도 제한(28). 빈도 제한은 실제 값(토큰 40개, 초당 30개, 3초 이어지면 끊기, 1초 없으면 다시 세기)이다.
    /// </summary>
    public partial class WorldTests
    {
        private static readonly RateLimiter.Limits s_limits = RateLimiter.Limits.From(TestData.Constants(64));

        /// <summary>
        /// 방금 죽은 대상을 공격하는 것은 정상 클라이언트도 보낼 수 있어 끊지 않고 "대상 없음"으로 답한다.
        /// </summary>
        [Fact]
        public void AttackingAJustKilledTargetFailsWithoutAKick()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            monster.Dead = true;
            Attack(world, knight, monster.Id);
            Assert.Equal(new[] { Failed(FailReason.NoTarget) }, Take(knight));
            Assert.False(knight.IsClosing);
        }

        /// <summary>
        /// 기절한 동안 Ping과 LeaveWorld는 받고, AttackStart와 UseSkill과 Revive는 "기절"로 실패하며 Move는 되돌린다. 기절한 동안 보낸 AttackStop은
        /// 공격 상태를 꺼서 기절이 끝난 뒤 치지 않는다.
        /// </summary>
        [Fact]
        public void AStunnedPlayerOnlyPingsLeavesAndStops()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            Player player = knight.Player!;
            Attack(world, knight, monster.Id);
            world.Step();
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            Take(knight);

            world.Receive(knight, new Packet { Ping = new Ping() });
            Attack(world, knight, monster.Id);
            world.Receive(knight, new Packet { UseSkill = new UseSkill { SkillId = 101, TargetId = monster.Id } });
            world.Receive(knight, new Packet { Revive = new Revive() });
            Move(world, knight, player.X + 10, player.Z, player.Ack);
            List<Packet> answers = Take(knight);
            Assert.Equal(Packet.BodyOneofCase.Pong, answers[0].BodyCase);
            Assert.Equal(
                new[] { Failed(FailReason.Stunned), SkillFailedFor(FailReason.Stunned, RequestKind.Skill), SkillFailedFor(FailReason.Stunned, RequestKind.Revive) },
                answers.Skip(1).Take(3));
            Assert.Equal(Packet.BodyOneofCase.PositionReset, answers[4].BodyCase);

            world.Receive(knight, new Packet { AttackStop = new AttackStop() });
            Assert.Equal(0u, player.AttackTarget);
            uint hp = monster.Hp;
            StepFor(world, 80);
            Assert.Equal(hp, monster.Hp);

            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            world.Receive(knight, new Packet { LeaveWorld = new LeaveWorld() });
            Assert.Null(knight.Player);
            Assert.False(knight.IsClosing);
        }

        /// <summary>
        /// 버킷은 토큰 40개로 시작해 한 틱의 41개째부터 버리고, 틱마다 1.5개(초당 30개)씩, 건너뛴 틱은 지난 틱 수만큼 채운다.
        /// </summary>
        [Fact]
        public void TheBucketHoldsFortyAndRefillsThirtyASecond()
        {
            var limiter = new RateLimiter();
            Assert.All(Enumerable.Range(0, 40), _ => Assert.Equal(RateLimiter.Verdict.Allow, limiter.Take(100, s_limits)));
            Assert.Equal(RateLimiter.Verdict.Drop, limiter.Take(100, s_limits));

            // 20틱(1초) 뒤에는 30개가 찼다.
            Assert.Equal(30, Enumerable.Range(0, 40).Count(_ => limiter.Take(120, s_limits) == RateLimiter.Verdict.Allow));
            // 두 틱을 건너뛴 틱에는 3개가 찼다.
            Assert.Equal(3, Enumerable.Range(0, 10).Count(_ => limiter.Take(122, s_limits) == RateLimiter.Verdict.Allow));
            // 가득 찬 뒤로는 더 채우지 않는다.
            Assert.Equal(40, Enumerable.Range(0, 50).Count(_ => limiter.Take(10000, s_limits) == RateLimiter.Verdict.Allow));
        }

        /// <summary>
        /// 버리기 시작한 틱부터 3초 동안 버리는 일이 이어지면 끊는다. 그 전에 1초 동안 버린 것이 없으면 다시 세고, 버린 것 사이가 1초보다 짧으면 이어 센다.
        /// </summary>
        [Fact]
        public void ThreeSecondsOfDroppingKicks()
        {
            RateLimiter.Verdict Flood(RateLimiter limiter, uint tick)
            {
                // 그 틱에 채운 것을 다 쓰고 하나 더 보낸다.
                RateLimiter.Verdict verdict;
                do
                {
                    verdict = limiter.Take(tick, s_limits);
                }
                while (verdict == RateLimiter.Verdict.Allow);
                return verdict;
            }

            var steady = new RateLimiter();
            for (uint tick = 0; tick < 60; tick += 10)
            {
                Assert.Equal(RateLimiter.Verdict.Drop, Flood(steady, tick));
            }

            Assert.Equal(RateLimiter.Verdict.Kick, Flood(steady, 60));

            var paused = new RateLimiter();
            Assert.Equal(RateLimiter.Verdict.Drop, Flood(paused, 0));
            Assert.Equal(RateLimiter.Verdict.Drop, Flood(paused, 30));
            // 30틱에 다시 셌으므로 60틱(처음부터 3초)에는 끊지 않는다.
            Assert.Equal(RateLimiter.Verdict.Drop, Flood(paused, 49));
            Assert.Equal(RateLimiter.Verdict.Drop, Flood(paused, 60));
            Assert.Equal(RateLimiter.Verdict.Drop, Flood(paused, 79));
            Assert.Equal(RateLimiter.Verdict.Kick, Flood(paused, 90));
        }

        /// <summary>
        /// 초당 20번의 Move와 행동 몇 번(공격 시작, 스킬, Ping)을 10초 동안 보내는 연결은 버려지는 것이 없고, 몰려온 Move 20개 뒤의 UseSkill도 버려지지 않는다.
        /// </summary>
        [Fact]
        public void ANormalClientIsNeverDropped()
        {
            var limiter = new RateLimiter();
            for (uint tick = 0; tick < 200; tick++)
            {
                Assert.Equal(RateLimiter.Verdict.Allow, limiter.Take(tick, s_limits));
                if (tick % 20 == 0)
                {
                    Assert.All(Enumerable.Range(0, 3), _ => Assert.Equal(RateLimiter.Verdict.Allow, limiter.Take(tick, s_limits)));
                }
            }

            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 1, 0);
            Player player = knight.Player!;
            for (int i = 0; i < 20; i++)
            {
                Move(world, knight, player.X, player.Z, player.Ack);
            }

            world.Receive(knight, new Packet { UseSkill = new UseSkill { SkillId = 104 } });
            Assert.Equal(40u, player.Mp);
        }

        /// <summary>
        /// 월드는 버린 요청을 처리하지 않고, 버리는 일이 3초 이어지면 KICK_REASON_RATE_LIMITED로 끊는다.
        /// </summary>
        [Fact]
        public void TheWorldDropsAndKicksAFloodingConnection()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            Take(session);
            for (int i = 0; i < 60; i++)
            {
                world.Receive(session, new Packet { Ping = new Ping() });
            }

            Assert.InRange(Take(session).Count(packet => packet.BodyCase == Packet.BodyOneofCase.Pong), 1, 40);
            for (int step = 0; step < 61 && !session.IsClosing; step++)
            {
                world.Step();
                for (int i = 0; i < 5; i++)
                {
                    world.Receive(session, new Packet { Ping = new Ping() });
                }
            }

            Assert.True(session.IsClosing);
            Assert.Contains(new Packet { Kicked = new Kicked { Reason = KickReason.RateLimited } }, Take(session));
        }

        /// <summary>
        /// TCP로 Ping을 쉬지 않고 보내는 연결은 KICK_REASON_RATE_LIMITED를 받고 끊긴다.
        /// </summary>
        [Fact]
        public async Task AFloodOverTcpIsKicked()
        {
            using var cancellation = new CancellationTokenSource();
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new System.Random(1), new CharacterStore(":memory:"), TestData.Data));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            using var flood = new CancellationTokenSource();
            Task writing = Task.Run(async () =>
            {
                byte[] ping = new Packet { Ping = new Ping() }.ToByteArray();
                byte[] frame = new byte[ping.Length + 1];
                frame[0] = (byte)ping.Length;
                ping.CopyTo(frame, 1);
                try
                {
                    while (!flood.IsCancellationRequested)
                    {
                        // 초당 약 200개(제한은 초당 30개).
                        await stream.WriteAsync(frame, flood.Token);
                        await Task.Delay(5, flood.Token);
                    }
                }
                catch (System.Exception exception) when (exception is System.IO.IOException or System.OperationCanceledException or SocketException)
                {
                }
            });

            Packet? packet;
            using (var timeout = new CancellationTokenSource(System.TimeSpan.FromSeconds(10)))
            {
                do
                {
                    packet = await PacketReader.ReadAsync(stream, new byte[64 * 1024], timeout.Token);
                }
                while ((packet != null) && (packet.BodyCase != Packet.BodyOneofCase.Kicked));
            }

            flood.Cancel();
            await writing;
            Assert.Equal(KickReason.RateLimited, packet!.Kicked.Reason);
            cancellation.Cancel();
            await running;
        }

        private static Packet SkillFailedFor(FailReason reason, RequestKind request)
        {
            return new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = request } };
        }
    }
}
