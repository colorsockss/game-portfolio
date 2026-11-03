using System;
using UnityEngine;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 화면 크기나 세이프 에어리어가 바뀌면 알린다. UI 캔버스(UiRoot)가 화면에 맞출 때 쓴다.
    /// 회전, 창 크기, 에디터의 Game 뷰와 Device Simulator가 바꾼다. 프레임마다 값 둘을 비교할 뿐이다.
    /// </summary>
    internal sealed class ScreenWatcher : MonoBehaviour
    {
        /// <summary>바뀔 때 부르는 것.</summary>
        private Action _changed;

        /// <summary>마지막으로 알린 화면 크기(픽셀).</summary>
        private Vector2Int _size;

        /// <summary>마지막으로 알린 세이프 에어리어(픽셀).</summary>
        private Rect _safeArea;

        /// <summary>지금 화면으로 바로 한 번 부르고, 그 뒤로 바뀔 때마다 부른다.</summary>
        /// <param name="changed">화면에 맞추는 것.</param>
        internal void Watch(Action changed)
        {
            _changed = changed;
            _size = new Vector2Int(Screen.width, Screen.height);
            _safeArea = Screen.safeArea;
            _changed();
        }

        /// <summary>화면이 바뀌었으면 알린다.</summary>
        private void Update()
        {
            var size = new Vector2Int(Screen.width, Screen.height);
            Rect safeArea = Screen.safeArea;
            if ((size == _size) && (safeArea == _safeArea))
                return;
            _size = size;
            _safeArea = safeArea;
            _changed?.Invoke();
        }
    }
}
