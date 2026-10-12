import React from 'react';
import { Character, Point, Colors, LimbLayerKey, ClothingRatios } from '../types';
import { modulateColorDepth, computeLimbDepthFactors, splitChainAtRatio, ChainSeg } from '../utils';

interface Props {
  char: Character;
  opacity?: number;
  isPreview?: boolean;
  highContrastPreview?: boolean;
  contrastBoost?: boolean;
  mousePos?: Point | null;
  showCharacter?: boolean;
  showStrokes?: boolean;
  showJoints?: boolean;
  showThumbs?: boolean;
  showWaistMoveHandle?: boolean;
  jointScale?: number;
  jointOpacity?: number;
  skeletonOpacity?: number;
  bodyOpacity?: number;
  depthIntensity?: number;
  clothingRatios?: ClothingRatios;
  debugShapeColors?: boolean;
  colors?: Colors;
  key?: React.Key;
  onLimbSelect?: (charId: string, part: LimbLayerKey) => void;
  selectedPart?: LimbLayerKey | null;
}

export const CharacterRenderer = React.memo(function CharacterRenderer({
  char,
  opacity = 1,
  isPreview = false, 
  highContrastPreview = false,
  contrastBoost = false,
  mousePos,
  showCharacter = true,
  showStrokes = true,
  showJoints = true,
  showThumbs = false,
  showWaistMoveHandle = false,
  jointScale = 1,
  jointOpacity = 1,
  skeletonOpacity = 1,
  bodyOpacity = 1,
  depthIntensity = 0.35,
  clothingRatios = { arms: 0, legs: 0 },
  debugShapeColors = false,
  onLimbSelect,
  selectedPart,
  colors = {
    body: '#334155',
    head: '#334155',
    hands: '#fbcfe8',
    feet: '#0f172a',
    arms: '#334155',
    legs: '#334155'
  }
}: Props) {
  const s = char.scale;
  const sc = char.profile.scales;
  const outlineId = React.useId().replace(/:/g, '');
  const selectFilterId = React.useId().replace(/:/g, '') + 'sel';
  const limbPointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const strokeColor = colors.body;
  const jointColor = "#fff";
  const highlightColor = "#3b82f6";

  const hashString = (value: string) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const getDebugShapeColor = (shapeKey: string) => {
    const hash = hashString(`${char.id}:${shapeKey}`);
    const hue = hash % 360;
    const saturation = 62 + ((hash >>> 8) % 22);
    const lightness = 46 + ((hash >>> 16) % 18);
    const alpha = 0.42 + ((hash >>> 24) % 20) / 100;
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
  };

  const getShapeFill = (shapeKey: string | undefined, fallback: string) => {
    if (!debugShapeColors || !shapeKey) return fallback;
    return getDebugShapeColor(shapeKey);
  };

  const Capsule = ({ p1, p2, w1, w2, color = strokeColor, debugKey }: { p1: Point; p2: Point; w1: number; w2: number; color?: string; debugKey?: string; key?: string | number }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return <circle cx={p1.x} cy={p1.y} r={w1} fill={getShapeFill(debugKey, color)} />;
    const nx = -dy / len;
    const ny = dx / len;
    const pts = `${p1.x + nx * w1},${p1.y + ny * w1} ${p2.x + nx * w2},${p2.y + ny * w2} ${p2.x - nx * w2},${p2.y - ny * w2} ${p1.x - nx * w1},${p1.y - ny * w1}`;
    return (
      <g>
        <circle cx={p1.x} cy={p1.y} r={w1} fill={getShapeFill(debugKey ? `${debugKey}-start` : undefined, color)} />
        <circle cx={p2.x} cy={p2.y} r={w2} fill={getShapeFill(debugKey ? `${debugKey}-end` : undefined, color)} />
        <polygon points={pts} fill={getShapeFill(debugKey ? `${debugKey}-bridge` : undefined, color)} />
      </g>
    );
  };

  // 外公切线连接：多边形侧边与两端圆形相切，完整包住较大的圆，消除凸出感
  // sinTilt = (r2-r1)/d，切线法向量从垂线方向倾斜该角度
  // flatStart/flatEnd：衣物分界端改用垂直于骨骼的平口，消除分界弧形
  const TangentConnect = ({ p1, r1, p2, r2, color = strokeColor, flatStart = false, flatEnd = false, debugKey }: {
    p1: Point; r1: number; p2: Point; r2: number;
    color?: string; key?: React.Key; flatStart?: boolean; flatEnd?: boolean; debugKey?: string;
  }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return <circle cx={p1.x} cy={p1.y} r={Math.max(r1, r2)} fill={getShapeFill(debugKey, color)} />;
    const ax = dx / d;
    const ay = dy / d;
    // px_n 是指向左侧的法向量；-px_n 是指向右侧的法向量
    const px_n = -ay;
    const py_n = ax;
    const sinT = Math.max(-1, Math.min(1, (r2 - r1) / d));
    const cosT = Math.sqrt(1 - sinT * sinT);
    const ntx = sinT * ax + cosT * px_n;
    const nty = sinT * ay + cosT * py_n;
    const nbx = sinT * ax - cosT * px_n;
    const nby = sinT * ay - cosT * py_n;
    // topP1/topP2 是多边形「正面」（右侧）顶点，botP1/botP2 是「背面」（左侧）顶点
    // 正常切线：top = p - r*nt，bot = p - r*nb（即 top 用-px_n 分量，bot 用+px_n 分量）
    // 平口时：直接用 ±(-px_n) 做垂直截面，确保绕序方向与正常情况一致避免菱形
    // flatStart 时向根部方向多延伸 OVERLAP 像素，使末端区略微覆盖根部区，消除抗锯齿接缝
    const OVERLAP = 1.5;
    const p1ox = flatStart ? p1.x - ax * OVERLAP : p1.x;
    const p1oy = flatStart ? p1.y - ay * OVERLAP : p1.y;
    const topP1x = flatStart ? p1ox - r1 * px_n : p1.x - r1 * ntx;
    const topP1y = flatStart ? p1oy - r1 * py_n : p1.y - r1 * nty;
    const botP1x = flatStart ? p1ox + r1 * px_n : p1.x - r1 * nbx;
    const botP1y = flatStart ? p1oy + r1 * py_n : p1.y - r1 * nby;
    const topP2x = flatEnd ? p2.x - r2 * px_n : p2.x - r2 * ntx;
    const topP2y = flatEnd ? p2.y - r2 * py_n : p2.y - r2 * nty;
    const botP2x = flatEnd ? p2.x + r2 * px_n : p2.x - r2 * nbx;
    const botP2y = flatEnd ? p2.y + r2 * py_n : p2.y - r2 * nby;
    const pts = `${topP1x},${topP1y} ${topP2x},${topP2y} ${botP2x},${botP2y} ${botP1x},${botP1y}`;
    return (
      <g>
        {!flatStart && <circle cx={p1.x} cy={p1.y} r={r1} fill={getShapeFill(debugKey ? `${debugKey}-start` : undefined, color)} />}
        {!flatEnd && <circle cx={p2.x} cy={p2.y} r={r2} fill={getShapeFill(debugKey ? `${debugKey}-end` : undefined, color)} />}
        <polygon points={pts} fill={getShapeFill(debugKey ? `${debugKey}-bridge` : undefined, color)} />
      </g>
    );
  };

  // 渲染一组 ChainSeg；flatFirst/flatLast 控制首段起点/末段终点是否用平口截面
  const renderSegs = (segs: ChainSeg[], color: string, prefix: string, flatFirst = false, flatLast = false) =>
    segs.map((seg, i) => (
      <TangentConnect
        key={`${prefix}-${i}`}
        p1={seg.p1} r1={seg.r1} p2={seg.p2} r2={seg.r2}
        color={color}
        flatStart={flatFirst && i === 0}
        flatEnd={flatLast && i === segs.length - 1}
        debugKey={`${prefix}-${i}`}
      />
    ));

  const Head = () => {
    const hLen = 0.5 * s * sc.head;
    const hWid = 0.35 * s * sc.head;
    const angle = char.headAngle;
    // 将头部 local x=hLen（下颌/颈端）锚定到 neckTop，使头缩放时脖子对齐
    const tx = char.neckTop.x - hLen * Math.cos(angle);
    const ty = char.neckTop.y - hLen * Math.sin(angle);
    const d = `M ${-hLen*0.8} 0 
               C ${-hLen*0.8} ${-hWid}, ${hLen*0.2} ${-hWid}, ${hLen*0.8} ${-hWid*0.6}
               C ${hLen} ${-hWid*0.2}, ${hLen} ${hWid*0.2}, ${hLen*0.8} ${hWid*0.6}
               C ${hLen*0.2} ${hWid}, ${-hLen*0.8} ${hWid}, ${-hLen*0.8} 0 Z`;
    return (
      <path 
        d={d} 
        transform={`translate(${tx}, ${ty}) rotate(${angle * 180 / Math.PI})`}
        fill={getShapeFill('head', colors.head)} 
      />
    );
  };

  const Joint = ({ p, radius, name }: { p: Point; radius: number; name: string }) => {
    if (isPreview) return null;
    let isAttachment = false;
    let isHovered = false;
    const isDrawnLimbJoint =
      (name.startsWith('arm1.') && !!char.arm1) ||
      (name.startsWith('arm2.') && !!char.arm2) ||
      (name.startsWith('leg1.') && !!char.leg1) ||
      (name.startsWith('leg2.') && !!char.leg2) ||
      (name === 'shoulderLeft' && !!char.arm1) ||
      (name === 'shoulderRight' && !!char.arm2) ||
      (name === 'hipLeft' && !!char.leg1) ||
      (name === 'hipRight' && !!char.leg2);
    // 躯干骨骼点：第一笔画完就始终可见可拖
    const isSpineJoint =
      name === 'headTop' || name === 'neckTop' || name === 'root' ||
      name === 'midTorso' || name === 'waist' || name === 'waistMoveHandle';

    if (!char.isComplete && !isPreview) {
      if (name === 'shoulderLeft' && !char.arm1) isAttachment = true;
      if (name === 'shoulderRight' && !char.arm2) isAttachment = true;
      if (name === 'hipLeft' && !char.leg1) isAttachment = true;
      if (name === 'hipRight' && !char.leg2) isAttachment = true;
      
      if (isAttachment && mousePos) {
        const d = Math.hypot(p.x - mousePos.x, p.y - mousePos.y);
        if (d < radius * 2) isHovered = true;
      }
    }

    if (!char.isComplete && !isAttachment && !isDrawnLimbJoint && !isSpineJoint) return null;

    const isDraggable = char.isComplete || isDrawnLimbJoint || isSpineJoint;

    const incompleteJointFill = "#cbd5e1";   // slate-300
    const incompleteJointStroke = "#94a3b8"; // slate-400
    const incompleteJointFillOpacity = 0.25;
    const incompleteJointStrokeOpacity = 0.3;

    const effectiveFill = isAttachment
      ? (isHovered ? highlightColor : "#93c5fd")
      : (!char.isComplete ? incompleteJointFill : jointColor);
    const effectiveStroke = isAttachment
      ? highlightColor
      : (!char.isComplete ? incompleteJointStroke : strokeColor);
    const effectiveFillOpacity = isAttachment ? 1 : (!char.isComplete ? incompleteJointFillOpacity : 1);
    const effectiveStrokeOpacity = isAttachment ? 1 : (!char.isComplete ? incompleteJointStrokeOpacity : 1);

    // 当 showJoints 关闭时视觉隐藏（opacity=0），但保留指针事件，鼠标经过时仍可变小手形状
    const visuallyHidden = !showJoints && !isAttachment;

    return (
      <circle 
        cx={p.x} cy={p.y} r={isHovered ? radius * 1.5 : radius} 
        fill={effectiveFill} 
        stroke={effectiveStroke} 
        fillOpacity={effectiveFillOpacity}
        strokeOpacity={effectiveStrokeOpacity}
        strokeWidth={2}
        opacity={visuallyHidden ? 0 : 1}
        className={isDraggable ? "cursor-grab active:cursor-grabbing hover:fill-slate-200 transition-colors" : "transition-colors"}
      />
    );
  };

  const MoveHandle = ({ p, radius }: { p: Point; radius: number }) => {
    if (isPreview) return null;

    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={radius}
        fill="#f59e0b"
        stroke="#fff"
        strokeWidth={2}
        className="cursor-grab active:cursor-grabbing hover:fill-amber-400 transition-colors"
      />
    );
  };

  const previewOutlineEnabled = (isPreview && highContrastPreview) || (!char.isComplete && contrastBoost);
  const previewFilter = previewOutlineEnabled ? `url(#${outlineId})` : undefined;
  const characterOpacity = !char.isComplete ? (contrastBoost ? 0.65 : 0.3) : 1;
  const jointRadius = (baseRadius: number) => baseRadius * jointScale;

  // 深度颜色因子（仅完整角色启用）
  const depthFactors = char.isComplete ? computeLimbDepthFactors(char) : { torso: 0, arm1: 0, arm2: 0, leg1: 0, leg2: 0 };
  const dc = (base: string, key: LimbLayerKey) => modulateColorDepth(base, depthFactors[key], depthIntensity);

  // 5个层级组定义，按 layerPriorities 排序后渲染
  type LayerDef = { key: LimbLayerKey; content: React.ReactNode };
  const lp = char.layerPriorities;

  const torsoLayer: LayerDef = {
    key: 'torso',
    content: (() => {
      return (
        <g key="torso">
          {char.torsoPath.map((p, i) => {
            if (i === char.torsoPath.length - 1) return null;
            const t1 = i / (char.torsoPath.length - 1);
            const t2 = (i + 1) / (char.torsoPath.length - 1);
            const getSpineScale = (t: number) => t < 0.5
              ? lerp(sc.spineTop, sc.spineMid, t * 2)
              : lerp(sc.spineMid, sc.spineBottom, (t - 0.5) * 2);
            const w1 = (0.45 - 0.1 * Math.sin(t1 * Math.PI)) * s * getSpineScale(t1);
            const w2 = (0.45 - 0.1 * Math.sin(t2 * Math.PI)) * s * getSpineScale(t2);
            return <TangentConnect key={`torso-${i}`} p1={p} r1={w1} p2={char.torsoPath[i + 1]} r2={w2} color={colors.body} debugKey={`torso-spine-${i}`} />;
          })}
          <TangentConnect p1={char.neckBottom} r1={0.2 * s * sc.neck} p2={char.neckTop} r2={0.15 * s * sc.neck} color={colors.body} debugKey="torso-neck" />
          <TangentConnect p1={char.neckBottom} r1={0.45 * s * sc.spineTop} p2={char.shoulderLeft} r2={0.18 * s * sc.shoulder} color={colors.body} debugKey="torso-shoulder-left" />
          <TangentConnect p1={char.neckBottom} r1={0.45 * s * sc.spineTop} p2={char.shoulderRight} r2={0.18 * s * sc.shoulder} color={colors.body} debugKey="torso-shoulder-right" />
          <TangentConnect p1={char.waist} r1={0.45 * s * sc.spineBottom} p2={char.hipLeft} r2={0.28 * s * sc.hip} color={colors.body} debugKey="torso-hip-left" />
          <TangentConnect p1={char.waist} r1={0.45 * s * sc.spineBottom} p2={char.hipRight} r2={0.28 * s * sc.hip} color={colors.body} debugKey="torso-hip-right" />
          <Head />
        </g>
      );
    })()
  };

  const arm1Layer: LayerDef = {
    key: 'arm1',
    content: char.arm1 ? (() => {
      const arm = char.arm1!;
      const armJoints = [arm.shoulder, arm.elbow, arm.wrist];
      const armRadii = [0.18 * s * sc.shoulder, 0.15 * s * sc.elbow, 0.11 * s * sc.wrist];
      const { clothingSegs: armRoot, distalSegs: armDistal } = splitChainAtRatio(armJoints, armRadii, clothingRatios.arms);
      const hasArm1Split = armRoot.length > 0 && armDistal.length > 0;
      return (
        <g key="arm1">
          {renderSegs(armRoot, colors.body, 'arm1-root', false, hasArm1Split)}
          {renderSegs(armDistal, dc(colors.arms, 'arm1'), 'arm1-distal', hasArm1Split, false)}
          <TangentConnect p1={arm.wrist} r1={0.11 * s * sc.wrist} p2={arm.hand} r2={0.07 * s * sc.hand} color={dc(colors.hands, 'arm1')} debugKey="arm1-hand" />
          {showThumbs && <TangentConnect p1={arm.wrist} r1={0.09 * s * sc.wrist} p2={arm.thumb} r2={0.05 * s * sc.thumb} color={dc(colors.hands, 'arm1')} debugKey="arm1-thumb" />}
        </g>
      );
    })() : null
  };

  const arm2Layer: LayerDef = {
    key: 'arm2',
    content: char.arm2 ? (() => {
      const arm = char.arm2!;
      const armJoints = [arm.shoulder, arm.elbow, arm.wrist];
      const armRadii = [0.18 * s * sc.shoulder, 0.15 * s * sc.elbow, 0.11 * s * sc.wrist];
      const { clothingSegs: armRoot, distalSegs: armDistal } = splitChainAtRatio(armJoints, armRadii, clothingRatios.arms);
      const hasArm2Split = armRoot.length > 0 && armDistal.length > 0;
      return (
        <g key="arm2">
          {renderSegs(armRoot, colors.body, 'arm2-root', false, hasArm2Split)}
          {renderSegs(armDistal, dc(colors.arms, 'arm2'), 'arm2-distal', hasArm2Split, false)}
          <TangentConnect p1={arm.wrist} r1={0.11 * s * sc.wrist} p2={arm.hand} r2={0.07 * s * sc.hand} color={dc(colors.hands, 'arm2')} debugKey="arm2-hand" />
          {showThumbs && <TangentConnect p1={arm.wrist} r1={0.09 * s * sc.wrist} p2={arm.thumb} r2={0.05 * s * sc.thumb} color={dc(colors.hands, 'arm2')} debugKey="arm2-thumb" />}
        </g>
      );
    })() : null
  };

  const leg1Layer: LayerDef = {
    key: 'leg1',
    content: char.leg1 ? (() => {
      const leg = char.leg1!;
      const legJoints = [char.hipLeft, leg.knee, leg.ankle];
      const legRadii = [0.28 * s * sc.hip, 0.20 * s * sc.knee, 0.14 * s * sc.ankle];
      const { clothingSegs: legRoot, distalSegs: legDistal } = splitChainAtRatio(legJoints, legRadii, clothingRatios.legs);
      const hasLeg1Split = legRoot.length > 0 && legDistal.length > 0;
      return (
        <g key="leg1">
          {renderSegs(legRoot, colors.body, 'leg1-root', false, hasLeg1Split)}
          {renderSegs(legDistal, dc(colors.legs, 'leg1'), 'leg1-distal', hasLeg1Split, false)}
          <TangentConnect p1={leg.ankle} r1={0.14 * s * sc.ankle} p2={leg.toe} r2={0.09 * s * sc.foot} color={dc(colors.feet, 'leg1')} debugKey="leg1-foot" />
        </g>
      );
    })() : null
  };

  const leg2Layer: LayerDef = {
    key: 'leg2',
    content: char.leg2 ? (() => {
      const leg = char.leg2!;
      const legJoints = [char.hipRight, leg.knee, leg.ankle];
      const legRadii = [0.28 * s * sc.hip, 0.20 * s * sc.knee, 0.14 * s * sc.ankle];
      const { clothingSegs: legRoot, distalSegs: legDistal } = splitChainAtRatio(legJoints, legRadii, clothingRatios.legs);
      const hasLeg2Split = legRoot.length > 0 && legDistal.length > 0;
      return (
        <g key="leg2">
          {renderSegs(legRoot, colors.body, 'leg2-root', false, hasLeg2Split)}
          {renderSegs(legDistal, dc(colors.legs, 'leg2'), 'leg2-distal', hasLeg2Split, false)}
          <TangentConnect p1={leg.ankle} r1={0.14 * s * sc.ankle} p2={leg.toe} r2={0.09 * s * sc.foot} color={dc(colors.feet, 'leg2')} debugKey="leg2-foot" />
        </g>
      );
    })() : null
  };

  // 按 layerPriorities 升序排列（priority 小的先渲染，即在底层）
  const allLayers = [torsoLayer, arm1Layer, arm2Layer, leg1Layer, leg2Layer];
  const sortedLayers = [...allLayers].sort((a, b) => lp[a.key] - lp[b.key]);

  return (
    <g opacity={opacity}>
      {previewOutlineEnabled && (
        <defs>
          <filter id={outlineId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="outlineGrow" />
            <feComposite in="outlineGrow" in2="SourceAlpha" operator="out" result="outlineOnly" />
            <feFlood floodColor="#ffffff" floodOpacity="0.9" result="outlineColor" />
            <feComposite in="outlineColor" in2="outlineOnly" operator="in" result="outerStroke" />
            <feMerge>
              <feMergeNode in="outerStroke" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {onLimbSelect && (
        <defs>
          <filter id={selectFilterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#fbbf24" floodOpacity="0.9" />
          </filter>
        </defs>
      )}
      {showCharacter && (
        <g opacity={characterOpacity * bodyOpacity} style={previewFilter ? { filter: previewFilter } : undefined}>
          {sortedLayers.map(layer => (
            <g
              key={layer.key}
              data-limb-selectable={onLimbSelect && char.isComplete ? 'true' : undefined}
              filter={onLimbSelect && char.isComplete && selectedPart === layer.key ? `url(#${selectFilterId})` : undefined}
              style={onLimbSelect && char.isComplete ? { cursor: 'pointer' } : undefined}
              onPointerDown={onLimbSelect && char.isComplete ? (e) => {
                limbPointerStartRef.current = { x: e.clientX, y: e.clientY };
              } : undefined}
              onPointerUp={onLimbSelect && char.isComplete ? (e) => {
                const start = limbPointerStartRef.current;
                if (!start) return;
                const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
                limbPointerStartRef.current = null;
                if (dist < 5) {
                  onLimbSelect(char.id, layer.key);
                }
              } : undefined}
              onPointerCancel={onLimbSelect && char.isComplete ? () => { limbPointerStartRef.current = null; } : undefined}
            >
              {layer.content}
            </g>
          ))}
        </g>
      )}

      {showStrokes && char.strokes && char.strokes.map((stroke, i) => (
        <polyline 
          key={i}
          points={stroke.map(p => `${p.x},${p.y}`).join(' ')} 
          stroke={!char.isComplete ? "#3b82f6" : "#cbd5e1"} 
          strokeWidth={!char.isComplete ? 6 : 4} 
          fill="none" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          opacity={!char.isComplete ? 0.8 : 0.5} 
        />
      ))}

      {showJoints && (
        <>
          {char.isComplete && (
            <g
              stroke="#94a3b8"
              strokeWidth={Math.max(1.5, 0.03 * s)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={1.0 * skeletonOpacity}
              className="pointer-events-none"
            >
              <line
                x1={char.neckTop.x - Math.cos(char.headAngle) * 0.9 * s * sc.head}
                y1={char.neckTop.y - Math.sin(char.headAngle) * 0.9 * s * sc.head}
                x2={char.neckTop.x}
                y2={char.neckTop.y}
              />
              <line x1={char.neckTop.x} y1={char.neckTop.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.neckBottom.x} y1={char.neckBottom.y} x2={char.midTorso.x} y2={char.midTorso.y} />
              <line x1={char.midTorso.x} y1={char.midTorso.y} x2={char.waist.x} y2={char.waist.y} />
              <line x1={char.shoulderLeft.x} y1={char.shoulderLeft.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.shoulderRight.x} y1={char.shoulderRight.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.waist.x} y1={char.waist.y} x2={char.hipLeft.x} y2={char.hipLeft.y} />
              <line x1={char.waist.x} y1={char.waist.y} x2={char.hipRight.x} y2={char.hipRight.y} />

              {char.arm1 && (
                <>
                  <line x1={char.arm1.shoulder.x} y1={char.arm1.shoulder.y} x2={char.arm1.elbow.x} y2={char.arm1.elbow.y} />
                  <line x1={char.arm1.elbow.x} y1={char.arm1.elbow.y} x2={char.arm1.wrist.x} y2={char.arm1.wrist.y} />
                  <line x1={char.arm1.wrist.x} y1={char.arm1.wrist.y} x2={char.arm1.hand.x} y2={char.arm1.hand.y} />
                  {showThumbs && (
                    <line x1={char.arm1.wrist.x} y1={char.arm1.wrist.y} x2={char.arm1.thumb.x} y2={char.arm1.thumb.y} />
                  )}
                </>
              )}

              {char.arm2 && (
                <>
                  <line x1={char.arm2.shoulder.x} y1={char.arm2.shoulder.y} x2={char.arm2.elbow.x} y2={char.arm2.elbow.y} />
                  <line x1={char.arm2.elbow.x} y1={char.arm2.elbow.y} x2={char.arm2.wrist.x} y2={char.arm2.wrist.y} />
                  <line x1={char.arm2.wrist.x} y1={char.arm2.wrist.y} x2={char.arm2.hand.x} y2={char.arm2.hand.y} />
                  {showThumbs && (
                    <line x1={char.arm2.wrist.x} y1={char.arm2.wrist.y} x2={char.arm2.thumb.x} y2={char.arm2.thumb.y} />
                  )}
                </>
              )}

              {char.leg1 && (
                <>
                  <line x1={char.leg1.hip.x} y1={char.leg1.hip.y} x2={char.leg1.knee.x} y2={char.leg1.knee.y} />
                  <line x1={char.leg1.knee.x} y1={char.leg1.knee.y} x2={char.leg1.ankle.x} y2={char.leg1.ankle.y} />
                  <line x1={char.leg1.ankle.x} y1={char.leg1.ankle.y} x2={char.leg1.toe.x} y2={char.leg1.toe.y} />
                </>
              )}

              {char.leg2 && (
                <>
                  <line x1={char.leg2.hip.x} y1={char.leg2.hip.y} x2={char.leg2.knee.x} y2={char.leg2.knee.y} />
                  <line x1={char.leg2.knee.x} y1={char.leg2.knee.y} x2={char.leg2.ankle.x} y2={char.leg2.ankle.y} />
                  <line x1={char.leg2.ankle.x} y1={char.leg2.ankle.y} x2={char.leg2.toe.x} y2={char.leg2.toe.y} />
                </>
              )}
            </g>
          )}

          {!char.isComplete && (
            <g
              stroke="#94a3b8"
              strokeWidth={Math.max(1.5, 0.025 * s)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.25 * skeletonOpacity}
              className="pointer-events-none"
            >
              {/* 躯干骨骼线 */}
              <line
                x1={char.neckTop.x - Math.cos(char.headAngle) * 0.9 * s * sc.head}
                y1={char.neckTop.y - Math.sin(char.headAngle) * 0.9 * s * sc.head}
                x2={char.neckTop.x}
                y2={char.neckTop.y}
              />
              <line x1={char.neckTop.x} y1={char.neckTop.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.neckBottom.x} y1={char.neckBottom.y} x2={char.midTorso.x} y2={char.midTorso.y} />
              <line x1={char.midTorso.x} y1={char.midTorso.y} x2={char.waist.x} y2={char.waist.y} />
              <line x1={char.shoulderLeft.x} y1={char.shoulderLeft.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.shoulderRight.x} y1={char.shoulderRight.y} x2={char.neckBottom.x} y2={char.neckBottom.y} />
              <line x1={char.waist.x} y1={char.waist.y} x2={char.hipLeft.x} y2={char.hipLeft.y} />
              <line x1={char.waist.x} y1={char.waist.y} x2={char.hipRight.x} y2={char.hipRight.y} />
              {/* 已画的肢体骨骼线 */}
              {char.arm1 && (
                <>
                  <line x1={char.arm1.shoulder.x} y1={char.arm1.shoulder.y} x2={char.arm1.elbow.x} y2={char.arm1.elbow.y} />
                  <line x1={char.arm1.elbow.x} y1={char.arm1.elbow.y} x2={char.arm1.wrist.x} y2={char.arm1.wrist.y} />
                  <line x1={char.arm1.wrist.x} y1={char.arm1.wrist.y} x2={char.arm1.hand.x} y2={char.arm1.hand.y} />
                  {showThumbs && <line x1={char.arm1.wrist.x} y1={char.arm1.wrist.y} x2={char.arm1.thumb.x} y2={char.arm1.thumb.y} />}
                </>
              )}
              {char.arm2 && (
                <>
                  <line x1={char.arm2.shoulder.x} y1={char.arm2.shoulder.y} x2={char.arm2.elbow.x} y2={char.arm2.elbow.y} />
                  <line x1={char.arm2.elbow.x} y1={char.arm2.elbow.y} x2={char.arm2.wrist.x} y2={char.arm2.wrist.y} />
                  <line x1={char.arm2.wrist.x} y1={char.arm2.wrist.y} x2={char.arm2.hand.x} y2={char.arm2.hand.y} />
                  {showThumbs && <line x1={char.arm2.wrist.x} y1={char.arm2.wrist.y} x2={char.arm2.thumb.x} y2={char.arm2.thumb.y} />}
                </>
              )}
              {char.leg1 && (
                <>
                  <line x1={char.leg1.hip.x} y1={char.leg1.hip.y} x2={char.leg1.knee.x} y2={char.leg1.knee.y} />
                  <line x1={char.leg1.knee.x} y1={char.leg1.knee.y} x2={char.leg1.ankle.x} y2={char.leg1.ankle.y} />
                  <line x1={char.leg1.ankle.x} y1={char.leg1.ankle.y} x2={char.leg1.toe.x} y2={char.leg1.toe.y} />
                </>
              )}
              {char.leg2 && (
                <>
                  <line x1={char.leg2.hip.x} y1={char.leg2.hip.y} x2={char.leg2.knee.x} y2={char.leg2.knee.y} />
                  <line x1={char.leg2.knee.x} y1={char.leg2.knee.y} x2={char.leg2.ankle.x} y2={char.leg2.ankle.y} />
                  <line x1={char.leg2.ankle.x} y1={char.leg2.ankle.y} x2={char.leg2.toe.x} y2={char.leg2.toe.y} />
                </>
              )}
            </g>
          )}
        </>
      )}
      <g opacity={jointOpacity}>
            {!showWaistMoveHandle && (
              <Joint p={char.midTorso} radius={jointRadius(0.12 * s)} name="midTorso" />
            )}
            {showWaistMoveHandle && char.isComplete && <MoveHandle p={char.midTorso} radius={jointRadius(0.16 * s)} />}
            {showWaistMoveHandle && !char.isComplete && <Joint p={char.midTorso} radius={jointRadius(0.12 * s)} name="midTorso" />}
            <Joint p={char.waist} radius={jointRadius(0.15 * s)} name="waist" />

            <Joint p={{
              x: char.neckTop.x - Math.cos(char.headAngle) * 0.9 * s * sc.head,
              y: char.neckTop.y - Math.sin(char.headAngle) * 0.9 * s * sc.head
            }} radius={jointRadius(0.08 * s)} name="headTop" />
            <Joint p={char.neckTop} radius={jointRadius(0.10 * s)} name="neckTop" />

            {char.leg1 && (
              <>
                <Joint p={char.leg1.knee} radius={jointRadius(0.12 * s)} name="leg1.knee" />
                <Joint p={char.leg1.ankle} radius={jointRadius(0.10 * s)} name="leg1.ankle" />
                <Joint p={char.leg1.toe} radius={jointRadius(0.08 * s)} name="leg1.toe" />
              </>
            )}

            {char.leg2 && (
              <>
                <Joint p={char.leg2.knee} radius={jointRadius(0.12 * s)} name="leg2.knee" />
                <Joint p={char.leg2.ankle} radius={jointRadius(0.10 * s)} name="leg2.ankle" />
                <Joint p={char.leg2.toe} radius={jointRadius(0.08 * s)} name="leg2.toe" />
              </>
            )}

            {char.arm1 && (
              <>
                <Joint p={char.arm1.elbow} radius={jointRadius(0.10 * s)} name="arm1.elbow" />
                <Joint p={char.arm1.wrist} radius={jointRadius(0.08 * s)} name="arm1.wrist" />
                <Joint p={char.arm1.hand} radius={jointRadius(0.06 * s)} name="arm1.hand" />
                {showThumbs && <Joint p={char.arm1.thumb} radius={jointRadius(0.05 * s)} name="arm1.thumb" />}
              </>
            )}

            {char.arm2 && (
              <>
                <Joint p={char.arm2.elbow} radius={jointRadius(0.10 * s)} name="arm2.elbow" />
                <Joint p={char.arm2.wrist} radius={jointRadius(0.08 * s)} name="arm2.wrist" />
                <Joint p={char.arm2.hand} radius={jointRadius(0.06 * s)} name="arm2.hand" />
                {showThumbs && <Joint p={char.arm2.thumb} radius={jointRadius(0.05 * s)} name="arm2.thumb" />}
              </>
            )}

            <Joint p={char.neckBottom} radius={jointRadius(0.12 * s)} name="root" />

            {/* 肩部/胯部关节：完整角色直接显示，未完成时已画肢体显示灰色根部点 */}
            {char.isComplete && (
              <>
                <Joint p={char.shoulderLeft} radius={jointRadius(0.12 * s)} name="shoulderLeft" />
                <Joint p={char.shoulderRight} radius={jointRadius(0.12 * s)} name="shoulderRight" />
                <Joint p={char.hipLeft} radius={jointRadius(0.15 * s)} name="hipLeft" />
                <Joint p={char.hipRight} radius={jointRadius(0.15 * s)} name="hipRight" />
              </>
            )}
            {!char.isComplete && (
              <>
                {char.arm1 && <Joint p={char.shoulderLeft} radius={jointRadius(0.12 * s)} name="shoulderLeft" />}
                {char.arm2 && <Joint p={char.shoulderRight} radius={jointRadius(0.12 * s)} name="shoulderRight" />}
                {char.leg1 && <Joint p={char.hipLeft} radius={jointRadius(0.15 * s)} name="hipLeft" />}
                {char.leg2 && <Joint p={char.hipRight} radius={jointRadius(0.15 * s)} name="hipRight" />}
              </>
            )}
      </g>

      {/* 附着点圆圈：无论 showJoints 是否开启都始终显示，方便在关闭骨骼显示时绘制四肢 */}
      {!char.isComplete && !isPreview && (
        <>
          {!char.arm1 && <Joint p={char.shoulderLeft} radius={jointRadius(0.12 * s)} name="shoulderLeft" />}
          {!char.arm2 && <Joint p={char.shoulderRight} radius={jointRadius(0.12 * s)} name="shoulderRight" />}
          {!char.leg1 && <Joint p={char.hipLeft} radius={jointRadius(0.15 * s)} name="hipLeft" />}
          {!char.leg2 && <Joint p={char.hipRight} radius={jointRadius(0.15 * s)} name="hipRight" />}
        </>
      )}
    </g>
  );
});
