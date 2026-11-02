using System;
using System.IO;
using PortfolioIdleRpg.Facades;
using PortfolioIdleRpg.Runtime;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// TypeScript 런타임 환경(Development, Release)을 고르는 메뉴. 고른 환경은 설정 JSON에 쓴다.
    /// </summary>
    public static class TypeScriptEnvironmentMenu
    {
        /// <summary>환경을 바꿔 설정 JSON에 쓴 뒤 알린다.</summary>
        public static event Action EnvironmentChanged;

        /// <summary>런타임 설정 JSON의 에셋 경로.</summary>
        private const string AssetPath = "Assets/Resources/TypeScriptRuntimeSettings.json";

        /// <summary>Development를 고르는 메뉴 경로.</summary>
        private const string DevelopmentMenu = "Tools/TypeScript/Environment/Development";

        /// <summary>Release를 고르는 메뉴 경로.</summary>
        private const string ReleaseMenu = "Tools/TypeScript/Environment/Release";

        /// <summary>Development를 고른다.</summary>
        [MenuItem(DevelopmentMenu)]
        public static void UseDevelopment() => SetEnvironment(ScriptEnvironment.Development);

        /// <summary>Release를 고른다.</summary>
        [MenuItem(ReleaseMenu)]
        public static void UseRelease() => SetEnvironment(ScriptEnvironment.Release);

        /// <summary>Development 메뉴에 체크를 표시하고, 플레이 중이면 끈다.</summary>
        [MenuItem(DevelopmentMenu, true)]
        private static bool ValidateDevelopment() =>
            Validate(ScriptEnvironment.Development, DevelopmentMenu);

        /// <summary>Release 메뉴에 체크를 표시하고, 플레이 중이면 끈다.</summary>
        [MenuItem(ReleaseMenu, true)]
        private static bool ValidateRelease() => Validate(ScriptEnvironment.Release, ReleaseMenu);

        /// <summary>선택된 환경이면 메뉴에 체크를 표시한다.</summary>
        /// <param name="environment">메뉴의 환경.</param>
        /// <param name="menu">메뉴 경로.</param>
        /// <returns>플레이 중이 아니라 메뉴를 쓸 수 있으면 true.</returns>
        private static bool Validate(ScriptEnvironment environment, string menu)
        {
            Menu.SetChecked(menu, TypeScriptRuntimeSettings.Load().Environment == environment);
            return !EditorApplication.isPlayingOrWillChangePlaymode;
        }

        /// <summary>환경을 설정 JSON에 쓰고 다시 불러온다. 다음 플레이와 빌드부터 적용된다.</summary>
        /// <param name="environment">고를 환경.</param>
        public static void SetEnvironment(ScriptEnvironment environment)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                throw new System.InvalidOperationException(
                    "Stop Play mode before switching TypeScript environments.");
            }

            TypeScriptRuntimeSettings settings = TypeScriptRuntimeSettings.Load();
            settings.EnvironmentName = environment.ToString();
            File.WriteAllText(AssetPath, $"{JsonUtility.ToJson(settings, true)}\n");
            AssetDatabase.ImportAsset(AssetPath, ImportAssetOptions.ForceUpdate);
            RemoteContent.UsePlayMode(environment);
            EnvironmentChanged?.Invoke();
            Debug.Log($"[TypeScript] Selected {environment}.");
        }

        /// <summary>설정 JSON을 Project 창에서 선택한다.</summary>
        [MenuItem("Tools/TypeScript/Select Settings")]
        private static void SelectSettings() =>
            Selection.activeObject = AssetDatabase.LoadAssetAtPath<TextAsset>(AssetPath);
    }

    /// <summary>
    /// Development가 선택된 채로 플레이어를 빌드하지 못하게 막고, 앱에 들 부트 번들(Resources)이 있고 지금 C# API로
    /// 빌드됐는지 본다. 게임 번들은 앱에 들지 않고 첫 실행의 패치가 받는다. 고른 환경의 앱 설정(config/환경.json)을
    /// Resources에 넣는다. 환경은 메뉴 빌드가 고른 것이나 배치 모드 인자 -idleEnvironment이고, 없으면 local이다.
    /// </summary>
    public sealed class TypeScriptBuildValidation : IPreprocessBuildWithReport
    {
        /// <summary>인자가 없을 때의 환경.</summary>
        private const string DefaultEnvironment = "local";

        /// <summary>빌드 전처리 순서. Unity의 인터페이스가 정한 이름이다.</summary>
        public int callbackOrder => 0;

        /// <summary>
        /// Development가 선택돼 있거나, 부트 번들이 없거나 다른 C# API로 빌드됐거나, 앱 설정이 없거나 자리표시가 남아 있으면
        /// 빌드를 실패시킨다.
        /// </summary>
        /// <param name="report">빌드 보고서.</param>
        public void OnPreprocessBuild(BuildReport report)
        {
            TypeScriptRuntimeSettings settings = TypeScriptRuntimeSettings.Load();
            if (settings.Environment == ScriptEnvironment.Development)
            {
                throw new BuildFailedException("TypeScript Development mode reads local Editor files. "
                    + "Select Release in the TS toolbar dropdown before building a Player.");
            }
            string boot = Path.Combine(
                Application.dataPath, "Resources", settings.ReleaseBootDirectory, settings.ReleaseBootModule);
            if (!File.Exists(boot))
            {
                throw new BuildFailedException(
                    $"No boot bundle at {boot}. Run npm run build:release before building a Player.");
            }
            // 부트 번들의 RUNTIME_API가 곧 앱의 API다. 패치는 그 API의 채널에서 받는다(TypeScript/tools/build.mjs).
            if (!File.ReadAllText(boot).Contains(TypeScriptTypings.Fingerprint()))
            {
                throw new BuildFailedException(
                    $"The boot bundle at {boot} was built for another C# API. Run npm run build:release again.");
            }
            UseAppConfig(AppEnvironment());
        }

        /// <summary>메뉴 빌드(PlayerBuild)나 배치 모드 인자가 고른 환경.</summary>
        /// <returns>환경 이름.</returns>
        private static string AppEnvironment() =>
            PlayerBuild.Environment ?? PlayerBuild.Argument(PlayerBuild.EnvironmentArgument) ?? DefaultEnvironment;

        /// <summary>환경의 앱 설정을 Resources에 넣는다. 런타임은 RuntimeFacade.Config로 읽는다.</summary>
        /// <param name="environment">환경 이름.</param>
        private static void UseAppConfig(string environment)
        {
            string source = Path.Combine(
                Application.dataPath, "..", RuntimeFacade.ConfigDirectory, $"{environment}.json");
            if (!File.Exists(source))
                throw new BuildFailedException($"No app config at {source}.");
            string config = File.ReadAllText(source);
            if (config.Contains('<'))
                throw new BuildFailedException($"Fill in the placeholders (<…>) in {source} before building a Player.");
            string target = $"Assets/Resources/{RuntimeFacade.ConfigResource}.json";
            File.WriteAllText(target, config);
            AssetDatabase.ImportAsset(target, ImportAssetOptions.ForceUpdate);
            Debug.Log($"[TypeScript] Building the Player with the {environment} app config.");
        }
    }
}
