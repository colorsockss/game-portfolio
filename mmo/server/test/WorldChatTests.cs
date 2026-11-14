using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 채팅(41). 시야 칸은 32 m라 200 m 떨어진 플레이어는 둘레 9칸 밖이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 주변 채팅은 보낸 사람의 둘레 9개 시야 칸 안의 플레이어(본인 포함)에게 보낸 사람의 번호·이름과 함께 가고, 밖에는 가지 않는다.
        /// </summary>
        [Fact]
        public void NearbyChatReachesOnlyTheNineViewCells()
        {
            World world = CombatWorld(TestData.Draw(600), spawns: System.Array.Empty<Data.SpawnsRow>());
            Session speaker = Fighter(world, "hero_01", 0, 0);
            Session near = Fighter(world, "hero_02", 10, 0);
            Session far = Fighter(world, "hero_03", 200, 0);
            Take(speaker);
            Say(world, speaker, ChatChannel.Nearby, "안녕");
            var expected = new ChatReceived { Channel = ChatChannel.Nearby, SenderId = speaker.Player!.Id, SenderName = "hero01", Text = "안녕" };
            Assert.Equal(new[] { expected }, Chats(speaker));
            Assert.Equal(new[] { expected }, Chats(near));
            Assert.Empty(Chats(far));
        }

        /// <summary>
        /// 전체 채팅은 시야 밖의 연결에도 가고, 캐릭터 선택에 있는 연결에는 가지 않는다.
        /// </summary>
        [Fact]
        public void WorldChatReachesEveryoneInTheWorld()
        {
            World world = CombatWorld(TestData.Draw(600), spawns: System.Array.Empty<Data.SpawnsRow>());
            Session speaker = Fighter(world, "hero_01", 0, 0);
            Session far = Fighter(world, "hero_02", 200, 0);
            Session selecting = LogIn(world, "hero_03");
            Take(selecting);
            Say(world, speaker, ChatChannel.World, "모두 안녕");
            Assert.Single(Chats(speaker));
            Assert.Equal("모두 안녕", Chats(far).Single().Text);
            Assert.Empty(Chats(selecting));
        }

        /// <summary>
        /// 귓속말은 대소문자가 다른 이름으로도 받는 사람에게 가고, 받는 사람과 보낸 사람에게만 받는 사람의 이름과 함께 간다. 없는 이름은 "받는 사람 없음"이다.
        /// </summary>
        [Fact]
        public void WhispersGoToTheRecipientAndTheSenderOnly()
        {
            World world = CombatWorld(TestData.Draw(600), spawns: System.Array.Empty<Data.SpawnsRow>());
            Session speaker = Fighter(world, "hero_01", 0, 0);
            Session recipient = Fighter(world, "hero_02", 200, 0);
            Session other = Fighter(world, "hero_03", 5, 0);
            Take(speaker);
            Say(world, speaker, ChatChannel.Whisper, "비밀", "HERO02");
            var expected = new ChatReceived { Channel = ChatChannel.Whisper, SenderId = speaker.Player!.Id, SenderName = "hero01", To = "hero02", Text = "비밀" };
            Assert.Equal(new[] { expected }, Chats(speaker));
            Assert.Equal(new[] { expected }, Chats(recipient));
            Assert.Empty(Chats(other));

            Say(world, speaker, ChatChannel.Whisper, "비밀", "nobody");
            Assert.Equal(new[] { FailedFor(FailReason.NoRecipient, RequestKind.Chat) }, Take(speaker));
            Assert.Empty(Chats(recipient));
        }

        /// <summary>
        /// 181바이트의 글은 "글이 너무 긺"이고 180바이트는 간다. 1초 안의 셋째 글은 "너무 자주 보냄"이고(실패한 글은 세지 않음) 1초 뒤에는 간다.
        /// </summary>
        [Fact]
        public void ChatsAreLimitedInLengthAndRate()
        {
            World world = CombatWorld(TestData.Draw(600), spawns: System.Array.Empty<Data.SpawnsRow>());
            Session speaker = Fighter(world, "hero_01", 0, 0);
            Say(world, speaker, ChatChannel.Nearby, new string('가', 60));
            Say(world, speaker, ChatChannel.Nearby, new string('가', 60) + "a");
            Say(world, speaker, ChatChannel.Nearby, "둘째");
            Say(world, speaker, ChatChannel.Nearby, "셋째");
            List<Packet> answers = Take(speaker);
            Assert.Equal(
                new[] { Packet.BodyOneofCase.ChatReceived, Packet.BodyOneofCase.ActionFailed, Packet.BodyOneofCase.ChatReceived, Packet.BodyOneofCase.ActionFailed },
                answers.Select(packet => packet.BodyCase));
            Assert.Equal(FailedFor(FailReason.TextTooLong, RequestKind.Chat), answers[1]);
            Assert.Equal(FailedFor(FailReason.ChatTooFast, RequestKind.Chat), answers[3]);

            for (int tick = 0; tick < Units.TicksPerSecond; tick++)
            {
                world.Step();
            }

            Take(speaker);
            Say(world, speaker, ChatChannel.Nearby, "1초 뒤");
            Assert.Equal("1초 뒤", Chats(speaker).Single().Text);
        }

        /// <summary>
        /// 파티가 없는 플레이어의 파티 채팅은 "파티 없음"이다. 죽은 동안과 기절한 동안 보낸 채팅은 간다.
        /// </summary>
        [Fact]
        public void PartyChatNeedsAPartyAndDeadOrStunnedPlayersStillChat()
        {
            World world = CombatWorld(TestData.Draw(600), spawns: System.Array.Empty<Data.SpawnsRow>());
            Session speaker = Fighter(world, "hero_01", 0, 0);
            Say(world, speaker, ChatChannel.Party, "파티");
            Assert.Equal(new[] { FailedFor(FailReason.NoParty, RequestKind.Chat) }, Take(speaker));

            world.Effects.Apply(speaker.Player!, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            Take(speaker);
            Say(world, speaker, ChatChannel.Nearby, "기절");
            Assert.Equal("기절", Chats(speaker).Single().Text);

            speaker.Player!.Hp = 0;
            speaker.Player.Dead = true;
            for (int tick = 0; tick < Units.TicksPerSecond; tick++)
            {
                world.Step();
            }

            Take(speaker);
            Say(world, speaker, ChatChannel.World, "쓰러짐");
            Assert.Equal("쓰러짐", Chats(speaker).Single().Text);
        }

        private static void Say(World world, Session session, ChatChannel channel, string text, string to = "")
        {
            world.Receive(session, new Packet { Chat = new Chat { Channel = channel, To = to, Text = text } });
        }

        /// <summary>
        /// 쌓인 패킷의 ChatReceived들(나머지도 비움).
        /// </summary>
        private static List<ChatReceived> Chats(Session session)
        {
            return Take(session).Where(packet => packet.BodyCase == Packet.BodyOneofCase.ChatReceived).Select(packet => packet.ChatReceived).ToList();
        }
    }
}
