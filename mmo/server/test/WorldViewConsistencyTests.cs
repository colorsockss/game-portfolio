using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 시야(52)를 옛 규칙과 견준다: 플레이어가 무작위로 옮겨지고 들고 나며 몬스터가 배회하고 소환수가 따라다니는 동안, 틱마다 연결이 받은 개체가 둘레 3×3 시야 칸을
    /// 통째로 본 결과(옛 방식)와 같고, 개체의 받은 연결 목록이 그것과 맞으며, 연결이 받은 EntitiesEnter·EntitiesLeave를 차례로 반영한 것도 같은지 본다.
    /// </summary>
    public partial class WorldTests
    {
        [Fact]
        public void IncrementalViewMatchesTheFullViewUnderRandomChurn()
        {
            World world = SummonWorld();
            var random = new Random(12345);
            var clients = new Dictionary<Session, HashSet<uint>>();
            var sessions = new List<Session>();
            int joined = 0;
            Session Add(CharacterClass characterClass = CharacterClass.Knight)
            {
                Session session = Duelist(world, $"hero_{joined++:D2}", random.Next(-40, 40), random.Next(-40, 40), characterClass);
                sessions.Add(session);
                clients[session] = new HashSet<uint>(session.Player!.Visible.Select(entity => entity.Id));
                return session;
            }

            Session mage = Add(CharacterClass.Mage);
            Call(world, mage);
            for (int i = 0; i < 6; i++)
            {
                Add();
            }

            for (int step = 0; step < 300; step++)
            {
                foreach (Session session in sessions.ToArray())
                {
                    int roll = random.Next(100);
                    if (roll < 25)
                    {
                        // 시야 칸(32 m)을 넘나들게 옮긴다.
                        world.Place(session.Player!, Center(random.Next(-60, 60)), Center(random.Next(-60, 60)));
                    }
                    else if ((roll < 27) && (session != mage))
                    {
                        world.Disconnect(session);
                        sessions.Remove(session);
                        clients.Remove(session);
                    }
                }

                if (random.Next(100) < 10)
                {
                    Add();
                }

                world.Step();
                foreach (Session session in sessions)
                {
                    HashSet<uint> view = clients[session];
                    foreach (Packet packet in session.Outbox)
                    {
                        if (packet.EntitiesLeave != null)
                        {
                            view.ExceptWith(packet.EntitiesLeave.Ids);
                        }

                        if (packet.EntitiesEnter != null)
                        {
                            view.UnionWith(packet.EntitiesEnter.Entities.Select(entity => entity.Id).Where(id => id != session.Player!.Id));
                        }

                        if (packet.EntityMoves != null)
                        {
                            Assert.All(packet.EntityMoves.Entities, move => Assert.Contains(move.Id, view));
                        }
                    }

                    session.Outbox.Clear();
                }

                CheckViews(world, sessions, clients, step);
            }
        }

        private static void CheckViews(World world, List<Session> sessions, Dictionary<Session, HashSet<uint>> clients, int step)
        {
            List<Entity> all = world.AllEntities.ToList();
            foreach (Session session in sessions)
            {
                Player observer = session.Player!;
                var expected = new HashSet<Entity>(all.Where(entity => (entity != observer) && (entity is not Summon) && Grid.Near(entity.Cell, observer.Cell)));
                expected.UnionWith(all.OfType<Summon>().Where(summon => (summon.Owner == observer) || expected.Contains(summon.Owner)));
                Assert.True(expected.SetEquals(observer.Visible), $"step {step}: the view of {observer.Id} differs from the full view");
                Assert.True(clients[session].SetEquals(observer.Visible.Select(entity => entity.Id)), $"step {step}: what {observer.Id} received differs from its view");
            }

            foreach (Entity entity in all)
            {
                var watchers = new HashSet<Player>(sessions.Select(session => session.Player!).Where(player => player.Visible.Contains(entity)));
                Assert.True(watchers.SetEquals(entity.Watchers), $"step {step}: the watchers of {entity.Id} differ from the views");
            }
        }
    }
}
