using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace PortfolioIdleRpg.Editor.Tests
{
    /// <summary>빌더가 프리팹을 다시 만들 때 fileID를 지키는 도우미(PrefabIds)의 테스트.</summary>
    public sealed class PrefabIdsTests
    {
        /// <summary>테스트가 프리팹을 쓰고 지우는 폴더.</summary>
        private const string Folder = "Assets/Tests/EditMode/Builders/Temp";

        /// <summary>테스트 프리팹의 경로.</summary>
        private const string PrefabPath = Folder + "/Buttons.prefab";

        /// <summary>문서 머리의 fileID.</summary>
        private static readonly Regex s_header = new Regex(@"^--- !u!\d+ &(-?\d+)", RegexOptions.Multiline);

        /// <summary>테스트 폴더를 만든다.</summary>
        [SetUp]
        public void CreateFolder()
        {
            if (!AssetDatabase.IsValidFolder(Folder))
                AssetDatabase.CreateFolder("Assets/Tests/EditMode/Builders", "Temp");
        }

        /// <summary>테스트 폴더를 지운다.</summary>
        [TearDown]
        public void DeleteFolder() => AssetDatabase.DeleteAsset(Folder);

        /// <summary>이름이 겹치는 오브젝트(버튼마다 있는 글자)도 다시 만들면 파일이 한 글자도 바뀌지 않는다.</summary>
        [Test]
        public void RebuildingTheSameHierarchyKeepsTheFile()
        {
            SaveButtons(false);
            string first = File.ReadAllText(PrefabPath);
            SaveButtons(false);
            Assert.AreEqual(first, File.ReadAllText(PrefabPath));
        }

        /// <summary>오브젝트를 더하면 원래 있던 오브젝트는 fileID가 그대로이고 더한 것만 새 fileID다.</summary>
        [Test]
        public void AddingAnObjectKeepsTheOthers()
        {
            SaveButtons(false);
            string first = File.ReadAllText(PrefabPath);
            SaveButtons(true);
            string second = File.ReadAllText(PrefabPath);
            foreach (Match header in s_header.Matches(first))
                StringAssert.Contains($"&{header.Groups[1].Value}", second);
            Assert.Greater(s_header.Matches(second).Count, s_header.Matches(first).Count);
        }

        /// <summary>다른 에셋을 가리키는 참조(guid가 붙음)는 숫자가 같아도 바꾸지 않는다.</summary>
        [Test]
        public void ReferencesToOtherAssetsAreLeftAlone()
        {
            const string before =
                "--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 101}\n  m_Name: Root\n" +
                "--- !u!224 &101\nRectTransform:\n  m_GameObject: {fileID: 100}\n  m_Children: []\n  m_Father: {fileID: 0}\n";
            const string after =
                "--- !u!1 &200\nGameObject:\n  m_Component:\n  - component: {fileID: 201}\n  m_Name: Root\n" +
                "--- !u!224 &201\nRectTransform:\n  m_GameObject: {fileID: 200}\n  m_Children: []\n  m_Father: {fileID: 0}\n" +
                "  m_Other: {fileID: 200, guid: 0123456789abcdef0123456789abcdef, type: 3}\n";
            string kept = PrefabIds.Keep(before, after);
            StringAssert.StartsWith("--- !u!1 &100\n", kept);
            StringAssert.Contains("- component: {fileID: 101}", kept);
            StringAssert.Contains("m_GameObject: {fileID: 100}", kept);
            StringAssert.Contains("m_Other: {fileID: 200, guid: 0123456789abcdef0123456789abcdef, type: 3}", kept);
        }

        /// <summary>
        /// 같은 원본의 중첩 프리팹 인스턴스 둘은 파일 순서(fileID를 따름)가 아니라 형제 순서로 맞춘다. 새 파일에서 두 번째
        /// 형제가 파일의 앞에 와도 첫 번째 형제가 지난 첫 번째 형제의 fileID를 받는다.
        /// </summary>
        [Test]
        public void InstancesOfOnePrefabMatchBySiblingOrder()
        {
            string before = Root("100", "101", "111", "121") + Instance("110", "111", "101") + Instance("120", "121", "101");
            string after = Root("200", "201", "231", "221") + Instance("220", "221", "201") + Instance("230", "231", "201");
            string kept = PrefabIds.Keep(before, after);
            StringAssert.Contains("  - {fileID: 111}\n  - {fileID: 121}\n", kept);
            StringAssert.Contains("--- !u!1001 &110\nPrefabInstance:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_Modification:\n    m_TransformParent: {fileID: 101}", kept);
            StringAssert.Contains("--- !u!224 &111 stripped\nRectTransform:\n  m_CorrespondingSourceObject: {fileID: 5, guid: 0123456789abcdef0123456789abcdef, type: 3}\n  m_PrefabInstance: {fileID: 110}", kept);
            StringAssert.Contains("m_PrefabInstance: {fileID: 120}", kept);

            // 두 자식을 순서대로 가진 루트.
            static string Root(string gameObject, string transform, string first, string second) =>
                $"--- !u!1 &{gameObject}\nGameObject:\n  m_Component:\n  - component: {{fileID: {transform}}}\n  m_Name: Root\n" +
                $"--- !u!224 &{transform}\nRectTransform:\n  m_GameObject: {{fileID: {gameObject}}}\n" +
                $"  m_Children:\n  - {{fileID: {first}}}\n  - {{fileID: {second}}}\n  m_Father: {{fileID: 0}}\n";

            // 한 원본 프리팹의 인스턴스와 그 루트 Transform.
            static string Instance(string instance, string transform, string parent) =>
                $"--- !u!1001 &{instance}\nPrefabInstance:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_Modification:\n" +
                $"    m_TransformParent: {{fileID: {parent}}}\n" +
                "  m_SourcePrefab: {fileID: 100100000, guid: 0123456789abcdef0123456789abcdef, type: 3}\n" +
                $"--- !u!224 &{transform} stripped\nRectTransform:\n" +
                "  m_CorrespondingSourceObject: {fileID: 5, guid: 0123456789abcdef0123456789abcdef, type: 3}\n" +
                $"  m_PrefabInstance: {{fileID: {instance}}}\n";
        }

        /// <summary>버튼 둘(각각 "Text"라는 자식)을 가진 오브젝트를 새로 만들어 저장한다.</summary>
        /// <param name="withExtra">버튼 하나를 더할지.</param>
        private static void SaveButtons(bool withExtra)
        {
            var root = new GameObject("Buttons", typeof(RectTransform));
            try
            {
                AddButton(root.transform, "OkButton");
                AddButton(root.transform, "CancelButton");
                if (withExtra)
                    AddButton(root.transform, "HelpButton");
                PrefabIds.Save(root, PrefabPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        /// <summary>이미지와 "Text"라는 자식을 가진 버튼을 만든다.</summary>
        /// <param name="parent">부모.</param>
        /// <param name="name">버튼 이름.</param>
        private static void AddButton(Transform parent, string name)
        {
            var button = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            button.transform.SetParent(parent, false);
            var text = new GameObject("Text", typeof(RectTransform), typeof(Image));
            text.transform.SetParent(button.transform, false);
        }
    }
}
