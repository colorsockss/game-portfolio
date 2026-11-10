using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 연결 하나에서 월드가 보는 상태. 틱 스레드만 읽고 쓴다.
    /// </summary>
    public sealed class Session
    {
        /// <summary>
        /// 이번 틱에 이 연결로 보낼 패킷. 틱이 끝날 때 한 버퍼로 이어 보내고 비운다.
        /// </summary>
        public List<Packet> Outbox { get; } = new List<Packet>();

        /// <summary>
        /// 로그인한 개체. 로그인 전이거나 개체가 월드에서 빠졌으면 null.
        /// </summary>
        public Player? Player { get; internal set; }

        /// <summary>
        /// 연결을 끊기로 했다. Outbox를 보낸 뒤 끊고, 그 뒤에 온 패킷은 버린다.
        /// </summary>
        public bool IsClosing { get; private set; }

        /// <summary>
        /// 연결을 받은 틱. 로그인 시간 제한에 쓴다.
        /// </summary>
        public uint ConnectedTick { get; set; }

        /// <summary>
        /// 마지막으로 패킷을 받은 틱(받은 적이 없으면 연결을 받은 틱). 무응답 시간 제한에 쓴다.
        /// </summary>
        public uint LastReceivedTick { get; set; }

        /// <summary>
        /// 이번 틱에 보낼 패킷에 더한다.
        /// </summary>
        public void Send(Packet packet)
        {
            Outbox.Add(packet);
        }

        /// <summary>
        /// Outbox를 보낸 뒤 연결을 끊게 한다.
        /// </summary>
        public void Close()
        {
            IsClosing = true;
        }
    }
}
