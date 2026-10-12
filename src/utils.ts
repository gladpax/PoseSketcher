import { Point, Character, Arm, Leg, CharacterProfile, LimbLayerKey } from './types';
import { CurrentCharacterBlueprint } from './blueprint';

export function getDefaultLayerPriorities(isSideView: boolean): Record<LimbLayerKey, number> {
  if (isSideView) {
    // 侧面模式：整体结构为 arm(底) < leg < 躯干 < leg < arm(顶)
    // 同类型规则：先画的(arm1/leg1)在下层，后画的(arm2/leg2)在上层
    // arm1=0(底), leg1=1, torso=2, leg2=3, arm2=4(顶)
    return { arm1: 0, leg1: 1, torso: 2, leg2: 3, arm2: 4 };
  } else {
    // 正面：腿整体低于臂，同类型先画的在下层
    return { torso: 0, leg1: 1, leg2: 2, arm1: 3, arm2: 4 };
  }
}

/**
 * 大气透视（Aerial Perspective）颜色调制。
 * 将颜色向雾色线性插值，模拟远景褪色效果。
 * depthFactor: 0（最近/最顶层）→ 1（最远/最底层）
 * intensity:   0（无效果）→ 1（最强）
 * 雾色 #b0bfcf 为偏冷蓝灰，对纯黑/纯白/彩色均有效。
 */
export function modulateColorDepth(hexColor: string, depthFactor: number, intensity: number): string {
  if (intensity <= 0 || depthFactor <= 0) return hexColor;

  // 雾色：大气冷蓝灰 #b0bfcf
  const FR = 0xb0 / 255;
  const FG = 0xbf / 255;
  const FB = 0xcf / 255;

  // 解析原色（支持 hex 和 hsl() 字符串）
  let r: number, g: number, b: number;
  const hex = hexColor.replace('#', '');
  if (hexColor.startsWith('#') && (hex.length === 6 || hex.length === 3)) {
    const h6 = hex.length === 3
      ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      : hex;
    r = parseInt(h6.substring(0, 2), 16) / 255;
    g = parseInt(h6.substring(2, 4), 16) / 255;
    b = parseInt(h6.substring(4, 6), 16) / 255;
  } else if (hexColor.startsWith('hsl')) {
    // 将 hsl() 转为 rgb（给旧代码路径兼容）
    const m = hexColor.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
    if (!m) return hexColor;
    const hh = parseFloat(m[1]) / 360;
    const ss = parseFloat(m[2]) / 100;
    const ll = parseFloat(m[3]) / 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1/3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1/3);
  } else {
    return hexColor;
  }

  // 向雾色 lerp
  const t = depthFactor * intensity;
  const rNew = r + (FR - r) * t;
  const gNew = g + (FG - g) * t;
  const bNew = b + (FB - b) * t;

  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255))).toString(16).padStart(2, '0');
  return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
}

/**
 * 根据 layerPriorities 计算各肢体的深度因子。
 * 躯干始终返回 0（不参与调制）。
 * 其他已存在的肢体按优先级从低到高排名，rank/count → depthFactor。
 */
export function computeLimbDepthFactors(char: Character): Record<LimbLayerKey, number> {
  const lp = char.layerPriorities;
  // 收集实际存在的四肢 key
  const activeLimbs: LimbLayerKey[] = [];
  if (char.arm1) activeLimbs.push('arm1');
  if (char.arm2) activeLimbs.push('arm2');
  if (char.leg1) activeLimbs.push('leg1');
  if (char.leg2) activeLimbs.push('leg2');

  // 按 priority 升序排序（越小越靠底层，深度因子越大）
  activeLimbs.sort((a, b) => lp[a] - lp[b]);

  const count = activeLimbs.length;
  const result: Record<LimbLayerKey, number> = { torso: 0, arm1: 0, arm2: 0, leg1: 0, leg2: 0 };

  activeLimbs.forEach((key, rank) => {
    // rank 0（最底层）→ depthFactor 最大；rank count-1（最顶层）→ depthFactor = 0
    result[key] = count > 1 ? (count - 1 - rank) / (count - 1) : 0;
  });

  return result;
}

