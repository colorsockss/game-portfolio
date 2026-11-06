namespace PortfolioMmo.Contract
{
    /// <summary>
    /// 패킷의 좌표·방향·틱 단위. 뜻은 packets.proto의 주석이 원본이고, 서버와 Unity가 이 값을 함께 쓴다.
    /// </summary>
    public static class Units
    {
        /// <summary>
        /// 1 m를 나눈 좌표 칸 수.
        /// </summary>
        public const int PerMeter = 32;

        /// <summary>
        /// 맵의 반 너비(칸). x, z는 -MapHalfExtent 이상 MapHalfExtent 이하다(±1,024 m).
        /// </summary>
        public const int MapHalfExtent = 1024 * PerMeter;

        /// <summary>
        /// 한 바퀴(360°)를 나눈 yaw 칸 수. yaw는 0 이상 YawSteps 미만이다.
        /// </summary>
        public const uint YawSteps = 256;

        /// <summary>
        /// 서버의 초당 틱 수. EntityMoves.tick이 틱마다 1씩 오른다.
        /// </summary>
        public const int TicksPerSecond = 20;
    }
}
