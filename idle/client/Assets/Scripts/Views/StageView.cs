using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 전투 월드의 무대: 배우 뒤의 배경 그림과, 맞거나 쓰러질 때 튀는 파티클. 배경은 원경(하늘과 먼 풍경)과 근경(땅)
    /// 두 겹을 가로로 이어 그린 것(Tiled)이고, 근경은 영웅이 걸은 만큼, 원경은 그보다 느리게 왼쪽으로 흐른다. 파티클은 파티클 시스템 하나가 자리마다 내뿜으므로 터질 때마다 오브젝트를 만들거나
    /// 풀에서 꺼내지 않는다. 배경이 흐르는 동안 파티클과 땅을 따르는 글자(FloatingText)도 같은 거리만큼 옮긴다. 언제 무엇을
    /// 보일지는 TypeScript가 정한다. 장면이 바뀌는 때는 무대를 막으로 다 덮었다가 걷는다. 배경이 바뀌면(맵 이동) 검게 다 덮은
    /// 순간에 그림을 바꾸고, Cover(보스전)는 그림을 두고 정한 색으로 덮는다. 막은 월드 시간으로 흘러 히트스톱 동안 함께 멈춘다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class StageView : MonoBehaviour
    {
        /// <summary>막이 다 덮이는 데 걸리는 시간(초).</summary>
        private const float DarkenSeconds = 0.3f;

        /// <summary>다 덮은 막이 걷히기 전에 머무는 시간(초).</summary>
        private const float HoldSeconds = 0.15f;

        /// <summary>막이 다 걷히는 데 걸리는 시간(초).</summary>
        private const float LightenSeconds = 0.45f;

        /// <summary>원경이 근경보다 몇 배 느리게 흐르는지.</summary>
        private const float FarSlowdown = 2f;

        /// <summary>배경 원경을 보이는 렌더러. 근경보다 아래에 그려진다.</summary>
        [SerializeField]
        private SpriteRenderer _far;

        /// <summary>배경 근경을 보이는 렌더러. 배우보다 아래에 그려진다.</summary>
        [SerializeField]
        private SpriteRenderer _near;

        /// <summary>Show가 고르는 원경. _nears와 같은 차례다.</summary>
        [SerializeField]
        private Sprite[] _fars;

        /// <summary>Show가 이름(스프라이트 이름)으로 고르는 근경. 0번은 이름이 맞는 것이 없을 때 쓴다.</summary>
        [SerializeField]
        private Sprite[] _nears;

        /// <summary>Burst가 내뿜는 파티클 시스템. 퍼지는 방향과 속도, 수명, 줄어듦은 시스템의 설정이다.</summary>
        [SerializeField]
        private ParticleSystem _particles;

        /// <summary>
        /// 무대를 덮는 막. 화면보다 넓은 사각형이고, 배우·발사체·파티클 위, 글자 아래에 그려져 배너는 막 위에 보인다. 걷혀
        /// 있으면 끈다.
        /// </summary>
        [SerializeField]
        private SpriteRenderer _cover;

        /// <summary>처음 배경을 보였는지. 처음은 덮지 않고 바로 보인다.</summary>
        private bool _shown;

        /// <summary>지금 보이는 배경의 번호.</summary>
        private int _picture;

        /// <summary>막이 다 덮으면 바꿀 배경의 번호. -1이면 바꿀 것이 없다.</summary>
        private int _pending = -1;

        /// <summary>막이 덮이는 중인지.</summary>
        private bool _darkening;

        /// <summary>다 덮은 막이 걷히기 전에 남은 시간(초).</summary>
        private float _holdLeft;

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

        /// <summary>
        /// 이름이 <paramref name="background"/>인 배경 그림을 보인다. 없으면 첫 그림이다. 처음이면 바로 보이고, 이미 보이던
        /// 그림과 다르면 무대를 검게 다 덮은 순간에 바꾸고 걷는다.
        /// </summary>
        /// <param name="background">배경 그림의 이름(Stages 테이블의 background).</param>
        [Preserve]
        public void Show(string background)
        {
            if (_nears.Length == 0)
                return;
            var shown = 0;
            for (var i = 0; i < _nears.Length; i++)
            {
                if (_nears[i].name == background)
                    shown = i;
            }
            if (!_shown)
            {
                _shown = true;
                SetPicture(shown);
                return;
            }
            int next = (_pending >= 0) ? _pending : _picture;
            if (shown == next)
                return;
            _pending = shown;
            Darken(Color.black);
        }

        /// <summary>
        /// 무대를 (<paramref name="r"/>, <paramref name="g"/>, <paramref name="b"/>)색으로 다 덮었다가 걷는다. 그림은 그대로다.
        /// </summary>
        /// <param name="r">색의 빨강(0~1).</param>
        /// <param name="g">색의 초록(0~1).</param>
        /// <param name="b">색의 파랑(0~1).</param>
        [Preserve]
        public void Cover(float r, float g, float b) => Darken(new Color(r, g, b));

        /// <summary>
        /// 배경을 지금 자리에서 <paramref name="distance"/>만큼 더 왼쪽으로 <paramref name="seconds"/>초 동안 흘린다(영웅이
        /// 그만큼 앞으로 걸었다). 흐르는 중이면 지금 보이는 자리에서 새로 시작한다.
        /// </summary>
        /// <param name="distance">흘릴 거리(유닛).</param>
        /// <param name="seconds">흐르는 시간(초).</param>
        [Preserve]
        public void Scroll(float distance, float seconds)
        {
            // 원경이 한 장 흐르는 거리로 접어야 두 겹 모두 접힐 때 튀지 않는다.
            _scrollFrom = Mathf.Repeat(Scrolled(), TileWidth() * FarSlowdown);
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

        /// <summary>막에 도형 스프라이트를 넣고 걷어 둔다.</summary>
        private void Awake()
        {
            _cover.sprite = ShapeSprites.Square;
            _cover.color = Color.clear;
            _cover.enabled = false;
        }

        /// <summary>막을 옮기고, 흐르는 중이면 배경을 지금 거리만큼 민다. 히트스톱 동안은 배우처럼 멈춘다.</summary>
        private void Update()
        {
            MoveCover();
            if (_scrollSeconds <= 0f)
                return;
            float before = Scrolled();
            _scrollElapsed += Time.deltaTime;
            if (_scrollElapsed >= _scrollSeconds)
                _scrollSeconds = 0f;
            float scrolled = Scrolled();
            MoveGround(before - scrolled);
            float width = TileWidth();
            Place(_near, scrolled, width);
            Place(_far, scrolled / FarSlowdown, width);
        }

        /// <summary>
        /// 배경 한 겹을 <paramref name="distance"/>만큼 흐른 자리에 둔다. 이어 그린 그림이 가운데에서 반 장 넘게 밀리지 않게
        /// 한 장의 너비로 접는다.
        /// </summary>
        /// <param name="layer">겹의 렌더러.</param>
        /// <param name="distance">흐른 거리(유닛).</param>
        /// <param name="width">그림 한 장의 너비(유닛).</param>
        private static void Place(SpriteRenderer layer, float distance, float width)
        {
            Vector3 position = layer.transform.localPosition;
            position.x = -(Mathf.Repeat(distance + (width / 2f), width) - (width / 2f));
            layer.transform.localPosition = position;
        }

        /// <summary><paramref name="index"/>번 배경의 두 겹을 보인다.</summary>
        /// <param name="index">배경의 번호.</param>
        private void SetPicture(int index)
        {
            _picture = index;
            _far.sprite = _fars[index];
            _near.sprite = _nears[index];
        }

        /// <summary>막을 <paramref name="color"/>로 바꾸고 지금 투명도에서 다 덮기 시작한다.</summary>
        /// <param name="color">막의 색. 투명도는 쓰지 않는다.</param>
        private void Darken(Color color)
        {
            _darkening = true;
            _holdLeft = 0f;
            color.a = _cover.color.a;
            _cover.color = color;
            _cover.enabled = true;
        }

        /// <summary>막을 덮거나, 머물거나, 걷는다. 다 덮인 순간에 바꿀 배경이 있으면 바꾼다.</summary>
        private void MoveCover()
        {
            if (!_cover.enabled)
                return;
            float delta = FrameTime.Scaled;
            Color color = _cover.color;
            if (_darkening)
            {
                color.a = Mathf.MoveTowards(color.a, 1f, delta / DarkenSeconds);
                if (color.a >= 1f)
                {
                    _darkening = false;
                    _holdLeft = HoldSeconds;
                    if (_pending >= 0)
                        SetPicture(_pending);
                    _pending = -1;
                }
            }
            else if (_holdLeft > 0f)
            {
                _holdLeft -= delta;
            }
            else
            {
                color.a = Mathf.MoveTowards(color.a, 0f, delta / LightenSeconds);
                _cover.enabled = color.a > 0f;
            }
            _cover.color = color;
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
        private float TileWidth() => (_near.sprite != null) ? _near.sprite.bounds.size.x : 1f;
    }
}