export type ChainSeg = { p1: Point; r1: number; p2: Point; r2: number };

/**
 * joints[0] 为根节点，joints[n-1] 为末端节点；radii 与 joints 等长。
 * ratio=0 → clothingSegs 为空，distalSegs 为全链；
 * ratio=1 → clothingSegs 为全链，distalSegs 为空。
 * 分界点落在段中间时，对坐标和半径线性插值，不强制对齐到关节点。
 */
export function splitChainAtRatio(joints: Point[], radii: number[], ratio: number): { clothingSegs: ChainSeg[]; distalSegs: ChainSeg[] } {
  const clothingSegs: ChainSeg[] = [];
  const distalSegs: ChainSeg[] = [];
  if (joints.length < 2) return { clothingSegs, distalSegs };

  // 计算各段长度及总长
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < joints.length - 1; i++) {
    const l = Math.hypot(joints[i + 1].x - joints[i].x, joints[i + 1].y - joints[i].y);
    segLengths.push(l);
    totalLen += l;
  }

  const splitDist = totalLen * Math.max(0, Math.min(1, ratio));
  let accumulated = 0;
  let splitDone = false;

  for (let i = 0; i < joints.length - 1; i++) {
    const segLen = segLengths[i];
    const segEnd = accumulated + segLen;

    if (splitDone) {
      // 分界点已经过，整段归末端
      distalSegs.push({ p1: joints[i], r1: radii[i], p2: joints[i + 1], r2: radii[i + 1] });
    } else if (segEnd <= splitDist) {
      // 整段在分界点之前，归根部
      clothingSegs.push({ p1: joints[i], r1: radii[i], p2: joints[i + 1], r2: radii[i + 1] });
    } else {
      // 分界点落在本段内部
      const t = segLen > 0 ? (splitDist - accumulated) / segLen : 0;
      const px = joints[i].x + (joints[i + 1].x - joints[i].x) * t;
      const py = joints[i].y + (joints[i + 1].y - joints[i].y) * t;
      const pr = radii[i] + (radii[i + 1] - radii[i]) * t;
      const pSplit: Point = { x: px, y: py };
      if (t > 0) clothingSegs.push({ p1: joints[i], r1: radii[i], p2: pSplit, r2: pr });
      if (t < 1) distalSegs.push({ p1: pSplit, r1: pr, p2: joints[i + 1], r2: radii[i + 1] });
      splitDone = true;
    }
    accumulated += segLen;
  }

  return { clothingSegs, distalSegs };
}

export function strokeLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

export function getPointAtDistance(points: Point[], distance: number): { point: Point; angle: number } {
  if (points.length === 0) return { point: { x: 0, y: 0 }, angle: 0 };
  if (points.length === 1) return { point: points[0], angle: 0 };

  let currentDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (currentDist + d >= distance) {
      const t = d === 0 ? 0 : (distance - currentDist) / d;
      const x = p1.x + t * (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      return { point: { x, y }, angle };
    }
    currentDist += d;
  }
  
  // Extrapolate
  const p1 = points[points.length - 2];
  const p2 = points[points.length - 1];
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const extra = distance - currentDist;
  const dx = d === 0 ? 0 : (p2.x - p1.x) / d;
  const dy = d === 0 ? 0 : (p2.y - p1.y) / d;
  return {
    point: { x: p2.x + dx * extra, y: p2.y + dy * extra },
    angle: Math.atan2(dy, dx)
  };
}

