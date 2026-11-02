using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// WorldFacade의 인스턴스가 올라가는 전투 월드: 루트 오브젝트와 그 아래 직교 카메라 하나로
    /// 이뤄지며, 처음 쓸 때 만든다. UI 캔버스(Screen Space Overlay)는 이 카메라 위에 그려진다.
    /// </summary>
    internal static class WorldRoot
    {
        /// <summary>월드 루트 오브젝트의 이름.</summary>
        private const string RootName = "BattleWorld";

        /// <summary>기준 해상도(UiRoot.s_referenceResolution)의 화면에서 보이는 세로의 절반(월드 단위).</summary>
        private const float ReferenceOrthographicSize = 5f;

        /// <summary>월드 카메라의 배경색.</summary>
        private static readonly Color s_background = new Color(0.12f, 0.14f, 0.18f);

        /// <summary>월드의 루트 오브젝트. 아직 만들지 않았거나 없앴으면 null이다.</summary>
        private static GameObject s_root;

        /// <summary>월드 카메라의 흔들림과 히트스톱.</summary>
        private static HitFeel s_feel;

        /// <summary>월드 카메라의 흔들림과 히트스톱. 월드가 없으면 만든다.</summary>
        internal static HitFeel Feel
        {
            get
            {
                EnsureRoot();
                return s_feel;
            }
        }

        /// <summary>월드 루트의 Transform을 돌려준다. 월드가 없으면 만든다.</summary>
        /// <returns>월드 루트의 Transform.</returns>
        internal static Transform Get()
        {
            EnsureRoot();
            return s_root.transform;
        }

        /// <summary>월드와 그 아래의 모든 인스턴스를 없앤다.</summary>
        internal static void DestroyAll()
        {
            if (s_root == null)
                return;
            UiRoot.Discard(s_root);
            s_root = null;
        }

        /// <summary>루트와 카메라를 만든다. 카메라는 씬의 카메라 위에 그려지게 한다.</summary>
        private static void EnsureRoot()
        {
            if (s_root != null)
                return;
            s_root = new GameObject(RootName);
            if (Application.isPlaying)
                Object.DontDestroyOnLoad(s_root);

            // 깊이는 만들기 전에 있던 카메라 가운데 가장 높은 것보다 하나 크게 한다.
            float depth = 0f;
            foreach (Camera other in Camera.allCameras)
                depth = Mathf.Max(depth, other.depth + 1f);

            var cameraObject = new GameObject("Camera", typeof(Camera));
            cameraObject.transform.SetParent(s_root.transform, false);
            cameraObject.transform.localPosition = new Vector3(0f, 0f, -10f);
            Camera camera = cameraObject.GetComponent<Camera>();
            camera.orthographic = true;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = s_background;
            camera.depth = depth;
            cameraObject.AddComponent<ScreenWatcher>().Watch(() => FitCamera(camera));
            s_feel = cameraObject.AddComponent<HitFeel>();
        }

        /// <summary>
        /// 기준 해상도의 화면에서 보이는 영역이 어느 화면 비율에서나 다 보이게 한다. 더 길쭉한 화면은 가로(배우 사이)를
        /// 그대로 두고 위아래를 더 보이며, 더 넓은 화면은 세로와 오른쪽 끝을 그대로 두고 왼쪽을 더 보인다. 월드는 화면 전체에 그리므로
        /// 세이프 에어리어가 아니라 화면의 비율을 쓴다.
        /// </summary>
        /// <param name="camera">월드 카메라.</param>
        private static void FitCamera(Camera camera)
        {
            if (Screen.height <= 0)
                return;
            float aspect = (float)Screen.width / Screen.height;
            float reference = UiRoot.s_referenceResolution.x / UiRoot.s_referenceResolution.y;
            camera.orthographicSize = ReferenceOrthographicSize * Mathf.Max(1f, reference / aspect);
            // 더 넓은 화면은 늘어난 폭을 모두 왼쪽(영웅 뒤)에 보인다. 오른쪽 끝이 기준 화면과 같아서, 영웅 앞의 화면 밖에서
            // 나오는 몬스터가 어느 비율에서나 화면 밖에서 나온다.
            float extra = (aspect > reference) ? ReferenceOrthographicSize * (aspect - reference) : 0f;
            camera.transform.localPosition = new Vector3(-extra, 0f, -10f);
        }
    }
}
