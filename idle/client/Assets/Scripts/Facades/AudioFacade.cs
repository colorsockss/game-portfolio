using System;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// TypeScript가 소리를 내는 문이다(src/unity/bridge.ts). 반복하는 BGM 하나와 겹쳐 나는 효과음이 있고,
    /// 클립은 ResourceFacade가 불러온 로드 id로 받는다. 볼륨은 TypeScript가 테이블과 설정으로 계산한
    /// 최종 값(0~1)이다. 소리를 내는 오브젝트는 AudioRoot가 가진다.
    /// </summary>
    [Preserve]
    public static class AudioFacade
    {
        /// <summary>
        /// 클립을 BGM으로 반복해서 튼다. 이미 그 클립이 돌고 있으면 처음으로 돌리지 않고 볼륨만 바꾼다.
        /// </summary>
        /// <param name="assetId">ResourceFacade.Load가 돌려준, 다 불러온 오디오 클립의 로드 id.</param>
        /// <param name="volume">0~1의 볼륨.</param>
        [Preserve]
        public static void PlayBgm(int assetId, float volume)
        {
            AudioClip clip = Clip(assetId);
            AudioSource source = AudioRoot.Bgm();
            source.volume = volume;
            if (source.clip == clip && source.isPlaying)
                return;
            source.clip = clip;
            source.Play();
        }

        /// <summary>BGM의 볼륨을 바꾼다.</summary>
        /// <param name="volume">0~1의 볼륨.</param>
        [Preserve]
        public static void SetBgmVolume(float volume) => AudioRoot.Bgm().volume = volume;

        /// <summary>BGM을 멈춘다.</summary>
        [Preserve]
        public static void StopBgm()
        {
            AudioSource source = AudioRoot.Bgm();
            source.Stop();
            source.clip = null;
        }

        /// <summary>클립을 효과음으로 한 번 낸다. 앞의 효과음과 겹친다.</summary>
        /// <param name="assetId">ResourceFacade.Load가 돌려준, 다 불러온 오디오 클립의 로드 id.</param>
        /// <param name="volume">0~1의 볼륨.</param>
        [Preserve]
        public static void PlaySfx(int assetId, float volume) =>
            AudioRoot.Sfx().PlayOneShot(Clip(assetId), volume);

        /// <summary>모든 소리를 멈추고 오브젝트를 없앤다. 클립을 불러온 스크립트 환경이 사라질 때 쓴다.</summary>
        internal static void StopAll() => AudioRoot.DestroyAll();

        /// <summary>다 불러온 오디오 클립을 돌려준다.</summary>
        /// <param name="assetId">ResourceFacade.Load가 돌려준 로드 id.</param>
        /// <returns>오디오 클립.</returns>
        private static AudioClip Clip(int assetId)
        {
            if (!(ResourceFacade.Get(assetId) is AudioClip clip))
                throw new ArgumentException($"Asset {assetId} is not a loaded audio clip.");
            return clip;
        }
    }
}
