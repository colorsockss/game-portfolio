using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.AddressableAssets.Initialization;
using UnityEngine.AddressableAssets.ResourceLocators;
using UnityEngine.Networking;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 부트 프로그램의 패치가 게임 번들을 받아 두는 곳을 TypeScript에 준다(src/unity/bundle.ts). 받기는 UnityWebRequest가
    /// 파일에 바로 쓰고 TypeScript가 폴링하므로 번들의 바이트가 스크립트로 넘어가지 않고, C#은 JavaScript 콜백을 쥐지
    /// 않는다. 무엇을 받고 어떻게 검증할지는 TypeScript가 정하고, 받는 곳(staging)과 슬롯의 배치는 BundleStore가 정한다.
    /// 경로는 모두 번들 디렉터리 기준 상대 경로이고 그 밖을 가리키지 못한다. 게임 번들에 든 에셋 카탈로그의 번들(Addressables)도
    /// 설치하기 전에 미리 받는다(DownloadAssets).
    /// </summary>
    [Preserve]
    public static class BundleFacade
    {
        /// <summary>Poll 결과: 아직 받는 중이다.</summary>
        [Preserve]
        public const int Downloading = 0;

        /// <summary>Poll 결과: 다 받았다.</summary>
        [Preserve]
        public const int Downloaded = 1;

        /// <summary>Poll 결과: 받지 못했거나, 그런 받기 id가 없다.</summary>
        [Preserve]
        public const int Failed = 2;

        /// <summary>게임 번들의 매니페스트 파일 이름. 릴리스 빌드가 진입 모듈 옆에 둔다.</summary>
        private const string ManifestFile = "manifest.json";

        /// <summary>받기 하나의 제한 시간(초). 응답 없는 서버에 패치가 붙들리지 않게 한다.</summary>
        private const int TimeoutSeconds = 30;

        /// <summary>
        /// 에셋 번들 주소의 앞부분(올린 게임 번들의 주소)을 넣는 Addressables 런타임 변수. 원격 그룹의 로드 경로가
        /// {PatchSource}aa/플랫폼이다(Assets/Editor/Patch/RemoteContent.cs).
        /// </summary>
        private const string SourceVariable = "PatchSource";

        /// <summary>미리 받을 에셋 번들을 고르는 라벨. 원격 그룹의 모든 항목에 달려 있다.</summary>
        private const string AssetLabel = "remote";

        /// <summary>받기 id별 진행 중인 요청.</summary>
        private static readonly Dictionary<int, UnityWebRequest> s_requests =
            new Dictionary<int, UnityWebRequest>();

        /// <summary>마지막으로 내준 받기 id. 되돌리지 않으므로 재시작 전의 id는 아무것도 찾지 못한다.</summary>
        private static int s_lastId;

        /// <summary>진행 중이거나 끝난 에셋 미리 받기. 한 번에 하나이고, 시작하지 않았으면 null이다.</summary>
        private static Task s_assets;

        /// <summary>에셋 번들을 받는 핸들. 받는 동안만 있다.</summary>
        private static AsyncOperationHandle s_assetDownload;

        /// <summary>미리 받을 에셋 번들의 바이트(이미 캐시에 있는 것은 빼고).</summary>
        private static long s_assetTotal;

        /// <summary>다 받은 에셋 번들의 바이트.</summary>
        private static long s_assetReceived;

        /// <summary>
        /// 받은 번들을 두는 디렉터리. Release로 시작할 때 런타임이 정하고, Development에서는 null이라 패치하지 않는다.
        /// </summary>
        internal static string Store { get; set; }

        /// <summary>받는 중인 번들의 디렉터리.</summary>
        private static string Staging
        {
            get
            {
                if (Store == null)
                {
                    throw new InvalidOperationException(
                        "Bundle updates need the Release TypeScript environment.");
                }
                return Path.Combine(Store, BundleStore.StagingDirectory);
            }
        }

        /// <summary>설치된 게임 번들의 매니페스트를 돌려준다.</summary>
        /// <returns>매니페스트 JSON. Development이거나 설치된 번들이 없으면(첫 실행) null.</returns>
        [Preserve]
        public static string CurrentManifest()
        {
            string installed = Store == null ? null : BundleStore.Current(Store);
            if (installed == null)
                return null;
            string path = SafePath.ResolveChild(installed, ManifestFile);
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }

        /// <summary>받는 곳을 비우고 새로 만든다.</summary>
        [Preserve]
        public static void BeginStaging()
        {
            Discard();
            Directory.CreateDirectory(Staging);
        }

        /// <summary><paramref name="url"/>을 받는 곳의 <paramref name="path"/>에 받기 시작한다.</summary>
        /// <param name="url">받을 주소.</param>
        /// <param name="path">받는 곳 기준 상대 경로.</param>
        /// <returns>받기 id. 끝났는지는 Poll이 알려 준다.</returns>
        [Preserve]
        public static int Download(string url, string path)
        {
            string target = SafePath.ResolveChild(Staging, path);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            var request = new UnityWebRequest(url, UnityWebRequest.kHttpVerbGET)
            {
                downloadHandler = new DownloadHandlerFile(target) { removeFileOnAbort = true },
                timeout = TimeoutSeconds,
            };
            request.SendWebRequest();
            s_requests[++s_lastId] = request;
            return s_lastId;
        }

        /// <summary>받기의 상태를 돌려준다. 끝났으면 요청을 놓으므로 끝난 뒤에는 같은 id로 Failed만 받는다.</summary>
        /// <param name="id">Download가 돌려준 받기 id.</param>
        /// <returns>Downloading, Downloaded, Failed 중 하나.</returns>
        [Preserve]
        public static int Poll(int id)
        {
            if (!s_requests.TryGetValue(id, out UnityWebRequest request))
                return Failed;
            if (!request.isDone)
                return Downloading;
            s_requests.Remove(id);
            bool succeeded = request.result == UnityWebRequest.Result.Success;
            if (!succeeded)
                Debug.LogWarning($"[Bundle] {request.url}: {request.error}");
            request.Dispose();
            return succeeded ? Downloaded : Failed;
        }

        /// <summary>설치된 게임 번들의 파일을 받는 곳에 복사한다(바뀌지 않은 파일).</summary>
        /// <param name="path">번들 기준 상대 경로.</param>
        [Preserve]
        public static void Reuse(string path)
        {
            string installed = BundleStore.Current(Store)
                ?? throw new InvalidOperationException("No game bundle is installed to reuse files from.");
            string target = SafePath.ResolveChild(Staging, path);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Copy(SafePath.ResolveChild(installed, path), target, true);
        }

        /// <summary>받는 곳의 파일을 글자로 읽는다.</summary>
        /// <param name="path">받는 곳 기준 상대 경로.</param>
        /// <returns>파일의 글자(UTF-8).</returns>
        [Preserve]
        public static string ReadText(string path) => File.ReadAllText(SafePath.ResolveChild(Staging, path));

        /// <summary>받는 곳의 파일 크기를 돌려준다.</summary>
        /// <param name="path">받는 곳 기준 상대 경로.</param>
        /// <returns>바이트 수. 파일이 없으면 -1.</returns>
        [Preserve]
        public static int Size(string path)
        {
            var file = new FileInfo(SafePath.ResolveChild(Staging, path));
            return file.Exists ? checked((int)file.Length) : -1;
        }

        /// <summary>받는 곳의 파일의 SHA-256을 계산한다.</summary>
        /// <param name="path">받는 곳 기준 상대 경로.</param>
        /// <returns>소문자 16진수 64자.</returns>
        [Preserve]
        public static string Sha256(string path)
        {
            using FileStream stream = File.OpenRead(SafePath.ResolveChild(Staging, path));
            using SHA256 sha256 = SHA256.Create();
            byte[] hash = sha256.ComputeHash(stream);
            return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
        }

        /// <summary>
        /// 올린 게임 번들의 주소를 정한다. 에셋 번들도 그 아래 aa/플랫폼에서 받는다. 부트가 시작할 때 패치의 결과와 상관없이
        /// 부르므로, 패치를 확인하지 못해도 게임이 캐시의 에셋 번들을 찾는다. 값은 앱이 끝날 때까지 남는다.
        /// </summary>
        /// <param name="source">올린 게임 번들의 주소(끝이 /).</param>
        [Preserve]
        public static void UseSource(string source) => AddressablesRuntimeProperties.SetPropertyValue(SourceVariable, source);

        /// <summary>
        /// 게임 번들의 에셋 카탈로그에 있는 에셋 번들을 모두 Addressables 캐시에 미리 받기 시작한다. 카탈로그는 받는 곳의 것
        /// (<paramref name="staged"/>)이거나 설치된 번들의 것이고, 카탈로그가 없는 번들이면 바로 끝난다. 끝났는지는
        /// PollAssets가 알려 준다. 주소는 UseSource로 정한 것이다.
        /// </summary>
        /// <param name="staged">받는 곳의 카탈로그를 쓰는지. 아니면 설치된 번들의 것을 쓴다.</param>
        [Preserve]
        public static void DownloadAssets(bool staged)
        {
            string root = staged ? Staging : BundleStore.Current(Store);
            string catalog = root == null ? null : ResourceFacade.CatalogPath(root);
            s_assetTotal = 0;
            s_assetReceived = 0;
            s_assets = (catalog != null) && File.Exists(catalog) ? DownloadAssetsAsync(catalog) : Task.CompletedTask;
        }

        /// <summary>에셋 미리 받기의 상태를 돌려준다.</summary>
        /// <returns>Downloading, Downloaded, Failed 중 하나. 시작하지 않았으면 Failed.</returns>
        [Preserve]
        public static int PollAssets()
        {
            if (s_assets == null)
                return Failed;
            if (!s_assets.IsCompleted)
                return Downloading;
            if (!s_assets.IsFaulted)
                return Downloaded;
            Debug.LogWarning($"[Bundle] Assets: {s_assets.Exception?.GetBaseException().Message}");
            return Failed;
        }

        /// <summary>에셋 미리 받기가 받은 바이트.</summary>
        /// <returns>바이트 수.</returns>
        [Preserve]
        public static double AssetBytesReceived() =>
            s_assetDownload.IsValid() ? s_assetDownload.GetDownloadStatus().DownloadedBytes : s_assetReceived;

        /// <summary>에셋 미리 받기가 받을 바이트. 크기를 알기 전이나 받을 것이 없으면 0이다.</summary>
        /// <returns>바이트 수.</returns>
        [Preserve]
        public static double AssetBytesTotal() => s_assetTotal;

        /// <summary>받는 곳을 설치된 게임 번들로 바꾼다. 앞 번들은 다음 업데이트까지 남는다.</summary>
        [Preserve]
        public static void Commit()
        {
            if (s_requests.Count > 0)
                throw new InvalidOperationException("Downloads are still running.");
            BundleStore.Commit(Store);
        }

        /// <summary>받는 곳을 지운다. 없으면 아무것도 하지 않는다.</summary>
        [Preserve]
        public static void Discard()
        {
            if (Directory.Exists(Staging))
                Directory.Delete(Staging, true);
        }

        /// <summary>
        /// 카탈로그 하나만 남기고 불러온 뒤, 라벨이 붙은 에셋 번들 가운데 캐시에 없는 것을 받는다. 실패하면 예외로 끝난다.
        /// </summary>
        /// <param name="catalog">카탈로그 파일의 전체 경로.</param>
        /// <returns>받기가 끝나는 작업.</returns>
        private static async Task DownloadAssetsAsync(string catalog)
        {
            await Addressables.InitializeAsync().Task;
            Addressables.ClearResourceLocators();
            AsyncOperationHandle<IResourceLocator> load = Addressables.LoadContentCatalogAsync(catalog, false);
            await load.Task;
            bool loaded = load.Status == AsyncOperationStatus.Succeeded;
            Addressables.Release(load);
            if (!loaded)
                throw new InvalidOperationException($"Could not load the asset catalog {catalog}.");

            AsyncOperationHandle<long> size = Addressables.GetDownloadSizeAsync((object)AssetLabel);
            await size.Task;
            bool sized = size.Status == AsyncOperationStatus.Succeeded;
            s_assetTotal = sized ? size.Result : 0;
            Addressables.Release(size);
            if (!sized)
                throw new InvalidOperationException("Could not size the asset bundles.");
            if (s_assetTotal == 0)
                return;

            s_assetDownload = Addressables.DownloadDependenciesAsync((object)AssetLabel, false);
            await s_assetDownload.Task;
            bool downloaded = s_assetDownload.Status == AsyncOperationStatus.Succeeded;
            s_assetReceived = s_assetDownload.GetDownloadStatus().DownloadedBytes;
            Addressables.Release(s_assetDownload);
            s_assetDownload = default;
            if (!downloaded)
                throw new InvalidOperationException("Could not download the asset bundles.");
        }

        /// <summary>진행 중인 받기를 모두 멈춘다. 받기를 시작한 스크립트 환경이 사라질 때 쓴다.</summary>
        internal static void CancelAll()
        {
            // 에셋 번들 받기는 멈추지 않고 끝까지 캐시에 받는다. 다음 스크립트 환경은 그 결과를 묻지 않는다.
            s_assets = null;
            foreach (UnityWebRequest request in s_requests.Values)
            {
                request.Abort();
                request.Dispose();
            }
            s_requests.Clear();
        }
    }
}
