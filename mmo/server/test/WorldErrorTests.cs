using System;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 오류와 내려가기(39). 예외는 World의 시험용 자리(ReceiveHook, StepHook)에서 내고, 실패하는 쓰기는 시험용 StoreJob으로 넣는다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 요청을 처리하다 예외가 나면 그 연결만 KICK_REASON_SERVER_ERROR를 받고 개체가 그 틱에 빠지며 다른 연결의 틱은 이어진다. 다시 들어오면 예외 전에
        /// 마지막으로 큐에 넣은 상태라 그 사이에 얻은 아이템이 없다.
        /// </summary>
        [Fact]
        public void ARequestExceptionKicksOnlyThatConnection()
        {
            World world = NewWorld();
            Session broken = Join(world, "hero_01");
            Session other = Join(world, "hero_02");
            long id = broken.Player!.CharacterId;
            uint brokenId = broken.Player.Id;
            world.Step();
            world.Inventory.Add(broken.Player, 3001, 5, GainReason.Unspecified);
            Take(broken);
            Take(other);

            world.ReceiveHook = _ => throw new InvalidOperationException("test");
            world.Receive(broken, new Packet { Ping = new Ping() });
            world.ReceiveHook = null;
            Assert.Equal(new[] { new Packet { Kicked = new Kicked { Reason = KickReason.ServerError } } }, Take(broken));
            Assert.True(broken.IsClosing);
            Assert.Equal(1, world.PlayerCount);
            world.Step();
            Assert.Contains(Take(other), packet => packet.EntitiesLeave?.Ids.Contains(brokenId) == true);
            world.Receive(other, new Packet { Ping = new Ping() });
            Assert.Contains(Take(other), packet => packet.BodyCase == Packet.BodyOneofCase.Pong);

            Session again = LogIn(world, "hero_01");
            Enter(world, again, id);
            Assert.Equal((0u, 3u), (again.Player!.Bag.CountOf(3001), again.Player.Bag.CountOf(2001)));
        }

        /// <summary>
        /// 아이템을 떨어뜨린 틱에 같은 플레이어의 다음 요청이 예외를 내도, 떨어뜨릴 때 넣은 사본 때문에 다시 들어온 그 플레이어에게 그 아이템이 없고 바닥에는 있다.
        /// </summary>
        [Fact]
        public void AnExceptionAfterADropKeepsTheDropOnTheGround()
        {
            World world = LootWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 5, 5);
            long id = session.Player!.CharacterId;
            Drop(world, session, SlotOf(session.Player, 2001), 1, 1);
            world.ReceiveHook = _ => throw new InvalidOperationException("test");
            world.Receive(session, new Packet { Ping = new Ping() });
            world.ReceiveHook = null;
            Assert.Single(world.GroundItems);

            Session again = LogIn(world, "hero_01");
            Enter(world, again, id);
            Assert.Equal(2u, again.Player!.Bag.CountOf(2001));
        }

        /// <summary>
        /// 내려갈 때 쓰기를 일부러 늦추면 한도에서 기다리기를 그치고 false다(서버의 한도는 10초).
        /// </summary>
        [Fact]
        public void ShutdownStopsWaitingAtTheLimit()
        {
            World world = NewWorld();
            Join(world, "hero_01");
            world.Saves.Delay = TimeSpan.FromSeconds(1);
            var watch = Stopwatch.StartNew();
            Assert.False(world.SaveAll(TimeSpan.FromMilliseconds(200)));
            Assert.True(watch.ElapsedMilliseconds < 900, $"waited {watch.ElapsedMilliseconds} ms");
            world.Saves.Delay = TimeSpan.Zero;
            world.CompleteSaves();
        }

        /// <summary>
        /// 쓰기가 실패하면 그 묶음과 뒤의 묶음이 쓰이지 않는다(앞에서부터 쓴 만큼만 남음). 서버는 그 뒤의 틱에서 1로 끝난다.
        /// </summary>
        [Fact]
        public async Task AFailedWriteStopsLaterWritesAndTheServer()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            world.Inventory.Add(session.Player, 3001, 5, GainReason.Unspecified);
            world.Saves.Enqueue(new FailingWrite());
            world.Disconnect(session);
            world.CompleteSaves();
            Assert.True(world.SaveFailed);
            Assert.Equal(0u, store.Load(id)!.State.Items.Where(item => item.ItemId == 3001).Select(item => item.Count).FirstOrDefault());

            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), world);
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            Assert.Equal(1, await server.RunAsync(cancellation.Token));
        }

        /// <summary>
        /// 입력 밖의 차례에서 예외가 나면 틱이 멈추고 서버가 1로 끝나며, 예외 전에 큐에 든 묶음은 마저 쓰여 있다.
        /// </summary>
        [Fact]
        public async Task ATickExceptionStopsTheServerAfterWritingTheQueue()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            world.Inventory.Add(session.Player, 3001, 5, GainReason.Unspecified);
            world.Saves.Delay = TimeSpan.FromMilliseconds(300);
            world.Disconnect(session);
            world.StepHook = () => throw new InvalidOperationException("test");

            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), world);
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            Assert.Equal(1, await server.RunAsync(cancellation.Token));
            Assert.Equal(0, world.Saves.Pending);
            Assert.Contains(store.Load(id)!.State.Items, item => item is { ItemId: 3001, Count: 5 });
        }

        /// <summary>
        /// 늘 실패하는 쓰기 묶음.
        /// </summary>
        private sealed class FailingWrite : StoreJob
        {
            public override bool IsWrite => true;

            public override void Run(CharacterStore store)
            {
                throw new InvalidOperationException("test");
            }
        }
    }
}
