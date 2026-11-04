using PortfolioIdleRpg.Views;
using TMPro;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 전투 월드의 프리팹(Remote/Battle)을 코드로 만든다. 배우의 임시 클립 묶음(ActorClips)과 스테이지 배경
    /// (Backgrounds)을 먼저 그린다. 다시 실행하면 같은 경로의 프리팹을 덮어쓰므로 GUID와 참조가 그대로다. HP 바 도형의
    /// 스프라이트는 프리팹에 담기지 않고 ActorView가 실행 중에 넣는다. 배치 모드에서는 다음을 쓴다.
    /// <code>
    /// Unity -batchmode -quit -projectPath client
    ///   -executeMethod PortfolioIdleRpg.Editor.BattlePrefabs.Build
    /// </code>
    /// </summary>
    public static class BattlePrefabs
    {
        /// <summary>프리팹을 만드는 폴더의 부모. 패치로 받는 Addressables 원격 그룹이다.</summary>
        private const string ParentFolder = "Assets/Remote";

        /// <summary>프리팹을 만드는 폴더의 이름.</summary>
        private const string FolderName = "Battle";

        /// <summary>HP 바가 몸 위에 놓이는 높이(유닛). ActorView.Setup이 크기에 맞춰 다시 놓는다.</summary>
        private const float BarHeight = 0.7f;

        /// <summary>배우 하나가 보이는 효과 칸의 최대 수.</summary>
        private const int EffectSlots = 4;

        /// <summary>배경의 그리는 순서. 배우(0~4)보다 아래다.</summary>
        private const int BackgroundOrder = -10;

        /// <summary>파티클의 그리는 순서. 발사체(5) 위, 글자(10) 아래다.</summary>
        private const int ParticleOrder = 6;

        /// <summary>무대를 덮는 막의 그리는 순서. 파티클(6) 위, 글자(10) 아래라서 배너는 막 위에 보인다.</summary>
        private const int CoverOrder = 8;

        /// <summary>
        /// 막의 한 변(유닛). 카메라가 보이는 넓이(세로 10유닛 남짓)와 흔들림, 전투 띠에 맞춰 옮겨 간 자리를 다 덮도록 넉넉히 둔다.
        /// </summary>
        private const float CoverSize = 100f;

        /// <summary>
        /// 클립 묶음과 배경을 그리고 Actor.prefab, Projectile.prefab, DamageText.prefab, Stage.prefab을 만들거나 덮어쓴다.
        /// </summary>
        [MenuItem("Tools/Battle/Build Prefabs")]
        public static void Build()
        {
            (SpriteClipSet[] actorClips, SpriteClipSet projectileClips) = ActorClips.Build();
            Sprite[] backgrounds = Backgrounds.Build();
            if (!AssetDatabase.IsValidFolder($"{ParentFolder}/{FolderName}"))
                AssetDatabase.CreateFolder(ParentFolder, FolderName);
            BuildActor(actorClips);
            BuildProjectile(projectileClips);
            BuildDamageText();
            BuildStage(backgrounds);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Battle] Built the prefabs in {ParentFolder}/{FolderName}");
        }

        /// <summary>
        /// 루트에 ViewRefs와 ActorView를 두고 몸(SpriteAnimator), HP 바, 효과 칸(EffectIcons)을 자식으로 둔 배우 프리팹을
        /// 만든다. ViewRefs 항목은 actor와 effects다.
        /// </summary>
        /// <param name="clipSets">ActorView가 이름으로 고르는 클립 묶음. 0번이 기본이다.</param>
        private static void BuildActor(SpriteClipSet[] clipSets)
        {
            var root = new GameObject("Actor", typeof(ViewRefs), typeof(ActorView));
            try
            {
                SpriteRenderer body = AddSprite(root.transform, "Body", Color.white, 0);
                SpriteRenderer hpBack = AddSprite(
                    root.transform, "HpBack", new Color(0.1f, 0.1f, 0.1f), 1);
                SpriteRenderer hpFill = AddSprite(
                    root.transform, "HpFill", new Color(0.35f, 0.85f, 0.35f), 2);
                hpBack.transform.localPosition = new Vector3(0f, BarHeight, 0f);
                hpFill.transform.localPosition = new Vector3(0f, BarHeight, 0f);

                var animator = body.gameObject.AddComponent<SpriteAnimator>();
                Fields.Wire(animator, ("_renderer", body));

                var view = root.GetComponent<ActorView>();
                EffectIcons effects = AddEffectIcons(root.transform);
                Fields.Wire(
                    view, ("_body", body), ("_animator", animator), ("_clipSets", clipSets), ("_effects", effects), ("_hpBack", hpBack),
                    ("_hpFill", hpFill));

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("actor", view), ("effects", effects));
                Save(root, "Actor");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>루트에 ViewRefs, FloatingText, 월드 TextMeshPro를 둔 피해 숫자 프리팹을 만든다.</summary>
        private static void BuildDamageText()
        {
            var root = new GameObject(
                "DamageText", typeof(ViewRefs), typeof(FloatingText), typeof(TextMeshPro));
            try
            {
                var label = root.GetComponent<TextMeshPro>();
                label.text = string.Empty;
                label.fontSize = 8f;
                label.fontStyle = FontStyles.Bold;
                label.alignment = TextAlignmentOptions.Center;
                label.textWrappingMode = TextWrappingModes.NoWrap;
                label.rectTransform.sizeDelta = new Vector2(4f, 1f);
                // 스프라이트(정렬 순서 0~2) 위에 그려진다.
                label.sortingOrder = 10;

                var view = root.GetComponent<FloatingText>();
                Fields.Wire(view, ("_label", label));

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("text", view));
                Save(root, "DamageText");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 루트에 ViewRefs, ProjectileView, SpriteRenderer, SpriteAnimator를 둔 발사체 프리팹을 만든다. ViewRefs 항목은
        /// projectile이다. 배우(정렬 순서 0~4) 위, 글자 아래에 그려진다.
        /// </summary>
        /// <param name="clips">발사체 클립 묶음.</param>
        private static void BuildProjectile(SpriteClipSet clips)
        {
            var root = new GameObject(
                "Projectile", typeof(ViewRefs), typeof(ProjectileView), typeof(SpriteRenderer), typeof(SpriteAnimator));
            try
            {
                var sprite = root.GetComponent<SpriteRenderer>();
                sprite.sortingOrder = 5;
                var animator = root.GetComponent<SpriteAnimator>();
                Fields.Wire(animator, ("_renderer", sprite));

                var view = root.GetComponent<ProjectileView>();
                Fields.Wire(view, ("_renderer", sprite), ("_animator", animator), ("_clips", clips));

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("projectile", view));
                Save(root, "Projectile");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// 루트에 ViewRefs와 StageView를 두고 배경(SpriteRenderer), 파티클(ParticleSystem), 막(SpriteRenderer)을 자식으로
        /// 둔 무대 프리팹을 만든다. ViewRefs 항목은 stage다. 파티클은 배경과 같은 스프라이트 재질로 흰 사각형을 그린다. 막의
        /// 도형 스프라이트는 StageView가 실행 중에 넣는다.
        /// </summary>
        /// <param name="backgrounds">StageView가 이름으로 고르는 배경. 0번이 기본이다.</param>
        private static void BuildStage(Sprite[] backgrounds)
        {
            var root = new GameObject("Stage", typeof(ViewRefs), typeof(StageView));
            try
            {
                SpriteRenderer background = AddSprite(root.transform, "Background", Color.white, BackgroundOrder);
                background.sprite = backgrounds[0];
                // 그림 세 장을 가로로 이어, StageView.Scroll이 반 장까지 밀어도 넓은 화면의 양옆이 비지 않게 한다.
                background.drawMode = SpriteDrawMode.Tiled;
                Vector2 tile = backgrounds[0].bounds.size;
                background.size = new Vector2(3f * tile.x, tile.y);
                ParticleSystem particles = AddParticles(root.transform, background.sharedMaterial);
                SpriteRenderer cover = AddSprite(root.transform, "Cover", Color.clear, CoverOrder);
                cover.transform.localScale = new Vector3(CoverSize, CoverSize, 1f);

                var view = root.GetComponent<StageView>();
                Fields.Wire(view, ("_background", background), ("_backgrounds", backgrounds), ("_particles", particles), ("_cover", cover));

                UiPrefabs.SetRefs(root.GetComponent<ViewRefs>(), ("stage", view));
                Save(root, "Stage");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>
        /// StageView.Burst가 Emit으로만 내뿜는 파티클 시스템을 가진 Particles 자식을 만든다. 시스템은 늘 재생하지만 스스로는
        /// 내뿜지 않고, 파티클은 작은 원에서 사방으로 튀어 떨어지며 줄어든다. deltaTime으로 흐르므로 히트스톱에 함께 멈춘다.
        /// </summary>
        /// <param name="parent">무대의 루트.</param>
        /// <param name="material">파티클을 그리는 재질.</param>
        /// <returns>만든 ParticleSystem.</returns>
        private static ParticleSystem AddParticles(Transform parent, Material material)
        {
            var child = new GameObject("Particles", typeof(ParticleSystem));
            child.transform.SetParent(parent, false);
            var particles = child.GetComponent<ParticleSystem>();
            ParticleSystem.MainModule main = particles.main;
            main.playOnAwake = true;
            main.loop = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.25f, 0.5f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1.5f, 4f);
            main.gravityModifier = 0.5f;
            main.simulationSpace = ParticleSystemSimulationSpace.Local;
            main.maxParticles = 300;
            ParticleSystem.EmissionModule emission = particles.emission;
            emission.enabled = false;
            ParticleSystem.ShapeModule shape = particles.shape;
            shape.shapeType = ParticleSystemShapeType.Circle;
            shape.radius = 0.1f;
            ParticleSystem.SizeOverLifetimeModule size = particles.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f, 1f, 0f));
            var renderer = child.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = material;
            renderer.sortingOrder = ParticleOrder;
            return particles;
        }

        /// <summary>효과 칸과 그 아래의 남은 시간 막대 EffectSlots쌍을 가진 Effects 자식을 만든다.</summary>
        /// <param name="parent">배우의 루트.</param>
        /// <returns>만든 EffectIcons.</returns>
        private static EffectIcons AddEffectIcons(Transform parent)
        {
            var child = new GameObject("Effects", typeof(EffectIcons));
            child.transform.SetParent(parent, false);
            var effects = child.GetComponent<EffectIcons>();
            var icons = new SpriteRenderer[EffectSlots];
            var bars = new SpriteRenderer[EffectSlots];
            for (int i = 0; i < EffectSlots; i++)
            {
                icons[i] = AddSprite(child.transform, $"Icon{i}", Color.white, 3);
                bars[i] = AddSprite(child.transform, $"Bar{i}", Color.white, 4);
            }
            Fields.Wire(effects, ("_icons", icons), ("_bars", bars));
            return effects;
        }

        /// <summary>SpriteRenderer 하나를 가진 자식 오브젝트를 만든다.</summary>
        /// <param name="parent">부모 Transform.</param>
        /// <param name="name">오브젝트 이름.</param>
        /// <param name="color">스프라이트의 색.</param>
        /// <param name="sortingOrder">그리는 순서. 클수록 위에 그려진다.</param>
        /// <returns>만든 SpriteRenderer.</returns>
        private static SpriteRenderer AddSprite(
            Transform parent, string name, Color color, int sortingOrder)
        {
            var child = new GameObject(name, typeof(SpriteRenderer));
            child.transform.SetParent(parent, false);
            var sprite = child.GetComponent<SpriteRenderer>();
            sprite.color = color;
            sprite.sortingOrder = sortingOrder;
            return sprite;
        }

        /// <summary>오브젝트를 폴더의 프리팹으로 저장한다. 있으면 덮어쓰고 지난 파일의 fileID를 그대로 둔다.</summary>
        /// <param name="root">프리팹의 루트.</param>
        /// <param name="name">프리팹 이름(확장자 제외).</param>
        private static void Save(GameObject root, string name) =>
            PrefabIds.Save(root, $"{ParentFolder}/{FolderName}/{name}.prefab");
    }
}
