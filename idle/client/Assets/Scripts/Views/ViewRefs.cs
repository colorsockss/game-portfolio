using System;
using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.Serialization;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Views
{
    /// <summary>
    /// 프리팹이 TypeScript 뷰에 주는 이름 붙은 값(TypeScript/src/unity/binding/refs.ts 참고):
    /// 바인딩할 오브젝트와, 에디터에서 정한 문자열, 숫자, 불. 데이터뿐이라 로드할 때 실행되는 것이
    /// 없고, 뷰가 읽기 전에는 비용이 들지 않는다.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("TypeScript/View Refs")]
    public sealed class ViewRefs : MonoBehaviour
    {
        /// <summary>항목이 담은 것의 종류. TypeScript도 같은 숫자를 쓴다(refs.ts의 Kind).</summary>
        public enum Kind
        {
            /// <summary>Unity 오브젝트 하나.</summary>
            Object = 0,

            /// <summary>Unity 오브젝트의 목록.</summary>
            List = 1,

            /// <summary>문자열.</summary>
            String = 2,

            /// <summary>숫자.</summary>
            Number = 3,

            /// <summary>불.</summary>
            Bool = 4,
        }

        /// <summary>
        /// 이름 붙은 값 하나. 종류마다 따로 두지 않고 평범한 구조체 하나로 쓰면 데이터와 인스펙터가
        /// 단순하다. 필드는 전부 직렬화되지만 <see cref="Kind"/>가 가리키는 하나만 쓴다.
        /// </summary>
        [Serializable]
        public struct Entry
        {
            /// <summary>뷰가 항목을 찾는 이름.</summary>
            [FormerlySerializedAs("name")]
            public string Name;

            /// <summary>항목이 담은 값의 종류.</summary>
            [FormerlySerializedAs("kind")]
            public Kind Kind;

            /// <summary>종류가 Object일 때의 값.</summary>
            [FormerlySerializedAs("objectValue")]
            public Object ObjectValue;

            /// <summary>종류가 List일 때의 값.</summary>
            [FormerlySerializedAs("listValue")]
            public Object[] ListValue;

            /// <summary>종류가 String일 때의 값.</summary>
            [FormerlySerializedAs("stringValue")]
            public string StringValue;

            /// <summary>종류가 Number일 때의 값.</summary>
            [FormerlySerializedAs("numberValue")]
            public double NumberValue;

            /// <summary>종류가 Bool일 때의 값.</summary>
            [FormerlySerializedAs("boolValue")]
            public bool BoolValue;
        }

        /// <summary>프리팹에 저장된 항목.</summary>
        [SerializeField]
        [FormerlySerializedAs("entries")]
        private Entry[] _entries = Array.Empty<Entry>();

        // 뷰는 열릴 때 이름마다 한 번씩 아래 메서드를 부른다. GetKind로 항목의 종류를 확인한 뒤 그 종류의
        // getter를 부른다. 한 번 읽는 데는 딕셔너리를 만드는 것보다 선형 탐색이 낫다.
        // [Preserve]: TypeScript만 부르는데, IL2CPP의 스트리핑은 그것을 알아보지 못한다.

        /// <summary>항목의 Kind를 숫자로 돌려주고, 그 이름의 항목이 없으면 -1을 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public int GetKind(string name) => TryFind(name, out Entry entry) ? (int)entry.Kind : -1;

        /// <summary>Object 항목의 값을 돌려주고, 그 이름의 항목이 없으면 null을 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public Object GetObject(string name) => TryFind(name, out Entry entry) ? entry.ObjectValue : null;

        /// <summary>List 항목의 값을 돌려주고, 그 이름의 항목이 없으면 null을 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public Object[] GetList(string name) => TryFind(name, out Entry entry) ? entry.ListValue : null;

        /// <summary>String 항목의 값을 돌려주고, 그 이름의 항목이 없으면 null을 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public string GetString(string name) => TryFind(name, out Entry entry) ? entry.StringValue : null;

        /// <summary>Number 항목의 값을 돌려주고, 그 이름의 항목이 없으면 NaN을 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public double GetNumber(string name) =>
            TryFind(name, out Entry entry) ? entry.NumberValue : double.NaN;

        /// <summary>Bool 항목의 값을 돌려주고, 그 이름의 항목이 없으면 false를 돌려준다.</summary>
        /// <param name="name">항목 이름.</param>
        [Preserve]
        public bool GetBool(string name) => TryFind(name, out Entry entry) && entry.BoolValue;

        /// <summary>이름으로 항목을 찾는다.</summary>
        /// <param name="name">항목 이름.</param>
        /// <param name="found">찾은 항목. 없으면 기본값.</param>
        /// <returns>찾았으면 true.</returns>
        private bool TryFind(string name, out Entry found)
        {
            foreach (Entry entry in _entries)
            {
                if (entry.Name == name)
                {
                    found = entry;
                    return true;
                }
            }
            found = default;
            return false;
        }
    }
}
