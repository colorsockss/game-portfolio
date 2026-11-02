using System;
using System.Collections.Generic;
using System.IO;
using PortfolioIdleRpg.Runtime;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Build;
using UnityEditor.AddressableAssets.Build.DataBuilders;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 패치로 받는 에셋(Assets/Remote)을 Addressables 원격 그룹으로 맞추고 빌드한다. 하위 폴더(UI, Battle, Audio)마다 그룹과
    /// 번들이 하나씩이고, 주소는 Remote 기준 경로에서 확장자를 뺀 것(UI/LoginScreen)이라 Resources에 두던 때의 키와 같다.
    /// 모든 항목에 미리 받기용 라벨(remote)을 단다. 원격 카탈로그(catalog_remote.bin)와 번들은 ServerData/플랫폼에 나오고,
    /// 릴리스 빌드(TypeScript/tools/build.mjs)가 게임 번들의 aa/플랫폼에 넣어 카탈로그를 매니페스트로 함께 받게 한다. 번들은
    /// 해시를 붙인 이름이라 같은 폴더에 올려도 이전 것과 섞이지 않는다. 메뉴나 배치 모드
    /// (-executeMethod PortfolioIdleRpg.Editor.RemoteContent.Build)로 부른다.
    /// </summary>
    public static class RemoteContent
    {
        /// <summary>패치로 받는 에셋의 폴더. 바로 아래 폴더 하나가 그룹 하나다.</summary>
        internal const string Folder = "Assets/Remote";

        /// <summary>부트가 미리 받는 번들을 고르는 라벨. 모든 항목에 단다(BundleFacade.DownloadAssets).</summary>
        internal const string Label = "remote";

        /// <summary>그룹 이름의 앞부분. 뒤에 폴더 이름이 붙는다(Remote UI).</summary>
        private const string GroupPrefix = "Remote ";

        /// <summary>
        /// 번들을 받는 주소. PatchSource는 실행 중에 부트가 넣는 올린 게임 번들의 주소이고(BundleFacade), 플랫폼은 빌드할 때
        /// 정해진다. 주소를 한 곳(부트의 설정)에만 둔다.
        /// </summary>
        private const string LoadPath = "{PatchSource}aa/[BuildTarget]";

        /// <summary>원격 카탈로그 이름의 버전 자리. 고정해 두어 런타임이 이름으로 찾는다(catalog_remote.bin).</summary>
        private const string PlayerVersion = "remote";

        /// <summary>Assets/Remote의 에셋을 원격 그룹의 항목으로 맞추고, 지금 TypeScript 환경에 맞는 플레이 모드를 고른다.</summary>
        [MenuItem("Tools/Addressables/Sync Remote Groups")]
        public static void Sync()
        {
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            settings.profileSettings.SetValue(settings.activeProfileId, AddressableAssetSettings.kRemoteLoadPath, LoadPath);
            settings.BuildRemoteCatalog = true;
            settings.RemoteCatalogBuildPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteBuildPath);
            settings.RemoteCatalogLoadPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteLoadPath);
            settings.OverridePlayerVersion = PlayerVersion;
            // 카탈로그는 패치가 게임 번들과 함께 받아 런타임이 직접 불러온다(ResourceFacade.UseCatalog).
            settings.DisableCatalogUpdateOnStartup = true;

            // 스크립트 참조 묶음(monoscripts)과 내장 셰이더 묶음은 기본 그룹의 경로를 따른다. 원격 카탈로그가 앱 안의 파일을
            // 가리키지 않도록 이것도 원격에 둔다.
            UseRemotePaths(settings, settings.DefaultGroup.GetSchema<BundledAssetGroupSchema>());

            var groups = new HashSet<string>();
            foreach (string folder in AssetDatabase.GetSubFolders(Folder))
            {
                string name = GroupPrefix + Path.GetFileName(folder);
                groups.Add(name);
                SyncGroup(settings, GetGroup(settings, name), folder);
            }
            // 폴더가 사라진 원격 그룹은 지운다.
            foreach (AddressableAssetGroup group in settings.groups.ToArray())
            {
                if ((group != null) && group.Name.StartsWith(GroupPrefix, StringComparison.Ordinal) && !groups.Contains(group.Name))
                    settings.RemoveGroup(group);
            }
            UsePlayMode(TypeScriptRuntimeSettings.Load().Environment);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Addressables] Synced {groups.Count} remote groups from {Folder}");
        }

        /// <summary>
        /// 그룹을 맞춘 뒤 원격 카탈로그와 번들을 빌드한다. Addressables는 출력 폴더(ServerData/플랫폼)의 옛 번들을 지우지
        /// 않으므로 비운 뒤 빌드한다. 그래야 릴리스 빌드가 이 카탈로그의 번들만 로컬 버킷에 더한다. 실패하면 예외를 던진다.
        /// </summary>
        [MenuItem("Tools/Addressables/Build Remote Content")]
        public static void Build()
        {
            Sync();
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.Settings;
            string output = settings.RemoteCatalogBuildPath.GetValue(settings);
            if (Directory.Exists(output))
                Directory.Delete(output, true);
            AddressableAssetSettings.BuildPlayerContent(out AddressablesPlayerBuildResult result);
            if (!string.IsNullOrEmpty(result.Error))
                throw new InvalidOperationException($"Addressables build failed: {result.Error}");
            Debug.Log($"[Addressables] Built the remote content in {result.Duration:F1}s: {result.OutputPath}");
        }

        /// <summary>
        /// CI(GameCI unity-builder)의 buildMethod. 원격 콘텐츠를 빌드한 뒤 GameCI가 성공으로 읽는 줄을 남긴다. GameCI는 로그에서
        /// 플레이어 빌드가 찍는 "Build succeeded!"를 찾아 성공을 판단하므로(game-ci/cli의 UnityBuildValidation), 플레이어를
        /// 만들지 않는 이 빌드는 그 줄을 직접 찍는다. 실패하면 Build가 예외를 던져 Unity가 0이 아닌 코드로 끝난다.
        /// </summary>
        public static void BuildForCi()
        {
            Build();
            Debug.Log("Build succeeded!");
        }

        /// <summary>
        /// 에디터의 Addressables 플레이 모드를 TypeScript 환경에 맞춘다. Development는 에셋 데이터베이스에서 바로 불러오고,
        /// Release는 빌드한 카탈로그와 번들을 쓴다(런타임이 게임 번들의 카탈로그를 불러옴).
        /// </summary>
        /// <param name="environment">TypeScript 환경.</param>
        internal static void UsePlayMode(ScriptEnvironment environment)
        {
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.Settings;
            if (settings == null)
                return;
            Type builder = environment == ScriptEnvironment.Development
                ? typeof(BuildScriptFastMode)
                : typeof(BuildScriptPackedPlayMode);
            for (int i = 0; i < settings.DataBuilders.Count; i++)
            {
                if (settings.DataBuilders[i].GetType() == builder)
                    settings.ActivePlayModeDataBuilderIndex = i;
            }
        }

        /// <summary>이름의 그룹을 찾고, 없으면 원격 번들 그룹으로 만든다.</summary>
        /// <param name="settings">Addressables 설정.</param>
        /// <param name="name">그룹 이름.</param>
        /// <returns>그룹.</returns>
        private static AddressableAssetGroup GetGroup(AddressableAssetSettings settings, string name) =>
            settings.FindGroup(name)
                ?? settings.CreateGroup(name, false, false, false, null,
                    typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));

        /// <summary>그룹을 원격 번들 하나로 정하고, 폴더의 에셋을 항목으로 넣고 폴더에 없는 항목을 뺀다.</summary>
        /// <param name="settings">Addressables 설정.</param>
        /// <param name="group">맞출 그룹.</param>
        /// <param name="folder">그룹의 폴더.</param>
        private static void SyncGroup(AddressableAssetSettings settings, AddressableAssetGroup group, string folder)
        {
            var schema = group.GetSchema<BundledAssetGroupSchema>();
            UseRemotePaths(settings, schema);
            schema.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackTogether;
            schema.Compression = BundledAssetGroupSchema.BundleCompressionMode.LZ4;
            schema.BundleNaming = BundledAssetGroupSchema.BundleNamingStyle.AppendHash;

            var kept = new HashSet<string>();
            foreach (string guid in AssetDatabase.FindAssets(string.Empty, new[] { folder }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetDatabase.IsValidFolder(path))
                    continue;
                AddressableAssetEntry entry = settings.CreateOrMoveEntry(guid, group, false, false);
                entry.address = AddressOf(path);
                entry.SetLabel(Label, true, true, false);
                kept.Add(guid);
            }
            foreach (AddressableAssetEntry entry in new List<AddressableAssetEntry>(group.entries))
            {
                if (!kept.Contains(entry.guid))
                    group.RemoveAssetEntry(entry, false);
            }
            EditorUtility.SetDirty(group);
        }

        /// <summary>그룹의 번들을 ServerData에 빌드하고 패치 주소에서 받게 한다.</summary>
        /// <param name="settings">Addressables 설정.</param>
        /// <param name="schema">그룹의 번들 스키마.</param>
        private static void UseRemotePaths(AddressableAssetSettings settings, BundledAssetGroupSchema schema)
        {
            schema.BuildPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteBuildPath);
            schema.LoadPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteLoadPath);
            EditorUtility.SetDirty(schema);
        }

        /// <summary>에셋의 주소: Remote 기준 경로에서 확장자를 뺀 것. Resources의 키와 같은 모양이다.</summary>
        /// <param name="path">에셋 경로(Assets/Remote/…).</param>
        /// <returns>주소(예: UI/LoginScreen).</returns>
        private static string AddressOf(string path) =>
            Path.ChangeExtension(path.Substring(Folder.Length + 1), null).Replace('\\', '/');
    }

    /// <summary>
    /// Assets/Remote의 에셋이 들어오거나 옮겨지거나 지워지면 원격 그룹을 다시 맞춘다. 빌더가 새 프리팹을 만들어도 패치에서
    /// 빠지지 않는다. 임포트 도중에는 설정을 바꾸지 않도록 다음 에디터 틱에 한다.
    /// </summary>
    internal sealed class RemoteContentWatcher : AssetPostprocessor
    {
        /// <summary>바뀐 에셋 가운데 Assets/Remote 아래의 것이 있으면 맞추기를 예약한다. Unity가 정한 이름이다.</summary>
        /// <param name="importedAssets">들어온 에셋.</param>
        /// <param name="deletedAssets">지운 에셋.</param>
        /// <param name="movedAssets">옮긴 뒤의 경로.</param>
        /// <param name="movedFromAssetPaths">옮기기 전의 경로.</param>
        private static void OnPostprocessAllAssets(
            string[] importedAssets, string[] deletedAssets, string[] movedAssets, string[] movedFromAssetPaths)
        {
            if (Touches(importedAssets) || Touches(deletedAssets) || Touches(movedAssets) || Touches(movedFromAssetPaths))
            {
                EditorApplication.delayCall -= RemoteContent.Sync;
                EditorApplication.delayCall += RemoteContent.Sync;
            }
        }

        /// <summary>경로 가운데 Assets/Remote 아래의 것이 있는지 돌려준다.</summary>
        /// <param name="paths">에셋 경로.</param>
        /// <returns>있으면 true.</returns>
        private static bool Touches(string[] paths)
        {
            foreach (string path in paths)
            {
                if (path.StartsWith(RemoteContent.Folder + "/", StringComparison.Ordinal))
                    return true;
            }
            return false;
        }
    }
}
