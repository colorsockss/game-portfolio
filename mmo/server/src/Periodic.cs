namespace PortfolioMmo.Server
{
    /// <summary>
    /// 주기로 하는 일의 차례. 나머지 연산 대신 "다음에 할 틱 ≤ 지금 틱"으로 보므로, 틱 번호가 건너뛰어도(밀린 틱) 한 번만 하고
    /// 다음 차례는 처음 위상(처음 틱 + 간격의 배수)에 둔다. 개체마다 같은 주기로 하는 일은 처음 틱을 번호 % 간격으로 엇갈린다.
    /// </summary>
    public sealed class Periodic
    {
        private readonly uint _interval;

        /// <summary>
        /// first 틱에 처음 하고, 그 뒤로 interval 틱마다 한다.
        /// </summary>
        public Periodic(uint first, uint interval)
        {
            Next = first;
            _interval = interval;
        }

        /// <summary>
        /// 다음에 할 틱.
        /// </summary>
        public uint Next { get; private set; }

        /// <summary>
        /// 지금 할 차례인가. 참이면 다음 차례를 지금 틱 뒤의 첫 위상으로 옮긴다(밀린 차례는 한 번으로 친다).
        /// </summary>
        public bool Due(uint now)
        {
            if (Next > now)
            {
                return false;
            }

            Next += (((now - Next) / _interval) + 1) * _interval;
            return true;
        }

        /// <summary>
        /// 쉬던 동안(잠든 몬스터. 56) 지난 차례를 하지 않은 것으로 버리고, 다음 차례를 now 이후의 첫 위상(now일 수 있음)에 둔다.
        /// 함께 쉬다 다시 시작한 것들이 밀린 차례를 한 틱에 몰아 하지 않게 한다.
        /// </summary>
        public void Resume(uint now)
        {
            if (Next < now)
            {
                Next += (now - Next + _interval - 1) / _interval * _interval;
            }
        }
    }
}
