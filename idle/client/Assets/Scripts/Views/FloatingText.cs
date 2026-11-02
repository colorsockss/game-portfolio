using TMPro;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 전투 월드에 뜨는 짧은 글자(피해 숫자 등). 보여 주면 0.8초 동안 1유닛 떠오르며 투명해진다. 화면 밖으로 나가지 않게
    /// 띄울 때 자리와 크기를 맞춘다.
    /// 끝난 뒤 풀로 돌려놓는 것은 TypeScript가 정한다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class FloatingText : MonoBehaviour
    {
        /// <summary>떠오르며 사라지는 데 걸리는 시간(초).</summary>
        private const float Seconds = 0.8f;

        /// <summary>떠오르는 높이(유닛).</summary>
        private const float Rise = 1f;

        /// <summary>글자가 화면 가장자리에서 떨어지는 여백(유닛).</summary>
        private const float Margin = 0.1f;

        /// <summary>월드 글자.</summary>
        [SerializeField]
        private TextMeshPro _label;

        /// <summary>월드 카메라. 처음 글자를 띄울 때 월드 루트에서 찾는다.</summary>
        private Camera _camera;

        /// <summary>영웅이 걷는 동안 배경처럼 흐르는지. 맞은 배우 위의 숫자는 흐르고, 배너는 화면에 머문다.</summary>
        private bool _grounded;

        /// <summary>글자를 보인 자리.</summary>
        private Vector3 _start;

        /// <summary>글자의 색. 투명도는 시간에 따라 바뀐다.</summary>
        private Color _color = Color.white;

        /// <summary>보인 뒤 지난 시간(초). Seconds면 끝난 것이다.</summary>
        private float _elapsed = Seconds;

        /// <summary>땅이 옮겨 가는 것을 듣는다(풀에서 꺼낸 동안).</summary>
        private void OnEnable() => StageView.GroundMoved += Follow;

        /// <summary>풀로 돌아가면 그만 듣는다.</summary>
        private void OnDisable() => StageView.GroundMoved -= Follow;

        /// <summary>땅을 따르는 글자면 땅이 옮겨 간 만큼 옮긴다.</summary>
        /// <param name="distance">땅이 옮겨 간 거리(유닛).</param>
        private void Follow(float distance)
        {
            if (_grounded)
                _start.x += distance;
        }

        /// <summary>진행 중인 움직임을 시간만큼 진행시킨다.</summary>
        private void Update()
        {
            if (_elapsed >= Seconds)
                return;
            _elapsed = Mathf.Min(_elapsed + Time.deltaTime, Seconds);
            Apply();
        }

        /// <summary>글자를 (x, y)에 띄우고 처음부터 다시 움직이게 한다.</summary>
        /// <param name="text">보일 글자.</param>
        /// <param name="r">글자 색의 빨강(0~1).</param>
        /// <param name="g">글자 색의 초록(0~1).</param>
        /// <param name="b">글자 색의 파랑(0~1).</param>
        /// <param name="size">글자 크기 배율. 1이 기본 크기다.</param>
        /// <param name="x">시작하는 월드 x.</param>
        /// <param name="y">시작하는 월드 y.</param>
        /// <param name="grounded">영웅이 걷는 동안 땅을 따라 흐르는지(맞은 배우 위의 숫자).</param>
        [Preserve]
        public void Show(string text, float r, float g, float b, float size, float x, float y, bool grounded)
        {
            _label.text = text;
            _grounded = grounded;
            _color = new Color(r, g, b, 1f);
            _start = new Vector3(x, y, 0f);
            transform.localScale = new Vector3(size, size, 1f);
            FitInView(size);
            _elapsed = 0f;
            Apply();
        }

        /// <summary>
        /// 글자가 카메라의 가로 범위를 넘지 않게 한다. 화면보다 넓으면 줄이고, 가장자리를 넘으면 안쪽으로 옮긴다. 화면 왼쪽에
        /// 서는 영웅 위의 레벨업 글자나 긴 배너가 잘리지 않게 한다.
        /// </summary>
        /// <param name="size">글자 크기 배율.</param>
        private void FitInView(float size)
        {
            if (_camera == null)
                _camera = transform.root.GetComponentInChildren<Camera>();
            if (_camera == null)
                return;
            _label.ForceMeshUpdate();
            Bounds bounds = _label.textBounds;
            float half = (_camera.orthographicSize * _camera.aspect) - Margin;
            float scale = size;
            if (bounds.size.x * size > 2f * half)
            {
                scale = 2f * half / bounds.size.x;
                transform.localScale = new Vector3(scale, scale, 1f);
            }
            float center = _camera.transform.position.x;
            float left = _start.x + (bounds.min.x * scale);
            float right = _start.x + (bounds.max.x * scale);
            if (left < center - half)
                _start.x += center - half - left;
            else if (right > center + half)
                _start.x -= right - (center + half);
        }

        /// <summary>지금 시각의 위치와 투명도를 넣는다.</summary>
        private void Apply()
        {
            float progress = _elapsed / Seconds;
            transform.localPosition = _start + (Vector3.up * (Rise * progress));
            _color.a = 1f - progress;
            _label.color = _color;
        }
    }
}
