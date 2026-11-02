using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// Android APK를 빌드한다. 에디터 메뉴는 환경(local, live)을 골라 client/Builds/Android/(커밋하지 않음)에 만들고, 서명은
    /// 플레이어 설정의 것(키스토어가 없으면 디버그 키)이다. CI는 <see cref="BuildForCi"/>를 GameCI의 buildMethod로 부른다.
    /// </summary>
    public static class PlayerBuild
    {
        /// <summary>앱 설정의 환경을 고르는 배치 모드 인자. 뒤에 환경 이름(local, live)이 온다.</summary>
        internal const string EnvironmentArgument = "-idleEnvironment";

        /// <summary>CI가 같은 Unity 실행에서 원격 콘텐츠도 빌드하라고 넘기는 배치 모드 인자.</summary>
        private const string RemoteContentArgument = "-idleRemoteContent";

        /// <summary>APK를 두는 폴더. Unity 프로젝트 루트(idle/client/) 기준 상대 경로다.</summary>
        private const string OutputDirectory = "Builds/Android";

        /// <summary>빌드가 고른 환경. 빌드하는 동안만 있고, 플레이어 빌드 전처리가 배치 모드 인자보다 먼저 본다.</summary>
        internal static string Environment { get; private set; }

        /// <summary>로컬 서버와 로컬 버킷(config/local.json)에 붙는 APK를 빌드한다.</summary>
        [MenuItem("Tools/Build/Android APK (Local)")]
        public static void BuildLocal() => Build($"{OutputDirectory}/idle-local.apk", "local");

        /// <summary>Live VPS(config/live.json)에 붙는 APK를 빌드한다.</summary>
        [MenuItem("Tools/Build/Android APK (Live)")]
        public static void BuildLive() => Build($"{OutputDirectory}/idle-live.apk", "live");

        /// <summary>
        /// CI(GameCI unity-builder)의 buildMethod. -idleRemoteContent가 있으면 같은 Unity 실행에서 원격 콘텐츠를 먼저 빌드하고, APK를
        /// 빌드한다. 출력 경로, versionCode, 버전 이름, 키스토어는 GameCI가 넘기는 인자(-customBuildPath, -androidVersionCode,
        /// -buildVersion, -androidKeystoreName 등)에서 읽고, 환경은 -idleEnvironment다. GameCI의 기본 빌드 스크립트를 쓴 두 번의
        /// 실행(2026-10-31)은 Unity가 어셈블리를 불러오다 메모리 부족 없이 죽어서(exit 137) 그 스크립트와 두 번째 Unity 실행을 피한다.
        /// 끝나면 GameCI가 성공으로 읽는 줄을 남긴다.
        /// </summary>
        public static void BuildForCi()
        {
            if (Array.IndexOf(System.Environment.GetCommandLineArgs(), RemoteContentArgument) >= 0)
                RemoteContent.Build();
            string keystore = Argument("-androidKeystoreName");
            if (!string.IsNullOrEmpty(keystore))
            {
                PlayerSettings.Android.useCustomKeystore = true;
                PlayerSettings.Android.keystoreName = Path.GetFullPath(keystore);
                PlayerSettings.Android.keystorePass = Argument("-androidKeystorePass");
                PlayerSettings.Android.keyaliasName = Argument("-androidKeyaliasName");
                PlayerSettings.Android.keyaliasPass = Argument("-androidKeyaliasPass");
            }
            PlayerSettings.Android.bundleVersionCode = int.Parse(Argument("-androidVersionCode"));
            PlayerSettings.bundleVersion = Argument("-buildVersion");
            Build(Argument("-customBuildPath"), Argument(EnvironmentArgument) ?? "local");
            Debug.Log("Build succeeded!");
        }

        /// <summary>배치 모드 인자의 값. 없으면 null이다.</summary>
        /// <param name="name">인자 이름(예: -customBuildPath).</param>
        /// <returns>뒤에 온 값.</returns>
        internal static string Argument(string name)
        {
            string[] args = System.Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, name);
            return (index >= 0) && (index + 1 < args.Length) ? args[index + 1] : null;
        }

        /// <summary>빌드 설정의 켠 씬으로 APK를 빌드한다. 실패하면 예외를 던진다.</summary>
        /// <param name="path">APK 경로.</param>
        /// <param name="environment">앱 설정의 환경 이름.</param>
        private static void Build(string path, string environment)
        {
            var options = new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray(),
                locationPathName = path,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            Environment = environment;
            try
            {
                BuildReport report = BuildPipeline.BuildPlayer(options);
                if (report.summary.result != BuildResult.Succeeded)
                    throw new BuildFailedException($"The {environment} APK build {report.summary.result}.");
                Debug.Log($"[Build] {options.locationPathName}: {report.summary.totalSize} bytes "
                    + $"in {report.summary.totalTime.TotalSeconds:F0}s");
            }
            finally
            {
                Environment = null;
            }
        }
    }
}
