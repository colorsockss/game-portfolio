using System;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 서버 진입점. SIGINT·SIGTERM을 받으면 모두에게 SERVER_SHUTDOWN을 보내고 내려간다.
    /// </summary>
    public static class Program
    {
        /// <summary>
        /// 인자: --port(기본 7777), --max-players(동시 접속 상한, 기본 1000),
        /// --spawn-half-extent(처음 들어온 플레이어를 놓을 정사각형의 반 너비, m, 기본 0).
        /// </summary>
        public static async Task Main(string[] args)
        {
            int port = Option(args, "--port", 7777);
            int maxPlayers = Option(args, "--max-players", 1000);
            int spawnHalfExtent = Option(args, "--spawn-half-extent", 0) * Units.PerMeter;

            using var cancellation = new CancellationTokenSource();
            Action<PosixSignalContext> stop = context =>
            {
                context.Cancel = true;
                cancellation.Cancel();
            };
            using PosixSignalRegistration interrupt = PosixSignalRegistration.Create(PosixSignal.SIGINT, stop);
            using PosixSignalRegistration terminate = PosixSignalRegistration.Create(PosixSignal.SIGTERM, stop);

            var server = new GameServer(new IPEndPoint(IPAddress.Any, port), new World(maxPlayers, spawnHalfExtent, new Random()));
            Task running = server.RunAsync(cancellation.Token);
            Console.WriteLine($"Listening on port {server.Port} (max players {maxPlayers})");
            await running;
            Console.WriteLine("Stopped");
        }

        /// <summary>
        /// "--이름 값" 꼴의 정수 인자. 없으면 fallback.
        /// </summary>
        private static int Option(string[] args, string name, int fallback)
        {
            int index = Array.IndexOf(args, name);
            return (index >= 0) && (index + 1 < args.Length) ? int.Parse(args[index + 1]) : fallback;
        }
    }
}
