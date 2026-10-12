import { CharacterProfile } from './types';

// The default hardcoded structural values extracted from old HTML_PoseSketch math
export const DEFAULT_CHARACTER_PROFILE: CharacterProfile = {
  version: "0.3.0",
  baseColor: "#2c3e50", // Current canvas drawing stroke color / fill
  ratios: {
    arm: {
      elbowRatio: 0.40,
      wristRatio: 0.84,
      thumbPosRatio: 0.3,
      thumbLengthRatio: 0.4,
    },
    leg: {
      kneeRatio: 0.40,
      ankleRatio: 0.85,
      toeLengthRatio: 0.1,
    },
    spine: {
      // In the original algorithm: scale = L / 3.0
      // headCenter = 0.5 * scale
      headCenterRatio: 0.5,
      // neckTop = 1.0 * scale
      neckTopRatio: 1.0,
      // neckBottom = 1.5 * scale
      neckBottomRatio: 1.5,
      // midTorso is placed between neckBottom and waist(which is roughly L=3.0 scale) -> 2.25
      midTorsoRatio: 2.25,
    },
    // Offsets are typically multiplied by scale
    shoulderOffset: { x: 0.4, y: 0.15 }, 
    hipOffset: { x: 0.3, y: 0.15 },
  },
  // Scale multipliers for rendering thicknesses. Default is 1.0 (no extra thickness applied yet)
  scales: {
    head: 1.0,
    neck: 1.0,
    spineTop: 1.0,
    spineMid: 1.0,
    spineBottom: 1.0,
    shoulder: 1.0,
    elbow: 1.0,
    wrist: 1.0,
    hand: 1.0,
    thumb: 1.0,
    hip: 1.0,
    knee: 1.0,
    ankle: 1.0,
    foot: 1.0,
  }
};

// Global singleton representing the properties for any NEWLY drawn characters
export let CurrentCharacterBlueprint: CharacterProfile = JSON.parse(JSON.stringify(DEFAULT_CHARACTER_PROFILE));

export function updateBlueprint(newBlueprint: CharacterProfile) {
  CurrentCharacterBlueprint = JSON.parse(JSON.stringify(newBlueprint));
}

export function resetBlueprint() {
  CurrentCharacterBlueprint = JSON.parse(JSON.stringify(DEFAULT_CHARACTER_PROFILE));
}
