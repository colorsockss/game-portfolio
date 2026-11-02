using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace PortfolioIdleRpg.Editor
{
    /// <summary>
    /// 빌더가 프리팹을 다시 만들어도 오브젝트의 fileID를 지난 파일과 같게 둔다. SaveAsPrefabAsset은 덮어쓸 때 오브젝트를
    /// 이름으로만 맞추므로, 이름이 겹치는 오브젝트(버튼마다 있는 "Text (TMP)", 칸마다 있는 "Name")는 저장할 때마다 fileID가
    /// 새로 나온다. 그러면 내용이 같아도 diff가 생기고, 그 fileID를 가리키는 다른 프리팹(중첩 프리팹)의 참조도 어긋난다.
    /// 그래서 저장한 뒤 계층 경로(이름이 같은 형제는 순서)와 컴포넌트 종류로 지난 파일의 오브젝트를 찾아 그 fileID로 되돌린다.
    /// </summary>
    internal static class PrefabIds
    {
        /// <summary>문서 머리: 클래스 번호, fileID, 중첩 프리팹에서 온 오브젝트 표시.</summary>
        private static readonly Regex s_header =
            new Regex(@"^--- !u!(\d+) &(-?\d+)( stripped)?", RegexOptions.Multiline);

        /// <summary>같은 파일 안을 가리키는 참조. guid가 붙은 다른 에셋의 참조는 맞지 않는다.</summary>
        private static readonly Regex s_localReference = new Regex(@"(fileID: )(-?\d+)(\})");

        /// <summary>프리팹으로 저장하고, 지난 파일에 있던 오브젝트는 그 fileID로 되돌린다.</summary>
        /// <param name="root">프리팹의 루트(새로 만든 오브젝트이거나 LoadPrefabContents로 연 내용).</param>
        /// <param name="path">프리팹 경로.</param>
        /// <returns>저장한 프리팹 에셋.</returns>
        internal static GameObject Save(GameObject root, string path)
        {
            string before = File.Exists(path) ? File.ReadAllText(path) : null;
            PrefabUtility.SaveAsPrefabAsset(root, path);
            if (before != null)
            {
                string after = File.ReadAllText(path);
                string kept = Keep(before, after);
                if (kept != after)
                {
                    // 반쯤 쓴 프리팹이 남지 않게 임시 파일에 쓴 뒤 바꾼다.
                    string temp = $"{path}.tmp";
                    File.WriteAllText(temp, kept);
                    File.Replace(temp, path, null);
                    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
                    // 문서 순서는 fileID를 따르므로, 되돌린 fileID의 순서로 Unity가 다시 쓰게 한다.
                    AssetDatabase.ForceReserializeAssets(new[] { path });
                }
            }
            return AssetDatabase.LoadAssetAtPath<GameObject>(path);
        }

        /// <summary>새 파일의 fileID 중 지난 파일에 같은 자리의 오브젝트가 있는 것을 그 fileID로 바꾼다.</summary>
        /// <param name="before">지난 프리팹 파일.</param>
        /// <param name="after">방금 저장한 프리팹 파일.</param>
        /// <returns>fileID를 되돌린 파일. 바꿀 것이 없으면 <paramref name="after"/> 그대로다.</returns>
        internal static string Keep(string before, string after)
        {
            Dictionary<string, string> oldIds = new Document(before).Ids();
            Dictionary<string, string> newIds = new Document(after).Ids();
            var map = new Dictionary<string, string>();
            var targets = new HashSet<string>();
            foreach (KeyValuePair<string, string> pair in newIds)
            {
                if (!oldIds.TryGetValue(pair.Key, out string oldId) || (oldId == pair.Value))
                    continue;
                map[pair.Value] = oldId;
                targets.Add(oldId);
            }
            // 되돌릴 fileID를 옮기지 않는 다른 오브젝트가 이미 쓰고 있으면 겹치므로 그 짝은 그대로 둔다.
            foreach (Match header in s_header.Matches(after))
            {
                string id = header.Groups[2].Value;
                if (!map.ContainsKey(id) && targets.Contains(id))
                {
                    foreach (string from in new List<string>(map.Keys))
                    {
                        if (map[from] == id)
                            map.Remove(from);
                    }
                }
            }
            if (map.Count == 0)
                return after;
            string text = s_header.Replace(
                after,
                match => map.TryGetValue(match.Groups[2].Value, out string id)
                    ? $"--- !u!{match.Groups[1].Value} &{id}{match.Groups[3].Value}"
                    : match.Value);
            return s_localReference.Replace(
                text,
                match => map.TryGetValue(match.Groups[2].Value, out string id)
                    ? $"{match.Groups[1].Value}{id}{match.Groups[3].Value}"
                    : match.Value);
        }

        /// <summary>프리팹 파일 하나를 읽어 오브젝트마다 계층에서의 자리를 이름 붙인다.</summary>
        private sealed class Document
        {
            /// <summary>GameObject의 이름.</summary>
            private static readonly Regex s_name = new Regex(@"^  m_Name: (.*)$", RegexOptions.Multiline);

            /// <summary>GameObject의 컴포넌트 목록 한 줄.</summary>
            private static readonly Regex s_component = new Regex(@"- component: \{fileID: (-?\d+)\}");

            /// <summary>컴포넌트가 붙은 GameObject.</summary>
            private static readonly Regex s_gameObject = new Regex(@"^  m_GameObject: \{fileID: (-?\d+)\}", RegexOptions.Multiline);

            /// <summary>Transform의 부모.</summary>
            private static readonly Regex s_father = new Regex(@"^  m_Father: \{fileID: (-?\d+)\}", RegexOptions.Multiline);

            /// <summary>Transform의 자식 목록(순서대로).</summary>
            private static readonly Regex s_children =
                new Regex(@"^  m_Children:\n((?:  - \{fileID: -?\d+\}\n)*)", RegexOptions.Multiline);

            /// <summary>자식 목록의 한 줄.</summary>
            private static readonly Regex s_child = new Regex(@"\{fileID: (-?\d+)\}");

            /// <summary>MonoBehaviour의 스크립트.</summary>
            private static readonly Regex s_script = new Regex(@"^  m_Script: \{fileID: -?\d+, guid: ([0-9a-f]+)", RegexOptions.Multiline);

            /// <summary>중첩 프리팹에서 온 오브젝트의 원본.</summary>
            private static readonly Regex s_source =
                new Regex(@"^  m_CorrespondingSourceObject: \{fileID: (-?\d+), guid: ([0-9a-f]+)", RegexOptions.Multiline);

            /// <summary>중첩 프리팹에서 온 오브젝트가 속한 인스턴스.</summary>
            private static readonly Regex s_instance = new Regex(@"^  m_PrefabInstance: \{fileID: (-?\d+)\}", RegexOptions.Multiline);

            /// <summary>중첩 프리팹 인스턴스의 부모 Transform.</summary>
            private static readonly Regex s_transformParent = new Regex(@"^    m_TransformParent: \{fileID: (-?\d+)\}", RegexOptions.Multiline);

            /// <summary>중첩 프리팹 인스턴스의 원본 프리팹.</summary>
            private static readonly Regex s_sourcePrefab = new Regex(@"^  m_SourcePrefab: \{fileID: -?\d+, guid: ([0-9a-f]+)", RegexOptions.Multiline);

            /// <summary>파일 순서대로의 fileID.</summary>
            private readonly List<string> _order = new List<string>();

            /// <summary>fileID마다 클래스 번호.</summary>
            private readonly Dictionary<string, int> _classes = new Dictionary<string, int>();

            /// <summary>fileID마다 중첩 프리팹에서 온 오브젝트인지.</summary>
            private readonly HashSet<string> _stripped = new HashSet<string>();

            /// <summary>fileID마다 문서 본문.</summary>
            private readonly Dictionary<string, string> _bodies = new Dictionary<string, string>();

            /// <summary>이미 구한 자리.</summary>
            private readonly Dictionary<string, string> _keys = new Dictionary<string, string>();

            /// <summary>파일을 문서로 나눈다.</summary>
            /// <param name="text">프리팹 파일.</param>
            internal Document(string text)
            {
                MatchCollection headers = s_header.Matches(text);
                for (var i = 0; i < headers.Count; i++)
                {
                    Match header = headers[i];
                    int end = (i + 1 < headers.Count) ? headers[i + 1].Index : text.Length;
                    string id = header.Groups[2].Value;
                    _order.Add(id);
                    _classes[id] = int.Parse(header.Groups[1].Value);
                    _bodies[id] = text.Substring(header.Index, end - header.Index);
                    if (header.Groups[3].Success)
                        _stripped.Add(id);
                }
            }

            /// <summary>자리마다 fileID. 둘 이상의 오브젝트가 같은 자리이면 넣지 않는다.</summary>
            /// <returns>자리에서 fileID로.</returns>
            internal Dictionary<string, string> Ids()
            {
                var ids = new Dictionary<string, string>();
                var repeated = new HashSet<string>();
                foreach (string id in _order)
                {
                    foreach (KeyValuePair<string, string> entry in Entries(id))
                    {
                        if (repeated.Contains(entry.Key))
                            continue;
                        if (ids.ContainsKey(entry.Key))
                        {
                            ids.Remove(entry.Key);
                            repeated.Add(entry.Key);
                            continue;
                        }
                        ids[entry.Key] = entry.Value;
                    }
                }
                return ids;
            }

            /// <summary>문서 하나가 이름 붙이는 오브젝트: GameObject와 그 컴포넌트, 중첩 인스턴스, 거기서 온 오브젝트.</summary>
            /// <param name="id">문서의 fileID.</param>
            /// <returns>자리와 fileID의 짝.</returns>
            private IEnumerable<KeyValuePair<string, string>> Entries(string id)
            {
                if (_stripped.Contains(id))
                {
                    yield return new KeyValuePair<string, string>(Key(id), id);
                    yield break;
                }
                if (_classes[id] == 1001)
                {
                    yield return new KeyValuePair<string, string>(InstanceKey(id), id);
                    yield break;
                }
                if (_classes[id] != 1)
                    yield break;
                string owner = GameObjectKey(id);
                yield return new KeyValuePair<string, string>($"{owner}|GameObject", id);
                var counts = new Dictionary<string, int>();
                foreach (Match component in s_component.Matches(_bodies[id]))
                {
                    string componentId = component.Groups[1].Value;
                    if (!_classes.TryGetValue(componentId, out int type))
                        continue;
                    string kind = type.ToString();
                    Match script = s_script.Match(_bodies[componentId]);
                    if (script.Success)
                        kind = $"{kind}:{script.Groups[1].Value}";
                    counts.TryGetValue(kind, out int seen);
                    counts[kind] = seen + 1;
                    yield return new KeyValuePair<string, string>($"{owner}|{kind}#{seen}", componentId);
                }
            }

            /// <summary>GameObject의 자리: 부모의 자리 + 이름 + 이름이 같은 형제 중 순서.</summary>
            /// <param name="gameObject">GameObject의 fileID.</param>
            /// <returns>자리.</returns>
            private string GameObjectKey(string gameObject)
            {
                if (_keys.TryGetValue(gameObject, out string known))
                    return known;
                string name = Name(gameObject);
                string transform = TransformOf(gameObject);
                string key = $"/{name}#0";
                if (transform != null)
                {
                    string father = Field(s_father, transform);
                    if ((father != null) && (father != "0"))
                    {
                        int index = 0;
                        foreach (string sibling in Children(father))
                        {
                            if (sibling == transform)
                                break;
                            string siblingObject = Field(s_gameObject, sibling);
                            if ((siblingObject != null) && (Name(siblingObject) == name))
                                index++;
                        }
                        key = $"{Key(father)}/{name}#{index}";
                    }
                }
                _keys[gameObject] = key;
                return key;
            }

            /// <summary>Transform이나 중첩 프리팹에서 온 오브젝트의 자리.</summary>
            /// <param name="id">fileID.</param>
            /// <returns>자리.</returns>
            private string Key(string id)
            {
                if (!_bodies.ContainsKey(id))
                    return $"?{id}";
                if (!_stripped.Contains(id))
                {
                    string owner = Field(s_gameObject, id);
                    return (owner != null) ? GameObjectKey(owner) : $"?{id}";
                }
                if (_keys.TryGetValue(id, out string known))
                    return known;
                Match source = s_source.Match(_bodies[id]);
                string instance = Field(s_instance, id);
                string key = $"{((instance != null) ? InstanceKey(instance) : "?")}~{source.Groups[2].Value}:{source.Groups[1].Value}";
                _keys[id] = key;
                return key;
            }

            /// <summary>
            /// 중첩 프리팹 인스턴스의 자리: 부모의 자리 + 원본 + 같은 부모·원본인 인스턴스 중 순서. 순서는 부모의 자식 목록(형제
            /// 순서)으로 센다. 파일 순서는 fileID를 따르므로, 새로 만든 파일에서는 같은 원본의 인스턴스 둘(예: 같은 모양의 버튼)의
            /// 순서가 빌드마다 뒤바뀐다. 부모가 중첩 프리팹에서 와서 자식 목록이 파일에 없을 때만 파일 순서로 센다.
            /// </summary>
            /// <param name="instance">인스턴스의 fileID.</param>
            /// <returns>자리.</returns>
            private string InstanceKey(string instance)
            {
                if (_keys.TryGetValue(instance, out string known))
                    return known;
                string parent = Field(s_transformParent, instance) ?? "0";
                string prefab = s_sourcePrefab.Match(_bodies[instance]).Groups[1].Value;
                bool SameSource(string other) =>
                    (other != null) && (_classes[other] == 1001) && (s_sourcePrefab.Match(_bodies[other]).Groups[1].Value == prefab);
                int index = 0;
                if ((parent != "0") && !_stripped.Contains(parent))
                {
                    foreach (string child in Children(parent))
                    {
                        string owner = _stripped.Contains(child) ? Field(s_instance, child) : null;
                        if (owner == instance)
                            break;
                        if (SameSource(owner))
                            index++;
                    }
                }
                else
                {
                    foreach (string id in _order)
                    {
                        if (id == instance)
                            break;
                        if (SameSource(id) && (Field(s_transformParent, id) == parent))
                            index++;
                    }
                }
                string key = $"{((parent == "0") ? "" : Key(parent))}>{prefab}#{index}";
                _keys[instance] = key;
                return key;
            }

            /// <summary>
            /// Transform의 자식을 순서대로 구한다. 중첩 프리팹에서 온 Transform은 자식 목록이 파일에 없으므로 그것을 부모로
            /// 적은 Transform을 파일 순서대로 모은다.
            /// </summary>
            /// <param name="transform">부모 Transform의 fileID.</param>
            /// <returns>자식 Transform의 fileID.</returns>
            private IEnumerable<string> Children(string transform)
            {
                if (!_stripped.Contains(transform) && _bodies.TryGetValue(transform, out string body))
                {
                    Match children = s_children.Match(body);
                    if (children.Success)
                    {
                        foreach (Match child in s_child.Matches(children.Groups[1].Value))
                            yield return child.Groups[1].Value;
                    }
                    yield break;
                }
                foreach (string id in _order)
                {
                    if (!_stripped.Contains(id) && (Field(s_father, id) == transform))
                        yield return id;
                }
            }

            /// <summary>GameObject의 Transform(컴포넌트 중 클래스 4나 224).</summary>
            /// <param name="gameObject">GameObject의 fileID.</param>
            /// <returns>Transform의 fileID. 없으면 null.</returns>
            private string TransformOf(string gameObject)
            {
                foreach (Match component in s_component.Matches(_bodies[gameObject]))
                {
                    string id = component.Groups[1].Value;
                    if (_classes.TryGetValue(id, out int type) && ((type == 4) || (type == 224)))
                        return id;
                }
                return null;
            }

            /// <summary>GameObject의 이름.</summary>
            /// <param name="gameObject">GameObject의 fileID.</param>
            /// <returns>이름. 문서가 없으면 빈 문자열.</returns>
            private string Name(string gameObject) =>
                _bodies.TryGetValue(gameObject, out string body) ? s_name.Match(body).Groups[1].Value : "";

            /// <summary>문서에서 fileID 하나를 담은 필드를 읽는다.</summary>
            /// <param name="pattern">필드 패턴. 첫 그룹이 fileID다.</param>
            /// <param name="id">문서의 fileID.</param>
            /// <returns>필드의 fileID. 문서나 필드가 없으면 null.</returns>
            private string Field(Regex pattern, string id)
            {
                if (!_bodies.TryGetValue(id, out string body))
                    return null;
                Match match = pattern.Match(body);
                return match.Success ? match.Groups[1].Value : null;
            }
        }
    }
}
