using System;
using System.IO;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>런타임이 다음 Tick 뒤에 할 일. 스크립트가 요청하고 런타임이 가져간다.</summary>
    internal enum RuntimeRequest
    {
        /// <summary>요청 없음.</summary>
        None,

        /// <summary>처음(부트 프로그램)부터 다시 시작한다.</summary>
        Restart,

        /// <summary>부트 프로그램을 버리고 설치된 게임 번들로 게임 프로그램을 시작한다.</summary>
        StartGame
    }

    /// <summary>스크립트 환경 자체의 수명 주기를 TypeScript에 준다(src/unity/bridge.ts, src/unity/boot.ts).</summary>
    [Preserve]
    public static class RuntimeFacade
    {
        /// <summary>플레이어 빌드가 고른 앱 설정을 넣는 Resources 경로(AppConfig.json).</summary>
        internal const string ConfigResource = "AppConfig";

        /// <summary>앱 설정 파일(local.json, live.json)의 폴더. Unity 프로젝트 루트(idle/client/) 기준 상대 경로다.</summary>
        internal const string ConfigDirectory = "config";

        /// <summary>에디터가 읽을 앱 설정의 환경(local, live)을 담는 EditorPrefs 키. 메뉴 Tools/TypeScript/App Config가 쓴다.</summary>
        internal const string EditorConfigPref = "PortfolioIdleRpg.EditorAppConfig";

        /// <summary>에디터에서 고른 것이 없을 때의 환경.</summary>
        internal const string EditorDefaultConfig = "local";

        /// <summary>
        /// 스크립트의 요청. 스크립트가 이 파사드를 정적으로 부르므로 static이다. 런타임은 한 번에 하나만 돈다.
        /// </summary>
        private static RuntimeRequest s_request;

        /// <summary>
        /// 이번 프레임에 도는 스크립트가 끝나면 스크립트 환경을 버리고 부트 프로그램부터 새로 시작한다(패치 확인 포함).
        /// 로그아웃이 이렇게 재시작하므로 이전 실행의 상태가 남지 않는다.
        /// </summary>
        [Preserve]
        public static void Restart() => s_request = RuntimeRequest.Restart;

        /// <summary>
        /// 부트 프로그램이 패치를 마치면 부른다. 이번 프레임에 도는 스크립트가 끝나면 부트의 스크립트 환경을 버리고 설치된
        /// 게임 번들로 게임 프로그램을 시작한다.
        /// </summary>
        [Preserve]
        public static void StartGame() => s_request = RuntimeRequest.StartGame;

        /// <summary>
        /// 앱 설정(환경, 게임 서버 주소, 패치 주소)의 JSON. 검사는 TypeScript가 한다(parseAppConfig). 플레이어는 빌드가
        /// Resources에 넣은 설정을 읽고, 에디터는 메뉴 Tools/TypeScript/App Config에서 고른 설정(기본은 config/local.json)을
        /// 읽는다. 마지막 플레이어 빌드가 남긴 설정으로 에디터가 Live에 붙지 않게 하기 위해서다.
        /// </summary>
        /// <returns>설정 JSON.</returns>
        [Preserve]
        public static string Config()
        {
#if UNITY_EDITOR
            string environment = UnityEditor.EditorPrefs.GetString(EditorConfigPref, EditorDefaultConfig);
            return File.ReadAllText(Path.Combine(Application.dataPath, "..", ConfigDirectory, $"{environment}.json"));
#else
            TextAsset config = Resources.Load<TextAsset>(ConfigResource);
            if (config == null)
                throw new InvalidOperationException($"No {ConfigResource} in Resources; the Player build did not add it.");
            return config.text;
#endif
        }

        /// <summary>요청을 돌려주고 지운다. 런타임이 스크립트를 Tick할 때마다 가져간다.</summary>
        /// <returns>요청. 없으면 None.</returns>
        internal static RuntimeRequest TakeRequest()
        {
            RuntimeRequest request = s_request;
            s_request = RuntimeRequest.None;
            return request;
        }
    }
}
