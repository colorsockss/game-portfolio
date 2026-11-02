using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// UiFacade의 뷰가 올라가는 캔버스. 뷰 종류마다 레이어 하나(UiFacade.Screen, Popup, Overlay로 찾는다)와
    /// 그 위의 차단막 하나로 이뤄지며, 처음 쓸 때 만든다. 레이어는 세이프 에어리어(노치, 홈 인디케이터를 뺀 곳)를 채우고,
    /// 캔버스 배율은 세이프 에어리어에 기준 해상도가 가로세로 모두 들어가게 정하므로, 뷰는 어느 기기에서나 기준 해상도
    /// 이상의 영역에 놓인다. 화면 밖까지 깔리는 바탕은 빌더가 세이프 에어리어 밖으로 늘인다(에디터의 UiPrefabs.Bleed).
    /// </summary>
    internal static class UiRoot
    {
        /// <summary>
        /// UI를 설계한 세로 해상도. 세이프 에어리어가 이것보다 길쭉하면 위아래가, 넓으면 양옆이 남는다. 월드 카메라도 이
        /// 비율로 보이는 영역을 정한다.
        /// </summary>
        internal static readonly Vector2 s_referenceResolution = new Vector2(1080f, 1920f);

        /// <summary>레이어 오브젝트의 이름. 인덱스가 UiFacade의 레이어 번호다.</summary>
        private static readonly string[] s_layerNames = { "Screens", "Popups", "Guides", "Overlays", "Debug" };

        /// <summary>캔버스의 루트 오브젝트. 아직 만들지 않았거나 없앴으면 null이다.</summary>
        private static GameObject s_root;

        /// <summary>레이어 번호별 레이어의 Transform.</summary>
        private static Transform[] s_layers;

        /// <summary>모든 레이어 위에서 탭을 받는 투명한 차단막.</summary>
        private static GameObject s_blocker;

        /// <summary>레이어 번호의 Transform을 돌려준다. 캔버스가 없으면 만든다.</summary>
        /// <param name="layer">UiFacade의 레이어 번호.</param>
        /// <returns>레이어의 Transform.</returns>
        internal static Transform Layer(int layer)
        {
            if ((layer < 0) || (layer >= s_layerNames.Length))
                throw new ArgumentOutOfRangeException(nameof(layer));
            EnsureRoot();
            return s_layers[layer];
        }

        /// <summary>차단막을 보이거나 숨긴다. 캔버스가 없으면 만든다.</summary>
        /// <param name="blocking">보이려면 true.</param>
        internal static void SetBlocking(bool blocking)
        {
            EnsureRoot();
            s_blocker.SetActive(blocking);
        }

        /// <summary>캔버스와 그 위의 모든 뷰를 없앤다.</summary>
        internal static void DestroyAll()
        {
            if (s_root == null)
                return;
            // 곧바로 비활성화한다. Destroy가 적용되기 전에 폐기되는 스크립트를 부르는 버튼이 없게 한다.
            s_root.SetActive(false);
            Discard(s_root);
            s_root = null;
        }

        /// <summary>오브젝트를 없앤다. 플레이 모드가 아니면 Destroy를 쓸 수 없으므로 바로 없앤다.</summary>
        /// <param name="target">없앨 오브젝트.</param>
        internal static void Discard(Object target)
        {
            if (Application.isPlaying)
                Object.Destroy(target);
            else
                Object.DestroyImmediate(target);
        }

        /// <summary>캔버스와 레이어, 차단막, 필요하면 EventSystem을 만들고 한글 글꼴을 넣는다.</summary>
        private static void EnsureRoot()
        {
            if (s_root != null)
                return;
            s_root = new GameObject("UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            if (Application.isPlaying)
                Object.DontDestroyOnLoad(s_root);
            s_root.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            // 배율은 FitSafeArea가 세이프 에어리어로 정한다.
            s_root.GetComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;

            s_layers = new Transform[s_layerNames.Length];
            for (var i = 0; i < s_layerNames.Length; i++)
            {
                // 차단막은 디버그 레이어 바로 아래에서 화면 전체의 탭을 받는다.
                if (i == UiFacade.Debug)
                {
                    s_blocker = Stretched("Blocker");
                    s_blocker.AddComponent<Image>().color = Color.clear;
                    s_blocker.SetActive(false);
                }
                s_layers[i] = Stretched(s_layerNames[i]).transform;
            }
            s_root.AddComponent<ScreenWatcher>().Watch(FitSafeArea);

            if (EventSystem.current == null)
            {
                var events = new GameObject(
                    "EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                events.transform.SetParent(s_root.transform, false);
                events.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
            }
            KoreanFontFallback.Add();
        }

        /// <summary>
        /// 레이어가 세이프 에어리어를 채우게 하고, 캔버스 배율을 세이프 에어리어가 기준 해상도를 가로세로 모두 담는 가장 큰
        /// 값으로 둔다. 화면이 바뀔 때마다 ScreenWatcher가 부른다. 화면 값이 쓸 수 없는 프레임(크기 0, NaN)에는 지난 배치를
        /// 두고, 값이 돌아오면 그때 다시 맞춘다.
        /// </summary>
        private static void FitSafeArea()
        {
            foreach (Transform layer in s_layers)
            {
                if (!float.IsNaN(layer.localPosition.x) && !float.IsNaN(layer.localPosition.y))
                    continue;
                // 레이어에 NaN이 들어갔다면 그 아래 RectTransform도 모두 NaN으로 저장되어 고칠 수 없다. 스크립트 환경을
                // 다시 시작해 UI를 새로 만든다.
                Debug.LogError("[UI] A UI layer's position became NaN; restarting to rebuild the UI");
                RuntimeFacade.Restart();
                return;
            }
            var screen = new Vector2(Screen.width, Screen.height);
            if (!SafeAreaFit.TryFit(
                    Screen.safeArea, screen, s_referenceResolution, out float scale, out Vector2 anchorMin,
                    out Vector2 anchorMax))
            {
                return;
            }
            s_root.GetComponent<CanvasScaler>().scaleFactor = scale;
            foreach (Transform layer in s_layers)
            {
                var rectTransform = (RectTransform)layer;
                rectTransform.anchorMin = anchorMin;
                rectTransform.anchorMax = anchorMax;
            }
        }

        /// <summary>캔버스를 가득 채우는 자식 오브젝트를 만든다.</summary>
        /// <param name="name">오브젝트 이름.</param>
        /// <returns>만든 오브젝트.</returns>
        private static GameObject Stretched(string name)
        {
            var child = new GameObject(name, typeof(RectTransform));
            var rectTransform = (RectTransform)child.transform;
            rectTransform.SetParent(s_root.transform, false);
            rectTransform.anchorMin = Vector2.zero;
            rectTransform.anchorMax = Vector2.one;
            rectTransform.offsetMin = Vector2.zero;
            rectTransform.offsetMax = Vector2.zero;
            return child;
        }
    }
}
