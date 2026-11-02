using System;
using System.IO;
using PortfolioIdleRpg.Facades;
using Puerts;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Runtime
{
    /// <summary>
    /// 프로그램의 스크립트 디렉터리(파일)나 앱에 든 Resources 디렉터리에서 모듈을 읽어 PuerTS에 준다. public 메서드는
    /// PuerTS가 리플렉션으로 부른다.
    /// </summary>
    [Preserve]
    public sealed class TypeScriptFileLoader : ILoader, IModuleChecker
    {
        /// <summary>게임 모듈을 찾는 스크립트 디렉터리의 전체 경로. Resources에서 읽으면 null이다.</summary>
        private readonly string _root;

        /// <summary>게임 모듈을 찾는 Resources 디렉터리(예: TypeScript). 파일에서 읽으면 null이다.</summary>
        private readonly string _resources;

        /// <summary>Resources에 든 PuerTS 내부 모듈을 읽는 PuerTS의 기본 로더.</summary>
        private readonly DefaultLoader _builtins = new DefaultLoader();

        /// <summary><paramref name="root"/> 아래의 파일에서 게임 모듈을 읽는 로더를 만든다.</summary>
        /// <param name="root">스크립트 디렉터리.</param>
        public TypeScriptFileLoader(string root)
            : this(Path.GetFullPath(root), null)
        {
        }

        /// <summary>파일이나 Resources 중 하나에서 읽는 로더를 만든다.</summary>
        /// <param name="root">스크립트 디렉터리의 전체 경로, 또는 null.</param>
        /// <param name="resources">Resources 디렉터리, 또는 null.</param>
        private TypeScriptFileLoader(string root, string resources)
        {
            _root = root;
            _resources = resources;
        }

        /// <summary>앱에 든 Resources의 <paramref name="directory"/>에서 게임 모듈을 읽는 로더를 만든다(부트 번들).</summary>
        /// <param name="directory">Resources 기준 디렉터리.</param>
        /// <returns>Resources에서 읽는 로더.</returns>
        public static TypeScriptFileLoader InResources(string directory) =>
            new TypeScriptFileLoader(null, directory);

        /// <summary>모듈이 있는지 돌려준다.</summary>
        /// <param name="filepath">import한 모듈 경로.</param>
        /// <returns>모듈이 있으면 true.</returns>
        [Preserve]
        public bool FileExists(string filepath)
        {
            if ((filepath == "csharp") || (filepath == "puerts"))
                return true;
            if (IsBuiltin(filepath))
                return _builtins.FileExists(filepath);
            return _resources != null
                ? LoadResource(filepath) != null
                : File.Exists(SafePath.ResolveChild(_root, filepath));
        }

        /// <summary>모듈의 소스를 읽는다.</summary>
        /// <param name="filepath">import한 모듈 경로.</param>
        /// <param name="debugpath">디버거가 보여 줄 경로.</param>
        /// <returns>모듈의 소스.</returns>
        [Preserve]
        public string ReadFile(string filepath, out string debugpath)
        {
            // PuerTS 네이티브 전역에 대한 ESM 기본 import(파일 시스템에 의존하지 않는다).
            if ((filepath == "csharp") || (filepath == "puerts"))
            {
                debugpath = filepath;
                return filepath == "csharp"
                    ? "export default globalThis.CS;"
                    : "export default globalThis.puer;";
            }
            // PuerTS 내부 파일은 PuerTS의 Resources에서, 게임 코드는 항상 이 로더의 디렉터리에서 가져온다.
            if (IsBuiltin(filepath))
                return _builtins.ReadFile(filepath, out debugpath);

            if (_resources != null)
            {
                debugpath = $"Resources/{_resources}/{filepath}";
                TextAsset asset = LoadResource(filepath);
                if (asset == null)
                    throw new FileNotFoundException($"No TypeScript module at {debugpath}.", debugpath);
                return asset.text;
            }
            debugpath = SafePath.ResolveChild(_root, filepath);
            return File.ReadAllText(debugpath);
        }

        /// <summary>모듈이 ESM인지 돌려준다. .cjs만 CommonJS로 읽는다.</summary>
        /// <param name="filepath">모듈 경로.</param>
        /// <returns>ESM이면 true.</returns>
        [Preserve]
        public bool IsESM(string filepath) => !filepath.EndsWith(".cjs", StringComparison.Ordinal);

        /// <summary>PuerTS 내부 모듈의 경로인지 돌려준다.</summary>
        /// <param name="filepath">모듈 경로.</param>
        /// <returns>PuerTS 내부 모듈이면 true.</returns>
        private static bool IsBuiltin(string filepath) =>
            filepath.StartsWith("puerts/", StringComparison.Ordinal);

        /// <summary>Resources의 모듈을 불러온다. Resources 경로에는 확장자가 없다(PuerTS가 .mjs를 TextAsset으로 가져온다).</summary>
        /// <param name="filepath">모듈 경로.</param>
        /// <returns>모듈의 TextAsset. 없으면 null.</returns>
        private TextAsset LoadResource(string filepath) =>
            Resources.Load<TextAsset>($"{_resources}/{Path.ChangeExtension(filepath, null)}");
    }
}
