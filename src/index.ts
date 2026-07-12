import {
  ExtensionContext,
} from "@foxglove/extension";

import {
  initAdaptiveSatelliteMapPanel,
} from "./AdaptiveSatelliteMapPanel";

export function activate(
  extensionContext: ExtensionContext,
): void {
  extensionContext.registerPanel({
    name: "adaptive-satellite-map",
    initPanel:
      initAdaptiveSatelliteMapPanel,
  });
}