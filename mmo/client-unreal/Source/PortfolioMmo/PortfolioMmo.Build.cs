using System.IO;
using UnrealBuildTool;

/// <summary>
/// 게임 모듈. Protocol/(패킷)과 World/(월드 모델) 폴더는 UE 타입을 쓰지 않는다. Tests/run.mjs가 그 폴더를 엔진 없이 컴파일해 경계를 지킨다.
/// </summary>
public class PortfolioMmo : ModuleRules
{
    /// <summary>
    /// protobuf를 쓰는 코드를 이 모듈 하나에 모은다. 에디터에서는 모듈마다 라이브러리가 따로 링크되므로,
    /// 모듈을 나누면 libprotobuf가 두 벌 들어가 전역 상태가 갈라진다.
    /// </summary>
    public PortfolioMmo(ReadOnlyTargetRules target) : base(target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "DeveloperSettings",
            "InputCore",
            "EnhancedInput",
            "Sockets",
            "Networking",
            "UMG",
            "Slate",
            "SlateCore",
            "MmoProtobuf",
            "Niagara",
        });

        // 서버·Unity와 같은 packets.proto에서 만든 C++. 모듈 폴더 밖이라 Protocol/Packets.cpp가 .cc를 include해 컴파일하고,
        // 시스템 경로로 넣어 생성 코드의 경고를 UE 설정에서 뺀다.
        PublicSystemIncludePaths.Add(Path.GetFullPath(Path.Combine(ModuleDirectory, "../../../shared/contract/generated")));
        // 기획 데이터(mmo/data/의 xlsx)에서 만든 C++. Private/Data/Data<테이블>.cpp가 .cc를 하나씩 include한다. protoc의 .pb.cc는
        // 파일 안의 정적 이름(schemas 등)이 같아 한 번역 단위에 둘이 들어가면 컴파일되지 않으므로 이 모듈은 유니티 빌드를 쓰지 않는다.
        bUseUnity = false;
        PublicSystemIncludePaths.Add(Path.GetFullPath(Path.Combine(ModuleDirectory, "../../../shared/data/generated")));
    }
}
