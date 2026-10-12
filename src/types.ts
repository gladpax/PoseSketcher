export type Point = { x: number; y: number };

export type Colors = {
  body: string;
  head: string;
  hands: string;
  feet: string;
  arms: string;
  legs: string;
};

export type LimbLayerKey = 'torso' | 'arm1' | 'arm2' | 'leg1' | 'leg2';

export type ClothingRatios = {
  arms: number; // 0~1，臂根部区占臂总长（肩→腕）比例
  legs: number; // 0~1，腿根部区占腿总长（髋→踝）比例
};

// ==========================================
// v0.3: Character Profile & Blueprint System
// ==========================================

export type LengthRatios = {
  arm: {
    elbowRatio: number;
    wristRatio: number;
    thumbPosRatio: number;
    thumbLengthRatio: number;
  };
  leg: {
    kneeRatio: number;
    ankleRatio: number;
    toeLengthRatio: number;
  };
  spine: {
    headCenterRatio: number; // Based on arbitrary scale calculation in generateMainAxis
    neckTopRatio: number;
    neckBottomRatio: number;
    midTorsoRatio: number;
  };
  // Offsets for generating triangle structures (shoulder and hip widths/height differentials)
  shoulderOffset: { x: number; y: number }; 
  hipOffset: { x: number; y: number };
};

export type JointScales = {
  head: number;
  neck: number;
  spineTop: number;
  spineMid: number;
  spineBottom: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  hand: number;
  thumb: number;
  hip: number;
  knee: number;
  ankle: number;
  foot: number;
};

export type CharacterProfile = {
  version: string;
  ratios: LengthRatios;
  scales: JointScales;
  baseColor: string;
};

// ==========================================
// Entity Type Definitions
// ==========================================

export type Arm = {
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  hand: Point;
  thumb: Point;
};

export type Leg = {
  hip: Point;
  knee: Point;
  ankle: Point;
  toe: Point;
};

export type Character = {
  id: string;
  isSideView?: boolean;
  isComplete: boolean;
  scale: number;
  profile: CharacterProfile; // v0.3: Assigned during creation
  strokes: Point[][];
  
  headCenter: Point;
  headAngle: number;
  neckTop: Point;
  neckBottom: Point; // ROOT
  
  torsoPath: Point[];
  midTorso: Point;
  waist: Point;
  
  shoulderLeft: Point;
  shoulderRight: Point;
  
  hipLeft: Point;
  hipRight: Point;
  
  arm1: Arm | null;
  arm2: Arm | null;
  
  leg1: Leg | null;
  leg2: Leg | null;

  layerPriorities: Record<LimbLayerKey, number>;
  charZ?: number;
};
