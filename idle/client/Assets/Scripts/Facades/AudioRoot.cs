using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// AudioFacade의 소리가 나는 곳: BGM과 효과음의 AudioSource를 하나씩 가진 오브젝트이고, 처음 쓸 때
    /// 만든다. 씬에 AudioListener가 없으면(01_Init의 카메라에는 없다) 여기에 붙인다.
    /// </summary>
    internal static class AudioRoot
    {
        /// <summary>오디오 루트 오브젝트의 이름.</summary>
        private const string RootName = "Audio";

        /// <summary>오디오 루트 오브젝트. 아직 만들지 않았거나 없앴으면 null이다.</summary>
        private static GameObject s_root;

        /// <summary>반복하는 BGM의 AudioSource.</summary>
        private static AudioSource s_bgm;

        /// <summary>PlayOneShot으로 겹쳐 내는 효과음의 AudioSource.</summary>
        private static AudioSource s_sfx;

        /// <summary>BGM의 AudioSource를 돌려준다. 루트가 없으면 만든다.</summary>
        /// <returns>BGM의 AudioSource.</returns>
        internal static AudioSource Bgm()
        {
            EnsureRoot();
            return s_bgm;
        }

        /// <summary>효과음의 AudioSource를 돌려준다. 루트가 없으면 만든다.</summary>
        /// <returns>효과음의 AudioSource.</returns>
        internal static AudioSource Sfx()
        {
            EnsureRoot();
            return s_sfx;
        }

        /// <summary>루트를 없앤다. 그 위의 소리도 함께 멈춘다.</summary>
        internal static void DestroyAll()
        {
            if (s_root == null)
                return;
            UiRoot.Discard(s_root);
            s_root = null;
            s_bgm = null;
            s_sfx = null;
        }

        /// <summary>루트와 두 AudioSource를 만들고, 씬에 리스너가 없으면 리스너를 붙인다.</summary>
        private static void EnsureRoot()
        {
            if (s_root != null)
                return;
            s_root = new GameObject(RootName);
            if (Application.isPlaying)
                Object.DontDestroyOnLoad(s_root);

            // 리스너가 둘이면 Unity가 경고하므로, 씬이 이미 가진 리스너가 있으면 그것을 쓴다.
            if (Object.FindAnyObjectByType<AudioListener>() == null)
                s_root.AddComponent<AudioListener>();

            s_bgm = s_root.AddComponent<AudioSource>();
            s_bgm.playOnAwake = false;
            s_bgm.loop = true;
            s_sfx = s_root.AddComponent<AudioSource>();
            s_sfx.playOnAwake = false;
        }
    }
}
