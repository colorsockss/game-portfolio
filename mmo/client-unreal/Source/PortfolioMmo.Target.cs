using UnrealBuildTool;

/// <summary>
/// 게임 빌드(Mac, Android 패키지).
/// </summary>
public class PortfolioMmoTarget : TargetRules
{
    /// <summary>
    /// 게임 모듈 하나를 담는다.
    /// </summary>
    public PortfolioMmoTarget(TargetInfo target) : base(target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("PortfolioMmo");
    }
}
