using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using Puerts;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.Events;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// TypeScript/types/csharp.d.ts를 쓴다. TypeScript가 부를 수 있는 C# API를 PuerTS가 선언한 파일로,
    /// Facades와 Views 네임스페이스의 public 타입이 전부 들어간다. Unity의 컴포넌트는 ViewRefs로만
    /// TypeScript에 닿으며 src/unity/binding/components.ts의 모양으로 쓴다.
    /// 스크립트를 다시 불러온 뒤 그 API가 바뀌었으면 파일을 다시 써서 C#보다 뒤처지지 않게 한다.
    /// 에디터를 열지 않고 실행하려면 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.TypeScriptTypings.Generate
    /// </code>
    /// </summary>
    [Configure]
    public static class TypeScriptTypings
    {
        /// <summary>생성한 파일의 머리에 API 지문을 적는 줄의 앞부분.</summary>
        private const string FingerprintLine = "// API 지문: ";

        /// <summary>TypeScript에 선언하는 네임스페이스.</summary>
        private static readonly string[] s_namespaces =
        {
            "PortfolioIdleRpg.Facades", "PortfolioIdleRpg.Views",
        };

        /// <summary>생성한 파일의 전체 경로.</summary>
        private static string OutputPath =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "../TypeScript/types/csharp.d.ts"));

        /// <summary>
        /// 선언할 타입. PuerTS는 [Configure] 클래스의 [Typing] 목록을 읽는다. System.Array도 넣는다:
        /// 뷰가 C# 배열(ViewRefs 목록)을 읽는데, 빠지면 PuerTS가 Length 없는 Array로 선언한다.
        /// </summary>
        [Typing]
        private static IEnumerable<Type> Types => typeof(Facades.FileFacade).Assembly.GetTypes()
            .Concat(typeof(Views.ViewRefs).Assembly.GetTypes())
            .Where(type => type.IsPublic && s_namespaces.Contains(type.Namespace))
            .Append(typeof(Array))
            .OrderBy(type => type.FullName, StringComparer.Ordinal);

        /// <summary>
        /// TypeScript가 PuerTS 리플렉션으로 직접 부르는 엔진 타입(src/unity/binding/components.ts의 UnityTypes 가운데 엔진 것과
        /// 그 이벤트). IL2CPP는 C#에서 부르지 않는 엔진 멤버를 잘라내므로(2026-11-02 기기에서 UnityEvent.RemoveListener가
        /// 없어 로그인이 멈춤), PuerTS가 이 목록으로 Assets/Gen/link.xml을 만들어 통째로 남긴다(Tools/TypeScript/Generate
        /// IL2CPP Bridge). 게임 어셈블리는 잘라내지 않으므로(Minimal) 넣지 않는다. PuerTS는 열린 제네릭을 건너뛰므로 닫힌
        /// 것으로 넣는다. API 지문(Fingerprint)에는 들지 않는다.
        /// </summary>
        [Binding]
        private static IEnumerable<Type> Bindings => new[]
        {
            typeof(GameObject), typeof(Component),
            typeof(UnityEventBase), typeof(UnityEvent), typeof(UnityEvent<string>), typeof(UnityEvent<bool>),
            typeof(UnityEvent<float>),
            typeof(UnityEngine.UI.Selectable), typeof(UnityEngine.UI.Text), typeof(UnityEngine.UI.Image),
            typeof(UnityEngine.UI.Button), typeof(UnityEngine.UI.Button.ButtonClickedEvent),
            typeof(UnityEngine.UI.InputField), typeof(UnityEngine.UI.InputField.OnChangeEvent),
            typeof(UnityEngine.UI.Toggle), typeof(UnityEngine.UI.Toggle.ToggleEvent),
            typeof(UnityEngine.UI.Slider), typeof(UnityEngine.UI.Slider.SliderEvent),
            typeof(TMPro.TMP_Text), typeof(TMPro.TextMeshProUGUI),
            typeof(TMPro.TMP_InputField), typeof(TMPro.TMP_InputField.OnChangeEvent),
        };

        /// <summary>
        /// 스크립트를 다시 불러올 때마다 API 지문을 비교해, 바뀌었으면 파일을 다시 쓴다. 예외는 Unity가
        /// InitializeOnLoadMethod마다 잡아 기록하므로 다른 초기화를 막지 않는다.
        /// </summary>
        [InitializeOnLoadMethod]
        private static void GenerateIfChanged()
        {
            string line = $"{FingerprintLine}{Fingerprint()}";
            if (!File.Exists(OutputPath) || !File.ReadLines(OutputPath).Take(3).Contains(line))
                Generate();
        }

        /// <summary>PuerTS로 선언을 만들어 머리말과 API 지문을 붙여 쓴다.</summary>
        [MenuItem("Tools/TypeScript/Generate Typings")]
        public static void Generate()
        {
            string temp = $"{FileUtil.GetUniqueTempPathInProject()}/";
            Directory.CreateDirectory($"{temp}Typing/csharp");
            try
            {
                Puerts.V8.Editor.Generator.DTSUnityMenu.ExportDTS(temp, null, true);
                string header = "// idle/client/Assets/Editor/TypeScript/TypeScriptTypings.cs가 생성한 파일. "
                    + "직접 고치지 않는다.\n"
                    + $"{FingerprintLine}{Fingerprint()}\n";
                string declarations = File.ReadAllText($"{temp}Typing/csharp/index.d.ts");
                File.WriteAllText(OutputPath, $"{header}{declarations}");
                Debug.Log($"[TypeScript] Wrote {OutputPath}");
            }
            finally
            {
                Directory.Delete(temp, true);
            }
        }

        /// <summary>
        /// 목록에 있는 타입의 public 시그니처, 플레이어 스크립트가 직렬화하는 필드, 파일에 실린 문서의 Unity 버전으로 만든 지문.
        /// V8 환경을 띄우는 생성과 달리 다시 불러올 때마다 해도 될 만큼 싸다.
        /// </summary>
        /// <returns>16자리 16진수 지문.</returns>
        internal static string Fingerprint()
        {
            var api = new StringBuilder(Application.unityVersion);
            foreach (Type type in Types)
            {
                api.Append('\n').Append(type.FullName).Append(" : ").Append(type.BaseType);
                IEnumerable<string> members = type
                    .GetMembers(BindingFlags.Public | BindingFlags.Instance
                        | BindingFlags.Static | BindingFlags.DeclaredOnly)
                    .Select(member => member.ToString())
                    .OrderBy(member => member, StringComparer.Ordinal);
                foreach (string member in members)
                    api.Append('\n').Append(member);
            }
            foreach (Type type in SerializedTypes())
            {
                api.Append('\n').Append(type.FullName).Append(" {");
                foreach (FieldInfo field in SerializedFields(type))
                    api.Append(' ').Append(field.FieldType).Append(' ').Append(field.Name).Append(';');
                api.Append(" }");
            }
            using SHA256 sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(api.ToString()));
            return BitConverter.ToString(hash, 0, 8).Replace("-", "").ToLowerInvariant();
        }

        /// <summary>
        /// 플레이어에 드는 스크립트 어셈블리(프로젝트와 패키지)에서 Unity가 직렬화하는 타입: 컴포넌트, ScriptableObject,
        /// [Serializable] 타입. 패치의 프리팹과 에셋은 이 필드를 이름으로 맞춰 읽고 없는 이름은 빈 값으로 두므로, 필드가 다른 앱이
        /// 받으면 오류 없이 깨진다(2026-11-04 build 3이 build 4의 무대를 받아 배경과 이동이 멈춤). public API에 드러나지 않아도
        /// 지문이 바뀌어야 하는 까닭이다. 컴파일러가 만든 타입(람다의 닫힘)은 직렬화되지 않으므로 뺀다.
        /// </summary>
        /// <returns>이름 순의 타입.</returns>
        private static IEnumerable<Type> SerializedTypes()
        {
            var player = new HashSet<string>(CompilationPipeline
                .GetAssemblies(AssembliesType.PlayerWithoutTestAssemblies)
                .Select(assembly => assembly.name));
            return AppDomain.CurrentDomain.GetAssemblies()
                .Where(assembly => player.Contains(assembly.GetName().Name))
                .SelectMany(assembly => assembly.GetTypes())
                .Where(type => (typeof(UnityEngine.Object).IsAssignableFrom(type) || type.IsSerializable)
                    && !type.IsDefined(typeof(CompilerGeneratedAttribute), false))
                .OrderBy(type => type.FullName, StringComparer.Ordinal);
        }

        /// <summary>Unity가 직렬화하는 <paramref name="type"/>의 필드(기반 타입의 것은 빼고).</summary>
        /// <param name="type">타입.</param>
        /// <returns>이름 순의 필드.</returns>
        private static IEnumerable<FieldInfo> SerializedFields(Type type) => type
            .GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(field => !field.IsInitOnly && !field.IsNotSerialized
                && (field.IsPublic || field.IsDefined(typeof(SerializeField), false)
                    || field.IsDefined(typeof(SerializeReference), false)))
            .OrderBy(field => field.Name, StringComparer.Ordinal);
    }
}
