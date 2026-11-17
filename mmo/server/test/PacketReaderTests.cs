using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 버퍼를 가진 PacketReader(53)가 TCP처럼 아무 데서나 잘려 오는 바이트에서 프레임을 바르게 꺼내는지 본다.
    /// </summary>
    public class PacketReaderTests
    {
        /// <summary>
        /// 한 바이트씩, 몇 바이트씩, 버퍼만큼씩 와도 패킷을 차례대로 하나씩 읽고(버퍼 끝에 걸친 프레임 포함), 경계에서 끝나면 null이다.
        /// </summary>
        [Theory]
        [InlineData(1)]
        [InlineData(3)]
        [InlineData(4096)]
        public async Task ReadsPacketsHoweverTheBytesAreSplit(int chunk)
        {
            Packet[] packets = Enumerable.Range(0, 600).Select(i => new Packet { Move = new Move { X = i * 997, Z = -i, Yaw = (uint)i % 256, Ack = (uint)i, Moving = i % 2 == 0 } }).ToArray();
            var bytes = new MemoryStream();
            foreach (Packet packet in packets)
            {
                packet.WriteDelimitedTo(bytes);
            }

            Assert.True(bytes.Length > 4096);
            var reader = new PacketReader(new ChunkedStream(bytes.ToArray(), chunk), 256);
            foreach (Packet expected in packets)
            {
                Assert.Equal(expected, await reader.ReadAsync(CancellationToken.None));
            }

            Assert.Null(await reader.ReadAsync(CancellationToken.None));
        }

        /// <summary>
        /// 상한을 넘는 길이와 읽을 수 없는 내용은 InvalidDataException, 패킷 중간에 끝나면 EndOfStreamException이다.
        /// </summary>
        [Fact]
        public async Task RejectsOversizedBrokenAndTruncatedFrames()
        {
            await Assert.ThrowsAsync<InvalidDataException>(() => Read(new byte[] { 0xAD, 0x02 }));
            await Assert.ThrowsAsync<InvalidDataException>(() => Read(new byte[] { 0x02, 0xFF, 0xFF }));
            await Assert.ThrowsAsync<InvalidDataException>(() => Read(new byte[] { 0x80, 0x80, 0x80, 0x80, 0x80, 0x00 }));
            await Assert.ThrowsAsync<EndOfStreamException>(() => Read(new byte[] { 0x0A, 0x01, 0x02 }));
        }

        private static async Task Read(byte[] bytes)
        {
            await new PacketReader(new ChunkedStream(bytes, 2), 256).ReadAsync(CancellationToken.None);
        }

        /// <summary>
        /// 읽을 때마다 chunk 바이트까지만 내주는 스트림.
        /// </summary>
        private sealed class ChunkedStream : Stream
        {
            private readonly byte[] _bytes;
            private readonly int _chunk;
            private int _position;

            public ChunkedStream(byte[] bytes, int chunk)
            {
                _bytes = bytes;
                _chunk = chunk;
            }

            public override bool CanRead => true;
            public override bool CanSeek => false;
            public override bool CanWrite => false;
            public override long Length => throw new NotSupportedException();
            public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

            public override int Read(byte[] buffer, int offset, int count)
            {
                return Read(buffer.AsSpan(offset, count));
            }

            public override int Read(Span<byte> buffer)
            {
                int count = Math.Min(Math.Min(_chunk, buffer.Length), _bytes.Length - _position);
                _bytes.AsSpan(_position, count).CopyTo(buffer);
                _position += count;
                return count;
            }

            public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
            {
                return ValueTask.FromResult(Read(buffer.Span));
            }

            public override void Flush()
            {
            }

            public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
            public override void SetLength(long value) => throw new NotSupportedException();
            public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        }
    }
}
