using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 소켓 쪽에서 틱 스레드로 넘기는 일의 종류.
    /// </summary>
    internal enum InboundKind
    {
        /// <summary>
        /// 연결을 받았다.
        /// </summary>
        Connected,

        /// <summary>
        /// 패킷 하나를 받았다.
        /// </summary>
        Received,

        /// <summary>
        /// 길이가 상한을 넘거나 읽을 수 없는 패킷을 받았다.
        /// </summary>
        Malformed,

        /// <summary>
        /// 연결이 끊겼다.
        /// </summary>
        Disconnected,
    }

    /// <summary>
    /// 소켓 쪽에서 틱 스레드로 넘기는 일 하나. 한 연결의 일은 일어난 순서대로 큐에 들어간다.
    /// </summary>
    internal readonly record struct Inbound(Connection Connection, InboundKind Kind, Packet? Packet = null);
}
