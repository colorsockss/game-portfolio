using System;
using System.IO;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 내려받은 번들을 두는 디렉터리(persistentDataPath/TypeScript)의 배치. 번들 슬롯 a와 b, 지금 슬롯의 이름을 적은
    /// current.txt, 받는 중인 staging/이 있다. 새 번들은 staging에 모아 검증한 뒤 지금이 아닌 슬롯으로 이름을 바꾸고,
    /// current.txt는 임시 파일에 써서 바꿔 넣는다. 어디서 꺼져도 current.txt는 앞 슬롯이나 새 슬롯 하나를 가리키고, 앞
    /// 번들은 다음 업데이트까지 남는다. 런타임은 시작할 때 이것으로 번들을 고르고(TypeScriptRuntimeSettings),
    /// BundleFacade는 이것으로 받은 번들을 바꾼다.
    /// </summary>
    internal static class BundleStore
    {
        /// <summary>받는 중인 번들의 디렉터리 이름.</summary>
        internal const string StagingDirectory = "staging";

        /// <summary>지금 슬롯의 이름을 적은 파일.</summary>
        private const string PointerFile = "current.txt";

        /// <summary>번들 슬롯의 디렉터리 이름.</summary>
        private static readonly string[] s_slots = { "a", "b" };

        /// <summary>지금 슬롯의 디렉터리를 돌려준다.</summary>
        /// <param name="store">받은 번들을 두는 디렉터리.</param>
        /// <returns>슬롯의 전체 경로. 받은 번들이 없거나 current.txt가 슬롯을 가리키지 않으면 null.</returns>
        internal static string Current(string store)
        {
            string slot = ReadPointer(store);
            return slot == null ? null : Path.Combine(store, slot);
        }

        /// <summary>staging을 지금이 아닌 슬롯으로 옮기고 current.txt가 그 슬롯을 가리키게 한다.</summary>
        /// <param name="store">받은 번들을 두는 디렉터리.</param>
        internal static void Commit(string store)
        {
            string next = ReadPointer(store) == s_slots[0] ? s_slots[1] : s_slots[0];
            string target = Path.Combine(store, next);
            if (Directory.Exists(target))
                Directory.Delete(target, true);
            Directory.Move(Path.Combine(store, StagingDirectory), target);

            string pointer = Path.Combine(store, PointerFile);
            string temporary = $"{pointer}.tmp";
            File.WriteAllText(temporary, next);
            if (File.Exists(pointer))
                File.Replace(temporary, pointer, null);
            else
                File.Move(temporary, pointer);
        }

        /// <summary>current.txt가 가리키는 슬롯 이름을 읽는다.</summary>
        /// <param name="store">받은 번들을 두는 디렉터리.</param>
        /// <returns>슬롯 이름. 파일이 없거나 슬롯 이름이 아니면 null.</returns>
        private static string ReadPointer(string store)
        {
            string pointer = Path.Combine(store, PointerFile);
            if (!File.Exists(pointer))
                return null;
            string slot = File.ReadAllText(pointer).Trim();
            return Array.IndexOf(s_slots, slot) >= 0 ? slot : null;
        }
    }
}
