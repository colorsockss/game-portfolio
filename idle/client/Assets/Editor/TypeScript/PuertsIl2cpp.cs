using System.IO;
using Puerts.Editor.Generator;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// IL2CPP 플레이어가 쓰는 PuerTS의 C++ 연결 코드(Assets/Gen, 생성물이지만 CI가 Unity 없이는 만들 수 없어 커밋함)를 만든다. PuerTS의 리플렉션
    /// 모드 생성과 네이티브 플러그인 파일 생성을 차례로 부른 뒤, Unity 6000.6의 IL2CPP에서 없어진 호출을 고친다. C#을
    /// 바꾼 뒤에는 다시 만든다. 배치 모드는 -executeMethod PortfolioIdleRpg.Editor.PuertsIl2cpp.Generate이다.
    /// </summary>
    public static class PuertsIl2cpp
    {
        /// <summary>PuerTS 빌드 검사(GenerateChecker)가 찾는 연결 코드.</summary>
        internal static string BridgeFile => Path.Combine(PathHelper.GetIl2cppPluginPath(), "Puerts_il2cpp.cpp");

        // shortcut: PuerTS 3.0.3(과 2026-10 master)은 Unity 6000.6에서 없어진 il2cpp::vm::Object::Unbox를 부른다.
        // 같은 일을 하는 GetRawData(IL2CPP의 il2cpp_object_unbox가 이것을 부름)로 바꾼다. PuerTS가 고쳐지면 지운다.
        /// <summary>Unity 6000.6의 IL2CPP에 없는 호출.</summary>
        internal const string Removed = "Object::Unbox(";

        /// <summary><see cref="Removed"/>를 대신하는 호출.</summary>
        private const string Replacement = "Object::GetRawData(";

        /// <summary>연결 코드를 만들고 고친다. 몇십 초 걸린다.</summary>
        [MenuItem("Tools/TypeScript/Generate IL2CPP Bridge")]
        public static void Generate()
        {
            UnityMenu.GenV2WithoutWrapper();
            UnityMenu.GenerateCppPlugin();
            string code = File.ReadAllText(BridgeFile);
            int count = (code.Length - code.Replace(Removed, string.Empty).Length) / Removed.Length;
            File.WriteAllText(BridgeFile, code.Replace(Removed, Replacement));
            AssetDatabase.Refresh();
            Debug.Log($"[TypeScript] Generated the PuerTS IL2CPP bridge and replaced {count} {Removed} calls.");
        }
    }

    /// <summary>
    /// IL2CPP 플레이어를 빌드하기 전에 연결 코드가 있고 고쳐졌는지 본다. PuerTS의 검사(GenerateChecker)보다 먼저 돌아 무엇을
    /// 할지 알려 준다.
    /// </summary>
    public sealed class PuertsIl2cppValidation : IPreprocessBuildWithReport
    {
        /// <summary>빌드 전처리 순서. PuerTS의 검사(-100)보다 먼저다. Unity의 인터페이스가 정한 이름이다.</summary>
        public int callbackOrder => -150;

        /// <summary>IL2CPP인데 연결 코드가 없거나 고쳐지지 않았으면 빌드를 실패시킨다.</summary>
        /// <param name="report">빌드 보고서.</param>
        public void OnPreprocessBuild(BuildReport report)
        {
            NamedBuildTarget target = NamedBuildTarget.FromBuildTargetGroup(report.summary.platformGroup);
            if (PlayerSettings.GetScriptingBackend(target) != ScriptingImplementation.IL2CPP)
                return;
            string bridge = PuertsIl2cpp.BridgeFile;
            if (!File.Exists(bridge) || File.ReadAllText(bridge).Contains(PuertsIl2cpp.Removed))
            {
                throw new BuildFailedException(
                    "The PuerTS IL2CPP bridge is missing or not patched for this Unity version. "
                        + "Run Tools/TypeScript/Generate IL2CPP Bridge before building a Player.");
            }
        }
    }
}
