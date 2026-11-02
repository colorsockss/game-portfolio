using TMPro;
using UnityEngine;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 바뀔 때 굴러가는 숫자 글자(TypeScript/src/unity/binding/bind.ts의 bindBigNumber). 표기(1.2K 등)는
    /// TypeScript가 만들어 중간 글자들을 한 번에 넘기고, 이 컴포넌트는 그것을 시간에 맞춰 차례로 보일 뿐이다.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class RollingText : MonoBehaviour
    {
        /// <summary>보이는 글자.</summary>
        [SerializeField]
        private TMP_Text _label;

        /// <summary>굴러가는 중인 글자들. 멈춰 있으면 null이다.</summary>
        private string[] _frames;

        /// <summary>글자들을 다 지나는 데 걸리는 시간(초).</summary>
        private float _seconds;

        /// <summary>굴러가기 시작한 뒤 지난 시간(초).</summary>
        private float _elapsed;

        /// <summary>굴러가는 중이면 지난 시간에 맞는 글자로 넘긴다.</summary>
        private void Update()
        {
            if (_frames == null)
                return;
            _elapsed += Time.deltaTime;
            Apply();
        }

        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>글자를 굴리지 않고 바로 보인다. 굴러가던 것은 멈춘다.</summary>
        /// <param name="text">보일 글자.</param>
        [Preserve]
        public void Set(string text)
        {
            _frames = null;
            _label.text = text;
        }

        /// <summary>글자들을 <paramref name="seconds"/> 동안 같은 간격으로 차례로 보이고 마지막 것에서 멈춘다.</summary>
        /// <param name="frames">줄바꿈으로 이은 글자들. 마지막이 목표 값이다.</param>
        /// <param name="seconds">다 지나는 데 걸리는 시간(초).</param>
        [Preserve]
        public void Roll(string frames, float seconds)
        {
            _frames = frames.Split('\n');
            _seconds = Mathf.Max(seconds, Mathf.Epsilon);
            _elapsed = 0f;
            Apply();
        }

        /// <summary>지난 시간에 맞는 글자를 넣는다. 마지막 글자에 닿으면 멈춘다.</summary>
        private void Apply()
        {
            int last = _frames.Length - 1;
            int index = Mathf.Min(last, Mathf.FloorToInt((_elapsed / _seconds) * _frames.Length));
            _label.text = _frames[index];
            if (index == last)
                _frames = null;
        }
    }
}