export function generateMainAxis(stroke: Point[], isSideView: boolean = false): Character | null {
  const L = strokeLength(stroke);
  if (L < 20) return null; // Too short
  // The first stroke is just head + torso. Let's assume it represents 3 units (head=1, torso=2)
  const scale = L / 3.0;

  const profile: CharacterProfile = JSON.parse(JSON.stringify(CurrentCharacterBlueprint));
  const spineRatios = profile.ratios.spine;

  let headCenter = getPointAtDistance(stroke, spineRatios.headCenterRatio * scale).point;
  let neckTop = getPointAtDistance(stroke, spineRatios.neckTopRatio * scale).point;
  const neckBottom = getPointAtDistance(stroke, spineRatios.neckBottomRatio * scale).point;
  let midTorso = getPointAtDistance(stroke, spineRatios.midTorsoRatio * scale).point;
  const waist = getPointAtDistance(stroke, L).point;

  // Derive headAngle from the chord stroke[0]→neckTop: captures the user's intended
  // head-tilt direction over the whole head segment, avoids single-segment jitter.
  let headAngle = Math.atan2(neckTop.y - stroke[0].y, neckTop.x - stroke[0].x);

  const torsoPath = [];
  for (let d = spineRatios.neckBottomRatio * scale; d <= L; d += 10) {
    torsoPath.push(getPointAtDistance(stroke, d).point);
  }
  if (torsoPath.length === 0 || Math.hypot(torsoPath[torsoPath.length-1].x - waist.x, torsoPath[torsoPath.length-1].y - waist.y) > 5) {
    torsoPath.push(waist);
  }

  let nx = 1, ny = 0;
  if (torsoPath.length > 1) {
    const dx = torsoPath[1].x - torsoPath[0].x;
    const dy = torsoPath[1].y - torsoPath[0].y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      nx = -dy / len;
      ny = dx / len;
    }
  }

  // Adjust for side view (head forward tilt)
  if (isSideView && torsoPath.length > 1) {
    const forwardTilt = 0.15 * scale;
    neckTop = { x: neckTop.x + nx * forwardTilt, y: neckTop.y + ny * forwardTilt };
    const convexBias = 0.08 * scale;
    midTorso = { x: midTorso.x + nx * convexBias, y: midTorso.y + ny * convexBias };
  }

  headCenter = { 
    x: neckTop.x - Math.cos(headAngle) * (spineRatios.neckTopRatio - spineRatios.headCenterRatio) * scale, 
    y: neckTop.y - Math.sin(headAngle) * (spineRatios.neckTopRatio - spineRatios.headCenterRatio) * scale 
  };

  const shoulderBase = {
      x: neckBottom.x,
      y: neckBottom.y
  };

  const sOffset = profile.ratios.shoulderOffset;
  const shoulderWidth = isSideView ? sOffset.x * 0.2 : sOffset.x;
  // Apply both x (width) and y (height) offsets relative to shoulderBase
  let sxVecX = nx * shoulderWidth * scale;
  let sxVecY = ny * shoulderWidth * scale;
  let syVecX = -ny * sOffset.y * scale; // Perpendicular to normal is roughly tangent
  let syVecY = nx * sOffset.y * scale;

  const shoulderLeft = { x: shoulderBase.x + sxVecX + syVecX, y: shoulderBase.y + sxVecY + syVecY };
  const shoulderRight = { x: shoulderBase.x - sxVecX + syVecX, y: shoulderBase.y - sxVecY + syVecY };

  let hnx = 1, hny = 0;
  let tx = 0, ty = 1;
  if (torsoPath.length > 1) {
    const dx = torsoPath[torsoPath.length-1].x - torsoPath[torsoPath.length-2].x;
    const dy = torsoPath[torsoPath.length-1].y - torsoPath[torsoPath.length-2].y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      tx = dx / len;
      ty = dy / len;
      hnx = -ty;
      hny = tx;
    }
  }

  const hOffset = profile.ratios.hipOffset;
  const hipWidth = isSideView ? hOffset.x * 0.2 : hOffset.x;
  
  // Calculate hip positions using exact offset defined in blueprint
  let hxVecX = hnx * hipWidth * scale;
  let hxVecY = hny * hipWidth * scale;
  let hyVecX = tx * hOffset.y * scale;
  let hyVecY = ty * hOffset.y * scale;

  const hipLeft = { x: waist.x + hxVecX + hyVecX, y: waist.y + hxVecY + hyVecY };
  const hipRight = { x: waist.x - hxVecX + hyVecX, y: waist.y - hxVecY + hyVecY };

  return {
    id: 'preview',
    isSideView,
    isComplete: false,
    scale,
    profile,
    strokes: [stroke],
    headCenter, headAngle, neckTop, neckBottom, midTorso, torsoPath, waist,
    shoulderLeft, shoulderRight,
    hipLeft, hipRight,
    arm1: null, arm2: null, leg1: null, leg2: null,
    layerPriorities: getDefaultLayerPriorities(isSideView)
  };
}

