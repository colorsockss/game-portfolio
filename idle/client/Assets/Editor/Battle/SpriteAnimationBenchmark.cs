using System.Collections.Generic;
using System.Text;
using PortfolioIdleRpg.Views;
using Unity.Profiling;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 배우 수에 따른 프레임 애니메이션 비용을 SpriteAnimator와 Animator Controller로 잰다(61). 플레이 모드에서
    /// Tools/Battle/Measure Sprite Animation을 고르면 배우 N개를 세 가지로 세워 각각 프레임 수만큼 메인 스레드
    /// 시간을 재고 콘솔에 표로 남긴다: 렌더러만(기준), SpriteAnimator, Animator. 둘 다 영웅의 공격 클립(12fps,
    /// 4프레임)을 반복하므로 매 프레임 몇 개의 sprite가 바뀐다. 재는 것은 스크립트 Update(BehaviourUpdate, 게임의
    /// TS 틱도 들어 있어 기준을 뺀다)와 Animator의 메인 스레드 구간(DirectorUpdateAnimationBegin·End)이다.
    /// PlayerLoop는 에디터의 프레임 대기가 들어가 흔들리므로 재지 않고, Animator의 워커 스레드 시간도 들어가지
    /// 않는다. 에디터의 C#은 코드 최적화 모드(표 머리에 적음)에 따라 빌드보다 느리다.
    /// </summary>
    internal static class SpriteAnimationBenchmark
    {
        /// <summary>재는 배우 수.</summary>
        private static readonly int[] s_counts = { 10, 100, 1000 };

        /// <summary>세운 뒤 재기 전에 버리는 프레임 수.</summary>
        private const int WarmupFrames = 30;

        /// <summary>재는 프레임 수.</summary>
        private const int MeasuredFrames = 300;

        /// <summary>재는 프로파일러 마커(카테고리, 이름).</summary>
        private static readonly (ProfilerCategory Category, string Name)[] s_markers =
        {
            (ProfilerCategory.Scripts, "BehaviourUpdate"),
            (ProfilerCategory.Animation, "PreLateUpdate.DirectorUpdateAnimationBegin"),
            (ProfilerCategory.Animation, "PreLateUpdate.DirectorUpdateAnimationEnd"),
        };

        /// <summary>배우를 세우는 방법.</summary>
        private enum Variant
        {
            /// <summary>렌더러만.</summary>
            Static,

            /// <summary>SpriteAnimator.</summary>
            SpriteAnimator,

            /// <summary>Animator Controller.</summary>
            Animator,
        }

        /// <summary>남은 측정. 앞에서부터 하나씩 한다.</summary>
        private static Queue<(int Count, Variant Variant)> s_queue;

        /// <summary>재는 중인 배우의 부모. 없으면 null이다.</summary>
        private static GameObject s_root;

        /// <summary>재는 중인 마커의 기록기.</summary>
        private static ProfilerRecorder[] s_recorders;

        /// <summary>지금 측정을 시작한 프레임 번호.</summary>
        private static int s_startFrame;

        /// <summary>지금 측정에 쓸 기록기를 켠 프레임 번호. 아직 켜지 않았으면 -1이다.</summary>
        private static int s_recordFrame;

        /// <summary>지금 측정.</summary>
        private static (int Count, Variant Variant) s_current;

        /// <summary>결과 표.</summary>
        private static StringBuilder s_report;

        /// <summary>같은 배우 수의 기준(렌더러만)에서 잰 마커의 합(ms).</summary>
        private static double s_baseline;

        /// <summary>Animator가 반복할 클립을 쥔 컨트롤러.</summary>
        private static AnimatorController s_controller;

        /// <summary>SpriteAnimator가 반복할 클립.</summary>
        private static SpriteClip s_clip;

        /// <summary>측정을 시작한다. 플레이 모드에서만 연다.</summary>
        [MenuItem("Tools/Battle/Measure Sprite Animation")]
        public static void Run()
        {
            if (!EditorApplication.isPlaying)
            {
                Debug.LogWarning("[Battle] Measure Sprite Animation runs in play mode.");
                return;
            }
            var set = AssetDatabase.LoadAssetAtPath<SpriteClipSet>($"{ActorClips.Folder}/hero.asset");
            SpriteClip attack = set.Find("attack");
            s_clip = new SpriteClip
            {
                Name = "bench",
                Frames = attack.Frames,
                FramesPerSecond = attack.FramesPerSecond,
                Loop = true,
            };
            s_controller = Controller(s_clip);
            s_queue = new Queue<(int Count, Variant Variant)>();
            foreach (int count in s_counts)
            {
                s_queue.Enqueue((count, Variant.Static));
                s_queue.Enqueue((count, Variant.SpriteAnimator));
                s_queue.Enqueue((count, Variant.Animator));
            }
            s_report = new StringBuilder(
                "[Battle] Sprite animation cost, main thread ms per frame (mean of " +
                $"{MeasuredFrames} frames), code optimization " +
                $"{UnityEditor.Compilation.CompilationPipeline.codeOptimization}\n");
            s_report.Append("actors\tvariant");
            foreach ((ProfilerCategory _, string name) in s_markers)
                s_report.Append($"\t{name}");
            s_report.Append("\tsum\tus per actor over Static\n");
            Next();
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
        }

        /// <summary>다음 측정의 배우를 세운다. 남은 측정이 없으면 결과를 남기고 끝낸다.</summary>
        private static void Next()
        {
            if (s_root != null)
                Object.Destroy(s_root);
            if (s_queue.Count == 0)
            {
                EditorApplication.update -= Tick;
                Debug.Log(s_report.ToString());
                return;
            }
            s_current = s_queue.Dequeue();
            s_root = new GameObject($"SpriteAnimationBenchmark {s_current.Count} {s_current.Variant}");
            for (int i = 0; i < s_current.Count; i++)
            {
                var actor = new GameObject($"Actor {i}", typeof(SpriteRenderer));
                actor.transform.SetParent(s_root.transform, false);
                // 화면 밖이 아니라 그리는 비용도 셋이 같게 한 줄로 겹쳐 세운다.
                actor.transform.localPosition = new Vector3((i % 20) * 0.1f, 0f, 0f);
                var renderer = actor.GetComponent<SpriteRenderer>();
                renderer.sprite = s_clip.Frames[0];
                switch (s_current.Variant)
                {
                    case Variant.SpriteAnimator:
                        var animator = actor.AddComponent<SpriteAnimator>();
                        var serialized = new SerializedObject(animator);
                        serialized.FindProperty("_renderer").objectReferenceValue = renderer;
                        serialized.ApplyModifiedPropertiesWithoutUndo();
                        animator.Play(s_clip, i * 0.013f);
                        break;
                    case Variant.Animator:
                        var controlled = actor.AddComponent<Animator>();
                        controlled.runtimeAnimatorController = s_controller;
                        controlled.Play("bench", 0, (i * 0.013f) % 1f);
                        break;
                }
            }
            s_startFrame = Time.frameCount;
            s_recordFrame = -1;
        }

        /// <summary>프레임마다 측정을 진행한다. 몸풀이가 끝나면 기록기를 켜고, 다 쟀으면 결과를 적는다.</summary>
        private static void Tick()
        {
            if (!EditorApplication.isPlaying)
            {
                EditorApplication.update -= Tick;
                return;
            }
            int elapsed = Time.frameCount - s_startFrame;
            if ((s_recordFrame < 0) && (elapsed >= WarmupFrames))
            {
                s_recorders = new ProfilerRecorder[s_markers.Length];
                for (int i = 0; i < s_markers.Length; i++)
                {
                    s_recorders[i] = ProfilerRecorder.StartNew(
                        s_markers[i].Category, s_markers[i].Name, MeasuredFrames);
                }
                s_recordFrame = Time.frameCount;
                return;
            }
            if ((s_recordFrame < 0) || (Time.frameCount - s_recordFrame <= MeasuredFrames))
                return;

            s_report.Append($"{s_current.Count}\t{s_current.Variant}");
            double sum = 0d;
            foreach (ProfilerRecorder recorder in s_recorders)
            {
                double mean = recorder.Valid ? Mean(recorder) : 0d;
                sum += mean;
                s_report.Append(recorder.Valid ? $"\t{mean:F3}" : "\tn/a");
                recorder.Dispose();
            }
            if (s_current.Variant == Variant.Static)
                s_baseline = sum;
            double perActor = (sum - s_baseline) * 1000d / s_current.Count;
            s_report.Append($"\t{sum:F3}\t{perActor:F2}\n");
            Next();
        }

        /// <summary>기록기에 남은 표본(나노초)의 평균(ms).</summary>
        /// <param name="recorder">기록기.</param>
        /// <returns>평균(ms).</returns>
        private static double Mean(ProfilerRecorder recorder)
        {
            int count = recorder.Count;
            if (count == 0)
                return 0d;
            double sum = 0d;
            for (int i = 0; i < count; i++)
                sum += recorder.GetSample(i).Value;
            return sum / count / 1e6d;
        }

        /// <summary>클립 하나를 반복하는 상태 "bench"만 가진 컨트롤러를 메모리에 만든다.</summary>
        /// <param name="source">프레임과 초당 프레임 수를 가져올 클립.</param>
        /// <returns>만든 컨트롤러.</returns>
        private static AnimatorController Controller(SpriteClip source)
        {
            var clip = new AnimationClip { name = "bench", frameRate = source.FramesPerSecond };
            var keys = new ObjectReferenceKeyframe[source.Frames.Length + 1];
            for (int i = 0; i < source.Frames.Length; i++)
                keys[i] = new ObjectReferenceKeyframe { time = i / source.FramesPerSecond, value = source.Frames[i] };
            // 마지막 프레임도 한 프레임 길이만큼 보이게 끝에 같은 프레임을 한 번 더 둔다.
            keys[source.Frames.Length] = new ObjectReferenceKeyframe
            {
                time = source.Duration,
                value = source.Frames[source.Frames.Length - 1],
            };
            AnimationUtility.SetObjectReferenceCurve(
                clip, EditorCurveBinding.PPtrCurve(string.Empty, typeof(SpriteRenderer), "m_Sprite"), keys);
            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(clip, settings);

            var controller = new AnimatorController { name = "bench" };
            controller.AddLayer("Base");
            AnimatorState state = controller.layers[0].stateMachine.AddState("bench");
            state.motion = clip;
            return controller;
        }
    }
}
