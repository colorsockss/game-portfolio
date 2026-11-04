using System;
using System.Collections.Generic;
using System.IO;
using PortfolioIdleRpg.Views;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.AddressableAssets.ResourceLocators;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.Scripting;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 키로 에셋을 불러 TypeScript에 준다(src/unity/resources.ts). 불러온 카탈로그에 그 키가 있으면 패치로 받은 Addressables
    /// 원격 그룹(Assets/Remote)에서, 없으면 앱에 든 Resources에서 불러온다. 키는 둘 다 같은 모양의 경로(UI/LoginScreen)라서
    /// TypeScript는 어디에 있는지 모른다. 로드는 백그라운드에서 돌고 TypeScript가 폴링하므로 C#은 JavaScript 콜백을 쥐지 않는다.
    /// </summary>
    [Preserve]
    public static class ResourceFacade
    {
        /// <summary>Poll 결과: 아직 불러오는 중이다.</summary>
        [Preserve]
        public const int Loading = 0;

        /// <summary>Poll 결과: 에셋을 불러왔다.</summary>
        [Preserve]
        public const int Loaded = 1;

        /// <summary>Poll 결과: 에셋이 없거나, 그런 로드 id가 없다.</summary>
        [Preserve]
        public const int Missing = 2;

        /// <summary>게임 번들 안의 원격 카탈로그 이름(Assets/Editor/Patch/RemoteContent.cs가 정함).</summary>
        private const string CatalogFile = "catalog_remote.bin";

        /// <summary>로드 id별 진행 중이거나 끝난 로드.</summary>
        private static readonly Dictionary<int, AssetLoad> s_loads = new Dictionary<int, AssetLoad>();

        /// <summary>
        /// 마지막으로 내준 로드 id. 되돌리지 않으므로, 그 뒤 재시작한 스크립트 환경에서 온 id는
        /// 아무것도 찾지 못한다.
        /// </summary>
        private static int s_lastId;

        /// <summary>
        /// <paramref name="key"/>의 에셋 로드를 시작하고 로드 id를 돌려준다. 끝났는지는 Poll이 알려 준다.
        /// </summary>
        /// <param name="key">에셋 키. Addressables 주소이자 Resources 기준 경로다.</param>
        /// <returns>로드 id.</returns>
        [Preserve]
        public static int Load(string key)
        {
            s_loads[++s_lastId] = IsRemote(key)
                ? new AssetLoad(Addressables.LoadAssetAsync<Object>(key))
                : new AssetLoad(Resources.LoadAsync(key));
            return s_lastId;
        }

        /// <summary>로드의 상태를 돌려준다.</summary>
        /// <param name="id">Load가 돌려준 로드 id.</param>
        /// <returns>Loading, Loaded, Missing 중 하나.</returns>
        [Preserve]
        public static int Poll(int id)
        {
            if (!s_loads.TryGetValue(id, out AssetLoad load))
                return Missing;
            if (!load.IsDone)
                return Loading;
            return load.Asset != null ? Loaded : Missing;
        }

        /// <summary>
        /// 로드를 놓는다. 그 id로는 더 찾지 못한다. Addressables의 에셋은 바로 해제되고, Resources의 에셋은 하나만 내릴 수
        /// 없어서 다음 UnloadUnused(앱 흐름의 상태가 바뀔 때)에 메모리가 돌아온다.
        /// </summary>
        /// <param name="id">Load가 돌려준 로드 id.</param>
        [Preserve]
        public static void Release(int id)
        {
            if (s_loads.Remove(id, out AssetLoad load))
                load.Release();
        }

        /// <summary>
        /// 놓은 로드의 Resources 에셋을 메모리에서 내린다. Resources는 에셋 하나를 내릴 수 없어서, 참조가 없는 에셋을 모두 찾아
        /// 내리는 UnloadUnusedAssets를 쓴다. 씬을 하나만 쓰므로 씬 로드가 대신 불러 주지 않는다. 메인 스레드를 잠깐
        /// 멈추므로 TypeScript는 전환 화면이 화면을 가린 동안 부른다.
        /// </summary>
        [Preserve]
        public static void UnloadUnused() => Resources.UnloadUnusedAssets();

        /// <summary>끝난 로드의 에셋을 돌려준다. 없거나 아직 불러오는 중이면 null이다.</summary>
        /// <param name="id">Load가 돌려준 로드 id.</param>
        /// <returns>불러온 에셋, 또는 null.</returns>
        internal static Object Get(int id) =>
            (s_loads.TryGetValue(id, out AssetLoad load) && load.IsDone) ? load.Asset : null;

        /// <summary>끝난 로드의 프리팹을 <paramref name="parent"/> 아래에 새로 만든다.</summary>
        /// <param name="id">Load가 돌려준, 다 불러온 프리팹의 로드 id.</param>
        /// <param name="parent">인스턴스를 올릴 Transform.</param>
        /// <returns>인스턴스 루트의 ViewRefs.</returns>
        internal static ViewRefs Instantiate(int id, Transform parent)
        {
            if (!(Get(id) is GameObject prefab))
                throw new ArgumentException($"Asset {id} is not a loaded prefab.");
            GameObject instance = Object.Instantiate(prefab, parent, false);
            ViewRefs refs = instance.GetComponent<ViewRefs>();
            if (refs != null)
                return refs;
            UiRoot.Discard(instance);
            throw new ArgumentException($"The prefab {prefab.name} has no ViewRefs on its root.");
        }

        /// <summary>모든 로드를 놓는다. 로드를 시작한 스크립트 환경이 사라질 때 쓴다.</summary>
        internal static void ReleaseAll()
        {
            foreach (AssetLoad load in s_loads.Values)
                load.Release();
            s_loads.Clear();
        }

        /// <summary>
        /// 게임 프로그램이 시작하기 전에 런타임이 부른다. Addressables를 준비하고, 게임 번들에 원격 카탈로그가 있으면 다른
        /// 카탈로그를 모두 빼고 그것만 쓴다. 카탈로그가 게임 번들과 함께 설치되므로 코드와 에셋의 버전이 어긋나지 않는다. 없으면
        /// (Development) 에디터의 Addressables 설정(에셋 데이터베이스)에서 불러온다. 로컬 파일이라 기다려도 잠깐이다.
        /// </summary>
        /// <param name="gameRoot">게임 번들의 디렉터리.</param>
        internal static void UseCatalog(string gameRoot)
        {
            Addressables.InitializeAsync().WaitForCompletion();
            string catalog = CatalogPath(gameRoot);
            if (!File.Exists(catalog))
                return;
            AsyncOperationHandle<IResourceLocator> handle = LoadOnlyCatalog(catalog);
            handle.WaitForCompletion();
            EndCatalogLoad(handle, catalog);
        }

        /// <summary>다른 카탈로그를 모두 빼고 <paramref name="catalog"/> 하나만 불러오기 시작한다. 끝나면 <see cref="EndCatalogLoad"/>를 부른다.</summary>
        /// <param name="catalog">카탈로그 파일의 전체 경로.</param>
        /// <returns>불러오는 작업.</returns>
        internal static AsyncOperationHandle<IResourceLocator> LoadOnlyCatalog(string catalog)
        {
            Addressables.ClearResourceLocators();
            return Addressables.LoadContentCatalogAsync(catalog, false);
        }

        /// <summary>끝난 카탈로그 불러오기를 놓고, 실패했으면 던진다.</summary>
        /// <param name="handle">끝난 작업.</param>
        /// <param name="catalog">카탈로그 파일의 전체 경로.</param>
        internal static void EndCatalogLoad(AsyncOperationHandle<IResourceLocator> handle, string catalog)
        {
            bool loaded = handle.Status == AsyncOperationStatus.Succeeded;
            Addressables.Release(handle);
            if (!loaded)
                throw new InvalidOperationException($"Could not load the asset catalog {catalog}.");
        }

        /// <summary>번들 디렉터리 안의 이 플랫폼의 원격 카탈로그 경로.</summary>
        /// <param name="root">번들 디렉터리.</param>
        /// <returns>카탈로그의 전체 경로.</returns>
        internal static string CatalogPath(string root) =>
            Path.Combine(root, "aa", PlatformMappingService.GetPlatformPathSubFolder(), CatalogFile);

        /// <summary>불러온 카탈로그에 키가 있는지(패치로 받은 에셋인지) 돌려준다.</summary>
        /// <param name="key">에셋 키.</param>
        /// <returns>Addressables에서 불러올 키면 true.</returns>
        private static bool IsRemote(string key)
        {
            foreach (IResourceLocator locator in Addressables.ResourceLocators)
            {
                if (locator.Locate(key, typeof(Object), out _))
                    return true;
            }
            return false;
        }

        /// <summary>로드 하나: Resources 요청이나 Addressables 핸들 중 하나.</summary>
        private sealed class AssetLoad
        {
            /// <summary>Resources 요청. Addressables 로드면 null이다.</summary>
            private readonly ResourceRequest _request;

            /// <summary>Addressables 핸들. Resources 로드면 기본값이다.</summary>
            private readonly AsyncOperationHandle<Object> _handle;

            /// <summary>Resources 로드를 감싼다.</summary>
            /// <param name="request">Resources 요청.</param>
            internal AssetLoad(ResourceRequest request) => _request = request;

            /// <summary>Addressables 로드를 감싼다.</summary>
            /// <param name="handle">Addressables 핸들.</param>
            internal AssetLoad(AsyncOperationHandle<Object> handle) => _handle = handle;

            /// <summary>끝났는지(성공이든 실패든).</summary>
            internal bool IsDone => _request?.isDone ?? _handle.IsDone;

            /// <summary>불러온 에셋. 없거나 실패했으면 null이다.</summary>
            internal Object Asset => _request != null
                ? _request.asset
                : (_handle.Status == AsyncOperationStatus.Succeeded ? _handle.Result : null);

            /// <summary>Addressables 핸들을 해제한다. Resources 요청은 놓기만 한다.</summary>
            internal void Release()
            {
                if ((_request == null) && _handle.IsValid())
                    Addressables.Release(_handle);
            }
        }
    }
}