export function generateLimb(stroke: Point[], startPoint: Point, type: string, profile: CharacterProfile, isSideView?: boolean): Arm | Leg {
  const offset = { x: startPoint.x - stroke[0].x, y: startPoint.y - stroke[0].y };
  const offsetStroke = stroke.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }));
  const L = strokeLength(offsetStroke);

  if (type === 'shoulderLeft' || type === 'shoulderRight') {
    const r = profile.ratios.arm;
    const wrist = getPointAtDistance(offsetStroke, L * r.wristRatio).point;
    const hand = getPointAtDistance(offsetStroke, L).point;

    const dx = hand.x - wrist.x;
    const dy = hand.y - wrist.y;
    const len = Math.hypot(dx, dy);
    let nx = 1, ny = 0;
    if (len > 0) {
      nx = -dy / len;
      ny = dx / len;
    }
    const thumbDir = isSideView ? 1 : (type === 'shoulderLeft' ? -1 : 1);
    const thumb = {
      x: wrist.x + dx * r.thumbPosRatio + nx * thumbDir * len * r.thumbLengthRatio,
      y: wrist.y + dy * r.thumbPosRatio + ny * thumbDir * len * r.thumbLengthRatio
    };

    return {
      shoulder: startPoint,
      elbow: getPointAtDistance(offsetStroke, L * r.elbowRatio).point,
      wrist,
      hand,
      thumb
    };
  } else {
    // hipLeft or hipRight
    const r = profile.ratios.leg;
    return {
      hip: startPoint,
      knee: getPointAtDistance(offsetStroke, L * r.kneeRatio).point,
      ankle: getPointAtDistance(offsetStroke, L * r.ankleRatio).point,
      // For now we just use the end of the stroke as toe. We can use r.toeLengthRatio later.
      toe: getPointAtDistance(offsetStroke, L).point,
    };
  }
}

export function findAttachmentPoint(p: Point, chars: Character[], jointScale: number = 1) {
  let best = null;
  let bestDist = Infinity;

  for (const char of chars) {
    if (char.isComplete) continue;

    // 半径与 CharacterRenderer Joint 组件保持一致：baseRadius * jointScale * 2（hover 触发区）
    const shoulderRadius = 0.12 * char.scale * jointScale * 2;
    const hipRadius = 0.15 * char.scale * jointScale * 2;

    const points: { type: string; point: { x: number; y: number }; radius: number }[] = [];
    if (!char.arm1) points.push({ type: 'shoulderLeft', point: char.shoulderLeft, radius: shoulderRadius });
    if (!char.arm2) points.push({ type: 'shoulderRight', point: char.shoulderRight, radius: shoulderRadius });
    if (!char.leg1) points.push({ type: 'hipLeft', point: char.hipLeft, radius: hipRadius });
    if (!char.leg2) points.push({ type: 'hipRight', point: char.hipRight, radius: hipRadius });

    for (const pt of points) {
      const d = Math.hypot(pt.point.x - p.x, pt.point.y - p.y);
      if (d < pt.radius && d < bestDist) {
        bestDist = d;
        best = { charId: char.id, type: pt.type, point: pt.point };
      }
    }
  }
  return best;
}

