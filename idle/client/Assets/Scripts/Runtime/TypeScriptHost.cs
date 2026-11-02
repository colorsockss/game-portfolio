using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Runtime
{
    /// <summary>
    /// 앱의 진입점이고 첫 씬(Scenes/01_Init)에 있다. TypeScript 런타임을 앱이 사는 동안 씬을 넘어
    /// 쥐고 있으면서 매 프레임 돌리고, 종료할 때 폐기한다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class TypeScriptHost : MonoBehaviour
    {
        /// <summary>도는 런타임. 시작하지 못했거나 폐기했으면 null이다.</summary>
        private TypeScriptRuntime _runtime;

        /// <summary>씬이 바뀌어도 호스트가 남게 한다.</summary>
        private void Awake() => Object.DontDestroyOnLoad(gameObject);

        /// <summary>설정을 읽어 런타임을 시작한다. 실패하면 런타임 없이 꺼진다.</summary>
        private void Start()
        {
            _runtime = new TypeScriptRuntime();
            try
            {
                _runtime.Start(TypeScriptRuntimeSettings.Load());
            }
            catch
            {
                // 시작하지 못한 런타임을 놓고 꺼진 뒤 그대로 다시 던진다. Unity가 이 컴포넌트를
                // 문맥으로 예외를 기록한다.
                _runtime = null;
                enabled = false;
                throw;
            }
        }

        /// <summary>매 프레임 스크립트를 돌린다.</summary>
        private void Update() => _runtime?.Tick();

        /// <summary>앱이 끝나면 런타임을 폐기한다.</summary>
        private void OnDestroy()
        {
            _runtime?.Dispose();
            _runtime = null;
        }
    }
}
