import React, { useState, useEffect, useRef } from 'react';
import { CurrentCharacterBlueprint, resetBlueprint, updateBlueprint } from '../blueprint';
import { CharacterProfile, JointScales, Point, Character } from '../types';
import { Upload, Download, RotateCcw, Eye, EyeOff, Bug } from 'lucide-react';
import { CharacterRenderer } from './CharacterRenderer';
import { getDefaultLayerPriorities } from '../utils';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  backgroundColor?: string;
  debugShapeColors: boolean;
  onToggleDebugShapeColors: () => void;
}

export function CharacterEditorSidebar({
  isOpen,
  onToggle,
  backgroundColor = '#f8fafc',
  debugShapeColors,
  onToggleDebugShapeColors
}: SidebarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [profile, setProfile] = useState<CharacterProfile>(
    JSON.parse(JSON.stringify(CurrentCharacterBlueprint))
  );
  
  const [draggingJoint, setDraggingJoint] = useState<string | null>(null);
  const [scalingJoint, setScalingJoint] = useState<string | null>(null);
  const [showJointsToggle, setShowJointsToggle] = useState(true);
  const scalingStartRef = useRef<{ x: number; y: number; initialScale: number } | null>(null);
  const [activeValue, setActiveValue] = useState<{name: string, value: string} | null>(null);
  const finalizeEditorInteractionRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Keep local state in sync with global blueprint when it changes
    // Alternatively, this can act as the source of truth for the blueprint
    // when changes occur.
    setProfile(JSON.parse(JSON.stringify(CurrentCharacterBlueprint)));
  }, [isOpen]);

  // Derived properties for A-Pose rendering
  const scale = 100; // Render scale in the SVG canvas
  const centerX = 315; // Shifted right for the wider sidebar
  const topY = 65;

  // Spine points
  // Use scale * 3 as the total torso length concept from utils to match blueprint setup. 
  // Ratios in the old math were roughly relative to scale * 3. So waist is topY + scale * 3.0.
  // Head should be placed appropriately.
  // We need to normalize ratios identically to `generateMainAxis` in utils.ts.
  const spineScale = scale; 
  
  // Notice: The previous hardcoded logic manually set topY. But in the generator, 
  // the distance from stroke start. 
  // According to DEFAULT_CHARACTER_PROFILE:
  // headCenter.y = 0.5 * scale
  // neckTop.y = 1.0 * scale
  // neckBottom.y = 1.5 * scale
  // midTorso.y = 2.25 * scale
  // waist.y = 3.0 * scale
  const headCenter = { x: centerX, y: topY + (profile.ratios.spine.headCenterRatio - 0.5) * spineScale }; 
  const neckTop = { x: centerX, y: topY + (profile.ratios.spine.neckTopRatio - 0.5) * spineScale };
  // headTop: matches CharacterRenderer joint formula (neckTop - 0.9 * scale * sc.head in A-pose where sin(PI/2)=1)
  const headTopPoint = { x: neckTop.x, y: neckTop.y - 0.9 * scale * profile.scales.head };
  const neckBottom = { x: centerX, y: topY + (profile.ratios.spine.neckBottomRatio - 0.5) * spineScale };
  const midTorso = { x: centerX, y: topY + (profile.ratios.spine.midTorsoRatio - 0.5) * spineScale };
  const waist = { x: centerX, y: topY + (3.0 - 0.5) * spineScale };

  // Shoulders and Hips
  // In utils.ts, offset width is shoulderWidth * scale where shoulderWidth is profile.ratios.shoulderOffset.x
  const sOffsetX = profile.ratios.shoulderOffset.x * spineScale;
  const sOffsetY = profile.ratios.shoulderOffset.y * spineScale;
  const hOffsetX = profile.ratios.hipOffset.x * spineScale;
  const hOffsetY = profile.ratios.hipOffset.y * spineScale;

    // Follow utils.ts base placement for correct visual proxy
    const shoulderBaseY = neckBottom.y;

    // Normal mapping multiplier in utils.ts applies -1 to sOffset.y for A-pose
    const shoulderLeft = { x: neckBottom.x - sOffsetX, y: shoulderBaseY - sOffsetY };
    const shoulderRight = { x: neckBottom.x + sOffsetX, y: shoulderBaseY - sOffsetY };    const hipLeft = { x: waist.x - hOffsetX, y: waist.y + hOffsetY };
    const hipRight = { x: waist.x + hOffsetX, y: waist.y + hOffsetY };

    // A-Pose arbitrary lengths (making arms and legs longer as requested)
    const armLength = 2.6 * scale; // Adjusted down
    const legLength = 3.2 * scale; // Adjusted down
  // Render left arm (A-Pose: straight down, slightly outwards)
  // Making them spread wider (more dx)
  const armDx = -0.55; 
  const armDy = 0.85;
  const armMag = Math.sqrt(armDx * armDx + armDy * armDy);
  const leftArmDir = { x: armDx / armMag, y: armDy / armMag };

  const leftElbow = { x: shoulderLeft.x + leftArmDir.x * armLength * profile.ratios.arm.elbowRatio, y: shoulderLeft.y + leftArmDir.y * armLength * profile.ratios.arm.elbowRatio };
  const leftWrist = { x: shoulderLeft.x + leftArmDir.x * armLength * profile.ratios.arm.wristRatio, y: shoulderLeft.y + leftArmDir.y * armLength * profile.ratios.arm.wristRatio };
  const leftHand = { x: shoulderLeft.x + leftArmDir.x * armLength, y: shoulderLeft.y + leftArmDir.y * armLength };
  // Add a thumb point based on wrist to hand
  const thumbDx = leftHand.x - leftWrist.x;
  const thumbDy = leftHand.y - leftWrist.y;
  const leftThumb = { x: leftWrist.x + thumbDx * 0.4 - thumbDy * 0.5, y: leftWrist.y + thumbDy * 0.4 + thumbDx * 0.5 };

  // Render right arm (mirror)
  const rightArmDir = { x: -leftArmDir.x, y: leftArmDir.y };
  const rightElbow = { x: shoulderRight.x + rightArmDir.x * armLength * profile.ratios.arm.elbowRatio, y: shoulderRight.y + rightArmDir.y * armLength * profile.ratios.arm.elbowRatio };
  const rightWrist = { x: shoulderRight.x + rightArmDir.x * armLength * profile.ratios.arm.wristRatio, y: shoulderRight.y + rightArmDir.y * armLength * profile.ratios.arm.wristRatio };
  const rightHand = { x: shoulderRight.x + rightArmDir.x * armLength, y: shoulderRight.y + rightArmDir.y * armLength };
  const rightThumbDx = rightHand.x - rightWrist.x;
  const rightThumbDy = rightHand.y - rightWrist.y;
  const rightThumb = { x: rightWrist.x + rightThumbDx * 0.4 + rightThumbDy * 0.5, y: rightWrist.y + rightThumbDy * 0.4 - rightThumbDx * 0.5 };

  // Render left leg (A-Pose: straight down, slightly apart)
  const legDx = -0.35; // Spread legs wider
  const legDy = 0.95;
  const legMag = Math.sqrt(legDx * legDx + legDy * legDy);
  const leftLegDir = { x: legDx / legMag, y: legDy / legMag };

  const leftKnee = { x: hipLeft.x + leftLegDir.x * legLength * profile.ratios.leg.kneeRatio, y: hipLeft.y + leftLegDir.y * legLength * profile.ratios.leg.kneeRatio };
  const leftAnkle = { x: hipLeft.x + leftLegDir.x * legLength * profile.ratios.leg.ankleRatio, y: hipLeft.y + leftLegDir.y * legLength * profile.ratios.leg.ankleRatio };
  const leftToe = { x: hipLeft.x + leftLegDir.x * legLength, y: hipLeft.y + leftLegDir.y * legLength };

  // Render right leg (mirror)
  const rightLegDir = { x: -leftLegDir.x, y: leftLegDir.y };
  const rightKnee = { x: hipRight.x + rightLegDir.x * legLength * profile.ratios.leg.kneeRatio, y: hipRight.y + rightLegDir.y * legLength * profile.ratios.leg.kneeRatio };
  const rightAnkle = { x: hipRight.x + rightLegDir.x * legLength * profile.ratios.leg.ankleRatio, y: hipRight.y + rightLegDir.y * legLength * profile.ratios.leg.ankleRatio };
  const rightToe = { x: hipRight.x + rightLegDir.x * legLength, y: hipRight.y + rightLegDir.y * legLength };

  const dummyCharacter: Character = {
    id: 'blueprint-preview',
    isSideView: false,
    isComplete: true,
    scale: scale,
    profile: profile,
    strokes: [],
    headCenter,
    headAngle: Math.PI / 2, // Straight down
    neckTop,
    neckBottom,
    midTorso,
    waist,
    torsoPath: [neckBottom, midTorso, waist],
    shoulderLeft,
    shoulderRight,
    hipLeft,
    hipRight,
    arm1: { shoulder: shoulderLeft, elbow: leftElbow, wrist: leftWrist, hand: leftHand, thumb: leftThumb },
    arm2: { shoulder: shoulderRight, elbow: rightElbow, wrist: rightWrist, hand: rightHand, thumb: rightThumb },
    leg1: { hip: hipLeft, knee: leftKnee, ankle: leftAnkle, toe: leftToe },
    leg2: { hip: hipRight, knee: rightKnee, ankle: rightAnkle, toe: rightToe },
    layerPriorities: getDefaultLayerPriorities(false)
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const jointToScaleKey = (jointName: string): keyof JointScales | null => {
    const map: Partial<Record<string, keyof JointScales>> = {
      headTop: 'head',
      neckTop: 'neck', neckBottom: 'spineTop',
      midTorso: 'spineMid',
      waist: 'spineBottom',
      shoulderLeft: 'shoulder', shoulderRight: 'shoulder',
      hipLeft: 'hip', hipRight: 'hip',
      leftElbow: 'elbow', rightElbow: 'elbow',
      leftWrist: 'wrist', rightWrist: 'wrist',
      leftHand: 'hand', rightHand: 'hand',
      leftThumb: 'thumb', rightThumb: 'thumb',
      leftKnee: 'knee', rightKnee: 'knee',
      leftAnkle: 'ankle', rightAnkle: 'ankle',
      leftToe: 'foot', rightToe: 'foot',
    };
    return map[jointName] ?? null;
  };

  const getSVGPoint = (e: React.PointerEvent) => {
    if (!svgRef.current) return { x: e.clientX, y: e.clientY };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: e.clientX, y: e.clientY };
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    const p = getSVGPoint(e);

    let closestTarget: string | null = null;
    let minDist = 20;

    const check = (id: string, jp: Point) => {
      const d = Math.hypot(p.x - jp.x, p.y - jp.y);
      if (d < minDist) { minDist = d; closestTarget = id; }
    };

    check('headTop', headTopPoint);
    check('neckTop', neckTop);
    check('neckBottom', neckBottom);
    check('midTorso', midTorso);
    check('shoulderLeft', shoulderLeft);
    check('shoulderRight', shoulderRight);
    check('hipLeft', hipLeft);
    check('hipRight', hipRight);
    check('leftElbow', leftElbow);
    check('rightElbow', rightElbow);
    check('leftWrist', leftWrist);
    check('rightWrist', rightWrist);
    check('leftKnee', leftKnee);
    check('rightKnee', rightKnee);
    check('leftAnkle', leftAnkle);
    check('rightAnkle', rightAnkle);
    check('leftHand', leftHand);
    check('rightHand', rightHand);
    check('leftThumb', leftThumb);
    check('rightThumb', rightThumb);
    check('leftToe', leftToe);
    check('rightToe', rightToe);
    check('waist', waist);

    if (!closestTarget) return;
    e.stopPropagation();
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);

    if (e.button === 2) {
      const scaleKey = jointToScaleKey(closestTarget);
      if (scaleKey) {
        setScalingJoint(closestTarget);
        scalingStartRef.current = { x: e.clientX, y: e.clientY, initialScale: profile.scales[scaleKey] };
      }
    } else {
      setDraggingJoint(closestTarget);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (scalingJoint) {
      const scaleKey = jointToScaleKey(scalingJoint);
      if (scaleKey && scalingStartRef.current) {
        const dx = e.clientX - scalingStartRef.current.x;
        const dy = e.clientY - scalingStartRef.current.y;
        // 右移或上移变粗，左移或下移变细
        const delta = (dx - dy) / 150;
        const newScale = clamp(scalingStartRef.current.initialScale + delta, 0.1, 5.0);
        const newProfile = JSON.parse(JSON.stringify(profile)) as CharacterProfile;
        newProfile.scales[scaleKey] = newScale;
        setProfile(newProfile);
        updateBlueprint(newProfile);
        setActiveValue({ name: `Scale (${scaleKey})`, value: newScale.toFixed(2) });
      }
      return;
    }
    if (!draggingJoint) return;
    const p = getSVGPoint(e);
    const newProfile = JSON.parse(JSON.stringify(profile)) as CharacterProfile;
    let name = '';
    let valStr = '';

    const spineRatios = newProfile.ratios.spine;
    const armRatios = newProfile.ratios.arm;
    const legRatios = newProfile.ratios.leg;

    const spineRatioVal = (p.y - topY) / spineScale + 0.5;
    
    if (draggingJoint === 'headCenter') {
      spineRatios.headCenterRatio = clamp(spineRatioVal, 0.0, spineRatios.neckTopRatio - 0.05);
      name = 'Head Pos'; valStr = spineRatios.headCenterRatio.toFixed(3);
    } else if (draggingJoint === 'neckTop') {
        const headDist = spineRatios.neckTopRatio - spineRatios.headCenterRatio;
        spineRatios.neckTopRatio = clamp(spineRatioVal, headDist, spineRatios.neckBottomRatio - 0.05);
        // Move headCenter along with neckTop
        spineRatios.headCenterRatio = spineRatios.neckTopRatio - headDist;
      name = 'Neck Top'; valStr = spineRatios.neckTopRatio.toFixed(3);
    } else if (draggingJoint === 'neckBottom') {
      spineRatios.neckBottomRatio = clamp(spineRatioVal, spineRatios.neckTopRatio + 0.05, spineRatios.midTorsoRatio - 0.05);
      name = 'Neck Bottom'; valStr = spineRatios.neckBottomRatio.toFixed(3);
    } else if (draggingJoint === 'midTorso') {
      spineRatios.midTorsoRatio = clamp(spineRatioVal, spineRatios.neckBottomRatio + 0.05, 2.9);
      name = 'Mid Torso'; valStr = spineRatios.midTorsoRatio.toFixed(3);
    } 
    else if (draggingJoint === 'shoulderLeft' || draggingJoint === 'shoulderRight') {
      let targetP = { x: p.x, y: p.y };
      const maxDist = 0.6 * spineScale;
      const staticBaseX = neckBottom.x;
      const staticBaseY = neckBottom.y;
      const dist = Math.hypot(targetP.x - staticBaseX, targetP.y - staticBaseY);
      if (dist > maxDist) {
        targetP = {
          x: staticBaseX + (targetP.x - staticBaseX) * maxDist / dist,
          y: staticBaseY + (targetP.y - staticBaseY) * maxDist / dist
        };
      }
      
      const dx = Math.abs(targetP.x - neckBottom.x) / spineScale;
      const shoulderBaseY = neckBottom.y;
      const dy = (shoulderBaseY - targetP.y) / spineScale;
      newProfile.ratios.shoulderOffset = { x: clamp(dx, 0.05, 1.5), y: clamp(dy, -1.0, 1.0) };
      name = 'Shoulder Offset'; valStr = `X: ${newProfile.ratios.shoulderOffset.x.toFixed(2)}  Y: ${newProfile.ratios.shoulderOffset.y.toFixed(2)}`;
    }
    else if (draggingJoint === 'hipLeft' || draggingJoint === 'hipRight') {
      let targetP = { x: p.x, y: p.y };
      const maxDist = 0.6 * spineScale;
      const dist = Math.hypot(targetP.x - waist.x, targetP.y - waist.y);
      if (dist > maxDist) {
        targetP = {
          x: waist.x + (targetP.x - waist.x) * maxDist / dist,
          y: waist.y + (targetP.y - waist.y) * maxDist / dist
        };
      }

      const dx = Math.abs(targetP.x - waist.x) / spineScale;
      const dy = (targetP.y - waist.y) / spineScale;
      newProfile.ratios.hipOffset = { x: clamp(dx, 0.05, 1.5), y: clamp(dy, -1.0, 1.0) };
      name = 'Hip Offset'; valStr = `X: ${newProfile.ratios.hipOffset.x.toFixed(2)}  Y: ${newProfile.ratios.hipOffset.y.toFixed(2)}`;
    }
    else {
      // Limb slider logic: Project cursor onto the straight limb line to find percentage length
      const computeRatioOnLine = (mouseP: Point, startP: Point, endP: Point, length: number) => {
          const dirX = endP.x - startP.x;
          const dirY = endP.y - startP.y;
          const len = Math.hypot(dirX, dirY); 
          const vX = dirX / len;
          const vY = dirY / len;
          const proj = (mouseP.x - startP.x) * vX + (mouseP.y - startP.y) * vY;
          return proj / length;
      };

      if (['leftElbow', 'rightElbow'].includes(draggingJoint)) {
         const isL = draggingJoint === 'leftElbow';
         const start = isL ? shoulderLeft : shoulderRight;
         const end = isL ? leftHand : rightHand;
         const ratio = computeRatioOnLine(p, start, end, armLength);
         armRatios.elbowRatio = clamp(ratio, 0.1, armRatios.wristRatio - 0.05);
         name = 'Elbow Ratio'; valStr = armRatios.elbowRatio.toFixed(3);
      } else if (['leftWrist', 'rightWrist'].includes(draggingJoint)) {
         const isL = draggingJoint === 'leftWrist';
         const start = isL ? shoulderLeft : shoulderRight;
         const end = isL ? leftHand : rightHand;
         const ratio = computeRatioOnLine(p, start, end, armLength);
         armRatios.wristRatio = clamp(ratio, armRatios.elbowRatio + 0.05, 0.95);
         name = 'Wrist Ratio'; valStr = armRatios.wristRatio.toFixed(3);
      } else if (['leftKnee', 'rightKnee'].includes(draggingJoint)) {
         const isL = draggingJoint === 'leftKnee';
         const start = isL ? hipLeft : hipRight;
         const end = isL ? leftToe : rightToe; 
         const ratio = computeRatioOnLine(p, start, end, legLength);
         legRatios.kneeRatio = clamp(ratio, 0.1, legRatios.ankleRatio - 0.05);
         name = 'Knee Ratio'; valStr = legRatios.kneeRatio.toFixed(3);
      } else if (['leftAnkle', 'rightAnkle'].includes(draggingJoint)) {
         const isL = draggingJoint === 'leftAnkle';
         const start = isL ? hipLeft : hipRight;
         const end = isL ? leftToe : rightToe;
         const ratio = computeRatioOnLine(p, start, end, legLength);
         legRatios.ankleRatio = clamp(ratio, legRatios.kneeRatio + 0.05, 0.95);
         name = 'Ankle Ratio'; valStr = legRatios.ankleRatio.toFixed(3);
      }
    }

    setProfile(newProfile);
    updateBlueprint(newProfile);
    setActiveValue({ name, value: valStr });
  };

  finalizeEditorInteractionRef.current = () => {
    if (scalingJoint) {
      setScalingJoint(null);
      scalingStartRef.current = null;
      setActiveValue(null);
      return;
    }
    if (draggingJoint) {
      setDraggingJoint(null);
      setActiveValue(null);
    }
  };

  const handlePointerUp = (e?: React.PointerEvent | PointerEvent) => {
    if (e && 'pointerId' in e && svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    finalizeEditorInteractionRef.current();
  };

  useEffect(() => {
    const handleWindowPointerEnd = () => {
      finalizeEditorInteractionRef.current();
    };
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    window.addEventListener('blur', handleWindowPointerEnd);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      window.removeEventListener('blur', handleWindowPointerEnd);
    };
  }, []);

  const handleReset = () => {
    resetBlueprint();
    setProfile(JSON.parse(JSON.stringify(CurrentCharacterBlueprint)));
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "custom_style_01.json");
    dlAnchorElem.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.version && json.ratios && json.scales) {
          updateBlueprint(json);
          setProfile(JSON.parse(JSON.stringify(CurrentCharacterBlueprint)));
        } else {
          alert('Invalid blueprint format.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset input
  };

  if (!isOpen) return null;

  return (
    <div className="w-[630px] h-full shadow-xl flex flex-col z-20 border-r border-slate-200 absolute left-0 top-0 transition-transform" style={{ backgroundColor }}>
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <h2 className="text-lg font-bold text-slate-800">形体编辑器 (v0.3)</h2>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1 bg-slate-200 rounded">X</button>
      </div>

      {/* Editor Canvas Area */}
      <div className="flex-1 overflow-hidden relative flex items-center justify-center border-b border-slate-200" style={{ backgroundColor }}>
        {/* Joint visibility toggle button */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          <button
            onClick={onToggleDebugShapeColors}
            title={debugShapeColors ? '关闭拆件调试着色' : '开启拆件调试着色'}
            className={debugShapeColors
              ? 'p-1.5 rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-300 shadow-sm text-amber-700 transition-colors'
              : 'p-1.5 rounded-md bg-white/80 hover:bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-700 transition-colors'}
          >
            <Bug size={16} />
          </button>
          <button
            onClick={() => setShowJointsToggle(v => !v)}
            title={showJointsToggle ? '隐藏关节点' : '显示关节点'}
            className="p-1.5 rounded-md bg-white/80 hover:bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showJointsToggle ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
        {activeValue && (
          <div className="absolute top-3 left-3 z-30 bg-indigo-50/90 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-indigo-200/50 shadow-sm backdrop-blur-sm pointer-events-none">
            {activeValue.name}: <span className="font-mono">{activeValue.value}</span>
          </div>
        )}
        <svg 
          ref={svgRef}
          viewBox="0 0 630 670" 
          className="w-full h-full drop-shadow-md"
          style={{ cursor: (draggingJoint || scalingJoint) ? 'grabbing' : 'crosshair' }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Main Visual Character Render from System */}
          <CharacterRenderer 
            char={dummyCharacter}
            showCharacter={true}
            showStrokes={false}
            showJoints={showJointsToggle && !scalingJoint}
            showThumbs={true}
            debugShapeColors={debugShapeColors}
            colors={{
              body: '#334155',
              head: '#334155',
              hands: '#475569',
              feet: '#475569',
              arms: '#334155',
              legs: '#334155'
            }}
          />

          {/* Skeleton lines overlay for reference and dragging indication */}
          {(showJointsToggle && !scalingJoint) && <g stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6">
            {/* Spine */}
            <line x1={headTopPoint.x} y1={headTopPoint.y} x2={neckTop.x} y2={neckTop.y} />
            <line x1={neckTop.x} y1={neckTop.y} x2={neckBottom.x} y2={neckBottom.y} />
            <line x1={neckBottom.x} y1={neckBottom.y} x2={waist.x} y2={waist.y} />

            {/* Shoulder V to chest & Hip V */}
            <line x1={shoulderLeft.x} y1={shoulderLeft.y} x2={neckBottom.x} y2={neckBottom.y} />
            <line x1={shoulderRight.x} y1={shoulderRight.y} x2={neckBottom.x} y2={neckBottom.y} />
            <line x1={waist.x} y1={waist.y} x2={hipLeft.x} y2={hipLeft.y} />
            <line x1={waist.x} y1={waist.y} x2={hipRight.x} y2={hipRight.y} />

            {/* Arms Left */}
            <line x1={shoulderLeft.x} y1={shoulderLeft.y} x2={leftElbow.x} y2={leftElbow.y} />
            <line x1={leftElbow.x} y1={leftElbow.y} x2={leftWrist.x} y2={leftWrist.y} />
            <line x1={leftWrist.x} y1={leftWrist.y} x2={leftHand.x} y2={leftHand.y} />

            {/* Arms Right */}
            <line x1={shoulderRight.x} y1={shoulderRight.y} x2={rightElbow.x} y2={rightElbow.y} />
            <line x1={rightElbow.x} y1={rightElbow.y} x2={rightWrist.x} y2={rightWrist.y} />
            <line x1={rightWrist.x} y1={rightWrist.y} x2={rightHand.x} y2={rightHand.y} />

            {/* Legs Left */}
            <line x1={hipLeft.x} y1={hipLeft.y} x2={leftKnee.x} y2={leftKnee.y} />
            <line x1={leftKnee.x} y1={leftKnee.y} x2={leftAnkle.x} y2={leftAnkle.y} />
            <line x1={leftAnkle.x} y1={leftAnkle.y} x2={leftToe.x} y2={leftToe.y} />

            {/* Legs Right */}
            <line x1={hipRight.x} y1={hipRight.y} x2={rightKnee.x} y2={rightKnee.y} />
            <line x1={rightKnee.x} y1={rightKnee.y} x2={rightAnkle.x} y2={rightAnkle.y} />
            <line x1={rightAnkle.x} y1={rightAnkle.y} x2={rightToe.x} y2={rightToe.y} />
          </g>}
        </svg>


      </div>

      {/* Settings / Instructions */}
      <div className="p-4 flex flex-col gap-2" style={{ backgroundColor }}>
        <p className="text-xs text-slate-500 mb-2">左键拖拽关节点改变身体比例；右键拖拽关节点调整粗细（右/上=变粗，左/下=变细）。</p>
      </div>

      {/* Action Bar */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 grid grid-cols-3 gap-2">
        <button 
          onClick={handleReset}
          className="flex flex-col items-center justify-center p-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
        >
          <RotateCcw size={16} className="mb-1" />
          重置
        </button>

        <label className="flex flex-col items-center justify-center p-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium cursor-pointer">
          <Upload size={16} className="mb-1" />
          加载
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>

        <button 
          onClick={handleExport}
          className="flex flex-col items-center justify-center p-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
        >
          <Download size={16} className="mb-1" />
          导出
        </button>
      </div>
    </div>
  );
}
