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
                new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = 0xe3b0c44298fc1c14 } },
                new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok } },
                new Packet
                {
                    CharacterList = new CharacterList
                    {
                        Characters = { new CharacterSummary { Id = 12, Name = "기사01", CharacterClass = CharacterClass.Knight } },
                    },
                },
                new Packet { CreateCharacter = new CreateCharacter { Name = "Merlin", CharacterClass = CharacterClass.Mage } },
                new Packet { CreateCharacterResult = new CreateCharacterResult { Result = CreateCharacterResultCode.NameTaken } },
                new Packet { EnterWorld = new EnterWorld { CharacterId = 12 } },
                new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.Ok, SelfId = 7, Tick = 100 } },
                new Packet { LeaveWorld = new LeaveWorld() },
                new Packet { Kicked = new Kicked { Reason = KickReason.DuplicateLogin } },
                new Packet { Move = new Move { X = -3, Z = 32767, Yaw = 255, Ack = 2 } },
                new Packet { PositionReset = new PositionReset { X = 1, Z = -1, Ack = 3 } },
                new Packet
                {
                    EntitiesEnter = new EntitiesEnter
                    {
                        Entities =
                        {
                            new EntityEnter
                            {
                                Id = 7, X = 48, Z = 0, Yaw = 64, Kind = EntityKind.Player, Name = "기사01", CharacterClass = CharacterClass.Mage,
                                Level = 12, NameColor = NameColor.Outlaw, WeaponItemId = 1001, Hp = 90, MaxHp = 120,
                                Effects = { new EffectState { EffectId = 3, EndTick = 900 } },
                                Progress = new ProgressState { Kind = ProgressKind.Cast, Id = 5, EndTick = 880 }, Speed = 192, MoveYaw = 32,
                            },
                            new EntityEnter { Id = 8, Kind = EntityKind.Monster, TemplateId = 2, Hp = 0, MaxHp = 50, Dead = true, Speed = 96, NextX = -40, NextZ = 7 },
                            new EntityEnter
                            {
                                Id = 9, Kind = EntityKind.GroundItem, ItemId = 4, Count = 3, Enchant = 7, OwnerPartyId = 2, OwnerOnlyEndTick = 1200, DroppedByPlayer = true,
                            },
                        },
                    },
                },
                new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 7, 8 } } },
                new Packet { EntityMoves = new EntityMoves { Tick = 72000, Entities = { s_sampleMove, new EntityMove { Id = 9, X = 1, Z = 2, Teleport = true } } } },
                new Packet { EntityState = new EntityState { Id = 7, NameColor = NameColor.Aggressor, WeaponItemId = 1002, Level = 13 } },
                new Packet { SelfVitals = new SelfVitals { Hp = 140, Mp = 0, CombatEndTick = 72100, AggressorEndTick = 72600 } },
                new Packet { EntityVitals = new EntityVitals { Entities = { new EntityVital { Id = 7, Hp = 95, MaxHp = 120 }, new EntityVital { Id = 8, Hp = 50, MaxHp = 50 } } } },
                new Packet { SelfStats = new SelfStats { MaxHp = 150, MaxMp = 50, Attack = 12, Defense = 10 } },
                new Packet { ActionFailed = new ActionFailed { Reason = FailReason.InvalidTarget, Request = RequestKind.Attack } },
                new Packet { AttackStart = new AttackStart { TargetId = 1234 } },
                new Packet { AttackStop = new AttackStop() },
                new Packet { AttackSwing = new AttackSwing { AttackerId = 0, TargetId = 1234 } },
                new Packet { Damaged = new Damaged { AttackerId = 7, TargetId = 1234, Damage = 18, Hp = 42, Critical = true } },
                new Packet { Died = new Died { Id = 1234, KillerId = 7 } },
                new Packet { Revive = new Revive() },
                new Packet { Revived = new Revived { Id = 7, Hp = 45, MaxHp = 150 } },
                new Packet { ActionFailed = new ActionFailed { Reason = FailReason.NotDead, Request = RequestKind.Revive } },
                new Packet { UseSkill = new UseSkill { SkillId = 205, TargetId = 1234, ForceAttack = true } },
                new Packet { SkillUsed = new SkillUsed { CasterId = 7, SkillId = 205, TargetId = 1234 } },
                new Packet { Progress = new Progress { Id = 7, State = new ProgressState { Kind = ProgressKind.Cast, Id = 205, EndTick = 4000 } } },
                new Packet { ProgressCancelled = new ProgressCancelled { Id = 7, Reason = FailReason.Cancelled } },
                new Packet { EffectApplied = new EffectApplied { Id = 1234, Effect = new EffectState { EffectId = 2, EndTick = 4060 } } },
                new Packet { Cooldowns = new Cooldowns { Entries = { new Cooldown { SkillId = 101, EndTick = 4020 }, new Cooldown { SkillId = 102 } } } },
                new Packet { ActionFailed = new ActionFailed { Reason = FailReason.Blocked, Request = RequestKind.Skill } },
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
        /// Login의 데이터 해시는 값과 상관없이 태그까지 9바이트(fixed64)다.
        /// </summary>
        [Fact]
        public void TheDataHashCostsNineBytes()
        {
            var login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01" };
            int without = login.CalculateSize();
            login.DataHash = 1;
            Assert.Equal(without + 9, login.CalculateSize());
            login.DataHash = ulong.MaxValue;
            Assert.Equal(without + 9, login.CalculateSize());
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
            Assert.Equal(105, (int)Packet.BodyOneofCase.EntityState);
        }

        /// <summary>
        /// EntityEnter는 종류가 쓰지 않는 필드를 싣지 않는다. NPC는 번호, 종류, 위치와 방향, 템플릿 번호만이라 10바이트다
        /// (id 2, x 2, z는 0이라 없음, yaw 2, 종류 2, 템플릿 2). 바닥 아이템의 주인은 둘 가운데 하나다.
        /// </summary>
        [Fact]
        public void EntityEnterCarriesOnlyTheFieldsOfItsKind()
        {
            var npc = new EntityEnter { Id = 7, X = 48, Z = 0, Yaw = 64, Kind = EntityKind.Npc, TemplateId = 2 };
            Assert.Equal(10, npc.CalculateSize());
            Assert.Equal(new EntityEnter { Id = 7, X = 48, Yaw = 64, Kind = EntityKind.Npc, TemplateId = 2 }.ToByteArray(), npc.ToByteArray());

            // 기본값(서 있음, 효과 없음, 진행 없음, 일반 이름 색)인 플레이어는 이름과 직업만 더 실린다.
            var player = new EntityEnter { Id = 7, X = 48, Yaw = 64, Kind = EntityKind.Player, Name = "Arthur", CharacterClass = CharacterClass.Knight };
            Assert.Equal(10 - 2 + 8 + 2, player.CalculateSize());

            var item = new EntityEnter { Id = 9, Kind = EntityKind.GroundItem, OwnerPlayerId = 7 };
            item.OwnerPartyId = 2;
            Assert.Equal(EntityEnter.OwnerOneofCase.OwnerPartyId, item.OwnerCase);
            Assert.Equal(0u, item.OwnerPlayerId);
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

        /// <summary>
        /// AttackSwing의 프레임은 번호가 1바이트 varint(127 이하)면 8바이트, 2바이트(16,383 이하)면 10바이트다
        /// (길이 1 + 필드 204의 태그 2 + 본문 길이 1 + 번호 둘마다 태그 1과 varint). 설계의 "약 8바이트"는 앞의 경우다.
        /// </summary>
        [Fact]
        public void AttackSwingIsEightToTenBytes()
        {
            Assert.Equal(8, FrameSize(new Packet { AttackSwing = new AttackSwing { AttackerId = 12, TargetId = 34 } }));
            Assert.Equal(10, FrameSize(new Packet { AttackSwing = new AttackSwing { AttackerId = 1234, TargetId = 1235 } }));
        }

        private static long FrameSize(Packet packet)
        {
            using var stream = new MemoryStream();
            packet.WriteDelimitedTo(stream);
            return stream.Length;
        }
    }
}
