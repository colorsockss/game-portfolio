using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 전투 월드의 배우 하나: 클립을 재생하는 몸, 발밑의 그림자, 몸 위의 HP 바. TypeScript가 부르는 메서드는 상태를
    /// 바꾸기만 하고, 몸의 프레임은 SpriteAnimator가, 움직임은 Update의 짧은 보간이 그린다. 전투 규칙은
    /// 모르고 보이는 모양(클립 묶음, 위치, 색, 크기, HP 비율)만 쥔다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ActorView : MonoBehaviour
    {
        /// <summary>찌르기에 걸리는 시간(초).</summary>
        private const float LungeSeconds = 0.15f;

        /// <summary>앞 공격의 타격 프레임을 적어도 이만큼 보인 뒤 다음 공격 클립을 시작한다(초).</summary>
        private const float ImpactHoldSeconds = 0.05f;

        /// <summary>찌르기가 가장 멀리 나가는 거리(유닛).</summary>
        private const float LungeDistance = 0.5f;

        /// <summary>피격 깜빡임이 이어지는 시간(초).</summary>
        private const float FlashSeconds = 0.1f;

        /// <summary>쓰러지며 사라지는 데 걸리는 시간(초).</summary>
        private const float DieSeconds = 0.3f;

        /// <summary>쓰러지지 않고 물러나며(소환수의 만료) 흐려지는 데 걸리는 시간(초).</summary>
        private const float LeaveSeconds = 0.3f;

        /// <summary>효과 칸 줄의 아래 끝이 HP 바 가운데보다 위로 떨어진 거리(유닛). HP 바의 위 끝(0.09)과 조금 띄운다.</summary>
        private const float EffectsOffset = 0.14f;

        /// <summary>HP 바가 몸 윗면에서 떨어진 거리(유닛). 크기 1이면 몸 중심 위 0.7유닛이다.</summary>
        private const float BarOffset = 0.2f;

        /// <summary>HP 바의 높이(유닛).</summary>
        private const float BarHeight = 0.12f;

        /// <summary>HP 바 뒤판이 채움 둘레로 더 나온 두께(유닛).</summary>
        private const float BarBorder = 0.03f;

        /// <summary>발이 몸 중심보다 아래인 거리(크기 1의 유닛). 그림은 프레임 중심보다 64픽셀 아래가 접지선이고 PPU가 150이다.</summary>
        private const float FootOffset = 64f / 150f;

        /// <summary>그림자 타원의 너비(크기 1의 유닛).</summary>
        private const float ShadowWidth = 0.8f;

        /// <summary>그림자 타원의 높이(크기 1의 유닛).</summary>
        private const float ShadowHeight = 0.22f;

        /// <summary>
        /// 피격 깜빡임의 몸 색. 그림이 있는 배우는 색을 입히지 않아(흰색) 흰색으로는 깜빡임이 보이지 않으므로 붉게 물들인다.
        /// </summary>
        private static readonly Color s_flashColor = new Color(1f, 0.45f, 0.45f, 1f);

        /// <summary>클립의 프레임을 보이는 몸. 색은 프레임에 곱해진다.</summary>
        [SerializeField]
        private SpriteRenderer _body;

        /// <summary>몸에 클립의 프레임을 넣는다.</summary>
        [SerializeField]
        private SpriteAnimator _animator;

        /// <summary>Setup이 이름으로 고르는 클립 묶음. 0번은 이름이 맞는 것이 없을 때 쓴다.</summary>
        // shortcut: 모든 묶음을 프리팹이 쥐어 배우 하나가 모든 시트를 함께 불러온다. 62–63에서 시트가 늘면 키로 불러온다.
        [SerializeField]
        private SpriteClipSet[] _clipSets;

        /// <summary>발밑의 그림자. 몸 아래에 그려지고 몸 크기를 따른다.</summary>
        [SerializeField]
        private SpriteRenderer _shadow;

        /// <summary>HP 바의 어두운 뒤판.</summary>
        [SerializeField]
        private SpriteRenderer _hpBack;

        /// <summary>HP 바의 채움. 왼쪽을 기준으로 줄어든다.</summary>
        [SerializeField]
        private SpriteRenderer _hpFill;

        /// <summary>HP 바 위에 걸린 효과의 칸.</summary>
        [SerializeField]
        private EffectIcons _effects;

        /// <summary>Attack이 예약한, 아직 타격이 지나지 않은 공격. 타격이 이른 것부터다.</summary>
        private readonly List<PendingAttack> _pending = new List<PendingAttack>();

        /// <summary>Setup이 고른 클립 묶음.</summary>
        private SpriteClipSet _clips;

        /// <summary>재생 중인 클립이 대기·등장처럼 상태가 바뀌면 바로 바뀌는 바탕 클립이면 true.</summary>
        private bool _onBase;

        /// <summary>Setup이 정한 몸의 색.</summary>
        private Color _color = Color.white;

        /// <summary>Setup이 정한 몸의 한 변(유닛).</summary>
        private float _size = 1f;

        /// <summary>Place나 MoveTo가 정한 자리. 옮겨 가는 중이면 도착할 자리다.</summary>
        private Vector2 _home;

        /// <summary>옮겨 가기 시작한 자리.</summary>
        private Vector2 _from;

        /// <summary>옮겨 가는 데 걸리는 시간(초). 0이면 이미 자리에 있다.</summary>
        private float _moveSeconds;

        /// <summary>옮겨 가기 시작한 뒤 지난 시간(초).</summary>
        private float _moveElapsed;

        /// <summary>걷는 중이면 true. 바탕 클립이 걷기(등장)다.</summary>
        private bool _walking;

        /// <summary>바라보고 찌르는 쪽. 1이면 오른쪽, -1이면 왼쪽이다.</summary>
        private float _facing = 1f;

        /// <summary>찌르기가 시작한 뒤 지난 시간(초). LungeSeconds면 끝난 것이다.</summary>
        private float _lungeElapsed = LungeSeconds;

        /// <summary>피격 깜빡임이 시작한 뒤 지난 시간(초). FlashSeconds면 끝난 것이다.</summary>
        private float _flashElapsed = FlashSeconds;

        /// <summary>쓰러지는 중이거나 쓰러졌으면 true.</summary>
        private bool _dead;

        /// <summary>쓰러지기 시작한 뒤 지난 시간(초).</summary>
        private float _dieElapsed;

        /// <summary>물러나는 중이거나 물러났으면 true.</summary>
        private bool _leaving;

        /// <summary>물러나기 시작한 뒤 지난 시간(초).</summary>
        private float _leaveElapsed;

        /// <summary>프리팹이 정한 그림자의 색. 물러날 때 흐리게 한다.</summary>
        private Color _shadowColor;

        /// <summary>프리팹이 정한 HP 바 뒤판의 색. 물러날 때 흐리게 한다.</summary>
        private Color _hpBackColor;

        /// <summary>프리팹이 정한 HP 바 채움의 색.</summary>
        private Color _hpFillColor;

        /// <summary>그림자와 HP 바에 도형 스프라이트를 넣고, Setup 전에도 부를 수 있게 첫 클립 묶음의 대기를 재생한다.</summary>
        private void Awake()
        {
            _shadow.sprite = ShapeSprites.Shadow;
            _hpBack.sprite = ShapeSprites.Square;
            _hpFill.sprite = ShapeSprites.Square;
            _shadowColor = _shadow.color;
            _hpBackColor = _hpBack.color;
            _hpFillColor = _hpFill.color;
            _clips = _clipSets[0];
            PlayBase();
        }

        /// <summary>진행 중인 움직임을 시간만큼 진행시킨다.</summary>
        private void Update()
        {
            float delta = Time.deltaTime;
            _moveElapsed = Mathf.Min(_moveElapsed + delta, _moveSeconds);
            _lungeElapsed = Mathf.Min(_lungeElapsed + delta, LungeSeconds);
            _flashElapsed = Mathf.Min(_flashElapsed + delta, FlashSeconds);
            _dieElapsed = Mathf.Min(_dieElapsed + delta, DieSeconds);
            _leaveElapsed = Mathf.Min(_leaveElapsed + delta, LeaveSeconds);
            Advance(delta);
            if (!_dead && ((_onBase && (_animator.Clip != BaseClip())) || (!_onBase && _animator.Finished)))
                PlayBase();
            Apply();
        }

        /// <summary>
        /// 클립 묶음, 몸의 색과 크기를 정하고 HP 바를 가득 채우며 진행 중인 움직임과 예약한 공격을 모두
        /// 끝낸다. 풀에서 다시 꺼낸 배우도 이것으로 새로 시작한다.
        /// </summary>
        /// <param name="clips">클립 묶음(SpriteClipSet 에셋)의 이름. 없으면 첫 묶음이다.</param>
        /// <param name="r">몸 색의 빨강(0~1).</param>
        /// <param name="g">몸 색의 초록(0~1).</param>
        /// <param name="b">몸 색의 파랑(0~1).</param>
        /// <param name="size">몸의 한 변(유닛).</param>
        /// <param name="facing">바라보고 찌르는 쪽. 원본은 오른쪽을 보며, 음수면 몸 그림만 좌우 반전한다.</param>
        [Preserve]
        public void Setup(string clips, float r, float g, float b, float size, float facing)
        {
            _clips = _clipSets[0];
            foreach (SpriteClipSet set in _clipSets)
            {
                if (set.name == clips)
                    _clips = set;
            }
            _pending.Clear();
            _effects.SetCount(0);
            _leaving = false;
            _color = new Color(r, g, b, 1f);
            _size = size;
            _body.transform.localScale = new Vector3(size, size, 1f);
            _shadow.transform.localPosition = new Vector3(0f, -FootOffset * size, 0f);
            _shadow.transform.localScale = new Vector3(ShadowWidth * size, ShadowHeight * size, 1f);
            _facing = (facing >= 0f) ? 1f : -1f;
            _body.flipX = _facing < 0f;
            _moveSeconds = 0f;
            _moveElapsed = 0f;
            _walking = false;
            _lungeElapsed = LungeSeconds;
            _flashElapsed = FlashSeconds;
            _dead = false;
            Layout(1f);
            PlayBase();
            Apply();
        }

        /// <summary>배우를 자리에 바로 놓고 걷기를 멈춘다. 걷기 클립은 다음 프레임에 대기로 바뀐다.</summary>
        /// <param name="x">월드 x.</param>
        /// <param name="y">월드 y.</param>
        [Preserve]
        public void Place(float x, float y)
        {
            _home = new Vector2(x, y);
            _from = _home;
            _moveSeconds = 0f;
            _walking = false;
            Apply();
        }

        /// <summary>
        /// 지금 자리에서 (<paramref name="x"/>, <paramref name="y"/>)로 <paramref name="seconds"/> 동안 고르게 옮겨 간다.
        /// <paramref name="walking"/>이면 바탕 클립이 걷기(등장, 없으면 대기)다. 시뮬레이션이 한 틱마다 걸어서 TypeScript가 틱마다 부른다.
        /// </summary>
        /// <param name="x">도착할 월드 x.</param>
        /// <param name="y">도착할 월드 y.</param>
        /// <param name="seconds">옮겨 가는 시간(초).</param>
        /// <param name="walking">걷는 중인지.</param>
        [Preserve]
        public void MoveTo(float x, float y, float seconds, bool walking)
        {
            _from = Position();
            _home = new Vector2(x, y);
            _moveSeconds = Mathf.Max(seconds, 0f);
            _moveElapsed = 0f;
            _walking = walking;
            Apply();
        }

        /// <summary>
        /// 공격 클립을 그 타격 프레임이 <paramref name="impactSeconds"/>초 뒤에 오게 재생하고, 그때 바라보는
        /// 쪽으로 가장 멀리 찌르게 0.15초 동안 찔렀다가 돌아온다. 시작할 때까지 남은 시간이 선딜레이보다 길면
        /// 기다렸다가 시작하고, 짧으면(늦게 알았다) 앞 프레임을 건너뛴다.
        /// </summary>
        /// <param name="clip">클립 이름(attack, cast, special). 묶음에 없으면 공격 클립이다.</param>
        /// <param name="impactSeconds">타격까지 남은 시간(초).</param>
        [Preserve]
        public void Attack(string clip, float impactSeconds)
        {
            if (_dead)
                return;
            _pending.Add(new PendingAttack { Clip = _clips.Find(clip), ImpactIn = impactSeconds });
            Advance(0f);
            Apply();
        }

        /// <summary>
        /// 0.1초 동안 붉게 깜빡이고 HP 바를 갱신한다. 피격 클립은 공격 클립을 끊지 않는다.
        /// </summary>
        /// <param name="hpRatio">남은 HP 비율(0~1).</param>
        [Preserve]
        public void Hit(float hpRatio)
        {
            _flashElapsed = 0f;
            Layout(hpRatio);
            bool attacking = !_onBase && !_animator.Finished && (_animator.Clip.ImpactFrame >= 0);
            if (!_dead && !attacking)
                PlayOnce(_clips.Find("hit"), 0f);
            Apply();
        }

        /// <summary>깜빡이지 않고 HP 바만 갱신한다(지속 피해와 회복).</summary>
        /// <param name="hpRatio">남은 HP 비율(0~1).</param>
        [Preserve]
        public void SetHp(float hpRatio)
        {
            Layout(hpRatio);
        }

        /// <summary>사망 클립을 재생하며 0.3초 동안 작아지며 사라진다. 예약한 공격과 효과 칸은 버린다.</summary>
        [Preserve]
        public void Die()
        {
            _dead = true;
            _dieElapsed = 0f;
            _pending.Clear();
            _effects.SetCount(0);
            PlayOnce(_clips.Find("die"), 0f);
            Apply();
        }

        /// <summary>쓰러지지 않고 0.3초 동안 흐려지며 물러난다(소환수의 만료). 예약한 공격과 효과 칸은 버린다.</summary>
        [Preserve]
        public void Leave()
        {
            _leaving = true;
            _leaveElapsed = 0f;
            _pending.Clear();
            _effects.SetCount(0);
            Apply();
        }

        /// <summary>쓰러진 배우를 되살리고 HP 바를 갱신한다. 깜빡임은 없다.</summary>
        /// <param name="hpRatio">남은 HP 비율(0~1).</param>
        [Preserve]
        public void Revive(float hpRatio)
        {
            _dead = false;
            _leaving = false;
            Layout(hpRatio);
            PlayBase();
            Apply();
        }

        /// <summary>
        /// 예약한 공격을 시간만큼 진행한다. 타격까지 선딜레이만큼 남으면 클립을 시작하고, 찌르기의 절반만큼
        /// 남으면 찌르기를 시작하고, 타격 프레임을 ImpactHoldSeconds만큼 보이면 예약을 지운다. 그 전에는 다음
        /// 공격이 그 클립을 끊지 않고 기다렸다가, 늦은 만큼 앞 프레임을 건너뛰어 시작한다.
        /// </summary>
        /// <param name="delta">지난 시간(초).</param>
        private void Advance(float delta)
        {
            int index = 0;
            while (index < _pending.Count)
            {
                PendingAttack attack = _pending[index];
                attack.ImpactIn -= delta;
                if (!attack.Started && (index == 0) && (attack.ImpactIn <= attack.Clip.Windup))
                {
                    PlayOnce(attack.Clip, attack.Clip.Windup - attack.ImpactIn);
                    attack.Started = true;
                }
                float halfLunge = LungeSeconds * 0.5f;
                if (!attack.Lunged && (attack.ImpactIn <= halfLunge))
                {
                    _lungeElapsed = Mathf.Min(halfLunge - attack.ImpactIn, LungeSeconds);
                    attack.Lunged = true;
                }
                if (attack.Started && attack.Lunged && (attack.ImpactIn <= -ImpactHoldSeconds))
                {
                    _pending.RemoveAt(index);
                    continue;
                }
                _pending[index] = attack;
                index++;
            }
        }

        /// <summary>지금 상태의 바탕 클립: 걷는 중이면 걷기, 아니면 대기.</summary>
        /// <returns>바탕 클립.</returns>
        private SpriteClip BaseClip() => _clips.Find(_walking ? "walk" : "idle");

        /// <summary>찌르기를 빼고 지금 시각의 자리.</summary>
        /// <returns>월드 자리.</returns>
        private Vector2 Position() =>
            (_moveSeconds > 0f) ? Vector2.Lerp(_from, _home, Mathf.Clamp01(_moveElapsed / _moveSeconds)) : _home;

        /// <summary>바탕 클립을 처음부터 재생한다.</summary>
        private void PlayBase()
        {
            _onBase = true;
            _animator.Play(BaseClip());
        }

        /// <summary>한 번 재생하는 클립을 <paramref name="time"/>초 지점부터 재생한다.</summary>
        /// <param name="clip">재생할 클립.</param>
        /// <param name="time">시작할 지점(초).</param>
        private void PlayOnce(SpriteClip clip, float time)
        {
            _onBase = false;
            _animator.Play(clip, time);
        }

        /// <summary>HP 바를 몸 위에 놓고 비율만큼 채운다.</summary>
        /// <param name="hpRatio">남은 HP 비율(0~1).</param>
        private void Layout(float hpRatio)
        {
            float y = BarOffset + (_size * 0.5f);
            float width = _size * Mathf.Clamp01(hpRatio);
            _hpBack.transform.localPosition = new Vector3(0f, y, 0f);
            _hpBack.transform.localScale = new Vector3(
                _size + (2f * BarBorder), BarHeight + (2f * BarBorder), 1f);
            _hpFill.transform.localPosition = new Vector3((width - _size) * 0.5f, y, 0f);
            _hpFill.transform.localScale = new Vector3(width, BarHeight, 1f);
            _effects.transform.localPosition = new Vector3(0f, y + EffectsOffset, 0f);
        }

        /// <summary>지금 시각의 위치, 크기, 몸 색을 계산해 넣는다.</summary>
        private void Apply()
        {
            float lunge = (_lungeElapsed < LungeSeconds)
                ? (Mathf.Sin(Mathf.PI * _lungeElapsed / LungeSeconds) * LungeDistance)
                : 0f;
            Vector2 position = Position();
            transform.localPosition = new Vector3(position.x + (_facing * lunge), position.y, 0f);

            float scale = _dead ? (1f - Mathf.Clamp01(_dieElapsed / DieSeconds)) : 1f;
            transform.localScale = new Vector3(scale, scale, 1f);
            Color body = (_flashElapsed < FlashSeconds) ? s_flashColor : _color;
            float alpha = _leaving ? (1f - (_leaveElapsed / LeaveSeconds)) : 1f;
            _body.color = new Color(body.r, body.g, body.b, alpha);
            _shadow.color = new Color(_shadowColor.r, _shadowColor.g, _shadowColor.b, _shadowColor.a * alpha);
            _hpBack.color = new Color(_hpBackColor.r, _hpBackColor.g, _hpBackColor.b, alpha);
            _hpFill.color = new Color(_hpFillColor.r, _hpFillColor.g, _hpFillColor.b, alpha);
        }

        /// <summary>Attack이 예약한 공격 하나.</summary>
        private struct PendingAttack
        {
            /// <summary>재생할 공격 클립.</summary>
            public SpriteClip Clip;

            /// <summary>타격까지 남은 시간(초).</summary>
            public float ImpactIn;

            /// <summary>클립을 시작했으면 true.</summary>
            public bool Started;

            /// <summary>찌르기를 시작했으면 true.</summary>
            public bool Lunged;
        }
    }
}
