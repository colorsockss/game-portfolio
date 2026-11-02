namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// 런타임이 파사드가 쥔 것을 버리는 방법. 파사드마다 어떻게 정리하는지 런타임이 몰라도 된다.
    /// </summary>
    internal static class FacadeLifecycle
    {
        /// <summary>
        /// 파사드가 쥔 뷰, 전투 월드, 소리, 소켓, 번들 받기, 로드를 버린다. 뷰를 먼저 정리해서, 정리되는 동안 어떤
        /// 뷰도 스크립트를 부르지 못하게 한다. 소켓, 번들 받기, 스크립트가 시작한 로드는 그냥 두면 스크립트보다 오래
        /// 살아남는다.
        /// 그 사이에는 스크립트가 돌지 않으므로 스크립트 환경을 폐기하기 전에 정리해도 달라지는 것이 없다.
        /// 앞 단계가 실패해도 뒤 단계는 정리하고, 그 예외는 그대로 올린다.
        /// </summary>
        internal static void Shutdown()
        {
            try
            {
                UiFacade.DestroyAll();
            }
            finally
            {
                try
                {
                    WorldFacade.DestroyAll();
                }
                finally
                {
                    try
                    {
                        AudioFacade.StopAll();
                    }
                    finally
                    {
                        try
                        {
                            WebSocketFacade.CloseAll();
                        }
                        finally
                        {
                            try
                            {
                                BundleFacade.CancelAll();
                            }
                            finally
                            {
                                ResourceFacade.ReleaseAll();
                            }
                        }
                    }
                }
            }
        }
    }
}
