using System;
using System.IO;
using PortfolioIdleRpg.Facades;
using UnityEngine;

namespace PortfolioIdleRpg.Runtime
{
    /// <summary>런타임이 스크립트를 가져오는 곳.</summary>
    public enum ScriptEnvironment
    {
        /// <summary>에디터에서 로컬로 컴파일한 스크립트.</summary>
        Development,

        /// <summary>앱에 든 부트 번들(Resources)과 패치로 받은 게임 번들.</summary>
        Release
    }

    /// <summary>스크립트 환경에서 도는 프로그램. 한 번에 하나만 돈다.</summary>
    public enum ScriptProgram
    {
        /// <summary>패치 화면을 띄우고 게임 번들을 맞춘 뒤 게임을 시작한다. 앱이 시작하거나 재시작하면 먼저 돈다.</summary>
        Boot,

        /// <summary>게임(로그인부터). 부트가 패치를 마친 뒤에 돈다.</summary>
        Game
    }

    /// <summary>
    /// Resources/TypeScriptRuntimeSettings.json에서 읽는 런타임 설정. JsonUtility가 읽으므로 public
    /// 필드의 이름이 JSON 키다.
    /// </summary>
    [Serializable]
    public sealed class TypeScriptRuntimeSettings
    {
        /// <summary>설정 JSON의 Resources 경로.</summary>
        public const string ResourcePath = "TypeScriptRuntimeSettings";

        /// <summary>환경 이름. Development나 Release이고, 읽을 때는 <see cref="Environment"/>를 쓴다.</summary>
        public string EnvironmentName = "Development";

        /// <summary>Development에서 컴파일된 스크립트의 디렉터리. Unity 프로젝트 루트(idle/client/) 기준 상대 경로다.</summary>
        public string DevelopmentOutputDirectory = "TypeScript/dist/development";

        /// <summary>Development의 부트 진입 모듈. 스크립트 디렉터리 기준 상대 경로다.</summary>
        public string DevelopmentBootModule = "boot.js";

        /// <summary>Development의 게임 진입 모듈. 스크립트 디렉터리 기준 상대 경로다.</summary>
        public string DevelopmentGameModule = "main.js";

        /// <summary>Development에서 V8 Inspector가 여는 포트. -1이면 열지 않는다.</summary>
        public int DevelopmentDebugPort = 9229;

        /// <summary>Release의 부트 번들이 든 디렉터리. Resources 기준 상대 경로다(npm run build:release가 쓴다).</summary>
        public string ReleaseBootDirectory = "TypeScript";

        /// <summary>Release의 부트 진입 모듈. 부트 번들 디렉터리 기준 상대 경로다.</summary>
        public string ReleaseBootModule = "boot.mjs";

        /// <summary>Release에서 패치로 받은 게임 번들을 두는 디렉터리(BundleStore). persistentDataPath 기준 상대 경로다.</summary>
        public string ReleaseBundleDirectory = "TypeScript";

        /// <summary>Release의 게임 진입 모듈. 게임 번들 디렉터리 기준 상대 경로다.</summary>
        public string ReleaseGameModule = "main.mjs";

        /// <summary>선택된 환경. 이름을 모르면 예외를 던진다.</summary>
        public ScriptEnvironment Environment
        {
            get
            {
                switch (EnvironmentName)
                {
                    case "Development":
                        return ScriptEnvironment.Development;
                    case "Release":
                        return ScriptEnvironment.Release;
                    default:
                        throw new InvalidOperationException(
                            $"Unknown TypeScript environment '{EnvironmentName}'. "
                                + "Use Development or Release.");
                }
            }
        }

        /// <summary>Resources의 설정 JSON을 읽는다.</summary>
        /// <returns>읽은 설정.</returns>
        public static TypeScriptRuntimeSettings Load()
        {
            TextAsset asset = Resources.Load<TextAsset>(ResourcePath);
            if (asset == null)
                throw new FileNotFoundException("Missing Resources/TypeScriptRuntimeSettings.json.");

            TypeScriptRuntimeSettings settings = JsonUtility.FromJson<TypeScriptRuntimeSettings>(asset.text);
            if (settings == null)
                throw new InvalidOperationException("Invalid TypeScriptRuntimeSettings.json.");
            return settings;
        }

        /// <summary>
        /// 프로그램의 스크립트 디렉터리를 전체 경로로 돌려준다. Release의 부트는 앱의 Resources에서 읽으므로 null이다.
        /// </summary>
        /// <param name="program">프로그램.</param>
        /// <returns>스크립트 디렉터리의 전체 경로, 또는 null.</returns>
        public string GetScriptDirectory(ScriptProgram program)
        {
            if (Environment == ScriptEnvironment.Development)
            {
#if UNITY_EDITOR
                return SafePath.ResolveChild(
                    Path.GetDirectoryName(Application.dataPath), DevelopmentOutputDirectory);
#else
                throw new InvalidOperationException(
                    "TypeScript Development mode requires the Unity Editor and local compiled scripts. "
                        + "Player builds require Release mode.");
#endif
            }
            if (program == ScriptProgram.Boot)
                return null;
            // 부트는 게임 번들이 설치된 뒤에만 게임을 시작한다.
            string installed = BundleStore.Current(GetBundleStore());
            if (installed == null)
            {
                throw new InvalidOperationException(
                    "No game bundle is installed. The boot program starts the game only after a patch.");
            }
            return installed;
        }

        /// <summary>Release에서 패치로 받은 게임 번들을 두는 디렉터리를 전체 경로로 돌려준다.</summary>
        /// <returns>받은 번들을 두는 디렉터리의 전체 경로.</returns>
        public string GetBundleStore() =>
            SafePath.ResolveChild(Application.persistentDataPath, ReleaseBundleDirectory);

        /// <summary>프로그램의 진입 모듈. 스크립트 디렉터리(Release의 부트는 Resources 디렉터리) 기준 상대 경로다.</summary>
        /// <param name="program">프로그램.</param>
        /// <returns>진입 모듈의 경로.</returns>
        public string GetEntryModule(ScriptProgram program)
        {
            if (Environment == ScriptEnvironment.Development)
                return program == ScriptProgram.Boot ? DevelopmentBootModule : DevelopmentGameModule;
            return program == ScriptProgram.Boot ? ReleaseBootModule : ReleaseGameModule;
        }
    }
}
