using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 로그인한 계정, 캐릭터 목록·만들기, 월드에 들어가고 나가기, 끊기.
    /// 연결은 로그인 전 → 캐릭터 선택(Session.LoginId만 있음) → 월드(Session.Player도 있음)다.
    /// 데이터베이스의 일(목록 읽기, 만들기, 캐릭터 읽기)은 저장 스레드의 큐에 넣고, 결과가 돌아온 틱(입력 차례)에 패킷을 보낸다(38). 같은 큐라 그 캐릭터의
    /// 남은 사본이 다 쓰인 뒤에 읽힌다.
    /// </summary>
    internal sealed partial class LoginSystem
    {
        /// <summary>
        /// 동시 접속 상한(로그인한 계정 수).
        /// </summary>
        private readonly int _maxPlayers;

        /// <summary>
        /// 새 캐릭터를 놓을 정사각형의 반 너비(1/32 m). 원점이 가운데다. 0이면 마을의 부활 지점에서 시작한다(부하 측정용 옵션).
        /// </summary>
        private readonly int _spawnHalfExtent;

        /// <summary>
        /// 막힌 칸이 뽑혔을 때 다시 뽑는 횟수. 다 막혀 있으면 마을의 부활 지점으로 둔다.
        /// </summary>
        private const int SpawnTries = 100;

        /// <summary>
        /// 시작 위치를 고르는 난수.
        /// </summary>
        private readonly System.Random _random;

        private readonly SaveQueue _queue;
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly SaveSystem _save;
        private readonly StatSystem _stats;

        /// <summary>
        /// 로그인한 계정의 연결. 로그인 ID가 키다.
        /// </summary>
        private readonly Dictionary<string, Session> _accounts = new Dictionary<string, Session>();

        /// <summary>
        /// 불러오는 중인 캐릭터 번호 → 결과를 받을 연결. 같은 캐릭터의 EnterWorld가 또 오면 읽기를 다시 넣지 않고 연결만 바꾼다.
        /// </summary>
        private readonly Dictionary<long, Session> _loading = new Dictionary<long, Session>();

        private readonly System.Func<uint> _tick;

        /// <summary>
        /// 마을의 부활 지점(1/32 m). 새 캐릭터와 들어올 자리가 막힌 캐릭터가 여기서 시작한다.
        /// </summary>
        private readonly (int X, int Z) _respawn;
        private readonly PkSystem _pk;

        public LoginSystem(int maxPlayers, int spawnHalfExtent, System.Random random, SaveQueue queue, GameData data, FieldMap field, EntityTable entities, Grid grid, SaveSystem save, StatSystem stats, PkSystem pk, System.Func<uint> tick)
        {
            _pk = pk;
            ZonesRow town = data.Zones.Rows.FirstOrDefault(zone => zone.Kind == ZoneKind.Town)
                ?? throw new System.ArgumentException("Zones needs a town row with the respawn point.", nameof(data));
            _respawn = (town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter);
            _field = field;
            _maxPlayers = maxPlayers;
            _spawnHalfExtent = spawnHalfExtent;
            _random = random;
            _queue = queue;
            _tick = tick;
            _data = data;
            _entities = entities;
            _grid = grid;
            _save = save;
            _stats = stats;
        }

        /// <summary>
        /// 불러온 캐릭터가 월드에 들어온 뒤(EnterWorldResult, 경험치, 쿨다운 뒤) 아이템·스킬·퀵슬롯을 되살리는 일. World가 정한다.
        /// </summary>
        public System.Action<Player, CharacterSnapshot, bool>? Entered { get; set; }

        /// <summary>
        /// 연결이 캐릭터에서 떨어지기 직전(끊김, 로그아웃, LeaveWorld, 재로그인, 예외. 월드에서 빼기 전). 파티(42)가 그 캐릭터를 뺀다.
        /// </summary>
        public System.Action<Player>? Leaving { get; set; }

        /// <summary>
        /// 로그인을 처리한다. 프로토콜 버전 → 데이터 해시 → ID 형식 → 동접 상한 순으로 보고, 실패하면 LoginResult를 보내고 끊는다. 같은 계정이 이미 로그인해 있으면 예전 연결을 끊는다.
        /// 성공하면 캐릭터 목록을 보낸다.
        /// </summary>
        public void Login(Session session, Login login)
        {
            _accounts.TryGetValue(login.LoginId, out Session? previous);
            LoginResultCode result = login.ProtocolVersion != ProtocolVersion.Current ? LoginResultCode.VersionMismatch
                : login.DataHash != _data.Hash ? LoginResultCode.DataMismatch
                : !LoginIdPattern().IsMatch(login.LoginId) ? LoginResultCode.InvalidLoginId
                : (previous == null && _accounts.Count >= _maxPlayers) ? LoginResultCode.ServerFull
                : LoginResultCode.Ok;
            if (result != LoginResultCode.Ok)
            {
                session.Send(new Packet { LoginResult = new LoginResult { Result = result } });
                session.Close();
                return;
            }

            if (previous != null)
            {
                // 예전 연결의 캐릭터는 그 틱에 월드에서 빠지며 사본을 넣는다. 새 연결은 캐릭터 선택부터 하고, 그 EnterWorld는 큐에서 사본 뒤에 읽힌다.
                Kick(previous, KickReason.DuplicateLogin);
            }

            _accounts.Add(login.LoginId, session);
            session.LoginId = login.LoginId;
            session.Send(new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok } });
            SendCharacterList(session);
        }

        /// <summary>
        /// 캐릭터를 만든다. 결과를 보내고, 성공하면 바뀐 목록도 보낸다.
        /// </summary>
        public void CreateCharacter(Session session, CreateCharacter create)
        {
            CreateCharacterResultCode result;
            if (create.CharacterClass is not (CharacterClass.Knight or CharacterClass.Mage))
            {
                result = CreateCharacterResultCode.InvalidClass;
            }
            else if (!CharacterNamePattern().IsMatch(create.Name))
            {
                result = CreateCharacterResultCode.InvalidName;
            }
            else
            {
                // 처음 들어갈 자리와 처음 상태는 만들 때 정해 한 트랜잭션에 넣는다. 결과와 바뀐 목록은 저장 스레드에서 돌아온 틱에 보낸다.
                _queue.Enqueue(new CreateJob(session, create.Name, create.CharacterClass, StartState(create.CharacterClass)));
                return;
            }

            session.Send(new Packet { CreateCharacterResult = new CreateCharacterResult { Result = result } });
        }

        /// <summary>
        /// 고른 캐릭터로 월드에 들어간다: 읽기를 큐에 넣고 결과가 돌아온 틱(Loaded)에 개체를 만든다. 불러오는 중인 캐릭터면 결과를 받을 연결만 바꾼다.
        /// </summary>
        public void EnterWorld(Session session, EnterWorld enter)
        {
            long id = (long)enter.CharacterId;
            bool loading = _loading.ContainsKey(id);
            _loading[id] = session;
            if (!loading)
            {
                _queue.Enqueue(new LoadJob(this, id) { Owner = session });
            }
        }

        /// <summary>
        /// 캐릭터를 읽었다(입력 차례). 기다리던 연결이 끊겼거나 이미 월드에 있으면 결과를 버린다. 이 계정의 캐릭터가 아니면 실패로 답한다.
        /// 읽은 체력이 0이면(죽은 채 빠짐) 마을의 부활 지점(무법자는 무법자의 부활 지점. 44)에서 부활할 때의 체력으로 시작하고 표시를 켠다(페널티는 죽을 때 이미 줬음).
        /// </summary>
        private void Loaded(long id, CharacterRecord? character)
        {
            if (!_loading.Remove(id, out Session? session) || session.IsClosing || (session.Player != null) || (session.LoginId == null))
            {
                return;
            }

            if ((character == null) || (character.LoginId != session.LoginId))
            {
                session.Send(new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.NoSuchCharacter } });
                return;
            }

            // 맵이 바뀌어 저장된 자리가 막혔거나 필드 밖이면 마을의 부활 지점으로 옮긴다(무법자도 같음. 죽은 것이 아님).
            // 들어올 때 옮기므로 다른 연결은 옮긴 자리의 EntityEnter만 본다.
            CharacterSnapshot state = character.State;
            SavedPosition position = state.Position;
            bool revived = state.Hp == 0;
            bool moved = revived || !_field.CanWalk(position.X, position.Z, Walker.Player);
            if (moved)
            {
                (int x, int z) = revived ? _pk.Respawn(state.Alignment) : _respawn;
                position = new SavedPosition(x, z, position.Yaw);
            }

            var player = new Player(_entities.NextPlayerId(), character, session, position) { Exp = state.Exp, Karma = state.Alignment, DirtySlow = moved };
            player.SetDisplayState(_data.HasLevel(character.Class, state.Level) ? state.Level : 1, player.NameColor, 0);
            _stats.Enter(player);
            _entities.Add(player);
            _grid.Add(player);
            session.Player = player;
            session.Send(new Packet
            {
                EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.Ok, SelfId = player.Id, Tick = _tick(), Revived = revived },
            });
            // 지금 경험치를 알린다(얻은 양 0. 31).
            session.Send(new Packet { ExpGained = new ExpGained { Exp = player.Exp } });
            player.SendCooldowns(_data.Skills.Rows.Where(skill => skill.Class == (uint)player.Class).Select(skill => skill.Id));
            Entered?.Invoke(player, state, revived);
        }

        /// <summary>
        /// 월드를 떠나 캐릭터 선택으로 돌아간다.
        /// </summary>
        public void LeaveWorld(Session session)
        {
            Remove(session);
            // 나갈 때의 사본 뒤에 읽혀 방금의 레벨과 무기가 실린다.
            SendCharacterList(session);
        }

        /// <summary>
        /// Kicked를 보내고 연결을 끊는다. 개체는 월드에서 빠지고 계정은 로그아웃한다.
        /// </summary>
        public void Kick(Session session, KickReason reason)
        {
            if (!session.IsClosing)
            {
                session.Send(new Packet { Kicked = new Kicked { Reason = reason } });
                session.Close();
            }

            LogOut(session);
        }

        /// <summary>
        /// 연결의 개체를 월드에서 빼고 계정을 로그아웃한다.
        /// </summary>
        public void LogOut(Session session)
        {
            Remove(session);
            ForgetAccount(session);
        }

        /// <summary>
        /// 이 연결의 요청을 처리하다 예외가 났다(39): 반쯤 적용된 상태일 수 있으므로 사본을 넣지 않고(바뀜 표시도 버림) 개체를 월드에서 바로 빼고,
        /// KICK_REASON_SERVER_ERROR로 끊는다. 다시 들어오면 마지막으로 큐에 넣은 상태다.
        /// </summary>
        public void Fail(Session session)
        {
            if (session.Player is Player player)
            {
                Leaving?.Invoke(player);
                session.Player = null;
                _entities.Remove(player);
                _grid.Remove(player);
            }

            if (!session.IsClosing)
            {
                session.Send(new Packet { Kicked = new Kicked { Reason = KickReason.ServerError } });
                session.Close();
            }

            ForgetAccount(session);
        }

        private void ForgetAccount(Session session)
        {
            if ((session.LoginId != null) && _accounts.TryGetValue(session.LoginId, out Session? current) && (current == session))
            {
                _accounts.Remove(session.LoginId);
            }
        }

        /// <summary>
        /// 로그인 ID의 형식. 영문 소문자, 숫자, 밑줄 4–16자(\z는 끝의 줄바꿈도 막는다).
        /// </summary>
        [GeneratedRegex(@"^[a-z0-9_]{4,16}\z")]
        private static partial Regex LoginIdPattern();

        /// <summary>
        /// 캐릭터 이름의 형식. 한글 음절, 영문, 숫자 2–12자.
        /// </summary>
        [GeneratedRegex(@"^[가-힣A-Za-z0-9]{2,12}\z")]
        private static partial Regex CharacterNamePattern();

        /// <summary>
        /// 새 캐릭터의 자리. 옵션이 없으면 마을의 부활 지점이고, 있으면 정사각형 안의 걸을 수 있는 무작위 자리다(봇이 한 점에 몰리지 않게).
        /// </summary>
        private (int X, int Z) StartPosition()
        {
            if (_spawnHalfExtent == 0)
            {
                return _respawn;
            }

            for (int i = 0; i < SpawnTries; i++)
            {
                int x = _random.Next(-_spawnHalfExtent, _spawnHalfExtent + 1);
                int z = _random.Next(-_spawnHalfExtent, _spawnHalfExtent + 1);
                if (_field.CanWalk(x, z, Walker.Player))
                {
                    return (x, z);
                }
            }

            return _respawn;
        }

        /// <summary>
        /// 계정의 캐릭터 목록을 읽어(저장 스레드) 돌아온 틱에 보낸다.
        /// </summary>
        private void SendCharacterList(Session session)
        {
            _queue.Enqueue(new ListJob(session, session.LoginId!));
        }

        /// <summary>
        /// 새 캐릭터의 처음 상태: 자리, 레벨 1의 가득 찬 체력·마나, 처음 상태의 아이템(입힌 기본 무기), 첫 스킬과 그것으로 채운 퀵슬롯.
        /// </summary>
        private CharacterSnapshot StartState(CharacterClass characterClass)
        {
            (int x, int z) = StartPosition();
            ClassesRow row = _data.Class(characterClass);
            LevelsRow level = _data.Level(characterClass, 1);
            return new CharacterSnapshot(
                0, new SavedPosition(x, z, 0), 1, 0, level.MaxHp, level.MaxMp, 0, 0, InventorySystem.StartItems(_data, row),
                row.FirstSkill != 0 ? new[] { row.FirstSkill } : System.Array.Empty<uint>(), QuickslotSystem.StartQuickslots(_data, row));
        }

        private static Packet ListPacket(List<CharacterListEntry> characters)
        {
            var list = new CharacterList();
            list.Characters.Add(characters.Select(character => new CharacterSummary
            {
                Id = (ulong)character.Id, Name = character.Name, CharacterClass = character.Class, Level = character.Level, WeaponItemId = character.WeaponItemId,
            }));
            return new Packet { CharacterList = list };
        }

        /// <summary>
        /// 목록 읽기. 돌아온 틱에 연결이 아직 열려 있으면 보낸다.
        /// </summary>
        private sealed class ListJob : StoreJob
        {
            private readonly Session _session;
            private readonly string _loginId;
            private List<CharacterListEntry> _characters = new List<CharacterListEntry>();

            public ListJob(Session session, string loginId)
            {
                Owner = session;
                _session = session;
                _loginId = loginId;
            }

            public override void Run(CharacterStore store)
            {
                _characters = store.List(_loginId);
            }

            public override void Complete()
            {
                if (!_session.IsClosing && (Failure == null))
                {
                    _session.Send(ListPacket(_characters));
                }
            }
        }

        /// <summary>
        /// 캐릭터 만들기와 그 뒤의 목록 읽기.
        /// </summary>
        private sealed class CreateJob : StoreJob
        {
            private readonly Session _session;
            private readonly string _loginId;
            private readonly string _name;
            private readonly CharacterClass _class;
            private readonly CharacterSnapshot _start;
            private CreateCharacterResultCode _result;
            private List<CharacterListEntry> _characters = new List<CharacterListEntry>();

            public CreateJob(Session session, string name, CharacterClass characterClass, CharacterSnapshot start)
            {
                Owner = session;
                _session = session;
                _loginId = session.LoginId!;
                _name = name;
                _class = characterClass;
                _start = start;
            }

            public override void Run(CharacterStore store)
            {
                _result = store.Create(_loginId, _name, _class, _start).Result;
                if (_result == CreateCharacterResultCode.Ok)
                {
                    _characters = store.List(_loginId);
                }
            }

            public override void Complete()
            {
                if (_session.IsClosing || (Failure != null))
                {
                    return;
                }

                _session.Send(new Packet { CreateCharacterResult = new CreateCharacterResult { Result = _result } });
                if (_result == CreateCharacterResultCode.Ok)
                {
                    _session.Send(ListPacket(_characters));
                }
            }
        }

        /// <summary>
        /// 캐릭터 읽기(들어오기).
        /// </summary>
        private sealed class LoadJob : StoreJob
        {
            private readonly LoginSystem _login;
            private readonly long _id;
            private CharacterRecord? _character;

            public LoadJob(LoginSystem login, long id)
            {
                _login = login;
                _id = id;
            }

            public override void Run(CharacterStore store)
            {
                _character = store.Load(_id);
            }

            public override void Complete()
            {
                _login.Loaded(_id, Failure == null ? _character : null);
            }
        }

        /// <summary>
        /// 연결의 개체를 월드에서 뺀다. 개체가 없으면 아무것도 하지 않는다. 주변 플레이어는 다음 시야 차례에 EntitiesLeave를 받는다.
        /// </summary>
        private void Remove(Session session)
        {
            Player? player = session.Player;
            if (player == null)
            {
                return;
            }

            Leaving?.Invoke(player);
            session.Player = null;
            _entities.Remove(player);
            _grid.Remove(player);
            // 월드에서 빠지는 틱에 사본 하나짜리 묶음을 넣는다(LeaveWorld, 끊김, 같은 계정의 재로그인).
            _save.SaveNow(player);
        }
    }
}