export function findDraggableJoint(p: Point, chars: Character[], showWaistMoveHandle: boolean = false) {
  let best = null;
  let minDist = 20;

  for (const char of chars) {
    const joints: { name: string; point: Point }[] = [];

    if (char.isComplete) {
      // 完整角色：暴露所有躯干和头部关节
      const scHead = char.profile.scales.head;
      const headTop = {
        x: char.neckTop.x - Math.cos(char.headAngle) * 0.9 * char.scale * scHead,
        y: char.neckTop.y - Math.sin(char.headAngle) * 0.9 * char.scale * scHead
      };
      joints.push(
        { name: 'headTop', point: headTop },
        { name: 'neckTop', point: char.neckTop },
        { name: 'root', point: char.neckBottom },
        { name: 'shoulderLeft', point: char.shoulderLeft },
        { name: 'shoulderRight', point: char.shoulderRight },
        { name: 'hipLeft', point: char.hipLeft },
        { name: 'hipRight', point: char.hipRight },
        { name: showWaistMoveHandle ? 'waistMoveHandle' : 'midTorso', point: char.midTorso },
        { name: 'waist', point: char.waist },
      );
    }
    if (!char.isComplete) {
      // 躯干骨骼点：第一笔就存在，始终可拖
      const scHead = char.profile.scales.head;
      const headTop = {
        x: char.neckTop.x - Math.cos(char.headAngle) * 0.9 * char.scale * scHead,
        y: char.neckTop.y - Math.sin(char.headAngle) * 0.9 * char.scale * scHead
      };
      joints.push(
        { name: 'headTop', point: headTop },
        { name: 'neckTop', point: char.neckTop },
        { name: 'root', point: char.neckBottom },
        { name: showWaistMoveHandle ? 'waistMoveHandle' : 'midTorso', point: char.midTorso },
        { name: 'waist', point: char.waist },
      );
      // 肢体根部骨骼点（已画肢体时暴露）
      if (char.arm1) joints.push({ name: 'shoulderLeft', point: char.shoulderLeft });
      if (char.arm2) joints.push({ name: 'shoulderRight', point: char.shoulderRight });
      if (char.leg1) joints.push({ name: 'hipLeft', point: char.hipLeft });
      if (char.leg2) joints.push({ name: 'hipRight', point: char.hipRight });
    }
    // 无论是否完整，已画肢体的末端关节都可调节
    if (char.leg1) {
      joints.push({ name: 'leg1.knee', point: char.leg1.knee });
      joints.push({ name: 'leg1.ankle', point: char.leg1.ankle });
      joints.push({ name: 'leg1.toe', point: char.leg1.toe });
    }
    if (char.leg2) {
      joints.push({ name: 'leg2.knee', point: char.leg2.knee });
      joints.push({ name: 'leg2.ankle', point: char.leg2.ankle });
      joints.push({ name: 'leg2.toe', point: char.leg2.toe });
    }
    if (char.arm1) {
      joints.push({ name: 'arm1.elbow', point: char.arm1.elbow });
      joints.push({ name: 'arm1.wrist', point: char.arm1.wrist });
      joints.push({ name: 'arm1.hand', point: char.arm1.hand });
      joints.push({ name: 'arm1.thumb', point: char.arm1.thumb });
    }
    if (char.arm2) {
      joints.push({ name: 'arm2.elbow', point: char.arm2.elbow });
      joints.push({ name: 'arm2.wrist', point: char.arm2.wrist });
      joints.push({ name: 'arm2.hand', point: char.arm2.hand });
      joints.push({ name: 'arm2.thumb', point: char.arm2.thumb });
    }

    for (const j of joints) {
      const d = Math.hypot(j.point.x - p.x, j.point.y - p.y);
      if (d < minDist) {
        minDist = d;
        best = { charId: char.id, jointName: j.name };
      }
    }
  }
  return best;
}

