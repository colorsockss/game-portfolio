using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 요청의 빈도 제한(28). 연결마다 토큰 버킷 하나이고, 받은 패킷(Move 포함)마다 토큰 하나를 쓴다. 토큰은 지난 틱 수만큼 채우므로 틱이
    /// 건너뛰어도 그만큼 찬다. 토큰이 없으면 그 요청을 버리고, 버리기 시작한 틱부터 버리는 일이 끊는 시간 동안 이어지면 끊는다.
    /// 버린 것이 다시 세는 시간 동안 없으면 처음부터 다시 센다. 틱 스레드만 부른다.
    /// </summary>
    public sealed class RateLimiter
    {
        /// <summary>
        /// 받은 패킷 하나를 어떻게 할지.
        /// </summary>
        public enum Verdict
        {
            Allow,
            Drop,
            Kick,
        }

        /// <summary>
        /// 수치(Constants). 토큰은 틱 하나에 채우는 몫이 정수가 되게 초당 틱 수를 곱한 단위로 센다(30개/초 = 틱마다 1.5개).
        /// </summary>
        public readonly record struct Limits(uint Capacity, uint RefillPerTick, uint Cost, uint KickTicks, uint ResetTicks)
        {
            public static Limits From(Constants constants)
            {
                return new Limits(
                    constants.RateLimitTokens * (uint)Units.TicksPerSecond,
                    constants.RateLimitRefillPerSecond,
                    (uint)Units.TicksPerSecond,
                    Units.TicksFromMilliseconds(constants.RateLimitKickMs),
                    Units.TicksFromMilliseconds(constants.RateLimitResetMs));
            }
        }

        private bool _started;
        private uint _tokens;
        private uint _lastTick;
        private bool _dropping;
        private uint _dropStart;
        private uint _lastDrop;

        /// <summary>
        /// 그 틱에 받은 패킷 하나에 토큰을 쓴다. 처음 부를 때 버킷은 가득 차 있다.
        /// </summary>
        public Verdict Take(uint tick, in Limits limits)
        {
            if (!_started)
            {
                _started = true;
                _tokens = limits.Capacity;
                _lastTick = tick;
            }

            ulong refilled = _tokens + ((ulong)(tick - _lastTick) * limits.RefillPerTick);
            _tokens = (uint)System.Math.Min(refilled, limits.Capacity);
            _lastTick = tick;
            if (_tokens >= limits.Cost)
            {
                _tokens -= limits.Cost;
                return Verdict.Allow;
            }

            if (!_dropping || (tick - _lastDrop >= limits.ResetTicks))
            {
                _dropStart = tick;
            }

            _dropping = true;
            _lastDrop = tick;
            return tick - _dropStart >= limits.KickTicks ? Verdict.Kick : Verdict.Drop;
        }
    }
}
