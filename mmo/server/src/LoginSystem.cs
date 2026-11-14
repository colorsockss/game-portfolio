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

        private readonly CharacterStore _store;
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
        /// 마을의 부활 지점(1/32 m). 새 캐릭터와 들어올 자리가 막힌 캐릭터가 여기서 시작한다.
        /// </summary>
        private readonly (int X, int Z) _respawn;

        public LoginSystem(int maxPlayers, int spawnHalfExtent, System.Random random, CharacterStore store, GameData data, FieldMap field, EntityTable entities, Grid grid, SaveSystem save, StatSystem stats)
        {
            ZonesRow town = data.Zones.Rows.FirstOrDefault(zone => zone.Kind == ZoneKind.Town)
                ?? throw new System.ArgumentException("Zones needs a town row with the respawn point.", nameof(data));
            _respawn = (town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter);
            _field = field;
            _maxPlayers = maxPlayers;
            _spawnHalfExtent = spawnHalfExtent;
            _random = random;
            _store = store;
            _data = data;
            _entities = entities;
            _grid = grid;
            _save = save;
            _stats = stats;
        }

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
                // 예전 연결의 캐릭터는 월드에서 빠지고(위치는 저장 대기로 남음), 새 연결이 그 자리를 이어 간다.
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
                // 처음 들어갈 자리는 만들 때 정해 저장한다.
                (int x, int z) = StartPosition();
                result = _store.Create(session.LoginId!, create.Name, create.CharacterClass, x, z).Result;
            }

            session.Send(new Packet { CreateCharacterResult = new CreateCharacterResult { Result = result } });
            if (result == CreateCharacterResultCode.Ok)
            {
                SendCharacterList(session);
            }
        }

        /// <summary>
        /// 고른 캐릭터로 월드에 들어간다. 이 계정의 캐릭터가 아니면 실패로 답한다.
        /// </summary>
        public void EnterWorld(Session session, EnterWorld enter, uint tick)
        {
            CharacterRecord? character = _store.Load((long)enter.CharacterId);
            if ((character == null) || (character.LoginId != session.LoginId))
            {
                session.Send(new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.NoSuchCharacter } });
                return;
            }

            // 맵이 바뀌어 저장된 자리가 막혔거나 필드 밖이면 마을의 부활 지점으로 옮긴다(무법자도 같음. 죽은 것이 아님).
            // 들어올 때 옮기므로 다른 연결은 옮긴 자리의 EntityEnter만 본다.
            SavedPosition position = _save.PositionOf(character);
            bool blocked = !_field.CanWalk(position.X, position.Z, Walker.Player);
            if (blocked)
            {
                position = new SavedPosition(_respawn.X, _respawn.Z, position.Yaw);
            }

            var player = new Player(_entities.NextPlayerId(), character, session, position) { Dirty = blocked };
            _stats.Enter(player);
            _entities.Add(player);
            _grid.Add(player);
            session.Player = player;
            session.Send(new Packet
            {
                EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.Ok, SelfId = player.Id, Tick = tick },
            });
            // 지금 경험치를 알린다(얻은 양 0. 31).
            session.Send(new Packet { ExpGained = new ExpGained { Exp = player.Exp } });
            player.SendCooldowns(_data.Skills.Rows.Where(skill => skill.Class == (uint)player.Class).Select(skill => skill.Id));
        }

        /// <summary>
        /// 월드를 떠나 캐릭터 선택으로 돌아간다.
        /// </summary>
        public void LeaveWorld(Session session)
        {
            Remove(session);
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
        /// 계정의 캐릭터 목록을 보낸다.
        /// </summary>
        private void SendCharacterList(Session session)
        {
            var list = new CharacterList();
            foreach (CharacterRecord character in _store.List(session.LoginId!))
            {
                list.Characters.Add(new CharacterSummary { Id = (ulong)character.Id, Name = character.Name, CharacterClass = character.Class });
            }

            session.Send(new Packet { CharacterList = list });
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

            session.Player = null;
            _entities.Remove(player);
            _grid.Remove(player);
            _save.Left(player);
        }
    }
}
