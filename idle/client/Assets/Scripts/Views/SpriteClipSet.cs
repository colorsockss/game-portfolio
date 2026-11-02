using UnityEngine;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 배우 한 종류(영웅, 몬스터, 보스)의 클립 묶음. 에셋 이름이 TS가 ActorView.Setup에 넘기는 키다.
    /// </summary>
    [CreateAssetMenu(menuName = "Portfolio Idle RPG/Sprite Clip Set")]
    public sealed class SpriteClipSet : ScriptableObject
    {
        /// <summary>상태마다 하나인 클립. 0번이 대기(idle)다.</summary>
        [SerializeField]
        private SpriteClip[] _clips;

        /// <summary>
        /// 이름이 같은 클립. 없으면 시전·보스 전용은 공격으로, 걷기는 등장으로, 그 밖에는 대기로 대신한다(몬스터는
        /// 시전 클립이 없고, 걷기를 그리기 전의 몬스터 그림은 등장만 있다).
        /// </summary>
        /// <param name="name">상태 이름.</param>
        /// <returns>찾은 클립.</returns>
        public SpriteClip Find(string name)
        {
            foreach (SpriteClip clip in _clips)
            {
                if (clip.Name == name)
                    return clip;
            }
            return name switch
            {
                "cast" or "special" => Find("attack"),
                "walk" => Find("enter"),
                _ => _clips[0],
            };
        }
    }
}
