using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 요청 하나를 처리한 결과(28). 요청을 처리하는 함수가 돌려주고, 무엇을 보내고 끊을지는 받는 한 곳(World.Receive)이 정한다.
    /// 실패는 지연 때문에 정상 클라이언트도 보낼 수 있는 것(ActionFailed로 답함), 되돌림은 어긋난 이동(PositionReset),
    /// 잘못된 패킷은 정상 클라이언트가 보낼 수 없는 것(KICK_REASON_MALFORMED_PACKET으로 끊음)이다.
    /// </summary>
    internal readonly record struct Outcome(Outcome.Kinds Kind, FailReason Reason)
    {
        public enum Kinds
        {
            Done,
            Failed,
            Reset,
            Malformed,
        }

        public static readonly Outcome Done = new Outcome(Kinds.Done, FailReason.None);
        public static readonly Outcome Reset = new Outcome(Kinds.Reset, FailReason.None);
        public static readonly Outcome Malformed = new Outcome(Kinds.Malformed, FailReason.None);

        public static Outcome Fail(FailReason reason)
        {
            return new Outcome(Kinds.Failed, reason);
        }
    }
}
