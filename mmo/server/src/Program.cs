using System;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 서버 진입점. SIGINT·SIGTERM을 받으면 모두에게 SERVER_SHUTDOWN을 보내고 위치를 저장한 뒤 내려간다.
    /// </summary>
    public static class Program
    {
        /// <summary>
        /// 인자: --port(기본 7777), --max-players(동시 접속 상한, 기본 1000),
        /// --spawn-half-extent(처음 들어온 플레이어를 놓을 정사각형의 반 너비, m, 기본 0),
        /// --database(SQLite 파일, 작업 디렉터리 기준, 기본 mmo.sqlite).
        /// </summary>
        public static async Task Main(string[] args)
        {
            int port = int.Parse(Option(args, "--port", "7777"));
            int maxPlayers = int.Parse(Option(args, "--max-players", "1000"));
            int spawnHalfExtent = int.Parse(Option(args, "--spawn-half-extent", "0")) * Units.PerMeter;
            using var store = new PlayerStore(Option(args, "--database", "mmo.sqlite"));

            using var cancellation = new CancellationTokenSource();
            Action<PosixSignalContext> stop = context =>
            {
                context.Cancel = true;
                cancellation.Cancel();
            };
            using PosixSignalRegistration interrupt = PosixSignalRegistration.Create(PosixSignal.SIGINT, stop);
            using PosixSignalRegistration terminate = PosixSignalRegistration.Create(PosixSignal.SIGTERM, stop);

            var server = new GameServer(new IPEndPoint(IPAddress.Any, port), new World(maxPlayers, spawnHalfExtent, new Random(), store));
            Task running = server.RunAsync(cancellation.Token);
            Console.WriteLine($"Listening on port {server.Port} (max players {maxPlayers})");
            await running;
            Console.WriteLine("Stopped");
        }

        /// <summary>
        /// "--이름 값" 꼴의 인자. 없으면 fallback.
        /// </summary>
        private static string Option(string[] args, string name, string fallback)
        {
            int index = Array.IndexOf(args, name);
            return (index >= 0) && (index + 1 < args.Length) ? args[index + 1] : fallback;
        }
    }
}