export function updateCharacter(char: Character, jointName: string, delta: Point): Character {
  const newChar = { ...char };
  const movePoint = (p: Point) => ({ x: p.x + delta.x, y: p.y + delta.y });
  const moveArm = (arm: Arm | null, from: 'shoulder' | 'elbow' | 'wrist' | 'hand' | 'thumb') => {
    if (!arm) return arm;
    const newArm = { ...arm };
    if (from === 'shoulder') newArm.shoulder = movePoint(newArm.shoulder);
    if (from === 'shoulder' || from === 'elbow') newArm.elbow = movePoint(newArm.elbow);
    if (from === 'shoulder' || from === 'elbow' || from === 'wrist') {
      newArm.wrist = movePoint(newArm.wrist);
      newArm.thumb = movePoint(newArm.thumb);
    }
    if (from !== 'thumb') newArm.hand = movePoint(newArm.hand);
    if (from === 'thumb') newArm.thumb = movePoint(newArm.thumb);
    return newArm;
  };

  const moveLeg = (leg: Leg | null, from: 'hip' | 'knee' | 'ankle' | 'toe') => {
    if (!leg) return leg;
    const newLeg = { ...leg };
    if (from === 'hip') newLeg.hip = movePoint(newLeg.hip);
    if (from === 'hip' || from === 'knee') newLeg.knee = movePoint(newLeg.knee);
    if (from === 'hip' || from === 'knee' || from === 'ankle') newLeg.ankle = movePoint(newLeg.ankle);
    newLeg.toe = movePoint(newLeg.toe);
    return newLeg;
  };

  const translateCharacter = () => {
    newChar.headCenter = movePoint(newChar.headCenter);
    newChar.neckTop = movePoint(newChar.neckTop);
    newChar.neckBottom = movePoint(newChar.neckBottom);
    newChar.midTorso = movePoint(newChar.midTorso);
    newChar.torsoPath = newChar.torsoPath.map(movePoint);
    newChar.waist = movePoint(newChar.waist);
    newChar.shoulderLeft = movePoint(newChar.shoulderLeft);
    newChar.shoulderRight = movePoint(newChar.shoulderRight);
    newChar.hipLeft = movePoint(newChar.hipLeft);
    newChar.hipRight = movePoint(newChar.hipRight);
    newChar.strokes = newChar.strokes.map(stroke => stroke.map(movePoint));

    const moveArmAll = (arm: Arm | null) => arm ? {
      shoulder: movePoint(arm.shoulder), elbow: movePoint(arm.elbow),
      wrist: movePoint(arm.wrist), hand: movePoint(arm.hand), thumb: movePoint(arm.thumb)
    } : null;
    const moveLegAll = (leg: Leg | null) => leg ? {
      hip: movePoint(leg.hip), knee: movePoint(leg.knee),
      ankle: movePoint(leg.ankle), toe: movePoint(leg.toe)
    } : null;

    newChar.arm1 = moveArmAll(newChar.arm1);
    newChar.arm2 = moveArmAll(newChar.arm2);
    newChar.leg1 = moveLegAll(newChar.leg1);
    newChar.leg2 = moveLegAll(newChar.leg2);
    return newChar;
  };

  if (jointName === 'headTop') {
    const scHead = newChar.profile.scales.head;
    const headTop = {
      x: newChar.neckTop.x - Math.cos(newChar.headAngle) * 0.9 * newChar.scale * scHead,
      y: newChar.neckTop.y - Math.sin(newChar.headAngle) * 0.9 * newChar.scale * scHead
    };
    const newHeadTop = movePoint(headTop);
    const dx = newChar.neckTop.x - newHeadTop.x;
    const dy = newChar.neckTop.y - newHeadTop.y;
    newChar.headAngle = Math.atan2(dy, dx);
    newChar.headCenter = {
      x: newChar.neckTop.x - Math.cos(newChar.headAngle) * 0.5 * newChar.scale,
      y: newChar.neckTop.y - Math.sin(newChar.headAngle) * 0.5 * newChar.scale
    };
    const actualNewHeadTop = {
      x: newChar.neckTop.x - Math.cos(newChar.headAngle) * 0.9 * newChar.scale * scHead,
      y: newChar.neckTop.y - Math.sin(newChar.headAngle) * 0.9 * newChar.scale * scHead
    };
    delta.x = actualNewHeadTop.x - headTop.x;
    delta.y = actualNewHeadTop.y - headTop.y;
    return newChar;
  }

  if (jointName === 'neckTop') {
    newChar.neckTop = movePoint(newChar.neckTop);
    newChar.headCenter = movePoint(newChar.headCenter);
    return newChar;
  }

  if (jointName === 'root') {
    newChar.neckBottom = movePoint(newChar.neckBottom);
    newChar.neckTop = movePoint(newChar.neckTop);
    newChar.headCenter = movePoint(newChar.headCenter);
    newChar.midTorso = {
      x: char.midTorso.x + delta.x * 0.45,
      y: char.midTorso.y + delta.y * 0.45
    };
    newChar.shoulderLeft = movePoint(newChar.shoulderLeft);
    newChar.shoulderRight = movePoint(newChar.shoulderRight);
    newChar.arm1 = moveArm(newChar.arm1, 'shoulder');
    newChar.arm2 = moveArm(newChar.arm2, 'shoulder');
    newChar.torsoPath = char.torsoPath.map((p, i) => {
      const t = char.torsoPath.length <= 1 ? 0 : i / (char.torsoPath.length - 1);
      const weight = Math.pow(1 - t, 1.35);
      return {
        x: p.x + delta.x * weight,
        y: p.y + delta.y * weight
      };
    });
    return newChar;
  }

  if (jointName === 'waistMoveHandle') {
    return translateCharacter();
  }


  if (jointName === 'shoulderLeft') {
    let newShoulder = movePoint(char.shoulderLeft);
    const maxDist = 0.6 * char.scale;
    const dist = Math.hypot(newShoulder.x - char.neckBottom.x, newShoulder.y - char.neckBottom.y);
    if (dist > maxDist) {
      newShoulder = {
        x: char.neckBottom.x + (newShoulder.x - char.neckBottom.x) * maxDist / dist,
        y: char.neckBottom.y + (newShoulder.y - char.neckBottom.y) * maxDist / dist
      };
    }
    delta.x = newShoulder.x - char.shoulderLeft.x;
    delta.y = newShoulder.y - char.shoulderLeft.y;
    newChar.shoulderLeft = newShoulder;
    newChar.arm1 = moveArm(newChar.arm1, 'shoulder');
  } else if (jointName === 'arm1.elbow') {
    newChar.arm1 = moveArm(newChar.arm1, 'elbow');
  } else if (jointName === 'arm1.wrist') {
    newChar.arm1 = moveArm(newChar.arm1, 'wrist');
  } else if (jointName === 'arm1.hand') {
    newChar.arm1 = moveArm(newChar.arm1, 'hand');
  } else if (jointName === 'arm1.thumb') {
    newChar.arm1 = moveArm(newChar.arm1, 'thumb');
  }
  else if (jointName === 'shoulderRight') {
    let newShoulder = movePoint(char.shoulderRight);
    const maxDist = 0.6 * char.scale;
    const dist = Math.hypot(newShoulder.x - char.neckBottom.x, newShoulder.y - char.neckBottom.y);
    if (dist > maxDist) {
      newShoulder = {
        x: char.neckBottom.x + (newShoulder.x - char.neckBottom.x) * maxDist / dist,
        y: char.neckBottom.y + (newShoulder.y - char.neckBottom.y) * maxDist / dist
      };
    }
    delta.x = newShoulder.x - char.shoulderRight.x;
    delta.y = newShoulder.y - char.shoulderRight.y;
    newChar.shoulderRight = newShoulder;
    newChar.arm2 = moveArm(newChar.arm2, 'shoulder');
  } else if (jointName === 'arm2.elbow') {
    newChar.arm2 = moveArm(newChar.arm2, 'elbow');
  } else if (jointName === 'arm2.wrist') {
    newChar.arm2 = moveArm(newChar.arm2, 'wrist');
  } else if (jointName === 'arm2.hand') {
    newChar.arm2 = moveArm(newChar.arm2, 'hand');
  } else if (jointName === 'arm2.thumb') {
    newChar.arm2 = moveArm(newChar.arm2, 'thumb');
  }
  else if (jointName === 'midTorso') {
    const newMid = movePoint(char.midTorso);
    const dx = newMid.x - char.midTorso.x;
    const dy = newMid.y - char.midTorso.y;
    newChar.midTorso = newMid;
    newChar.torsoPath = char.torsoPath.map((p, i) => {
      const t = i / (char.torsoPath.length - 1);
      const weight = Math.sin(t * Math.PI);
      return {
        x: p.x + dx * weight,
        y: p.y + dy * weight
      };
    });
  } else if (jointName === 'waist') {
    newChar.waist = movePoint(newChar.waist);
    newChar.hipLeft = movePoint(newChar.hipLeft);
    newChar.hipRight = movePoint(newChar.hipRight);
    newChar.leg1 = moveLeg(newChar.leg1, 'hip');
    newChar.leg2 = moveLeg(newChar.leg2, 'hip');
    newChar.midTorso = {
      x: char.midTorso.x + delta.x * 0.5,
      y: char.midTorso.y + delta.y * 0.5
    };
    newChar.torsoPath = newChar.torsoPath.map((p, i) => {
      const t = i / (newChar.torsoPath.length - 1);
      return { x: p.x + delta.x * t, y: p.y + delta.y * t };
    });
  } else if (jointName === 'hipLeft') {
    let newHip = movePoint(char.hipLeft);
    const maxDist = 0.6 * char.scale;
    const dist = Math.hypot(newHip.x - char.waist.x, newHip.y - char.waist.y);
    if (dist > maxDist) {
      newHip = {
        x: char.waist.x + (newHip.x - char.waist.x) * maxDist / dist,
        y: char.waist.y + (newHip.y - char.waist.y) * maxDist / dist
      };
    }
    delta.x = newHip.x - char.hipLeft.x;
    delta.y = newHip.y - char.hipLeft.y;
    newChar.hipLeft = newHip;
    newChar.leg1 = moveLeg(newChar.leg1, 'hip');
  } else if (jointName === 'hipRight') {
    let newHip = movePoint(char.hipRight);
    const maxDist = 0.6 * char.scale;
    const dist = Math.hypot(newHip.x - char.waist.x, newHip.y - char.waist.y);
    if (dist > maxDist) {
      newHip = {
        x: char.waist.x + (newHip.x - char.waist.x) * maxDist / dist,
        y: char.waist.y + (newHip.y - char.waist.y) * maxDist / dist
      };
    }
    delta.x = newHip.x - char.hipRight.x;
    delta.y = newHip.y - char.hipRight.y;
    newChar.hipRight = newHip;
    newChar.leg2 = moveLeg(newChar.leg2, 'hip');
  } else if (jointName === 'leg1.knee') {
    newChar.leg1 = moveLeg(newChar.leg1, 'knee');
  } else if (jointName === 'leg1.ankle') {
    newChar.leg1 = moveLeg(newChar.leg1, 'ankle');
  } else if (jointName === 'leg1.toe') {
    newChar.leg1 = moveLeg(newChar.leg1, 'toe');
  } else if (jointName === 'leg2.knee') {
    newChar.leg2 = moveLeg(newChar.leg2, 'knee');
  } else if (jointName === 'leg2.ankle') {
    newChar.leg2 = moveLeg(newChar.leg2, 'ankle');
  } else if (jointName === 'leg2.toe') {
    newChar.leg2 = moveLeg(newChar.leg2, 'toe');
  }

  return newChar;
}

