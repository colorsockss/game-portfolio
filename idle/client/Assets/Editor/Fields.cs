using System;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 빌더가 컴포넌트와 에셋의 직렬화된 필드를 채우는 도우미. UI와 전투 빌더가 함께 쓴다. 필드 이름이 틀리거나 넣을 수 없는
    /// 값이면 던진다.
    /// </summary>
    internal static class Fields
    {
        /// <summary>
        /// <paramref name="target"/>의 직렬화된 필드들을 정한다. 값은 오브젝트(null 포함), float, bool, string, Color나 그것들의
        /// 배열이다.
        /// </summary>
        /// <param name="target">필드를 가진 컴포넌트나 에셋.</param>
        /// <param name="fields">필드 이름과 넣을 값.</param>
        internal static void Wire(Object target, params (string Field, object Value)[] fields)
        {
            var serialized = new SerializedObject(target);
            foreach ((string field, object value) in fields)
            {
                SerializedProperty property = serialized.FindProperty(field)
                    ?? throw new ArgumentException($"{target.GetType().Name} has no serialized field {field}.");
                Set(property, value);
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>직렬화된 필드 하나(배열이면 원소까지)를 정한다.</summary>
        /// <param name="property">필드.</param>
        /// <param name="value">넣을 값.</param>
        internal static void Set(SerializedProperty property, object value)
        {
            switch (value)
            {
                case null:
                    property.objectReferenceValue = null;
                    break;
                case Object reference:
                    property.objectReferenceValue = reference;
                    break;
                case float number:
                    property.floatValue = number;
                    break;
                case bool flag:
                    property.boolValue = flag;
                    break;
                case string text:
                    property.stringValue = text;
                    break;
                case Color color:
                    property.colorValue = color;
                    break;
                case Array values:
                    property.arraySize = values.Length;
                    for (var i = 0; i < values.Length; i++)
                        Set(property.GetArrayElementAtIndex(i), values.GetValue(i));
                    break;
                default:
                    throw new ArgumentException($"Cannot write a {value.GetType().Name} to {property.propertyPath}.");
            }
        }
    }
}
