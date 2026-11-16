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
        /// 로그인한 계정(로그인 ID). 로그인 전이면 null이다. 로그인한 뒤 Player가 null이면 캐릭터를 고르는 중이다.
        /// </summary>
        public string? LoginId { get; internal set; }

        /// <summary>
        /// 월드에 들어온 캐릭터의 개체. 월드 밖(로그인 전, 캐릭터 선택 중)이면 null.
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
        /// 요청의 빈도 제한(28). World.Receive가 받은 패킷마다 쓴다.
        /// </summary>
        public RateLimiter Limiter { get; } = new RateLimiter();

        /// <summary>
        /// 연결이 없는 세션이다(46. 월드에 남은 캐릭터에 붙임). 보내는 것을 버린다.
        /// </summary>
        public bool IsDetached { get; private init; }

        /// <summary>
        /// 월드에 남은 캐릭터에 붙일 떼어진 세션.
        /// </summary>
        public static Session Detached()
        {
            return new Session { IsDetached = true };
        }

        /// <summary>
        /// 이번 틱에 보낼 패킷에 더한다.
        /// </summary>
        public void Send(Packet packet)
        {
            if (!IsDetached)
            {
                Outbox.Add(packet);
            }
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
