using UnrealBuildTool;

/// <summary>
/// 에디터에만 들어가는 모듈. 위젯 블루프린트를 만드는 생성기(MmoCreateWidgets 커맨드렛)가 있다.
/// 게임 모듈의 UI 기반 클래스만 쓰고 protobuf는 쓰지 않는다(libprotobuf는 게임 모듈 하나에만 링크한다).
/// </summary>
public class PortfolioMmoEditor : ModuleRules
{
    /// <summary>
    /// 에디터 모듈의 의존성.
    /// </summary>
    public PortfolioMmoEditor(ReadOnlyTargetRules target) : base(target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "AssetRegistry",
            "Slate",
            "SlateCore",
            "UMG",
            "UMGEditor",
            "UnrealEd",
            "PortfolioMmo",
        });
    }
}
