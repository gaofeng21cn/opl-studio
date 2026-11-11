import agentOldPhotoWorkflow from "../assets/software-icons/agent-old-photo-workflow.png";
import agentSessionVault from "../assets/software-icons/agent-session-vault.png";
import codexModels from "../assets/software-icons/codex-models.png";
import glkvmNative from "../assets/software-icons/glkvm-native.png";
import iphoneSteward from "../assets/software-icons/iphone-steward.png";
import journeyAtlas from "../assets/software-icons/journey-atlas.png";
import kindlePilot from "../assets/software-icons/kindle-pilot.png";
import macMediaAssets from "../assets/software-icons/mac-media-assets.png";
import masScholarSkills from "../assets/software-icons/mas-scholar-skills.png";
import medAutoCast from "../assets/software-icons/med-auto-cast.png";
import medAutoGrant from "../assets/software-icons/med-auto-grant.png";
import medAutoPractice from "../assets/software-icons/med-auto-practice.png";
import medAutoScience from "../assets/software-icons/med-auto-science.png";
import occ from "../assets/software-icons/occ.png";
import oplApp from "../assets/software-icons/opl-app.png";
import oplBookForge from "../assets/software-icons/opl-book-forge.png";
import oplFlow from "../assets/software-icons/opl-flow.png";
import oplFleetAgent from "../assets/software-icons/opl-fleet-agent.png";
import oplMetaAgent from "../assets/software-icons/opl-meta-agent.png";
import oplPersona from "../assets/software-icons/opl-persona.png";
import oplRelay from "../assets/software-icons/opl-relay.png";
import photoSteward from "../assets/software-icons/photo-steward.png";
import redcubeAi from "../assets/software-icons/redcube-ai.png";
import rednoteSteward from "../assets/software-icons/rednote-steward.png";
import softwareGeneric from "../assets/software-icons/software-generic.png";

/**
 * First-party artwork is bundled with Studio so the catalog stays useful when
 * a private source is signed out or a remote GitHub asset is unavailable.
 * Aliases cover the package, native product, and Homebrew identities that can
 * describe the same installed product.
 */
export const softwareArtworkById: Readonly<Record<string, string>> = Object.freeze({
  "agent-old-photo-workflow": agentOldPhotoWorkflow,
  "agent-session-vault": agentSessionVault,
  "github:gaofeng21cn/opl-codex-models": codexModels,
  "codex-models": codexModels,
  "codex-model-manager": codexModels,
  "glkvm-native": glkvmNative,
  "iphone-steward": iphoneSteward,
  "iphone-app-steward": iphoneSteward,
  "travel-passport": journeyAtlas,
  "journey-atlas": journeyAtlas,
  "kindle-pilot": kindlePilot,
  "mac-media-assets": macMediaAssets,
  "med-autocast": medAutoCast,
  "med-auto-cast": medAutoCast,
  mag: medAutoGrant,
  "med-autogrant": medAutoGrant,
  "med-autopractice": medAutoPractice,
  mas: medAutoScience,
  "med-autoscience": medAutoScience,
  "mas-scholar-skills": masScholarSkills,
  "github:gaofeng21cn/one-person-lab-app": oplApp,
  "one-person-lab-app": oplApp,
  "opl-studio": oplApp,
  "cask:opl-studio": oplApp,
  obf: oplBookForge,
  "opl-bookforge": oplBookForge,
  bookforge: oplBookForge,
  occ,
  "opl-capital-compass": occ,
  "github:gaofeng21cn/opl-fleet-agent": oplFleetAgent,
  "opl-fleet-agent": oplFleetAgent,
  "opl-netfleet": oplFleetAgent,
  "cask:opl-fleet-agent": oplFleetAgent,
  "opl-flow": oplFlow,
  "github:gaofeng21cn/one-person-lab": softwareGeneric,
  "opl-framework": softwareGeneric,
  framework: softwareGeneric,
  "formula:opl": softwareGeneric,
  oma: oplMetaAgent,
  "opl-meta-agent": oplMetaAgent,
  "opl-persona": oplPersona,
  persona: oplPersona,
  "opl-relay": oplRelay,
  relay: oplRelay,
  "photo-steward": photoSteward,
  rca: redcubeAi,
  "redcube-ai": redcubeAi,
  "rednote-steward": rednoteSteward
});

export const softwareArtworkCatalogIds = Object.freeze([
  "agent-old-photo-workflow",
  "agent-session-vault",
  "github:gaofeng21cn/opl-codex-models",
  "glkvm-native",
  "iphone-steward",
  "travel-passport",
  "kindle-pilot",
  "mac-media-assets",
  "med-autocast",
  "mag",
  "med-autopractice",
  "mas",
  "github:gaofeng21cn/one-person-lab-app",
  "obf",
  "occ",
  "github:gaofeng21cn/opl-fleet-agent",
  "opl-flow",
  "github:gaofeng21cn/one-person-lab",
  "oma",
  "opl-persona",
  "opl-relay",
  "photo-steward",
  "rca",
  "rednote-steward"
] as const);

export function localSoftwareIconUrl(identity: string): string | undefined {
  const value = identity.trim();
  return value ? softwareArtworkById[value] : undefined;
}

export const genericSoftwareIconUrl = softwareGeneric;
