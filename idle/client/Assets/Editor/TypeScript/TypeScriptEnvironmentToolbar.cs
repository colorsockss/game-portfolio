using PortfolioIdleRpg.Runtime;
using UnityEditor;
using UnityEditor.Toolbars;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>메인 툴바의 TypeScript 환경 드롭다운. 플레이 중에는 끈다.</summary>
    [InitializeOnLoad]
    public static class TypeScriptEnvironmentToolbar
    {
        /// <summary>툴바 요소의 경로.</summary>
        private const string ElementPath = "TypeScript/Environment";

        /// <summary>환경, 프로젝트, 플레이 모드가 바뀌면 드롭다운을 새로 그리게 한다.</summary>
        static TypeScriptEnvironmentToolbar()
        {
            TypeScriptEnvironmentMenu.EnvironmentChanged += Refresh;
            EditorApplication.projectChanged += Refresh;
            EditorApplication.playModeStateChanged += _ => Refresh();
        }

        /// <summary>선택된 환경을 보여 주는 드롭다운을 만든다.</summary>
        /// <returns>툴바 요소.</returns>
        [MainToolbarElement(ElementPath,
            defaultDockPosition = MainToolbarDockPosition.Middle, defaultDockIndex = -1)]
        public static MainToolbarElement CreateDropdown()
        {
            ScriptEnvironment environment = TypeScriptRuntimeSettings.Load().Environment;
            bool canSwitch = !EditorApplication.isPlayingOrWillChangePlaymode;
            string tooltip = canSwitch
                ? "Select the TypeScript runtime environment."
                : "Stop Play mode to change the TypeScript environment.";

            return new MainToolbarDropdown(
                new MainToolbarContent($"TS: {environment}", tooltip), ShowDropdown)
            {
                enabled = canSwitch
            };
        }

        /// <summary>환경을 고르는 메뉴를 연다.</summary>
        /// <param name="rect">메뉴를 열 드롭다운의 영역.</param>
        private static void ShowDropdown(Rect rect)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                return;

            ScriptEnvironment current = TypeScriptRuntimeSettings.Load().Environment;
            var menu = new GenericMenu();
            menu.AddItem(new GUIContent("Development"), current == ScriptEnvironment.Development,
                () => TypeScriptEnvironmentMenu.SetEnvironment(ScriptEnvironment.Development));
            menu.AddItem(new GUIContent("Release"), current == ScriptEnvironment.Release,
                () => TypeScriptEnvironmentMenu.SetEnvironment(ScriptEnvironment.Release));
            menu.DropDown(rect);
        }

        /// <summary>드롭다운을 새로 그리게 한다.</summary>
        private static void Refresh() => MainToolbar.Refresh(ElementPath);
    }
}
