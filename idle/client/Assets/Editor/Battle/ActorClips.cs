using System.Collections.Generic;
using System.IO;
using System.Linq;
using PortfolioIdleRpg.Views;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 배우와 발사체의 클립 묶음(Assets/Battle/Clips의 hero, monster, boss, summon, projectiles)을 만든다. 그림
    /// (ActorArt, Assets/Battle/Actors/묶음 이름)이 있는 묶음은 그 그림의 프레임을 쓰고, 없는 묶음은 그림이 생기기 전(62–63)까지
    /// 쓰는 임시 클립을 코드로 그린다. Names에 없는 그림 폴더에는 걷기를 포함하고, special.png가 있으면 보스 전용 공격도
    /// 더한다. 임시 그림 한 프레임은 24×24 픽셀이고 대기의 몸이 약 14픽셀(1유닛)이다. 흰 몸에 어두운 눈과 표시를 그려 ActorView가 입히는
    /// 색이 몸에만 보이게 한다. 텍스처와 스프라이트는 묶음 에셋의 하위 에셋이다. 다시 실행하면 같은 경로의
    /// 묶음을 다시 그리므로 묶음의 GUID는 그대로이고, 하위 에셋은 새로 만든다.
    /// </summary>
    internal static class ActorClips
    {
        /// <summary>묶음을 두는 폴더.</summary>
        internal const string Folder = "Assets/Battle/Clips";

        /// <summary>프레임 한 변의 픽셀 수. 몸 밖의 휘두름 자국과 반짝임이 들어갈 만큼 몸보다 크다.</summary>
        private const int FrameSize = 24;

        /// <summary>배우의 유닛당 픽셀 수. 대기의 몸(14픽셀)이 도형 배우처럼 한 변 1유닛이다.</summary>
        private const int PixelsPerUnit = 14;

        /// <summary>발사체의 유닛당 픽셀 수. 프레임 한 변이 1유닛이다.</summary>
        private const int ProjectilePixelsPerUnit = 24;

        /// <summary>몸의 바닥이 놓이는 픽셀 줄. 대기의 몸이 프레임(피벗) 가운데에 온다.</summary>
        private const int Ground = 6;

        /// <summary>몸의 테두리 색.</summary>
        private static readonly Color s_outline = new Color(0.55f, 0.55f, 0.55f, 1f);

        /// <summary>눈과 입의 색.</summary>
        private static readonly Color s_feature = new Color(0.1f, 0.1f, 0.12f, 1f);

        /// <summary>
        /// 만드는 묶음의 이름. 묶음 에셋의 이름이 곧 TS가 ActorView.Setup에 넘기는 키이고, 0번이 키가 맞는 묶음이
        /// 없을 때 쓰는 묶음이다.
        /// </summary>
        internal static readonly string[] Names = { "hero", "monster", "boss", "summon" };

        /// <summary>눈의 모양.</summary>
        private enum Eyes
        {
            /// <summary>뜬 눈.</summary>
            Open,

            /// <summary>감은 눈(가로줄).</summary>
            Closed,

            /// <summary>쓰러진 눈(X).</summary>
            Cross,

            /// <summary>눈 없음.</summary>
            None,
        }

        /// <summary>몸 밖에 더 그리는 표시.</summary>
        private enum Mark
        {
            /// <summary>표시 없음.</summary>
            None,

            /// <summary>앞쪽의 휘두름 자국.</summary>
            Swipe,

            /// <summary>머리 위의 반짝임(시전 준비).</summary>
            Sparkle,

            /// <summary>사방으로 퍼지는 빛(시전 타격).</summary>
            Burst,

            /// <summary>머리 위의 가시(보스 전용).</summary>
            Spikes,

            /// <summary>벌린 입과 휘두름 자국(보스 전용 타격).</summary>
            Roar,
        }

        /// <summary>프레임에 그리는 것. Body 밖은 발사체다.</summary>
        private enum Shape
        {
            /// <summary>배우의 몸(크기, 옮김, 눈, 표시).</summary>
            Body,

            /// <summary>오른쪽을 향한 화살.</summary>
            Arrow,

            /// <summary>빛나는 구(화염구).</summary>
            Orb,

            /// <summary>출렁이는 덩어리(독).</summary>
            Blob,

            /// <summary>구덩이가 있는 바위(운석).</summary>
            Rock,
        }

        /// <summary>Tools/Battle/Build Prefabs가 프리팹보다 먼저 부른다.</summary>
        /// <returns>Names 순서의 배우 묶음 뒤에 몬스터 그림의 묶음, 그리고 발사체 묶음.</returns>
        internal static (SpriteClipSet[] Actors, SpriteClipSet Projectiles) Build()
        {
            CreateFolders(Folder);
            var sets = new List<SpriteClipSet>
            {
                ActorArt.Has("hero") ? SaveArt("hero", Hero()) : Save("hero", PixelsPerUnit, Hero()),
                Save("monster", PixelsPerUnit, Monster()),
                Save("boss", PixelsPerUnit, Boss()),
                // 모든 원본은 오른쪽을 보고, ActorView.Setup의 방향에 따라 몸만 반전한다.
                Save("summon", PixelsPerUnit, Monster()),
            };
            foreach (string name in ActorArt.Sets().Where(name => !Names.Contains(name)))
            {
                List<ClipSpec> clips = File.Exists($"{ActorArt.Folder}/{name}/special.png") ? Boss() : Monster();
                clips.Add(Walk());
                sets.Add(SaveArt(name, clips));
            }
            return (sets.ToArray(), Save("projectiles", ProjectilePixelsPerUnit, Projectiles()));
        }

        /// <summary>발사체: 0번 구(이름이 맞는 클립이 없을 때), 화살, 독 덩어리, 운석. 모두 반복한다.</summary>
        /// <returns>클립의 명세.</returns>
        private static List<ClipSpec> Projectiles() => new List<ClipSpec>
        {
            new ClipSpec("orb", 8f, true, -1) { new Frame(Shape.Orb, 0), new Frame(Shape.Orb, 1) },
            new ClipSpec("arrow", 8f, true, -1) { new Frame(Shape.Arrow, 0), new Frame(Shape.Arrow, 1) },
            new ClipSpec("blob", 6f, true, -1) { new Frame(Shape.Blob, 0), new Frame(Shape.Blob, 1) },
            new ClipSpec("rock", 6f, true, -1) { new Frame(Shape.Rock, 0), new Frame(Shape.Rock, 1) },
        };

        /// <summary>영웅: 걷기, 공격, 시전, 피격, 사망. 화면 밖에서 나오지 않아 등장 클립이 없다.</summary>
        /// <returns>클립의 명세.</returns>
        private static List<ClipSpec> Hero() => new List<ClipSpec>
        {
            Idle(),
            Walk(),
            Attack(),
            new ClipSpec("cast", 10f, false, 2)
            {
                new Frame(14, 15, 0, 0, Eyes.Open, Mark.Sparkle),
                new Frame(13, 16, 0, 0, Eyes.Closed, Mark.Sparkle),
                new Frame(16, 15, 1, 0, Eyes.Open, Mark.Burst),
                new Frame(14, 14, 0, 0, Eyes.Open, Mark.None),
            },
            Hit(),
            Die(),
        };

        /// <summary>몬스터: 등장(뛰어 옴. 걷기도 이것으로 대신한다), 공격, 피격, 사망. 시전은 공격으로 대신한다.</summary>
        /// <returns>클립의 명세.</returns>
        private static List<ClipSpec> Monster() => new List<ClipSpec>
        {
            Idle(),
            Enter(),
            Attack(),
            Hit(),
            Die(),
        };

        /// <summary>보스: 몬스터의 클립에 보스 전용(special) 포효 공격을 더한다.</summary>
        /// <returns>클립의 명세.</returns>
        private static List<ClipSpec> Boss()
        {
            List<ClipSpec> clips = Monster();
            clips.Add(new ClipSpec("special", 8f, false, 3)
            {
                new Frame(15, 15, 0, 0, Eyes.Open, Mark.Spikes),
                new Frame(16, 16, -1, 0, Eyes.Open, Mark.Spikes),
                new Frame(17, 16, -1, 0, Eyes.Closed, Mark.Spikes),
                new Frame(18, 12, 1, 0, Eyes.Open, Mark.Roar),
                new Frame(15, 13, 0, 0, Eyes.Open, Mark.None),
            });
            return clips;
        }

        /// <summary>숨 쉬듯 커졌다 작아지는 대기(반복).</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Idle() => new ClipSpec("idle", 4f, true, -1)
        {
            new Frame(14, 13, 0, 0, Eyes.Open, Mark.None),
            new Frame(14, 14, 0, 0, Eyes.Open, Mark.None),
        };

        /// <summary>몸이 오르내리는 걷기(반복).</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Walk() => new ClipSpec("walk", 8f, true, -1)
        {
            new Frame(14, 13, 0, 1, Eyes.Open, Mark.None),
            new Frame(14, 14, 0, 0, Eyes.Open, Mark.None),
            new Frame(14, 13, 0, 1, Eyes.Open, Mark.None),
            new Frame(14, 14, 0, 0, Eyes.Open, Mark.None),
        };

        /// <summary>깡충 뛰며 오는 등장(반복).</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Enter() => new ClipSpec("enter", 8f, true, -1)
        {
            new Frame(13, 14, 0, 2, Eyes.Open, Mark.None),
            new Frame(15, 12, 0, 0, Eyes.Open, Mark.None),
        };

        /// <summary>뒤로 움츠렸다가 앞으로 늘어나며 휘두르는 공격. 타격은 2번 프레임(선딜레이 1/6초)이다.</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Attack() => new ClipSpec("attack", 12f, false, 2)
        {
            new Frame(13, 14, -1, 0, Eyes.Open, Mark.None),
            new Frame(12, 14, -2, 0, Eyes.Closed, Mark.None),
            new Frame(16, 12, 1, 0, Eyes.Open, Mark.Swipe),
            new Frame(15, 13, 1, 0, Eyes.Open, Mark.None),
        };

        /// <summary>납작하게 눌렸다 돌아오는 피격.</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Hit() => new ClipSpec("hit", 12f, false, -1)
        {
            new Frame(16, 11, -1, 0, Eyes.Closed, Mark.None),
            new Frame(15, 12, 0, 0, Eyes.Closed, Mark.None),
        };

        /// <summary>바닥으로 퍼지는 사망. 마지막 프레임에 멈춘다.</summary>
        /// <returns>클립의 명세.</returns>
        private static ClipSpec Die() => new ClipSpec("die", 10f, false, -1)
        {
            new Frame(15, 12, 0, 0, Eyes.Cross, Mark.None),
            new Frame(17, 8, 0, 0, Eyes.Cross, Mark.None),
            new Frame(18, 4, 0, 0, Eyes.None, Mark.None),
        };

        /// <summary>오른쪽을 보는 원본으로 묶음 하나를 그려 에셋으로 저장한다.</summary>
        /// <param name="name">묶음(에셋)의 이름.</param>
        /// <param name="pixelsPerUnit">스프라이트의 유닛당 픽셀 수.</param>
        /// <param name="clips">클립의 명세.</param>
        /// <returns>저장한 묶음.</returns>
        private static SpriteClipSet Save(string name, int pixelsPerUnit, List<ClipSpec> clips)
        {
            SpriteClipSet set = Prepare(name);
            int count = 0;
            foreach (ClipSpec clip in clips)
                count += clip.Frames.Count;
            var texture = new Texture2D(FrameSize * count, FrameSize, TextureFormat.RGBA32, false)
            {
                name = name,
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            texture.SetPixels32(new Color32[texture.width * texture.height]);
            AssetDatabase.AddObjectToAsset(texture, set);

            var serialized = new SerializedObject(set);
            SerializedProperty list = serialized.FindProperty("_clips");
            list.arraySize = clips.Count;
            int column = 0;
            for (int c = 0; c < clips.Count; c++)
            {
                ClipSpec clip = clips[c];
                var sprites = new Sprite[clip.Frames.Count];
                for (int f = 0; f < clip.Frames.Count; f++)
                {
                    Draw(texture, column * FrameSize, clip.Frames[f]);
                    sprites[f] = Sprite.Create(
                        texture, new Rect(column * FrameSize, 0f, FrameSize, FrameSize),
                        new Vector2(0.5f, 0.5f), pixelsPerUnit, 0, SpriteMeshType.FullRect);
                    sprites[f].name = $"{name}_{clip.Name}_{f}";
                    AssetDatabase.AddObjectToAsset(sprites[f], set);
                    column++;
                }
                SetClip(list.GetArrayElementAtIndex(c), clip, sprites);
            }
            texture.Apply();
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            return set;
        }

        /// <summary>
        /// 그림(ActorArt)의 프레임으로 묶음을 저장한다. 클립의 이름, 초당 프레임, 반복, 타격 프레임은 임시 클립의 명세와 같고
        /// 프레임 수가 다르면 ActorArt가 던진다.
        /// </summary>
        /// <param name="name">묶음(에셋)의 이름이자 그림 폴더의 이름.</param>
        /// <param name="clips">클립의 명세. 프레임의 모양은 쓰지 않고 수만 쓴다.</param>
        /// <returns>저장한 묶음.</returns>
        private static SpriteClipSet SaveArt(string name, List<ClipSpec> clips)
        {
            SpriteClipSet set = Prepare(name);
            var serialized = new SerializedObject(set);
            SerializedProperty list = serialized.FindProperty("_clips");
            list.arraySize = clips.Count;
            for (int c = 0; c < clips.Count; c++)
                SetClip(list.GetArrayElementAtIndex(c), clips[c], ActorArt.Import(name, clips[c].Name, clips[c].Frames.Count));
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            return set;
        }

        /// <summary>경로의 묶음을 불러오거나 만들고, 전에 그린 하위 에셋(텍스처, 스프라이트)을 지운다.</summary>
        /// <param name="name">묶음(에셋)의 이름.</param>
        /// <returns>빈 묶음.</returns>
        private static SpriteClipSet Prepare(string name)
        {
            string path = $"{Folder}/{name}.asset";
            var set = AssetDatabase.LoadAssetAtPath<SpriteClipSet>(path);
            if (set == null)
            {
                set = ScriptableObject.CreateInstance<SpriteClipSet>();
                AssetDatabase.CreateAsset(set, path);
            }
            foreach (Object old in AssetDatabase.LoadAllAssetRepresentationsAtPath(path))
            {
                AssetDatabase.RemoveObjectFromAsset(old);
                Object.DestroyImmediate(old, true);
            }
            return set;
        }

        /// <summary>묶음의 클립 칸 하나를 명세와 프레임으로 채운다.</summary>
        /// <param name="entry">묶음의 _clips 원소.</param>
        /// <param name="clip">클립의 명세.</param>
        /// <param name="sprites">프레임 스프라이트.</param>
        private static void SetClip(SerializedProperty entry, ClipSpec clip, Sprite[] sprites)
        {
            entry.FindPropertyRelative("Name").stringValue = clip.Name;
            entry.FindPropertyRelative("FramesPerSecond").floatValue = clip.FramesPerSecond;
            entry.FindPropertyRelative("Loop").boolValue = clip.Loop;
            entry.FindPropertyRelative("ImpactFrame").intValue = clip.ImpactFrame;
            Fields.Set(entry.FindPropertyRelative("Frames"), sprites);
        }

        /// <summary>프레임 하나를 텍스처의 <paramref name="left"/> 열부터 그린다.</summary>
        /// <param name="texture">그릴 텍스처.</param>
        /// <param name="left">프레임의 왼쪽 픽셀 열.</param>
        /// <param name="frame">프레임의 명세.</param>
        private static void Draw(Texture2D texture, int left, Frame frame)
        {
            if (frame.Shape != Shape.Body)
            {
                DrawProjectile(texture, left, frame.Shape, frame.Phase);
                return;
            }

            // 몸은 가운데에서 오른쪽으로 dx만큼 옮긴 사각형이고 모서리 한 픽셀씩을 깎는다.
            int x0 = left + ((FrameSize - frame.Width) / 2) + frame.DeltaX;
            int y0 = Ground + frame.DeltaY;
            int x1 = x0 + frame.Width - 1;
            int y1 = y0 + frame.Height - 1;
            for (int x = x0; x <= x1; x++)
            {
                for (int y = y0; y <= y1; y++)
                {
                    bool corner = ((x == x0) || (x == x1)) && ((y == y0) || (y == y1));
                    if (corner)
                        continue;
                    bool edge = (x == x0) || (x == x1) || (y == y0) || (y == y1);
                    Put(texture, left, x, y, edge ? s_outline : Color.white);
                }
            }

            // 눈은 바라보는 쪽 위에 두 개다.
            int eyeY = y1 - 3;
            int front = x1 - 3;
            int back = front - 3;
            foreach (int eyeX in new[] { front, back })
            {
                switch (frame.Eyes)
                {
                    case Eyes.Open:
                        Put(texture, left, eyeX, eyeY, s_feature);
                        Put(texture, left, eyeX, eyeY + 1, s_feature);
                        break;
                    case Eyes.Closed:
                        Put(texture, left, eyeX - 1, eyeY, s_feature);
                        Put(texture, left, eyeX, eyeY, s_feature);
                        break;
                    case Eyes.Cross:
                        Put(texture, left, eyeX - 1, eyeY - 1, s_feature);
                        Put(texture, left, eyeX + 1, eyeY + 1, s_feature);
                        Put(texture, left, eyeX - 1, eyeY + 1, s_feature);
                        Put(texture, left, eyeX + 1, eyeY - 1, s_feature);
                        Put(texture, left, eyeX, eyeY, s_feature);
                        break;
                }
            }

            int middle = (x0 + x1) / 2;
            int tip = x1 + 1;
            switch (frame.Mark)
            {
                case Mark.Swipe:
                case Mark.Roar:
                    // 앞쪽에 위에서 아래로 휘는 호.
                    int[] bulge = { 0, 1, 2, 2, 2, 1, 0 };
                    for (int step = 0; step < bulge.Length; step++)
                        Put(texture, left, tip + bulge[step], y1 + 1 - step, Color.white);
                    if (frame.Mark == Mark.Roar)
                    {
                        for (int x = front - 2; x <= front + 1; x++)
                            Put(texture, left, x, eyeY - 3, s_feature);
                    }
                    break;
                case Mark.Sparkle:
                    Put(texture, left, middle, y1 + 2, Color.white);
                    Put(texture, left, middle - 1, y1 + 2, Color.white);
                    Put(texture, left, middle, y1 + 1, Color.white);
                    break;
                case Mark.Burst:
                    Put(texture, left, x0 - 1, y1 + 1, Color.white);
                    Put(texture, left, x1 + 1, y1 + 1, Color.white);
                    Put(texture, left, middle, y1 + 2, Color.white);
                    Put(texture, left, x0 - 1, y0 + 2, Color.white);
                    Put(texture, left, x1 + 1, y0 + 2, Color.white);
                    break;
                case Mark.Spikes:
                    for (int x = x0 + 2; x <= x1 - 2; x += 3)
                        Put(texture, left, x, y1 + 1, s_outline);
                    break;
            }
        }

        /// <summary>발사체 프레임 하나를 프레임 가운데에 그린다. 화살은 오른쪽을 향하고 ProjectileView가 돌린다.</summary>
        /// <param name="texture">그릴 텍스처.</param>
        /// <param name="left">프레임의 왼쪽 픽셀 열.</param>
        /// <param name="shape">그릴 것.</param>
        /// <param name="phase">반복 클립의 몇째 프레임인지(0, 1).</param>
        private static void DrawProjectile(Texture2D texture, int left, Shape shape, int phase)
        {
            int middle = FrameSize / 2;
            switch (shape)
            {
                case Shape.Arrow:
                    for (int x = left + 4; x <= left + 17; x++)
                    {
                        Put(texture, left, x, middle, Color.white);
                        Put(texture, left, x, middle - 1, s_outline);
                    }
                    // 촉은 오른쪽으로 좁아지는 삼각형이다.
                    for (int step = 0; step < 4; step++)
                    {
                        for (int y = middle - 3 + step; y <= middle + 2 - step; y++)
                            Put(texture, left, left + 18 + step, y, Color.white);
                    }
                    // 깃은 두 프레임에 걸쳐 한 칸씩 흔들린다.
                    for (int x = left + 3 + phase; x <= left + 5 + phase; x++)
                    {
                        Put(texture, left, x, middle + 2, s_outline);
                        Put(texture, left, x, middle - 3, s_outline);
                    }
                    break;
                case Shape.Orb:
                    Ellipse(texture, left, middle, middle, 5 + phase, 5 + phase);
                    Put(texture, left, left + middle - 2, middle + 2, s_feature);
                    break;
                case Shape.Blob:
                    Ellipse(texture, left, middle, middle, 5 + phase, 5 - phase);
                    Put(texture, left, left + middle, middle - 6 + phase, Color.white);
                    break;
                case Shape.Rock:
                    Ellipse(texture, left, middle, middle, 8, 8);
                    int turn = (phase == 0) ? 1 : -1;
                    Put(texture, left, left + middle - (3 * turn), middle + 2, s_feature);
                    Put(texture, left, left + middle + (2 * turn), middle - 3, s_feature);
                    Put(texture, left, left + middle + (3 * turn), middle + 3, s_feature);
                    break;
            }
        }

        /// <summary>흰 타원을 테두리와 함께 칠한다.</summary>
        /// <param name="texture">그릴 텍스처.</param>
        /// <param name="left">프레임의 왼쪽 픽셀 열.</param>
        /// <param name="centerX">프레임 안의 가운데 열.</param>
        /// <param name="centerY">가운데 줄.</param>
        /// <param name="radiusX">가로 반지름(픽셀).</param>
        /// <param name="radiusY">세로 반지름(픽셀).</param>
        private static void Ellipse(Texture2D texture, int left, int centerX, int centerY, int radiusX, int radiusY)
        {
            for (int x = -radiusX; x <= radiusX; x++)
            {
                for (int y = -radiusY; y <= radiusY; y++)
                {
                    float distance = ((x * x) / (float)(radiusX * radiusX)) + ((y * y) / (float)(radiusY * radiusY));
                    // 가장자리의 한 점씩 튀어나온 픽셀은 버린다.
                    if (distance > 0.92f)
                        continue;
                    Put(texture, left, left + centerX + x, centerY + y, (distance > 0.6f) ? s_outline : Color.white);
                }
            }
        }

        /// <summary>프레임 안의 픽셀 하나를 칠한다. 프레임 밖이면 칠하지 않는다.</summary>
        /// <param name="texture">그릴 텍스처.</param>
        /// <param name="left">프레임의 왼쪽 픽셀 열.</param>
        /// <param name="x">텍스처의 픽셀 열.</param>
        /// <param name="y">텍스처의 픽셀 줄.</param>
        /// <param name="color">칠할 색.</param>
        private static void Put(Texture2D texture, int left, int x, int y, Color color)
        {
            if ((x < left) || (x >= left + FrameSize) || (y < 0) || (y >= FrameSize))
                return;
            texture.SetPixel(x, y, color);
        }

        /// <summary><paramref name="path"/>의 폴더를 차례로 만든다.</summary>
        /// <param name="path">Assets로 시작하는 폴더 경로.</param>
        private static void CreateFolders(string path)
        {
            string parent = "Assets";
            foreach (string part in path.Substring("Assets/".Length).Split('/'))
            {
                string folder = $"{parent}/{part}";
                if (!AssetDatabase.IsValidFolder(folder))
                    AssetDatabase.CreateFolder(parent, part);
                parent = folder;
            }
        }

        /// <summary>클립 하나의 명세. 컬렉션 초기화로 프레임을 차례로 적는다.</summary>
        private sealed class ClipSpec : IEnumerable<Frame>
        {
            /// <summary>클립을 만든다.</summary>
            /// <param name="name">상태 이름.</param>
            /// <param name="framesPerSecond">초당 프레임 수.</param>
            /// <param name="loop">반복하는지.</param>
            /// <param name="impactFrame">타격 프레임 번호. 타격이 없으면 -1이다.</param>
            public ClipSpec(string name, float framesPerSecond, bool loop, int impactFrame)
            {
                Name = name;
                FramesPerSecond = framesPerSecond;
                Loop = loop;
                ImpactFrame = impactFrame;
            }

            /// <summary>상태 이름.</summary>
            public string Name { get; }

            /// <summary>초당 프레임 수.</summary>
            public float FramesPerSecond { get; }

            /// <summary>반복하는지.</summary>
            public bool Loop { get; }

            /// <summary>타격 프레임 번호. 타격이 없으면 -1이다.</summary>
            public int ImpactFrame { get; }

            /// <summary>차례로 보일 프레임.</summary>
            public List<Frame> Frames { get; } = new List<Frame>();

            /// <summary>프레임을 더한다(컬렉션 초기화).</summary>
            /// <param name="frame">더할 프레임.</param>
            public void Add(Frame frame) => Frames.Add(frame);

            /// <inheritdoc/>
            public IEnumerator<Frame> GetEnumerator() => Frames.GetEnumerator();

            /// <inheritdoc/>
            System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() =>
                GetEnumerator();
        }

        /// <summary>프레임 하나의 명세: 몸의 크기와 옮김, 눈, 표시. 발사체면 그 모양과 차례다.</summary>
        private readonly struct Frame
        {
            /// <summary>발사체 프레임을 만든다.</summary>
            /// <param name="shape">발사체의 모양.</param>
            /// <param name="phase">반복 클립의 몇째 프레임인지(0, 1).</param>
            public Frame(Shape shape, int phase)
                : this(0, 0, 0, 0, Eyes.None, Mark.None)
            {
                Shape = shape;
                Phase = phase;
            }

            /// <summary>프레임을 만든다.</summary>
            /// <param name="width">몸의 너비(픽셀).</param>
            /// <param name="height">몸의 높이(픽셀).</param>
            /// <param name="deltaX">바라보는 쪽으로 옮긴 픽셀 수.</param>
            /// <param name="deltaY">위로 옮긴 픽셀 수.</param>
            /// <param name="eyes">눈의 모양.</param>
            /// <param name="mark">더 그리는 표시.</param>
            public Frame(int width, int height, int deltaX, int deltaY, Eyes eyes, Mark mark)
            {
                Width = width;
                Height = height;
                DeltaX = deltaX;
                DeltaY = deltaY;
                Eyes = eyes;
                Mark = mark;
                Shape = Shape.Body;
                Phase = 0;
            }

            /// <summary>몸의 너비(픽셀).</summary>
            public int Width { get; }

            /// <summary>몸의 높이(픽셀).</summary>
            public int Height { get; }

            /// <summary>바라보는 쪽으로 옮긴 픽셀 수.</summary>
            public int DeltaX { get; }

            /// <summary>위로 옮긴 픽셀 수.</summary>
            public int DeltaY { get; }

            /// <summary>눈의 모양.</summary>
            public Eyes Eyes { get; }

            /// <summary>더 그리는 표시.</summary>
            public Mark Mark { get; }

            /// <summary>그리는 것. Body면 위의 몸이다.</summary>
            public Shape Shape { get; }

            /// <summary>발사체 반복 클립의 몇째 프레임인지.</summary>
            public int Phase { get; }
        }
    }
}
