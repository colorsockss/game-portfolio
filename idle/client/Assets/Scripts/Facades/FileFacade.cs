using System;
using System.IO;
using Puerts;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 게임 번들에 함께 든 파일을 게임에 준다(src/unity/bridge.ts). 빌드가 테이블 데이터를 진입 모듈 옆 data/에 두므로
    /// 데이터와 코드는 항상 함께 패치된다.
    /// </summary>
    [Preserve]
    public static class FileFacade
    {
        /// <summary>게임 번들의 디렉터리. 게임 프로그램의 스크립트 환경이 생기기 전에 런타임이 정하고, 부트 동안은 null이다.</summary>
        internal static string Root { get; set; }

        /// <summary>진입 모듈 디렉터리 기준 상대 경로로 파일을 읽는다. 예: data/Items.bytes.</summary>
        /// <param name="relativePath">진입 모듈 디렉터리 기준 상대 경로.</param>
        /// <returns>파일의 바이트.</returns>
        [Preserve]
        public static ArrayBuffer Read(string relativePath)
        {
            if (string.IsNullOrEmpty(Root))
            {
                throw new InvalidOperationException(
                    "FileFacade.Read is for the game program; the boot program has no game bundle.");
            }
            return new ArrayBuffer(File.ReadAllBytes(SafePath.ResolveChild(Root, relativePath)));
        }
    }
}
