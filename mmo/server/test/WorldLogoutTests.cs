using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 로그아웃(77).
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// Logout을 보내면 그 틱에 개체가 빠지며 사본이 큐에 들어가고 연결이 닫힌다. 죽은 동안과 기절한 동안에도 받는다.
        /// </summary>
        [Fact]
        public void LoggingOutSavesRemovesAndCloses()
        {
            using var store = new CharacterStore(":memory:");
            World world = CombatWorld(TestData.Draw(64), store: store);
            Session dead = Fighter(world, "hero_01", 1, 0);
            Session stunned = Fighter(world, "hero_02", 2, 0);
            long id = dead.Player!.CharacterId;
            world.Inventory.Add(dead.Player, 3001, 4, GainReason.Unspecified);
            dead.Player.Dead = true;
            world.Effects.Apply(stunned.Player!, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);

            world.Receive(dead, new Packet { Logout = new Logout() });
            world.Receive(stunned, new Packet { Logout = new Logout() });
            Assert.True(dead.IsClosing && stunned.IsClosing);
            Assert.Equal((0, (Player?)null), (world.PlayerCount, dead.Player));
            world.CompleteSaves();
            Assert.Contains(store.Load(id)!.State.Items, item => item is { ItemId: 3001, Count: 4 });
        }
    }
}
