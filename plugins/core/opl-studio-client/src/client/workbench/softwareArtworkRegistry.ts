// Product artwork is generated from the App-owned asset manifest during renderer builds.
export { softwareArtworkById, softwareArtworkCatalogIds, genericSoftwareIconUrl } from "../generated/softwareArtwork.generated";
import { softwareArtworkById } from "../generated/softwareArtwork.generated";

export function localSoftwareIconUrl(identity: string): string | undefined {
  return softwareArtworkById[identity.trim()];
}
