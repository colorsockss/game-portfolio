using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 전투 월드의 무대: 배우 뒤의 배경 그림과, 맞거나 쓰러질 때 튀는 파티클. 배경은 그림을 가로로 이어 그린 것(Tiled)이고
    /// 영웅이 걸은 만큼 왼쪽으로 흐른다. 파티클은 파티클 시스템 하나가 자리마다 내뿜으므로 터질 때마다 오브젝트를 만들거나
    /// 풀에서 꺼내지 않는다. 배경이 흐르는 동안 파티클과 땅을 따르는 글자(FloatingText)도 같은 거리만큼 옮긴다. 언제 무엇을
    /// 보일지는 TypeScript가 정한다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class StageView : MonoBehaviour
    {
        /// <summary>배경 그림을 보이는 렌더러. 배우보다 아래에 그려진다.</summary>
        [SerializeField]
        private SpriteRenderer _background;

        /// <summary>Show가 이름(스프라이트 이름)으로 고르는 배경 그림. 0번은 이름이 맞는 것이 없을 때 쓴다.</summary>
        [SerializeField]
        private Sprite[] _backgrounds;

        /// <summary>Burst가 내뿜는 파티클 시스템. 퍼지는 방향과 속도, 수명, 줄어듦은 시스템의 설정이다.</summary>
        [SerializeField]
        private ParticleSystem _particles;

        /// <summary>지금 흐름이 시작한 거리(유닛). 그림 한 장의 너비로 접어 둔다.</summary>
        private float _scrollFrom;

        /// <summary>지금 흐름이 닿을 거리(유닛).</summary>
        private float _scrollTo;

        /// <summary>지금 흐름의 길이(초). 0이면 흐르지 않는다.</summary>
        private float _scrollSeconds;

        /// <summary>지금 흐름이 시작한 뒤 지난 시간(초).</summary>
        private float _scrollElapsed;

        /// <summary>파티클을 옮길 때 쓰는 버퍼.</summary>
        private ParticleSystem.Particle[] _live;

        /// <summary>
        /// 이 프레임에 땅이 옮겨 간 거리(유닛, 왼쪽이 음수). 땅을 따르는 글자(FloatingText)가 듣는다. 무대는 하나라서
        /// 정적 이벤트로 알린다.
        /// </summary>
        internal static event System.Action<float> GroundMoved;

        /// <summary>이름이 <paramref name="background"/>인 배경 그림을 보인다. 없으면 첫 그림이다.</summary>
        /// <param name="background">배경 그림의 이름(Stages 테이블의 background).</param>
        [Preserve]
        public void Show(string background)
        {
            if (_backgrounds.Length == 0)
                return;
            Sprite shown = _backgrounds[0];
            foreach (Sprite sprite in _backgrounds)
            {
                if (sprite.name == background)
                    shown = sprite;
            }
            _background.sprite = shown;
        }

        /// <summary>
        /// 배경을 지금 자리에서 <paramref name="distance"/>만큼 더 왼쪽으로 <paramref name="seconds"/>초 동안 흘린다(영웅이
        /// 그만큼 앞으로 걸었다). 흐르는 중이면 지금 보이는 자리에서 새로 시작한다.
        /// </summary>
        /// <param name="distance">흘릴 거리(유닛).</param>
        /// <param name="seconds">흐르는 시간(초).</param>
        [Preserve]
        public void Scroll(float distance, float seconds)
        {
            _scrollFrom = Mathf.Repeat(Scrolled(), TileWidth());
            _scrollTo = _scrollFrom + distance;
            _scrollSeconds = seconds;
            _scrollElapsed = 0f;
        }

        /// <summary>(<paramref name="x"/>, <paramref name="y"/>)에서 파티클 <paramref name="count"/>개를 사방으로 튀긴다.</summary>
        /// <param name="x">월드 x.</param>
        /// <param name="y">월드 y.</param>
        /// <param name="r">색의 빨강(0~1).</param>
        /// <param name="g">색의 초록(0~1).</param>
        /// <param name="b">색의 파랑(0~1).</param>
        /// <param name="count">파티클 수.</param>
        /// <param name="size">파티클 한 변의 처음 크기(유닛).</param>
        [Preserve]
        public void Burst(float x, float y, float r, float g, float b, int count, float size)
        {
            var emit = new ParticleSystem.EmitParams
            {
                position = new Vector3(x, y, 0f),
                applyShapeToPosition = true,
                startColor = new Color(r, g, b, 1f),
                startSize = size,
            };
            _particles.Emit(emit, count);
        }

        /// <summary>흐르는 중이면 배경을 지금 거리만큼 민다. 히트스톱 동안은 배우처럼 멈춘다.</summary>
        private void Update()
        {
            if (_scrollSeconds <= 0f)
                return;
            float before = Scrolled();
            _scrollElapsed += Time.deltaTime;
            if (_scrollElapsed >= _scrollSeconds)
                _scrollSeconds = 0f;
            MoveGround(before - Scrolled());
            // 이어 그린 그림이 가운데에서 반 장 넘게 밀리지 않게 한 장의 너비로 접는다.
            float width = TileWidth();
            Vector3 position = _background.transform.localPosition;
            position.x = -(Mathf.Repeat(Scrolled() + (width / 2f), width) - (width / 2f));
            _background.transform.localPosition = position;
        }

        /// <summary>땅에 붙은 것(살아 있는 파티클, 땅을 따르는 글자)을 <paramref name="distance"/>만큼 옮긴다.</summary>
        /// <param name="distance">옮길 거리(유닛, 왼쪽이 음수).</param>
        private void MoveGround(float distance)
        {
            if (distance == 0f)
                return;
            int count = _particles.particleCount;
            if (count > 0)
            {
                if ((_live == null) || (_live.Length < count))
                    _live = new ParticleSystem.Particle[_particles.main.maxParticles];
                count = _particles.GetParticles(_live);
                for (var i = 0; i < count; i++)
                    _live[i].position += new Vector3(distance, 0f, 0f);
                _particles.SetParticles(_live, count);
            }
            GroundMoved?.Invoke(distance);
        }

        /// <summary>지금 흐른 거리(유닛).</summary>
        /// <returns>거리.</returns>
        private float Scrolled() => (_scrollSeconds > 0f)
            ? Mathf.Lerp(_scrollFrom, _scrollTo, _scrollElapsed / _scrollSeconds)
            : _scrollTo;

        /// <summary>배경 그림 한 장의 너비(유닛).</summary>
        /// <returns>너비. 그림이 없으면 1이다.</returns>
        private float TileWidth() => (_background.sprite != null) ? _background.sprite.bounds.size.x : 1f;
    }
}
