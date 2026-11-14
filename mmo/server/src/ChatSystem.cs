using System;
using System.Collections.Generic;
using System.Text;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 채팅(41). 입력 차례에서 Chat을 확인하고 그 자리에서 받는 연결들에 ChatReceived를 넣는다. 저장하지 않는다.
    /// 죽은 동안과 기절한 동안에도 받는다(World의 Blocked가 막지 않음). 실패는 ActionFailed(채팅)이고 아무에게도 보내지 않는다.
    /// </summary>
    internal sealed class ChatSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly int _maxBytes;
        private readonly int _perSecond;
        private readonly HashSet<Entity> _around = new HashSet<Entity>();

        public ChatSystem(GameData data, EntityTable entities, Grid grid)
        {
            _entities = entities;
            _grid = grid;
            _maxBytes = (int)data.Constants.ChatMaxBytes;
            _perSecond = (int)data.Constants.ChatPerSecond;
        }

        /// <summary>
        /// Chat(입력 차례): 길이, 빈도, 받는 사람을 차례로 보고 보낸다. 모르는 채널은 잘못된 패킷이다. 빈 글은 아무것도 하지 않는다.
        /// </summary>
        public Outcome Send(Player player, Chat chat, uint tick)
        {
            if (chat.Channel is not (ChatChannel.Nearby or ChatChannel.Party or ChatChannel.World or ChatChannel.Whisper))
            {
                return Outcome.Malformed;
            }

            if (chat.Text.Length == 0)
            {
                return Outcome.Done;
            }

            if (Encoding.UTF8.GetByteCount(chat.Text) > _maxBytes)
            {
                return Outcome.Fail(FailReason.TextTooLong);
            }

            if (!TakeChatTick(player, tick))
            {
                return Outcome.Fail(FailReason.ChatTooFast);
            }

            var received = new ChatReceived { Channel = chat.Channel, SenderId = player.Id, SenderName = player.Name, Text = chat.Text };
            var packet = new Packet { ChatReceived = received };
            switch (chat.Channel)
            {
                case ChatChannel.Nearby:
                    // 그 연결이 보낸 사람의 개체를 받았는지는 보지 않는다. 보낸 본인도 둘레 안이라 함께 받는다.
                    _around.Clear();
                    _grid.CollectAround(player.Cell, _around);
                    foreach (Entity entity in _around)
                    {
                        if (entity is Player listener)
                        {
                            listener.Session.Send(packet);
                        }
                    }

                    break;
                case ChatChannel.World:
                    foreach (Player listener in _entities.Players)
                    {
                        listener.Session.Send(packet);
                    }

                    break;
                case ChatChannel.Whisper:
                    // shortcut: 월드의 플레이어는 모두 연결이 붙어 있다. 끊긴 채 남는 캐릭터(46)가 생기면 연결이 없는 것을 "받는 사람 없음"으로 뺀다.
                    if (_entities.FindPlayer(chat.To) is not Player recipient)
                    {
                        return Outcome.Fail(FailReason.NoRecipient);
                    }

                    received.To = recipient.Name;
                    recipient.Session.Send(packet);
                    if (recipient != player)
                    {
                        player.Session.Send(packet);
                    }

                    break;
                default:
                    // 파티가 생기면(42) 파티원에게 보낸다.
                    return Outcome.Fail(FailReason.NoParty);
            }

            return Outcome.Done;
        }

        /// <summary>
        /// 지난 1초 안에 보낸 채팅이 chatPerSecond보다 적으면 이 틱을 남기고 참이다. 틱 번호로 센다(연결마다의 토큰 버킷 28과 따로).
        /// </summary>
        private bool TakeChatTick(Player player, uint tick)
        {
            if (player.ChatTicks.Length != _perSecond)
            {
                player.ChatTicks = new uint[_perSecond];
                player.NextChatTick = 0;
            }

            uint oldest = player.ChatTicks[player.NextChatTick];
            if ((oldest != 0) && (tick - (oldest - 1) < Units.TicksPerSecond))
            {
                return false;
            }

            player.ChatTicks[player.NextChatTick] = tick + 1;
            player.NextChatTick = (player.NextChatTick + 1) % _perSecond;
            return true;
        }
    }
}
