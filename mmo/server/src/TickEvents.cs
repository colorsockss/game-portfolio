using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 그 틱의 사건(공격 동작의 시작, 피해, 죽음, 스킬 사용, 진행 중인 일, 효과, 부활, 직선 발사체. 뒤에는 범위 예고)을 난 순서대로 가진다.
    /// 시야 차례가 들어옴·나감·움직임을 보낸 뒤 Deliver가 사건마다 "사건의 대상을 받은 연결 모두와 대상 자신"에게 넣는다.
    /// 받는 연결이 받지 않은 행위자(공격자, 죽인 개체)의 번호는 0으로 싣는다.
    /// </summary>
    internal sealed class TickEvents
    {
        private readonly Grid _grid;
        private readonly List<Event> _events = new List<Event>();
        private readonly HashSet<Entity> _around = new HashSet<Entity>();

        public TickEvents(Grid grid)
        {
            _grid = grid;
        }

        public int Count => _events.Count;

        /// <summary>
        /// 사건 하나. Full은 행위자 번호를 실은 패킷, Anonymous는 그 번호를 0으로 바꾼 패킷이다.
        /// </summary>
        private readonly record struct Event(Entity Target, Entity? Actor, Packet Full, Packet Anonymous);

        public void Swing(Creature attacker, Creature target)
        {
            _events.Add(new Event(
                target,
                attacker,
                new Packet { AttackSwing = new AttackSwing { AttackerId = attacker.Id, TargetId = target.Id } },
                new Packet { AttackSwing = new AttackSwing { TargetId = target.Id } }));
        }

        public void Damaged(Creature attacker, Creature target, uint damage, bool critical)
        {
            var full = new Damaged { AttackerId = attacker.Id, TargetId = target.Id, Damage = damage, Hp = target.Hp, Critical = critical };
            Damaged anonymous = full.Clone();
            anonymous.AttackerId = 0;
            _events.Add(new Event(target, attacker, new Packet { Damaged = full }, new Packet { Damaged = anonymous }));
        }

        public void Died(Creature dead, Creature? killer)
        {
            _events.Add(new Event(
                dead,
                killer,
                new Packet { Died = new Died { Id = dead.Id, KillerId = killer?.Id ?? 0 } },
                new Packet { Died = new Died { Id = dead.Id } }));
        }

        public void Revived(Creature revived)
        {
            Self(revived, new Packet { Revived = new Revived { Id = revived.Id, Hp = revived.Hp, MaxHp = revived.MaxHp } });
        }

        /// <summary>
        /// 스킬 동작의 시작. 대상이 없거나 자기에게 쓴 스킬은 target이 시전자다.
        /// </summary>
        public void SkillUsed(Creature caster, uint skillId, Entity target)
        {
            _events.Add(new Event(
                target,
                caster,
                new Packet { SkillUsed = new SkillUsed { CasterId = caster.Id, SkillId = skillId, TargetId = target.Id } },
                new Packet { SkillUsed = new SkillUsed { SkillId = skillId, TargetId = target.Id } }));
        }

        /// <summary>
        /// 직선 발사체의 스킬 동작의 시작. 대상은 방향만 정하고 확인하지 않으므로 쏜 쪽을 받은 연결과 쏜 쪽 자신에게 보내고, 대상의 번호는
        /// 받는 연결이 받지 않은 개체여도 그대로 싣는다(83). 대상이 없으면 targetId가 시전자다.
        /// </summary>
        public void SkillUsedByCaster(Creature caster, uint skillId, uint targetId)
        {
            Self(caster, new Packet { SkillUsed = new SkillUsed { CasterId = caster.Id, SkillId = skillId, TargetId = targetId } });
        }

        /// <summary>
        /// 직선 발사체가 나감과 끝. 쏜 쪽을 받은 연결과 쏜 쪽 자신에게 간다(83).
        /// </summary>
        public void ProjectileLaunched(Creature caster, ProjectileLaunched launched)
        {
            Self(caster, new Packet { ProjectileLaunched = launched });
        }

        public void ProjectileEnded(Creature caster, uint id)
        {
            Self(caster, new Packet { ProjectileEnded = new ProjectileEnded { Id = id } });
        }

        public void Progress(Creature creature)
        {
            Self(creature, new Packet { Progress = new Progress { Id = creature.Id, State = creature.Progress!.State() } });
        }

        public void ProgressCancelled(Creature creature, FailReason reason)
        {
            Self(creature, new Packet { ProgressCancelled = new ProgressCancelled { Id = creature.Id, Reason = reason } });
        }

        /// <summary>
        /// 보스의 범위 예고(43). 쏜 개체를 받은 연결에 간다.
        /// </summary>
        public void AreaWarning(Creature caster, AreaWarning warning)
        {
            Self(caster, new Packet { AreaWarning = warning });
        }

        public void EffectApplied(Creature creature, uint effectId, uint endTick)
        {
            Self(creature, new Packet { EffectApplied = new EffectApplied { Id = creature.Id, Effect = new EffectState { EffectId = effectId, EndTick = endTick } } });
        }

        /// <summary>
        /// 행위자가 없는 사건(그 개체를 받은 연결과 본인에게 같은 패킷).
        /// </summary>
        private void Self(Entity target, Packet packet)
        {
            _events.Add(new Event(target, null, packet, packet));
        }

        /// <summary>
        /// 사건을 난 순서대로 받는 연결에 넣고 비운다. 받는 연결은 대상 둘레 3×3 시야 칸의 플레이어 가운데 시야 집합에 대상이 든 연결이다
        /// (개체마다 받은 연결의 목록을 두는 것은 52).
        /// </summary>
        public void Deliver()
        {
            foreach (Event @event in _events)
            {
                if (@event.Target is Player self)
                {
                    self.Session.Send(PacketFor(self, @event));
                }

                _around.Clear();
                _grid.CollectAround(@event.Target.Cell, _around);
                foreach (Entity entity in _around)
                {
                    if ((entity is Player observer) && (observer != @event.Target) && observer.Visible.Contains(@event.Target))
                    {
                        observer.Session.Send(PacketFor(observer, @event));
                    }
                }
            }

            _events.Clear();
        }

        private static Packet PacketFor(Player receiver, Event @event)
        {
            return (@event.Actor == null) || (@event.Actor == receiver) || receiver.Visible.Contains(@event.Actor) ? @event.Full : @event.Anonymous;
        }
    }
}
