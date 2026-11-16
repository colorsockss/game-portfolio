using System.Collections.Generic;
using System.Runtime.CompilerServices;
using Google.Protobuf;

namespace PortfolioMmo.Contract
{
    /// <summary>
    /// Packet { EntityMoves }를 이어 붙여 쓴다(51). 같은 EntityMove 객체(그 틱에 움직인 개체 하나의 것을 보는 연결들이 함께 씀)는 내용의 바이트를
    /// 한 번만 만들어 두고, 연결마다 머리(Packet의 태그와 길이, 틱)와 원소마다의 태그를 쓴 뒤 그 바이트를 길이와 함께 붙인다. Protobuf의 반복 필드는
    /// 원소를 이어 붙인 것과 같은 바이트라 통째로 인코딩한 것과 같다(Contract.Tests가 봄). 틱마다 Clear로 비운다. 한 스레드에서만 쓴다.
    /// </summary>
    public sealed class EntityMovesEncoder
    {
        private static readonly int s_packetTagSize = CodedOutputStream.ComputeTagSize(Packet.EntityMovesFieldNumber);
        private static readonly int s_entityTagSize = CodedOutputStream.ComputeTagSize(EntityMoves.EntitiesFieldNumber);
        private readonly Dictionary<EntityMove, ByteString> _contents = new Dictionary<EntityMove, ByteString>(new ByReference());

        /// <summary>
        /// 원소의 바이트를 버린다(틱이 끝날 때. EntityMove 객체는 틱마다 새로 만들어짐).
        /// </summary>
        public void Clear()
        {
            _contents.Clear();
        }

        /// <summary>
        /// Packet { EntityMoves = moves }의 바이트 수(프레임의 길이는 뺌).
        /// </summary>
        public int PacketSize(EntityMoves moves)
        {
            int body = BodySize(moves);
            return s_packetTagSize + CodedOutputStream.ComputeLengthSize(body) + body;
        }

        /// <summary>
        /// Packet { EntityMoves = moves }를 쓴다(output.WriteMessage(packet)이 쓸 것에서 앞의 길이를 뺀 것과 같은 바이트).
        /// </summary>
        public void WritePacket(CodedOutputStream output, EntityMoves moves)
        {
            output.WriteTag(Packet.EntityMovesFieldNumber, WireFormat.WireType.LengthDelimited);
            output.WriteLength(BodySize(moves));
            if (moves.Tick != 0)
            {
                output.WriteTag(EntityMoves.TickFieldNumber, WireFormat.WireType.Varint);
                output.WriteUInt32(moves.Tick);
            }

            foreach (EntityMove move in moves.Entities)
            {
                output.WriteTag(EntityMoves.EntitiesFieldNumber, WireFormat.WireType.LengthDelimited);
                output.WriteBytes(Content(move));
            }
        }

        private int BodySize(EntityMoves moves)
        {
            int size = moves.Tick != 0 ? CodedOutputStream.ComputeTagSize(EntityMoves.TickFieldNumber) + CodedOutputStream.ComputeUInt32Size(moves.Tick) : 0;
            foreach (EntityMove move in moves.Entities)
            {
                size += s_entityTagSize + CodedOutputStream.ComputeBytesSize(Content(move));
            }

            return size;
        }

        /// <summary>
        /// 원소 하나의 내용(EntityMove의 바이트). 처음 묻는 객체만 인코딩한다.
        /// </summary>
        private ByteString Content(EntityMove move)
        {
            if (!_contents.TryGetValue(move, out ByteString bytes))
            {
                bytes = move.ToByteString();
                _contents.Add(move, bytes);
            }

            return bytes;
        }

        /// <summary>
        /// 객체 자체로 견준다(EntityMove의 Equals는 값으로 견줌).
        /// </summary>
        private sealed class ByReference : IEqualityComparer<EntityMove>
        {
            public bool Equals(EntityMove x, EntityMove y)
            {
                return ReferenceEquals(x, y);
            }

            public int GetHashCode(EntityMove obj)
            {
                return RuntimeHelpers.GetHashCode(obj);
            }
        }
    }
}
