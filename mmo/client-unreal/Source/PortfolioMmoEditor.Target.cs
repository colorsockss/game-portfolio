using UnrealBuildTool;

/// <summary>
/// 에디터 빌드. 에디터에서 열거나 -game으로 실행할 때 쓴다.
/// </summary>
public class PortfolioMmoEditorTarget : TargetRules
{
    /// <summary>
    /// 게임 모듈과 에디터에만 쓰는 모듈(위젯 블루프린트 생성기)을 담는다.
    /// </summary>
    public PortfolioMmoEditorTarget(TargetInfo target) : base(target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.AddRange(new[] { "PortfolioMmo", "PortfolioMmoEditor" });
    }
}
