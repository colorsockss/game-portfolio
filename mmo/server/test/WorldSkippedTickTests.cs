using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 틱이 밀릴 때(79). 틱 루프는 지난 틱 수를 World.Step에 넘기고(TickClock), 월드는 그만큼 진행한다. 몬스터·발사체·예약 큐·회복·시야 인원 상한·펫의
    /// 밀린 틱은 그 기능의 테스트가 본다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 지난 틱 수가 3이면 다음 입력의 이동 예산도 3틱 치라, 그동안 제 속도로 걸은 Move 셋이 되돌려지지 않는다. 지난 틱 수가 1이면 둘째에서 되돌린다.
        /// </summary>
        [Fact]
        public void SkippedTicksFillTheMoveBudgetForTheWholeTime()
        {
            foreach ((uint elapsed, bool reset) in new[] { (3u, false), (1u, true) })
            {
                World world = NewWorld();
                Session session = Join(world, "hero_01");
                world.Step();
                Take(session);
                Player player = session.Player!;
                player.MoveBudget = 0;

                world.Step(elapsed);
                for (int i = 1; i <= 3; i++)
                {
                    Move(world, session, Stride * i, 0, ack: 0);
                }

                Assert.Equal(reset, Take(session).Any(packet => packet.PositionReset != null));
                Assert.Equal(reset ? Stride : Stride * 3, player.X);
            }
        }
    }
}
