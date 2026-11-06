using System.IO;
using System.Linq;
using Google.Protobuf;
using PortfolioMmo.Contract;
using Xunit;

namespace PortfolioMmo.Contract.Tests
{
    /// <summary>
    /// packets.proto에서 생성한 코드가 길이 구분 프레임으로 왕복하는지와, MANUAL에 적은 와이어 크기를 확인한다.
    /// </summary>
    public class PacketTests
    {
        /// <summary>
        /// 크기 예시에 쓰는 개체 하나: id 1234, x 123.4 m(3949칸), z -512.5 m(-16400칸), yaw 200°(142칸).
        /// </summary>
        private static readonly EntityMove s_sampleMove = new EntityMove { Id = 1234, X = 3949, Z = -16400, Yaw = 142 };

        /// <summary>
        /// 모든 패킷이 한 스트림에 이어 쓴 길이 구분 프레임에서 같은 값으로 다시 읽힌다.
        /// </summary>
        [Fact]
        public void EveryPacketRoundTripsThroughOneDelimitedStream()
        {
            Packet[] packets =
            {
                new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01" } },
                new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok, SelfId = 7 } },
                new Packet { Kicked = new Kicked { Reason = KickReason.DuplicateLogin } },
                new Packet { Move = new Move { X = -3, Z = 32767, Yaw = 255, Ack = 2 } },
                new Packet { PositionReset = new PositionReset { X = 1, Z = -1, Ack = 3 } },
                new Packet { EntitiesEnter = new EntitiesEnter { Entities = { new EntityEnter { Id = 7, X = 48, Z = 0, Yaw = 64, Name = "hero_01" } } } },
                new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 7, 8 } } },
                new Packet { EntityMoves = new EntityMoves { Tick = 72000, Entities = { s_sampleMove } } },
            };

            using var stream = new MemoryStream();
            foreach (Packet packet in packets)
            {
                packet.WriteDelimitedTo(stream);
            }

            stream.Position = 0;
            Packet[] read = packets.Select(_ => Packet.Parser.ParseDelimitedFrom(stream)).ToArray();
            Assert.Equal(packets, read);
            Assert.Equal(stream.Length, stream.Position);
        }

        /// <summary>
        /// 패킷 번호는 oneof의 필드 번호다.
        /// </summary>
        [Fact]
        public void BodyCaseIsThePacketNumber()
        {
            Assert.Equal(1, (int)Packet.BodyOneofCase.Login);
            Assert.Equal(100, (int)Packet.BodyOneofCase.Move);
            Assert.Equal(104, (int)Packet.BodyOneofCase.EntityMoves);
        }

        /// <summary>
        /// 이동 개체 하나는 15바이트이고, 50명을 담은 EntityMoves 프레임은 760바이트다(MANUAL의 형식을 고른 근거).
        /// </summary>
        [Fact]
        public void EntityMovesForFiftyMoversIsSevenHundredSixtyBytes()
        {
            // 원소의 태그·길이 2바이트 + 본문 13바이트(id 3, x 3, z 4, yaw 3).
            Assert.Equal(13, s_sampleMove.CalculateSize());
            var packet = new Packet { EntityMoves = new EntityMoves { Tick = 72000 } };
            packet.EntityMoves.Entities.Add(Enumerable.Repeat(s_sampleMove, 50));

            using var stream = new MemoryStream();
            packet.WriteDelimitedTo(stream);
            Assert.Equal(760, stream.Length);
        }
    }
}
