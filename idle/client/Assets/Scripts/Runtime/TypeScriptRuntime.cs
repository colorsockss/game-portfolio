using System;
using System.IO;
using PortfolioIdleRpg.Facades;
using Puerts;
using UnityEngine;

namespace PortfolioIdleRpg.Runtime
{
    /// <summary>
    /// PuerTS 스크립트 환경 하나를 만들어 프로그램의 진입 모듈을 실행하고, 매 프레임 돌리고, 스크립트가 요청하면 다음
    /// 프로그램으로 바꾸고(부트 → 게임) 처음부터 다시 시작하고, 폐기한다.
    /// </summary>
    public sealed class TypeScriptRuntime : IDisposable
    {
        /// <summary>도는 스크립트 환경. 시작하기 전이나 폐기한 뒤에는 null이다.</summary>
        private ScriptEnv _scriptEnv;

        /// <summary>마지막으로 시작한 설정. 재시작할 때 다시 쓴다.</summary>
        private TypeScriptRuntimeSettings _settings;

        /// <summary>부트 프로그램으로 스크립트 환경을 시작한다. 부트가 패치를 마치면 게임 프로그램으로 바뀐다.</summary>
        /// <param name="settings">스크립트 디렉터리, 진입 모듈, 디버그 포트를 정하는 설정.</param>
        public void Start(TypeScriptRuntimeSettings settings) => Start(settings, ScriptProgram.Boot);

        /// <summary>프로그램의 진입 모듈을 실행해 스크립트 환경을 시작한다.</summary>
        /// <param name="settings">스크립트 디렉터리, 진입 모듈, 디버그 포트를 정하는 설정.</param>
        /// <param name="program">시작할 프로그램.</param>
        private void Start(TypeScriptRuntimeSettings settings, ScriptProgram program)
        {
            if (_scriptEnv != null)
                throw new InvalidOperationException("The TypeScript runtime is already running.");
            _settings = settings;
            // Tick 없이 끝난 실행(플레이 모드를 나감)에서 남은 요청은 이번 실행의 것이 아니다.
            RuntimeFacade.TakeRequest();

#if UNITY_WEBGL && !UNITY_EDITOR
            throw new PlatformNotSupportedException(
                "This TypeScript runtime uses PuerTS V8 and does not support WebGL.");
#else
            string root = settings.GetScriptDirectory(program);
            string entry = settings.GetEntryModule(program);
            // Release의 부트는 앱에 든 Resources에서, 나머지는 스크립트 디렉터리의 파일에서 읽는다.
            TypeScriptFileLoader loader = root == null
                ? TypeScriptFileLoader.InResources(settings.ReleaseBootDirectory)
                : new TypeScriptFileLoader(root);
            string where = root == null
                ? $"Resources/{settings.ReleaseBootDirectory}/{entry}"
                : SafePath.ResolveChild(root, entry);
            if (!loader.FileExists(entry))
            {
                string help = settings.Environment == ScriptEnvironment.Development
                    ? "Run npm ci and npm run build:dev (or npm run dev) in the repository root."
                    : "Run npm run build:release in the repository root. It writes the boot bundle to "
                        + "Assets/Resources/TypeScript and the game bundle that the patch downloads.";
                throw new FileNotFoundException($"TypeScript entry module not found: {where}. {help}", where);
            }

            int debugPort = settings.Environment == ScriptEnvironment.Development
                ? settings.DevelopmentDebugPort
                : -1;
            if ((debugPort != -1) && ((debugPort < 1024) || (debugPort > 65535)))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(settings.DevelopmentDebugPort),
                    "Use -1 to disable debugging, or a port between 1024 and 65535.");
            }

            // 게임이 FileFacade로 데이터 파일을 읽으므로, 스크립트가 돌기 전에 루트를 넣어 둬야 한다. 부트는 파일을 읽지
            // 않는다. 받은 번들을 두는 곳은 Release에만 있고, 없으면 부트가 패치하지 않는다.
            FileFacade.Root = program == ScriptProgram.Game ? root : null;
            BundleFacade.Store = settings.Environment == ScriptEnvironment.Release
                ? settings.GetBundleStore()
                : null;
            // 게임은 게임 번들과 함께 설치된 에셋 카탈로그로 패치 뒤의 에셋을 불러온다.
            if (program == ScriptProgram.Game)
                ResourceFacade.UseCatalog(root);
            try
            {
                _scriptEnv = new ScriptEnv(new BackendV8(loader), debugPort);
                _scriptEnv.ExecuteModule(entry);
                Debug.Log($"[TypeScript] {settings.Environment} {program}: {where}");
            }
            catch
            {
                // 반쯤 시작한 환경과 파사드가 쥔 것을 정리하고, 호출자가 실패를 알도록 그대로 다시 던진다.
                Dispose();
                throw;
            }
#endif
        }

        /// <summary>스크립트의 타이머와 프로미스를 돌리고, 스크립트가 요청했으면 프로그램을 바꾸거나 다시 시작한다.</summary>
        public void Tick()
        {
            if (_scriptEnv == null)
                return;
            _scriptEnv.Tick();
            // 도는 스크립트가 없는 여기서만 한다. 환경을 그 환경이 한 호출 안에서 폐기하면
            // 그 호출의 발밑에서 스택이 빠져 버린다.
            RuntimeRequest request = RuntimeFacade.TakeRequest();
            if (request == RuntimeRequest.None)
                return;
            Debug.Log(request == RuntimeRequest.StartGame
                ? "[TypeScript] Starting the game."
                : "[TypeScript] Restarting.");
            Dispose();
            Start(_settings, request == RuntimeRequest.StartGame ? ScriptProgram.Game : ScriptProgram.Boot);
        }

        /// <summary>파사드가 쥔 것을 정리하고 스크립트 환경을 폐기한다.</summary>
        public void Dispose()
        {
            // 소켓을 닫거나 로드를 해제하다 예외가 나도 환경은 폐기한다. 폐기하지 못해 남은 isolate는
            // 다음 Start를 이미 실행 중이라며 실패하게 만든다.
            try
            {
                FacadeLifecycle.Shutdown();
            }
            finally
            {
                _scriptEnv?.Dispose();
                _scriptEnv = null;
            }
        }
    }
}
