using System.IO;
using UnrealBuildTool;

/// <summary>
/// libprotobuf와 abseil(build.mjs가 만든 정적 라이브러리). 엔진의 Protobuf 모듈은 버전이 서버와 다르고 모바일 라이브러리가 없어 쓰지 않는다.
/// </summary>
public class MmoProtobuf : ModuleRules
{
    /// <summary>
    /// 서버의 C# 런타임(Google.Protobuf)과 같은 버전.
    /// </summary>
    private const string Version = "36.2";

    /// <summary>
    /// 헤더는 경고를 UE 설정에서 빼도록 시스템 경로로 주고, 플랫폼의 라이브러리를 모두 링크한다.
    /// </summary>
    public MmoProtobuf(ReadOnlyTargetRules target) : base(target)
    {
        Type = ModuleType.External;
        string root = Path.Combine(ModuleDirectory, Version);
        PublicSystemIncludePaths.Add(Path.Combine(root, "include"));

        string libraries;
        if (target.Platform == UnrealTargetPlatform.Mac)
        {
            libraries = Path.Combine(root, "lib", "Mac");
        }
        else if (target.Platform == UnrealTargetPlatform.Android)
        {
            libraries = Path.Combine(root, "lib", "Android", "arm64-v8a");
        }
        else
        {
            throw new BuildException($"MmoProtobuf has no libraries for {target.Platform}. Add the platform to build.mjs.");
        }

        foreach (string library in Directory.GetFiles(libraries, "*.a"))
        {
            PublicAdditionalLibraries.Add(library);
        }
    }
}