// 以 pivot 为中心等比缩放整个角色（所有关节坐标 + char.scale）
export function scaleCharacter(char: Character, scaleFactor: number, pivot: Point): Character {
  const newChar = { ...char };
  const sp = (p: Point): Point => ({
    x: pivot.x + (p.x - pivot.x) * scaleFactor,
    y: pivot.y + (p.y - pivot.y) * scaleFactor,
  });
  const scaleArm = (arm: Arm | null): Arm | null =>
    arm ? { shoulder: sp(arm.shoulder), elbow: sp(arm.elbow), wrist: sp(arm.wrist), hand: sp(arm.hand), thumb: sp(arm.thumb) } : null;
  const scaleLeg = (leg: Leg | null): Leg | null =>
    leg ? { hip: sp(leg.hip), knee: sp(leg.knee), ankle: sp(leg.ankle), toe: sp(leg.toe) } : null;

  newChar.headCenter = sp(char.headCenter);
  newChar.neckTop = sp(char.neckTop);
  newChar.neckBottom = sp(char.neckBottom);
  newChar.midTorso = sp(char.midTorso);
  newChar.torsoPath = char.torsoPath.map(sp);
  newChar.waist = sp(char.waist);
  newChar.shoulderLeft = sp(char.shoulderLeft);
  newChar.shoulderRight = sp(char.shoulderRight);
  newChar.hipLeft = sp(char.hipLeft);
  newChar.hipRight = sp(char.hipRight);
  newChar.strokes = char.strokes.map(stroke => stroke.map(sp));
  newChar.arm1 = scaleArm(char.arm1);
  newChar.arm2 = scaleArm(char.arm2);
  newChar.leg1 = scaleLeg(char.leg1);
  newChar.leg2 = scaleLeg(char.leg2);
  newChar.scale = char.scale * scaleFactor;
  return newChar;
}
