using UnityEngine;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 전투 월드 카메라의 타격감: 화면 흔들림과 히트스톱. 흔들림은 카메라를 제자리 둘레의 무작위 자리로 옮기며 남은 시간에
    /// 비례해 줄이고, 히트스톱은 Time.timeScale을 0으로 두어 deltaTime으로 움직이는 것(배우, 발사체, 글자, 파티클)을
    /// 멈춘다. UI의 굴러가는 수와 토스트도 그동안 멈추지만 0.3초를 넘지 않아 보이지 않는다. 둘 다 멈춘 동안에도 흐르는
    /// unscaled 시간으로 잰다. 언제 얼마나 낼지는 TypeScript가 정한다.
    /// </summary>
    [DisallowMultipleComponent]
    internal sealed class HitFeel : MonoBehaviour
    {
        /// <summary>히트스톱이 끝난 뒤 다음 히트스톱을 받지 않는 시간(초). 치명타가 이어져도 전투가 끊겨 보이지 않게 한다.</summary>
        private const float StopGapSeconds = 0.25f;

        /// <summary>한 번에 멈추는 가장 긴 시간(초).</summary>
        private const float MaxStopSeconds = 0.3f;

        /// <summary>흔들리지 않을 때의 카메라 자리.</summary>
        private Vector3 _rest;

        /// <summary>지금 흔들림의 처음 세기(유닛).</summary>
        private float _strength;

        /// <summary>지금 흔들림의 처음 길이(초).</summary>
        private float _shakeSeconds;

        /// <summary>지금 흔들림의 남은 시간(초). 0이면 흔들리지 않는다.</summary>
        private float _shakeLeft;

        /// <summary>히트스톱이 끝나는(끝난) unscaled 시각.</summary>
        private float _stopUntil = float.NegativeInfinity;

        /// <summary>히트스톱으로 Time.timeScale을 0으로 둔 동안 true.</summary>
        private bool _stopped;

        /// <summary>
        /// 카메라를 <paramref name="seconds"/>초 동안 흔든다. 흔들리는 중이면 지금 세기보다 센 것만 받아 새로 시작한다.
        /// </summary>
        /// <param name="strength">처음 흔들림의 크기(유닛). 남은 시간에 비례해 0까지 줄어든다.</param>
        /// <param name="seconds">흔들리는 시간(초).</param>
        internal void Shake(float strength, float seconds)
        {
            float current = (_shakeLeft > 0f) ? _strength * (_shakeLeft / _shakeSeconds) : 0f;
            if ((seconds <= 0f) || (strength <= current))
                return;
            if (_shakeLeft <= 0f)
                _rest = transform.localPosition;
            _strength = strength;
            _shakeSeconds = seconds;
            _shakeLeft = seconds;
        }

        /// <summary>
        /// 월드를 <paramref name="seconds"/>초(최대 0.3초) 동안 멈춘다. 멈춘 동안이나 지난 멈춤이 끝나고 0.25초 안에는
        /// 받지 않는다.
        /// </summary>
        /// <param name="seconds">멈추는 시간(초).</param>
        internal void Stop(float seconds)
        {
            float now = Time.unscaledTime;
            if (_stopped || (seconds <= 0f) || (now < _stopUntil + StopGapSeconds))
                return;
            _stopUntil = now + Mathf.Min(seconds, MaxStopSeconds);
            _stopped = true;
            Time.timeScale = 0f;
        }

        /// <summary>멈춤이 끝났으면 시간을 되돌리고, 흔들리는 중이면 카메라를 옮긴다.</summary>
        private void Update()
        {
            if (_stopped && (Time.unscaledTime >= _stopUntil))
                Resume();
            if (_shakeLeft <= 0f)
                return;
            _shakeLeft = Mathf.Max(0f, _shakeLeft - Time.unscaledDeltaTime);
            Vector2 offset = Random.insideUnitCircle * (_strength * (_shakeLeft / _shakeSeconds));
            transform.localPosition = _rest + (Vector3)offset;
        }

        /// <summary>월드가 없어지거나 꺼지면 멈춤과 흔들림을 거둬 시간과 카메라를 되돌린다.</summary>
        private void OnDisable()
        {
            if (_stopped)
                Resume();
            if (_shakeLeft > 0f)
                transform.localPosition = _rest;
            _shakeLeft = 0f;
        }

        /// <summary>히트스톱을 끝낸다.</summary>
        private void Resume()
        {
            _stopped = false;
            Time.timeScale = 1f;
        }
    }
}
