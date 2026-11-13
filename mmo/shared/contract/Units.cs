namespace PortfolioMmo.Contract
{
    /// <summary>
    /// 패킷의 좌표·방향·틱 단위. 값의 원본은 packets.proto의 Constant이고, 여기서는 C#에서 쓰기 좋은 형으로 이름만 붙인다.
    /// </summary>
    public static class Units
    {
        /// <summary>
        /// 1 m를 나눈 좌표 칸 수.
        /// </summary>
        public const int PerMeter = (int)Constant.UnitsPerMeter;

        /// <summary>
        /// 맵의 반 너비(칸). x, z는 -MapHalfExtent 이상 MapHalfExtent 이하다.
        /// </summary>
        public const int MapHalfExtent = (int)Constant.MapHalfExtentMeters * PerMeter;

        /// <summary>
        /// 한 바퀴(360°)를 나눈 yaw 칸 수. yaw는 0 이상 YawSteps 미만이다.
        /// </summary>
        public const uint YawSteps = (uint)Constant.YawSteps;

        /// <summary>
        /// 서버의 초당 틱 수. EntityMoves.tick이 틱마다 1씩 오른다.
        /// </summary>
        public const int TicksPerSecond = (int)Constant.TicksPerSecond;

        /// <summary>
        /// 최대 이동 속도(m/s). 서버의 이동 검증과 클라이언트의 걷기가 같은 값을 쓴다.
        /// </summary>
        public const double MaxSpeedMetersPerSecond = (double)Constant.MaxSpeedMetersPerSecond;

        /// <summary>
        /// 틱 하나의 길이(밀리초).
        /// </summary>
        public const uint MillisecondsPerTick = 1000 / TicksPerSecond;

        /// <summary>
        /// 데이터의 밀리초를 틱 수로 바꾼다(올림). 밀리초 열을 읽는 곳은 모두 이것을 쓴다. 0 ms는 0틱, 1–50 ms는 1틱이다.
        /// </summary>
        public static uint TicksFromMilliseconds(uint milliseconds)
        {
            return (uint)(((ulong)milliseconds + MillisecondsPerTick - 1) / MillisecondsPerTick);
        }
    }
}
