using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 실행 사이에 이 기기에 남겨 두는 작은 문자열을 TypeScript에 준다(src/unity/bridge.ts).
    /// PlayerPrefs를 쓴다. 게임 진행은 서버의 것이므로, 마지막 로그인 ID 같은 기기 설정만
    /// 여기에 둔다.
    /// </summary>
    [Preserve]
    public static class StorageFacade
    {
        /// <summary><paramref name="key"/>로 저장한 값을 돌려준다.</summary>
        /// <param name="key">값의 키.</param>
        /// <returns>저장한 값, 없으면 null.</returns>
        [Preserve]
        public static string Get(string key) =>
            PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;

        /// <summary>
        /// 값을 <paramref name="key"/>로 저장한다. 종료 때 저장하지 않고 바로 저장한다. 크래시가 났거나
        /// 강제 종료된 앱은 종료 처리에 닿지 못한다.
        /// </summary>
        /// <param name="key">값의 키.</param>
        /// <param name="value">저장할 값.</param>
        [Preserve]
        public static void Set(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
        }

        /// <summary><paramref name="key"/>로 저장한 값을 지운다. 지운 것도 바로 저장한다.</summary>
        /// <param name="key">값의 키.</param>
        [Preserve]
        public static void Delete(string key)
        {
            PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
        }
    }
}
