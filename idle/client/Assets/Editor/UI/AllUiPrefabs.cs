using UnityEditor;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// UI 프리팹 빌더를 모두 차례로 실행한다. 뒤 빌더가 앞 빌더의 결과를 쓰므로(프리팹이 아이콘 묶음을, 화면이 부품을, 메인 화면이
    /// 위젯의 CurrencyBar를, 장비가 CurrencySlot을) 이 순서를 지킨다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.AllUiPrefabs.Build
    /// </code>
    /// </summary>
    public static class AllUiPrefabs
    {
        /// <summary>아이콘 → 부품 → 위젯 → 메인·로그인 → 가방 → 장비 → 강화 → 스킬 → 환생 → 설정 → 튜토리얼 → 디버그 순서로 만든다. 하나가 던지면 거기서 멈춘다.</summary>
        [MenuItem("Tools/UI/Build All Prefabs", priority = 0)]
        public static void Build()
        {
            UiIcons.Build();
            UiParts.Build();
            WidgetPrefabs.Build();
            ScreenPrefabs.Build();
            InventoryPrefabs.Build();
            EquipmentPrefabs.Build();
            UpgradePrefabs.Build();
            SkillPrefabs.Build();
            RebirthPrefabs.Build();
            SettingsPrefabs.Build();
            TutorialPrefabs.Build();
            DebugPrefabs.Build();
            Debug.Log("[UI] Built all UI prefabs");
        }
    }
}
