import type CS from "csharp";
import type { BundleStore } from "../application/ports.js";
import { EVERY_FRAME } from "./frame.js";

type Generated = typeof CS.PortfolioIdleRpg.Facades.BundleFacade;

/** 이 브리지가 쓰는 BundleFacade. 설치된 게임 번들이 없으면(첫 실행, 개발 빌드) CurrentManifest가 null이다. */
export interface BundleFacade extends Pick<
  Generated,
  | "Downloading" | "Downloaded" | "BeginStaging" | "Download" | "Poll" | "Reuse" | "ReadText" | "Size" | "Sha256" | "Commit" | "Discard"
  | "DownloadAssets" | "PollAssets" | "AssetBytesReceived" | "AssetBytesTotal"
> {
  CurrentManifest(): string | null;
}

/**
 * C# BundleFacade 위에 만든 BundleStore(application/ports.ts). C#이 받은 바이트를 파일에 바로 쓰고 해시도 C#이 계산하므로
 * 번들의 바이트는 스크립트로 넘어오지 않는다. 받는 동안은 매 프레임 끝났는지 묻는다.
 */
export function createBundleStore(facade: BundleFacade): BundleStore {
  return {
    current: () => facade.CurrentManifest(),
    begin: () => facade.BeginStaging(),
    download: (url, path) => new Promise((resolve, reject) => {
      const id = facade.Download(url, path);
      const timer = setInterval(() => {
        const state = facade.Poll(id);
        if (state === facade.Downloading) return;
        clearInterval(timer);
        if (state === facade.Downloaded) resolve();
        else reject(new Error(`Could not download ${url}.`));
      }, EVERY_FRAME);
    }),
    reuse: path => facade.Reuse(path),
    read: path => facade.ReadText(path),
    digest(path) {
      const size = facade.Size(path);
      return size < 0 ? null : { size, sha256: facade.Sha256(path) };
    },
    assets: (staged, progress) => new Promise((resolve, reject) => {
      facade.DownloadAssets(staged);
      const timer = setInterval(() => {
        const state = facade.PollAssets();
        progress(facade.AssetBytesReceived(), facade.AssetBytesTotal());
        if (state === facade.Downloading) return;
        clearInterval(timer);
        if (state === facade.Downloaded) resolve();
        else reject(new Error("Could not download the asset bundles."));
      }, EVERY_FRAME);
    }),
    commit: () => facade.Commit(),
    discard: () => facade.Discard(),
  };
}
