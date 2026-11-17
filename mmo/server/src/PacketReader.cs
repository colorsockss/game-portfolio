using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 스트림에서 길이 구분 프레임(varint 길이 + Packet)을 하나씩 읽는다. 스트림 하나에 하나를 두고 그것으로만 읽는다(읽은 바이트를 버퍼에 남겨 둠).
    /// 버퍼에 든 만큼 한 번에 읽고 그 안에서 패킷을 잘라 파싱해, 패킷마다의 할당이 Packet과 그 내용뿐이다(53. BufferedStream의 비동기 상태와
    /// CodedInputStream을 만들지 않음).
    /// </summary>
    public sealed class PacketReader
    {
        /// <summary>
        /// varint 길이의 최대 바이트 수(uint32).
        /// </summary>
        private const int MaxLengthBytes = 5;

        /// <summary>
        /// 한 번에 읽어 들이는 최소 크기.
        /// </summary>
        private const int MinBufferBytes = 4096;

        private readonly Stream _stream;
        private readonly int _maxPacketBytes;
        private readonly byte[] _buffer;

        /// <summary>
        /// 버퍼에서 아직 파싱하지 않은 바이트의 범위 [_start, _end).
        /// </summary>
        private int _start;
        private int _end;

        /// <param name="maxPacketBytes">패킷 하나(길이 머리 뺌)의 크기 상한. 넘으면 InvalidDataException.</param>
        public PacketReader(Stream stream, int maxPacketBytes)
        {
            _stream = stream;
            _maxPacketBytes = maxPacketBytes;
            _buffer = new byte[Math.Max(MinBufferBytes, MaxLengthBytes + maxPacketBytes)];
        }

        /// <summary>
        /// 패킷 하나를 읽는다. 패킷 경계에서 스트림이 끝나면 null이다.
        /// 길이가 상한보다 크거나 읽을 수 없는 패킷이면 InvalidDataException, 패킷 중간에 끝나면 EndOfStreamException을 던진다.
        /// </summary>
        [AsyncMethodBuilder(typeof(PoolingAsyncValueTaskMethodBuilder<>))]
        public async ValueTask<Packet?> ReadAsync(CancellationToken cancellationToken)
        {
            while (true)
            {
                if (TryParse() is Packet packet)
                {
                    return packet;
                }

                // 남은 조각을 앞으로 당긴다. 버퍼가 프레임의 상한보다 크므로 그 뒤에는 늘 읽을 자리가 있다.
                if (_start > 0)
                {
                    Buffer.BlockCopy(_buffer, _start, _buffer, 0, _end - _start);
                    _end -= _start;
                    _start = 0;
                }

                int read = await _stream.ReadAsync(_buffer.AsMemory(_end), cancellationToken);
                if (read == 0)
                {
                    if (_end == 0)
                    {
                        return null;
                    }

                    throw new EndOfStreamException();
                }

                _end += read;
            }
        }

        /// <summary>
        /// 버퍼에 온전한 프레임이 있으면 파싱해 꺼내고, 모자라면 null.
        /// </summary>
        private Packet? TryParse()
        {
            int position = _start;
            long length = 0;
            for (int index = 0; ; index++)
            {
                if (index == MaxLengthBytes)
                {
                    throw new InvalidDataException("Packet length varint is too long.");
                }

                if (position == _end)
                {
                    return null;
                }

                byte part = _buffer[position++];
                length |= (long)(part & 0x7F) << (7 * index);
                if (length > _maxPacketBytes)
                {
                    throw new InvalidDataException($"Packet length {length} exceeds {_maxPacketBytes} bytes.");
                }

                if ((part & 0x80) == 0)
                {
                    break;
                }
            }

            if (_end - position < length)
            {
                return null;
            }

            Packet packet;
            try
            {
                packet = Packet.Parser.ParseFrom(new ReadOnlySpan<byte>(_buffer, position, (int)length));
            }
            catch (InvalidProtocolBufferException exception)
            {
                // InvalidProtocolBufferException은 IOException이라 연결 끊김과 구분되게 바꾼다.
                throw new InvalidDataException("Packet cannot be parsed.", exception);
            }

            _start = position + (int)length;
            if (_start == _end)
            {
                _start = 0;
                _end = 0;
            }

            return packet;
        }
    }
}
