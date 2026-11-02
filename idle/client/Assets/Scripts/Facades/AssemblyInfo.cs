using System.Runtime.CompilerServices;

// Runtime 어셈블리가 파사드의 internal 수명 주기 멤버(재시작, 루트, 종료)를 다룬다.
[assembly: InternalsVisibleTo("PortfolioIdleRpg.Runtime")]

// EditMode 테스트가 internal 계산(SafeAreaFit)을 검사한다.
[assembly: InternalsVisibleTo("PortfolioIdleRpg.Facades.Tests")]

// 플레이어 빌드 전처리가 앱 설정을 넣을 곳(RuntimeFacade.ConfigResource)을 파사드와 같은 이름으로 쓴다.
[assembly: InternalsVisibleTo("PortfolioIdleRpg.Editor")]
