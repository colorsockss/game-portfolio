using System;
using System.IO;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>설정된 디렉터리 밖을 가리키지 못하게 상대 경로를 푼다.</summary>
    internal static class SafePath
    {
        /// <summary>
        /// <paramref name="root"/> 아래의 상대 경로를 풀되, 절대 경로와 root 밖으로 빠져나가는 경로는
        /// 거부한다.
        /// </summary>
        /// <param name="root">기준 디렉터리.</param>
        /// <param name="relativePath">root 기준 상대 경로.</param>
        /// <returns>root 안의 전체 경로.</returns>
        internal static string ResolveChild(string root, string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
            {
                throw new ArgumentException(
                    "A non-empty relative script path is required.", nameof(relativePath));
            }

            string fullRoot = Path.GetFullPath(root)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                + Path.DirectorySeparatorChar;
            string fullPath = Path.GetFullPath(Path.Combine(fullRoot, relativePath));
            if (!fullPath.StartsWith(fullRoot, StringComparison.Ordinal))
            {
                throw new ArgumentException(
                    "Script paths must stay inside their configured directory.", nameof(relativePath));
            }
            return fullPath;
        }
    }
}
