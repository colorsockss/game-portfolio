using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 스트림에서 길이 구분 프레임(varint 길이 + Packet)을 하나씩 읽는다.
    /// </summary>
    public static class PacketReader
    {
        /// <summary>
        /// varint 길이의 최대 바이트 수(uint32).
        /// </summary>
        private const int MaxLengthBytes = 5;

        /// <summary>
        /// 패킷 하나를 읽는다. 패킷 경계에서 스트림이 끝나면 null이다.
        /// 길이가 buffer보다 크거나 읽을 수 없는 패킷이면 InvalidDataException, 패킷 중간에 끝나면 EndOfStreamException을 던진다.
        /// </summary>
        public static async ValueTask<Packet?> ReadAsync(Stream stream, byte[] buffer, CancellationToken cancellationToken)
        {
            long length = 0;
            for (int index = 0; ; index++)
            {
                if (index == MaxLengthBytes)
                {
                    throw new InvalidDataException("Packet length varint is too long.");
                }

                if (await stream.ReadAsync(buffer.AsMemory(0, 1), cancellationToken) == 0)
                {
                    if (index == 0)
                    {
                        return null;
                    }

                    throw new EndOfStreamException();
                }

                byte part = buffer[0];
                length |= (long)(part & 0x7F) << (7 * index);
                if (length > buffer.Length)
                {
                    throw new InvalidDataException($"Packet length {length} exceeds {buffer.Length} bytes.");
                }

                if ((part & 0x80) == 0)
                {
                    break;
                }
            }

            await stream.ReadExactlyAsync(buffer.AsMemory(0, (int)length), cancellationToken);
            try
            {
                return Packet.Parser.ParseFrom(buffer, 0, (int)length);
            }
            catch (InvalidProtocolBufferException exception)
            {
                // InvalidProtocolBufferException은 IOException이라 연결 끊김과 구분되게 바꾼다.
                throw new InvalidDataException("Packet cannot be parsed.", exception);
            }
        }
    }
}
