import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Character, Point, Arm, Leg, LimbLayerKey } from './types';
import { 
  strokeLength, 
  generateMainAxis, 
  generateLimb, 
  findAttachmentPoint, 
  findDraggableJoint, 
  updateCharacter,
  scaleCharacter
} from './utils';
import { CharacterRenderer } from './components/CharacterRenderer';
import { CharacterEditorSidebar } from './components/CharacterEditorSidebar';
import { CurrentCharacterBlueprint } from './blueprint';
import { PenTool, Info, Undo2, Trash2, User, PenLine, CircleDot, Palette, Download, Copy, Dices, RotateCcw, SlidersHorizontal, ImageIcon, Maximize2, Move } from 'lucide-react';
import clsx from 'clsx';

export default function App() {
  const MIN_VIEW_ZOOM = 0.3;
  const MAX_VIEW_ZOOM = 3;
  const VIEW_ZOOM_STEP = 0.1;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [history, setHistory] = useState<Character[][]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const [showCharacter, setShowCharacter] = useState(true);
  const [showStrokes, setShowStrokes] = useState(false);
  const [showJoints, setShowJoints] = useState(true);
  const [showThumbs, setShowThumbs] = useState(true);
  const [debugShapeColors, setDebugShapeColors] = useState(false);
  const [jointScale, setJointScale] = useState(0.8);
  const [jointOpacity, setJointOpacity] = useState(1.0);
  const [skeletonOpacity, setSkeletonOpacity] = useState(1.0);
  const [bodyOpacity, setBodyOpacity] = useState(1.0);
  
  const [colors, setColors] = useState({
    body: '#334155',  // slate-700  躯干
    head: '#1e293b',  // slate-800  头部（更深）
    arms: '#475569',  // slate-600  手臂（较浅）
    legs: '#0f172a',  // slate-900  腿部（最深）
    hands: '#64748b', // slate-500  手掌（更浅）
    feet: '#94a3b8',  // slate-400  脚掌（最浅）
  });
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [depthIntensity, setDepthIntensity] = useState(0.35);
  const [clothingRatios, setClothingRatios] = useState({ arms: 0.1, legs: 0.1 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportBackground, setExportBackground] = useState(true);
  const [bgColor, setBgColor] = useState('#f8fafc');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgImageScale, setBgImageScale] = useState(1);
  const [bgImageOpacity, setBgImageOpacity] = useState(1);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [showJointScaleMenu, setShowJointScaleMenu] = useState(false);
  const [showBodyOpacityMenu, setShowBodyOpacityMenu] = useState(false);
  const [isBottomActionsCollapsed, setIsBottomActionsCollapsed] = useState(false);
  const [showWaistMoveHandles, setShowWaistMoveHandles] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(() => window.innerWidth);
  const [canvasHeight, setCanvasHeight] = useState(() => window.innerHeight);

  const [drawingState, setDrawingState] = useState<{
    active: boolean;
    points: Point[];
    attachTarget: { charId: string; type: string; point: Point } | null;
    isSideView?: boolean;
  }>({ active: false, points: [], attachTarget: null, isSideView: false });

  const [draggingState, setDraggingState] = useState<{
    active: boolean;
    charId: string;
    jointName: string;
  }>({ active: false, charId: '', jointName: '' });

  const [selectedPart, setSelectedPart] = useState<{ charId: string; part: LimbLayerKey } | null>(null);
  const [scalingState, setScalingState] = useState<{
    active: boolean;
    charId: string;
    pivot: Point;
  }>({ active: false, charId: '', pivot: { x: 0, y: 0 } });

  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastPosRef = useRef<Point | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point | null>(null);
  const dragPreStateRef = useRef<Character[] | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const bgMenuRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const jointScaleMenuRef = useRef<HTMLDivElement>(null);
  const bodyOpacityMenuRef = useRef<HTMLDivElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const finalizeInteractionRef = useRef<() => void>(() => {});
  const toastTimeoutRef = useRef<number | null>(null);
  const selectedPartRef = useRef<{ charId: string; part: LimbLayerKey } | null>(null);
  selectedPartRef.current = selectedPart;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adjustLimbLayerRef = useRef<(charId: string, part: LimbLayerKey, direction: 'up' | 'down') => void>(() => {});
  const handleFitToCanvasRef = useRef<() => void>(() => {});
  const canvasWidthRef = useRef(canvasWidth);
  canvasWidthRef.current = canvasWidth;
  const canvasHeightRef = useRef(canvasHeight);
  canvasHeightRef.current = canvasHeight;

  const openJointScaleMenu = () => {
    setShowJointScaleMenu(true);
  };

  const closeJointScaleMenu = () => {
    setShowJointScaleMenu(false);
  };

  const openBodyOpacityMenu = () => {
    setShowBodyOpacityMenu(true);
  };

  const closeBodyOpacityMenu = () => {
    setShowBodyOpacityMenu(false);
  };

  const shouldIgnoreGlobalHotkeys = (target: EventTarget | null) => {
    if (target instanceof HTMLTextAreaElement) return true;
    if (target instanceof HTMLInputElement) {
      return ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(target.type);
    }
    if (target instanceof HTMLElement && target.isContentEditable) return true;
    return false;
  };

  const formatZoomPercent = (z: number) => `${Math.round(z * 100)}%`;
  const clampZoom = (z: number) => Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, z));

  const handleLimbSelect = useCallback((charId: string, part: LimbLayerKey) => {
    setSelectedPart({ charId, part });
    svgRef.current?.focus();
  }, []);

  const saveHistory = (newChars: Character[]) => {
    setHistory(h => [...h, characters]);
    setCharacters(newChars);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCharacters(prev);
  };

  const clear = () => {
    saveHistory([]);
  };

  const adjustLimbLayer = (charId: string, part: LimbLayerKey, direction: 'up' | 'down') => {
    setCharacters(chars => chars.map(char => {
      if (char.id !== charId) return char;
      const lp = { ...char.layerPriorities };
      const currentPriority = lp[part];
      const existingKeys = (['torso', 'arm1', 'arm2', 'leg1', 'leg2'] as LimbLayerKey[]).filter(k => {
        if (k === 'arm1') return !!char.arm1;
        if (k === 'arm2') return !!char.arm2;
        if (k === 'leg1') return !!char.leg1;
        if (k === 'leg2') return !!char.leg2;
        return true;
      });
      if (direction === 'up') {
        const candidates = existingKeys.filter(k => lp[k] > currentPriority);
        if (candidates.length === 0) return char;
        const swapKey = candidates.reduce((a, b) => lp[a] < lp[b] ? a : b);
        return { ...char, layerPriorities: { ...lp, [part]: lp[swapKey], [swapKey]: currentPriority } };
      } else {
        const candidates = existingKeys.filter(k => lp[k] < currentPriority);
        if (candidates.length === 0) return char;
        const swapKey = candidates.reduce((a, b) => lp[a] > lp[b] ? a : b);
        return { ...char, layerPriorities: { ...lp, [part]: lp[swapKey], [swapKey]: currentPriority } };
      }
    }));
  };

  const cycleLimbLayer = (charId: string, part: LimbLayerKey, direction: 'left' | 'right') => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const existingKeys = (['torso', 'arm1', 'arm2', 'leg1', 'leg2'] as LimbLayerKey[]).filter(k => {
      if (k === 'arm1') return !!char.arm1;
      if (k === 'arm2') return !!char.arm2;
      if (k === 'leg1') return !!char.leg1;
      if (k === 'leg2') return !!char.leg2;
      return true;
    });

    // 按层级排序：从低到高
    const sortedByLevel = [...existingKeys].sort((a, b) => char.layerPriorities[a] - char.layerPriorities[b]);
    const currentIndex = sortedByLevel.indexOf(part);
    if (currentIndex === -1) return;

    let nextIndex: number;
    if (direction === 'left') {
      nextIndex = currentIndex === 0 ? sortedByLevel.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === sortedByLevel.length - 1 ? 0 : currentIndex + 1;
    }

    const nextPart = sortedByLevel[nextIndex];
    setSelectedPart({ charId, part: nextPart });
  };

  const undoRef = useRef(undo);
  undoRef.current = undo;
  const clearRef = useRef(clear);
  clearRef.current = clear;
  adjustLimbLayerRef.current = adjustLimbLayer;
  const cycleLimbLayerRef = useRef(cycleLimbLayer);
  cycleLimbLayerRef.current = cycleLimbLayer;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkeys(e.target)) return;

      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        undoRef.current();
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setViewZoom(1);
        setPanX(Math.round((window.innerWidth - canvasWidthRef.current) / 2));
        setPanY(Math.round((window.innerHeight - canvasHeightRef.current) / 2));
        showToast('已重置到100%', 1200);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'x') {
        clearRef.current();
        e.preventDefault();
      } else if (e.key === '1') {
        setShowStrokes(s => !s);
        e.preventDefault();
      } else if (e.key === '2') {
        setShowJoints(s => !s);
        e.preventDefault();
      } else if (e.key === '3') {
        setShowCharacter(s => !s);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'v') {
        setShowThumbs(s => !s);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 't') {
        setShowWaistMoveHandles(s => !s);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'f') {
        if (bgImageRef.current) {
          handleFitToCanvasRef.current();
          e.preventDefault();
        }
      } else if (e.key === 'ArrowUp' && selectedPartRef.current) {
        adjustLimbLayerRef.current(selectedPartRef.current.charId, selectedPartRef.current.part, 'up');
        e.preventDefault();
      } else if (e.key === 'ArrowDown' && selectedPartRef.current) {
        adjustLimbLayerRef.current(selectedPartRef.current.charId, selectedPartRef.current.part, 'down');
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && selectedPartRef.current) {
        cycleLimbLayerRef.current(selectedPartRef.current.charId, selectedPartRef.current.part, 'left');
        e.preventDefault();
      } else if (e.key === 'ArrowRight' && selectedPartRef.current) {
        cycleLimbLayerRef.current(selectedPartRef.current.charId, selectedPartRef.current.part, 'right');
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setSelectedPart(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (showBgMenu && bgMenuRef.current && !bgMenuRef.current.contains(e.target as Node)) {
        setShowBgMenu(false);
      }
      if (showColorMenu && colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setShowColorMenu(false);
      }
      if (showJointScaleMenu && jointScaleMenuRef.current && !jointScaleMenuRef.current.contains(e.target as Node)) {
        setShowJointScaleMenu(false);
      }
      if (showBodyOpacityMenu && bodyOpacityMenuRef.current && !bodyOpacityMenuRef.current.contains(e.target as Node)) {
        setShowBodyOpacityMenu(false);
      }
    };
    if (showBgMenu || showColorMenu || showJointScaleMenu || showBodyOpacityMenu) {
      document.addEventListener('pointerdown', handleClickOutside, true);
    }
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, [showBgMenu, showColorMenu, showJointScaleMenu, showBodyOpacityMenu]);

  const showToast = (msg: string, duration = 2500) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, duration);
  };

  const setZoomWithToast = (nextZoom: number, duration = 900) => {
    const zoom = clampZoom(nextZoom);
    setViewZoom(zoom);
    showToast(`缩放 ${formatZoomPercent(zoom)}`, duration);
  };

  const getViewportLocalPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const getScenePointFromClient = (clientX: number, clientY: number) => {
    const local = getViewportLocalPoint(clientX, clientY);
    return {
      x: (local.x - panX) / viewZoom,
      y: (local.y - panY) / viewZoom,
    };
  };

  const getCharactersBoundingRect = () => {
    if (characters.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addPt = (p: Point) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    };
    for (const char of characters) {
      [char.headCenter, char.neckTop, char.neckBottom, char.midTorso,
        char.waist, char.shoulderLeft, char.shoulderRight, char.hipLeft, char.hipRight
      ].forEach(addPt);
      if (char.arm1) [char.arm1.shoulder, char.arm1.elbow, char.arm1.wrist, char.arm1.hand, char.arm1.thumb].forEach(addPt);
      if (char.arm2) [char.arm2.shoulder, char.arm2.elbow, char.arm2.wrist, char.arm2.hand, char.arm2.thumb].forEach(addPt);
      if (char.leg1) [char.leg1.hip, char.leg1.knee, char.leg1.ankle, char.leg1.toe].forEach(addPt);
      if (char.leg2) [char.leg2.hip, char.leg2.knee, char.leg2.ankle, char.leg2.toe].forEach(addPt);
      char.strokes.forEach(stroke => stroke.forEach(addPt));
    }
    const padding = characters.reduce((m, c) => Math.max(m, c.scale), 0) * 0.65;
    return { x: minX - padding, y: minY - padding, w: (maxX - minX) + padding * 2, h: (maxY - minY) + padding * 2 };
  };

  const exportToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!svgRef.current) return null;
    const svgEl = svgRef.current;
    const canvasW = svgEl.clientWidth;
    const canvasH = svgEl.clientHeight;
    const hasBgImage = !!bgImageRef.current && bgImageOpacity > 0;

    // --- Determine export region ---
    let regionX: number, regionY: number, regionW: number, regionH: number;

    if (exportBackground && hasBgImage) {
      // Region = bg image rendered bounds, clamped to canvas
      const bgW = bgImageRef.current!.naturalWidth * bgImageScale;
      const bgH = bgImageRef.current!.naturalHeight * bgImageScale;
      const bgX = (canvasW - bgW) / 2;
      const bgY = (canvasH - bgH) / 2;
      regionX = Math.max(0, bgX);
      regionY = Math.max(0, bgY);
      regionW = Math.max(1, Math.min(canvasW, bgX + bgW) - regionX);
      regionH = Math.max(1, Math.min(canvasH, bgY + bgH) - regionY);
    } else {
      // Region = bounding rect of all characters (transparent or no-bg export)
      const bbox = getCharactersBoundingRect();
      if (bbox) {
        regionX = Math.max(0, Math.round(bbox.x));
        regionY = Math.max(0, Math.round(bbox.y));
        regionW = Math.max(1, Math.min(canvasW, Math.round(bbox.x + bbox.w)) - regionX);
        regionH = Math.max(1, Math.min(canvasH, Math.round(bbox.y + bbox.h)) - regionY);
      } else {
        regionX = 0; regionY = 0; regionW = canvasW; regionH = canvasH;
      }
    }

    // Clone SVG, set viewBox to export region so it renders only that area
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('viewBox', `${regionX} ${regionY} ${regionW} ${regionH}`);
    svgClone.setAttribute('width', `${regionW}`);
    svgClone.setAttribute('height', `${regionH}`);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    canvas.width = regionW;
    canvas.height = regionH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const svgImg = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      svgImg.onload = () => {
        ctx.clearRect(0, 0, regionW, regionH);
        if (exportBackground) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, regionW, regionH);
          if (hasBgImage) {
            const bgW = bgImageRef.current!.naturalWidth * bgImageScale;
            const bgH = bgImageRef.current!.naturalHeight * bgImageScale;
            // Translate from canvas coords to region coords
            const imgX = (canvasW - bgW) / 2 - regionX;
            const imgY = (canvasH - bgH) / 2 - regionY;
            ctx.globalAlpha = bgImageOpacity;
            ctx.drawImage(bgImageRef.current!, imgX, imgY, bgW, bgH);
            ctx.globalAlpha = 1;
          }
        }
        ctx.drawImage(svgImg, 0, 0);
        URL.revokeObjectURL(svgUrl);
        resolve(canvas);
      };
      svgImg.src = svgUrl;
    });
  };

  const handleExportPNG = async () => {
    const canvas = await exportToCanvas();
    if (!canvas) return;
    const targetUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = `posesketch_${new Date().getTime()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyClipboard = async () => {
    const canvas = await exportToCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showToast(exportBackground ? '已复制' : '已复制(透明)');
      } catch (err) {
        console.error('Failed to copy', err);
        showToast('复制失败');
      }
    }, 'image/png');
  };

  const loadBgImageFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        bgImageRef.current = img;
        setBgImage(dataUrl);
        setBgImageScale(1);
        setBgImageOpacity(1);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadBgImageFromFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      loadBgImageFromFile(file);
    }
  };

  const handleFitToCanvas = () => {
    if (!bgImageRef.current) return;
    const scaleW = canvasWidth / bgImageRef.current.naturalWidth;
    const scaleH = canvasHeight / bgImageRef.current.naturalHeight;
    setBgImageScale(Math.min(scaleW, scaleH));
  };
  handleFitToCanvasRef.current = handleFitToCanvas;

  const handleMatchCanvasToImage = () => {
    if (!bgImageRef.current) return;
    const w = Math.min(6000, Math.round(bgImageRef.current.naturalWidth * bgImageScale));
    const h = Math.min(6000, Math.round(bgImageRef.current.naturalHeight * bgImageScale));
    setCanvasWidth(w);
    setCanvasHeight(h);
  };

  const handleClearBgImage = () => {
    setBgImage(null);
    setBgImageScale(1);
    setBgImageOpacity(1);
    bgImageRef.current = null;
  };

  const getSVGPoint = (e: React.PointerEvent) => getScenePointFromClient(e.clientX, e.clientY);

  const handleViewWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const local = getViewportLocalPoint(e.clientX, e.clientY);
    const scene = getScenePointFromClient(e.clientX, e.clientY);

    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + VIEW_ZOOM_STEP * direction;
    const nextZoom = clampZoom(viewZoom * factor);
    if (Math.abs(nextZoom - viewZoom) < 0.001) return;

    const nextPanX = local.x - scene.x * nextZoom;
    const nextPanY = local.y - scene.y * nextZoom;

    setViewZoom(nextZoom);
    setPanX(nextPanX);
    setPanY(nextPanY);
    showToast(`缩放 ${formatZoomPercent(nextZoom)}`, 900);
  };

  const modernPalettes = [
    { body: '#3b82f6', head: '#1e40af', arms: '#60a5fa', legs: '#1d4ed8', hands: '#93c5fd', feet: '#1e3a8a' }, // Blue
    { body: '#10b981', head: '#065f46', arms: '#34d399', legs: '#059669', hands: '#6ee7b7', feet: '#064e3b' }, // Emerald
    { body: '#f43f5e', head: '#9f1239', arms: '#fb7185', legs: '#e11d48', hands: '#fda4af', feet: '#881337' }, // Rose
    { body: '#8b5cf6', head: '#4c1d95', arms: '#a78bfa', legs: '#7c3aed', hands: '#c4b5fd', feet: '#2e1065' }, // Violet
    { body: '#f59e0b', head: '#92400e', arms: '#fbbf24', legs: '#d97706', hands: '#fcd34d', feet: '#78350f' }, // Amber
    { body: '#06b6d4', head: '#164e63', arms: '#22d3ee', legs: '#0891b2', hands: '#67e8f9', feet: '#083344' }, // Cyan
    { body: '#6366f1', head: '#312e81', arms: '#818cf8', legs: '#4f46e5', hands: '#a5b4fc', feet: '#1e1b4b' }, // Indigo
    { body: '#ec4899', head: '#831843', arms: '#f472b6', legs: '#db2777', hands: '#f9a8d4', feet: '#500724' }, // Pink
    { body: '#f97316', head: '#9a3412', arms: '#fb923c', legs: '#ea580c', hands: '#fdba74', feet: '#7c2d12' }, // Orange
  ];

  const handleRandomColors = () => {
    const palette = modernPalettes[Math.floor(Math.random() * modernPalettes.length)];
    setColors(palette);
  };

  const handleResetColors = () => {
    setColors({ body: '#334155', head: '#1e293b', arms: '#475569', legs: '#0f172a', hands: '#64748b', feet: '#94a3b8' });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      return;
    }

    // Only allow left click (0) or right click (2)
    if (e.button !== 0 && e.button !== 2) return;
    // Prevent starting if both buttons are somehow pressed down
    if (e.buttons !== 1 && e.buttons !== 2) return;
    e.preventDefault();
    const p = getSVGPoint(e);

    // Clear part selection when clicking SVG background (not on any element)
    if (e.target === svgRef.current) {
      setSelectedPart(null);
    }

    const isSideView = (e.button === 2); // Right click means side view

    const attachTarget = findAttachmentPoint(p, characters, jointScale);
    const draggable = findDraggableJoint(p, characters, showWaistMoveHandles);
    // 附着点优先级高于同一未完成角色上的骨骼点拖拽，防止已画肢体根部遮盖附着点
    const attachHasPriority = !!(attachTarget && draggable &&
      characters.some(c => c.id === draggable.charId && !c.isComplete));
    if (draggable && !isSideView && !attachHasPriority) { // Don't drag if right-clicking usually
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      lastPosRef.current = p;
      dragPreStateRef.current = characters;
      setDraggingState({ active: true, charId: draggable.charId, jointName: draggable.jointName });
      return;
    }
    // 右键点击移动黄点 → 缩放整个人物（拖拽上下放大/缩小，动作不变）
    if (draggable && isSideView && draggable.jointName === 'waistMoveHandle') {
      const char = characters.find(c => c.id === draggable.charId);
      if (char) {
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        lastPosRef.current = p;
        dragPreStateRef.current = characters;
        setScalingState({ active: true, charId: draggable.charId, pivot: { ...char.midTorso } });
        return;
      }
    }

    const targetElement = e.target as Element | null;
    const clickedSelectableLimb = !!targetElement?.closest?.('[data-limb-selectable="true"]');
    if (clickedSelectableLimb) {
      return;
    }

    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    setDrawingState({ active: true, points: [p], attachTarget, isSideView });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current && panStartRef.current) {
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;
      if (deltaX !== 0 || deltaY !== 0) {
        setPanX(prev => prev + deltaX);
        setPanY(prev => prev + deltaY);
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    const p = getSVGPoint(e);

    if (scalingState.active && lastPosRef.current) {
      // 右/上 → 放大，左/下 → 缩小；合并 X/Y 方向，SVG 坐标系 Y 向下所以取 dx - dy
      const dx = p.x - lastPosRef.current.x;
      const dy = p.y - lastPosRef.current.y;
      const rawFactor = Math.exp((dx - dy) / 200);
      const MIN_CHAR_SCALE = 20;
      const MAX_CHAR_SCALE = 1200;
      const newChars = characters.map(char => {
        if (char.id !== scalingState.charId) return char;
        const targetScale = char.scale * rawFactor;
        const clampedFactor = Math.min(MAX_CHAR_SCALE, Math.max(MIN_CHAR_SCALE, targetScale)) / char.scale;
        if (clampedFactor === 1) return char;
        return scaleCharacter(char, clampedFactor, scalingState.pivot);
      });
      setCharacters(newChars);
      lastPosRef.current = p;
    } else if (draggingState.active && lastPosRef.current) {
      const delta = { x: p.x - lastPosRef.current.x, y: p.y - lastPosRef.current.y };
      const newChars = characters.map(char => {
        if (char.id === draggingState.charId) {
          return updateCharacter(char, draggingState.jointName, delta);
        }
        return char;
      });
      setCharacters(newChars);
      lastPosRef.current = { x: lastPosRef.current.x + delta.x, y: lastPosRef.current.y + delta.y };
    } else if (drawingState.active) {
      setDrawingState(s => ({ ...s, points: [...s.points, p] }));
    } else {
      setMousePos(p);
    }
  };

  finalizeInteractionRef.current = () => {
    if (scalingState.active) {
      const prevState = dragPreStateRef.current;
      if (prevState && prevState !== characters) {
        setHistory(h => [...h, prevState]);
      }
      dragPreStateRef.current = null;
      setScalingState({ active: false, charId: '', pivot: { x: 0, y: 0 } });
      lastPosRef.current = null;
    } else if (draggingState.active) {
      const prevState = dragPreStateRef.current;
      if (prevState && prevState !== characters) {
        setHistory(h => [...h, prevState]);
      }
      dragPreStateRef.current = null;
      setDraggingState({ active: false, charId: '', jointName: '' });
      lastPosRef.current = null;
    } else if (drawingState.active) {
      const stroke = drawingState.points;
      if (strokeLength(stroke) > 10) {
        if (!drawingState.attachTarget) {
          const newChar = generateMainAxis(stroke, drawingState.isSideView);
          if (newChar) {
            newChar.id = Date.now().toString();
            saveHistory([...characters, newChar]);
          }
        } else {
          const target = drawingState.attachTarget;
          const newChars = characters.map(char => {
            if (char.id === target.charId) {
              const newChar = { ...char };
              const limb = generateLimb(stroke, target.point, target.type, newChar.profile, newChar.isSideView);
              const lp = { ...newChar.layerPriorities };
              if (target.type === 'shoulderLeft') {
                newChar.arm1 = limb as Arm;
                // 默认 arm1 < arm2；若 arm2 已存在说明 arm1 是第二笔 → 需要互换使 arm1 > arm2
                if (newChar.arm2) { [lp.arm1, lp.arm2] = [lp.arm2, lp.arm1]; }
              }
              if (target.type === 'shoulderRight') {
                newChar.arm2 = limb as Arm;
                // 默认 arm2 > arm1；若 arm1 已存在说明 arm2 是第二笔 → 默认已满足，不需要互换
              }
              if (target.type === 'hipLeft') {
                newChar.leg1 = limb as Leg;
                // 默认 leg1 < leg2；若 leg2 已存在说明 leg1 是第二笔 → 需要互换使 leg1 > leg2
                if (newChar.leg2) { [lp.leg1, lp.leg2] = [lp.leg2, lp.leg1]; }
              }
              if (target.type === 'hipRight') {
                newChar.leg2 = limb as Leg;
                // 默认 leg2 > leg1；若 leg1 已存在说明 leg2 是第二笔 → 默认已满足，不需要互换
              }
              newChar.layerPriorities = lp;
              
              newChar.strokes = [...newChar.strokes, stroke];
              
              if (newChar.arm1 && newChar.arm2 && newChar.leg1 && newChar.leg2) {
                newChar.isComplete = true;
              }
              return newChar;
            }
            return char;
          });
          saveHistory(newChars);
        }
      }
      setDrawingState({ active: false, points: [], attachTarget: null, isSideView: false });
    }
  };

  const handlePointerUp = (e?: React.PointerEvent | PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartRef.current = null;
      setIsPanning(false);
    }

    if (e && 'pointerId' in e && svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    finalizeInteractionRef.current();
  };

  useEffect(() => {
    const handleWindowPointerEnd = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        setIsPanning(false);
      }
      finalizeInteractionRef.current();
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

  const previewChar = drawingState.active && drawingState.points.length > 1 && !drawingState.attachTarget
    ? (() => {
        const c = generateMainAxis(drawingState.points, drawingState.isSideView);
        if (c) c.profile = JSON.parse(JSON.stringify(CurrentCharacterBlueprint));
        return c;
      })()
    : null;

  const hasVisibleBgImage = !!bgImage && bgImageOpacity > 0;

  return (
    <div
      className="relative w-full h-screen overflow-hidden touch-none select-none font-sans"
      style={{ backgroundColor: bgColor }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <CharacterEditorSidebar
        isOpen={isEditorOpen}
        onToggle={() => setIsEditorOpen(!isEditorOpen)}
        backgroundColor={bgColor}
        debugShapeColors={debugShapeColors}
        onToggleDebugShapeColors={() => setDebugShapeColors(value => !value)}
      />

      {!isEditorOpen && (
        <button
          onClick={() => setIsEditorOpen(true)}
          className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-md p-2 px-3 rounded-xl shadow-sm border border-slate-200/60 text-slate-700 hover:bg-slate-50 transition-colors"
          title="Open Character Editor"
        >
          <SlidersHorizontal size={18} />
          <span className="text-sm font-medium">编辑形体</span>
        </button>
      )}

      {/* Top Right: Visibility Toggles & Colors */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
        <div className="flex gap-2 bg-white/80 backdrop-blur-md p-1.5 rounded-xl shadow-sm border border-slate-200/60">
          <button
            onClick={() => setShowWaistMoveHandles(!showWaistMoveHandles)}
            className={clsx("p-2 rounded-lg transition-colors", showWaistMoveHandles ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100")}
            title="切换腰部移动柄 (T)"
          >
            <Move size={20} />
          </button>
          <button 
            onClick={() => setShowStrokes(!showStrokes)}
            className={clsx("p-2 rounded-lg transition-colors", showStrokes ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100")}
            title="Toggle Strokes (1)"
          >
            <PenLine size={20} />
          </button>
          <div
            className="relative"
            ref={jointScaleMenuRef}
            onMouseEnter={openJointScaleMenu}
            onMouseLeave={closeJointScaleMenu}
          >
            <button 
              onClick={() => setShowJoints(!showJoints)}
              className={clsx("p-2 rounded-lg transition-colors", showJoints ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100")}
              title="Toggle Joints (2)"
            >
              <CircleDot size={20} />
            </button>
            {showJointScaleMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 h-2 w-44" />
            )}
            {showJointScaleMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-sm border border-slate-200/60 flex flex-col gap-2 w-44 z-20">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-600">关节缩放</span>
                  <span className="text-xs text-slate-500">{jointScale.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={jointScale}
                  onChange={(e) => setJointScale(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-600">关节透明度</span>
                  <span className="text-xs text-slate-500">{jointOpacity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={jointOpacity}
                  onChange={(e) => setJointOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-600">骨骼线透明度</span>
                  <span className="text-xs text-slate-500">{skeletonOpacity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={skeletonOpacity}
                  onChange={(e) => setSkeletonOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            )}
          </div>

          <div
            className="relative"
            ref={bodyOpacityMenuRef}
            onMouseEnter={openBodyOpacityMenu}
            onMouseLeave={closeBodyOpacityMenu}
          >
            <button 
              onClick={() => setShowCharacter(!showCharacter)}
              className={clsx("p-2 rounded-lg transition-colors", showCharacter ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100")}
              title="Toggle Character (3)"
            >
              <User size={20} />
            </button>
            {showBodyOpacityMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 h-2 w-44" />
            )}
            {showBodyOpacityMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-sm border border-slate-200/60 flex flex-col gap-2 w-44 z-20">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-600">体块透明度</span>
                  <span className="text-xs text-slate-500">{bodyOpacity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={bodyOpacity}
                  onChange={(e) => setBodyOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            )}
          </div>

          <div className="w-px bg-slate-200 my-1 mx-1" />
          
          <button 
            onClick={() => setShowThumbs(!showThumbs)}
            className={clsx("p-2 rounded-lg transition-colors", showThumbs ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100")}
            title="Toggle Thumbs"
          >
            <span className="font-bold text-sm leading-none flex items-center justify-center w-5 h-5">👍</span>
          </button>
          <div className="relative" ref={colorMenuRef}>
            <button 
              onClick={() => setShowColorMenu(!showColorMenu)}
              className={clsx("p-2 rounded-lg transition-colors", showColorMenu ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100")}
              title="Color Settings"
            >
              <Palette size={20} />
            </button>

            {showColorMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-sm border border-slate-200/60 flex flex-col gap-3 w-48 z-20">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">躯干</span>
                  <input type="color" value={colors.body} onChange={e => setColors({...colors, body: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">头部</span>
                  <input type="color" value={colors.head} onChange={e => setColors({...colors, head: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">手臂</span>
                  <input type="color" value={colors.arms} onChange={e => setColors({...colors, arms: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">腿部</span>
                  <input type="color" value={colors.legs} onChange={e => setColors({...colors, legs: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">手掌</span>
                  <input type="color" value={colors.hands} onChange={e => setColors({...colors, hands: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">脚掌</span>
                  <input type="color" value={colors.feet} onChange={e => setColors({...colors, feet: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
                
                <div className="h-px bg-slate-200 mt-1 w-full" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">距离强度</span>
                    <span className="text-xs text-slate-400 tabular-nums">{Math.round(depthIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={depthIntensity}
                    onChange={e => setDepthIntensity(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full accent-indigo-500 cursor-pointer"
                  />
                </div>
                <div className="h-px bg-slate-200 w-full" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">衣物色区</span>
                  {([['袖口', 'arms'], ['裤腰', 'legs']] as [string, keyof typeof clothingRatios][]).map(([label, key]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-600">{label}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{Math.round(clothingRatios[key] * 100)}%</span>
                      </div>
                      <input
                        type="range" min={0} max={1} step={0.01}
                        value={clothingRatios[key]}
                        onChange={e => setClothingRatios(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 rounded-full accent-slate-500 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
                <div className="h-px bg-slate-200 w-full" />
                <div className="flex gap-2 justify-between">
                  <button onClick={handleRandomColors} className="flex-1 px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1">
                    <Dices size={14} /> 随机
                  </button>
                  <button onClick={handleResetColors} className="flex-1 px-2 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100 transition-colors flex items-center justify-center gap-1">
                    <RotateCcw size={14} /> 重置
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-px bg-slate-200 my-1 mx-1" />
          
          <button 
            onClick={handleExportPNG}
            className="p-2 rounded-lg transition-colors text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
            title="Export PNG"
          >
            <Download size={20} />
          </button>
          <button 
            onClick={handleCopyClipboard}
            className="p-2 rounded-lg transition-colors text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
            title="Copy to Clipboard"
          >
            <Copy size={20} />
          </button>
          <div className="flex items-center px-1">
            <input
              type="checkbox"
              id="exportBackground"
              checked={exportBackground}
              onChange={(e) => setExportBackground(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              title="Export with background"
            />
          </div>
        </div>
      </div>

      {/* Bottom Center: Actions (Manual Drawer) */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 overflow-visible pointer-events-none">
        <div
          className="flex flex-col items-center transition-transform duration-200"
          style={{ transform: `translateY(${isBottomActionsCollapsed ? 58 : 0}px)` }}
        >
          <button
            onClick={() => setIsBottomActionsCollapsed(v => !v)}
            className="w-24 h-3 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/70 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center shadow-sm pointer-events-auto"
            title={isBottomActionsCollapsed ? '展开按钮组' : '收起按钮组'}
          >
            <span className="text-[10px] leading-none">{isBottomActionsCollapsed ? '▴' : '▾'}</span>
          </button>
          <div className={clsx(
            "mt-0 mb-3 flex gap-3 bg-white/80 backdrop-blur-md p-2 rounded-2xl shadow-sm border border-slate-200/60 pointer-events-auto",
            isBottomActionsCollapsed && "pointer-events-none"
          )}>
            <button 
              onClick={undo}
              disabled={history.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 hover:bg-slate-100"
            >
              <Undo2 size={18} />
              Undo
            </button>
            <div className="w-px bg-slate-200 my-1"></div>
            <button 
              onClick={clear}
              disabled={characters.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-red-600 hover:bg-red-50"
            >
              <Trash2 size={18} />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Background Image Layer */}
      <div
        ref={viewportRef}
        className="absolute inset-0 z-[1] overflow-hidden"
        onWheel={handleViewWheel}
      >
        <div
          style={{
            position: 'absolute',
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `translate(${panX}px, ${panY}px) scale(${viewZoom})`,
            transformOrigin: '0 0'
          }}
        >
          {bgImage && (
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <img
                src={bgImage}
                alt=""
                style={{
                  transform: `scale(${bgImageScale})`,
                  opacity: bgImageOpacity,
                  maxWidth: 'none',
                  transformOrigin: 'center center',
                }}
              />
            </div>
          )}

          <svg
            ref={svgRef}
            tabIndex={0}
            width={canvasWidth}
            height={canvasHeight}
            style={{ outline: 'none' }}
            className={clsx('relative z-[1]', isPanning ? 'cursor-grabbing' : 'cursor-crosshair')}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Canvas border */}
            <rect x={0.5} y={0.5} width={canvasWidth - 1} height={canvasHeight - 1} fill="none" stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} style={{ pointerEvents: 'none' }} />
            {characters.map(char => (
              <CharacterRenderer 
                key={char.id} 
                char={char} 
                mousePos={mousePos} 
                opacity={1}
                contrastBoost={hasVisibleBgImage}
                jointScale={jointScale}
                bodyOpacity={bodyOpacity}
                depthIntensity={depthIntensity}
                clothingRatios={clothingRatios}
                showCharacter={showCharacter}
                showStrokes={showStrokes}
                showJoints={showJoints}
                showThumbs={showThumbs}
                showWaistMoveHandle={showWaistMoveHandles}
                jointOpacity={jointOpacity}
                skeletonOpacity={skeletonOpacity}
                debugShapeColors={debugShapeColors}
                colors={colors}
                onLimbSelect={handleLimbSelect}
                selectedPart={selectedPart?.charId === char.id ? selectedPart.part : null}
              />
            ))}
            
            {previewChar && (
              <CharacterRenderer 
                char={previewChar} 
                opacity={1}
                isPreview={true} 
                highContrastPreview={hasVisibleBgImage}
                jointScale={jointScale}
                bodyOpacity={bodyOpacity}
                depthIntensity={depthIntensity}
                clothingRatios={clothingRatios}
                showCharacter={showCharacter}
                showStrokes={showStrokes}
                showJoints={showJoints}
                showThumbs={showThumbs}
                showWaistMoveHandle={false}
                jointOpacity={jointOpacity}
                skeletonOpacity={skeletonOpacity}
                debugShapeColors={debugShapeColors}
                colors={colors}
              />
            )}

            {drawingState.active && drawingState.attachTarget && (() => {
              const target = drawingState.attachTarget;
              const char = characters.find(c => c.id === target.charId);
              if (!char) return null;
              const limb = generateLimb(drawingState.points, target.point, target.type, char.profile, char.isSideView);

              const s = char.scale;
              const Bone = ({ p1, p2, width, color = colors.body }: any) => (
                hasVisibleBgImage ? (
                  <g>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff" strokeWidth={width + 2} strokeLinecap="round" opacity={0.6} />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={width} strokeLinecap="round" opacity={0.9} />
                  </g>
                ) : (
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={width} strokeLinecap="round" opacity={0.4} />
                )
              );
              
              if (target.type === 'hipLeft' || target.type === 'hipRight') {
                const leg = limb as Leg;
                return (
                  <g>
                    <Bone p1={leg.hip} p2={leg.knee} width={0.3 * s} color={colors.legs} />
                    <Bone p1={leg.knee} p2={leg.ankle} width={0.25 * s} color={colors.legs} />
                    <Bone p1={leg.ankle} p2={leg.toe} width={0.2 * s} color={colors.feet} />
                  </g>
                );
              } else {
                const arm = limb as Arm;
                return (
                  <g>
                    <Bone p1={arm.shoulder} p2={arm.elbow} width={0.25 * s} color={colors.arms} />
                    <Bone p1={arm.elbow} p2={arm.wrist} width={0.2 * s} color={colors.arms} />
                    <Bone p1={arm.wrist} p2={arm.hand} width={0.15 * s} color={colors.hands} />
                    <Bone p1={arm.wrist} p2={arm.thumb} width={0.1 * s} color={colors.hands} />
                  </g>
                );
              }
            })()}

            {drawingState.active && (
              <>
                {hasVisibleBgImage && (
                  <polyline
                    points={drawingState.points.map(p => `${p.x},${p.y}`).join(' ')}
                    stroke="#ffffff" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" opacity={0.55}
                  />
                )}
                <polyline
                  points={drawingState.points.map(p => `${p.x},${p.y}`).join(' ')}
                  stroke="#60a5fa" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" opacity={hasVisibleBgImage ? 0.95 : 0.6}
                />
                {drawingState.points.length > 0 && (
                  <>
                    {hasVisibleBgImage && (
                      <circle
                        cx={drawingState.points[drawingState.points.length - 1].x}
                        cy={drawingState.points[drawingState.points.length - 1].y}
                        r={8}
                        fill="#ffffff"
                        opacity={0.7}
                        className="pointer-events-none"
                      />
                    )}
                    <circle
                      cx={drawingState.points[drawingState.points.length - 1].x}
                      cy={drawingState.points[drawingState.points.length - 1].y}
                      r={6}
                      fill={hasVisibleBgImage ? "#3b82f6" : "#94a3b8"}
                      opacity={hasVisibleBgImage ? 0.95 : 0.8}
                      className="pointer-events-none"
                    />
                  </>
                )}
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Bottom Right: Background Settings */}
      <div className="absolute bottom-4 right-4 z-10" ref={bgMenuRef}>
        {showBgMenu && (
          <div className="absolute bottom-12 right-0 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-md border border-slate-200/60 flex flex-col gap-3 w-56">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">背景设置</span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">背景颜色</span>
              <input
                type="color"
                value={bgColor}
                onChange={e => setBgColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">画布尺寸</span>
                {bgImage && (
                  <button
                    onClick={handleMatchCanvasToImage}
                    className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200 transition-colors"
                    title="匹配背景图片尺寸（含缩放）"
                  >
                    <ImageIcon size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={1} max={6000}
                  value={canvasWidth}
                  onChange={e => setCanvasWidth(Math.min(6000, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 text-center bg-white"
                />
                <span className="text-xs text-slate-400">×</span>
                <input
                  type="number" min={1} max={6000}
                  value={canvasHeight}
                  onChange={e => setCanvasHeight(Math.min(6000, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 text-center bg-white"
                />
              </div>
            </div>
            <button
              onClick={() => bgFileInputRef.current?.click()}
              className="w-full px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1"
            >
              <ImageIcon size={14} /> 加载图片
            </button>
            {bgImage && (
              <>
                <div className="h-px bg-slate-200 w-full" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">缩放</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 w-8 text-right">{bgImageScale.toFixed(2)}×</span>
                      <button
                        onClick={handleFitToCanvas}
                        className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200 transition-colors"
                        title="适应画布"
                      >
                        <Maximize2 size={12} />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={8}
                    step={0.05}
                    value={bgImageScale}
                    onChange={e => setBgImageScale(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">不透明度</span>
                    <span className="text-xs text-slate-500">{Math.round(bgImageOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={bgImageOpacity}
                    onChange={e => setBgImageOpacity(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <button
                  onClick={handleClearBgImage}
                  className="w-full px-2 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                >
                  <Trash2 size={14} /> 清除图片
                </button>
              </>
            )}
          </div>
        )}
        <button
          onClick={() => setShowBgMenu(m => !m)}
          className={clsx(
            "w-10 h-10 flex items-center justify-center rounded-full shadow-sm border transition-colors",
            showBgMenu
              ? "bg-indigo-100 text-indigo-600 border-indigo-200"
              : "bg-white/80 backdrop-blur-md text-slate-500 border-slate-200/60 hover:bg-slate-50"
          )}
          title="背景设置"
        >
          <ImageIcon size={18} />
        </button>
        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBgFileChange}
        />
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white/90 px-4 py-2 rounded-xl shadow-lg pointer-events-none z-50 text-sm font-medium animate-in fade-in zoom-in duration-300">
          {toastMessage}
        </div>
      )}

      {/* Side View Mode Badge */}
      {(drawingState.active && drawingState.isSideView) && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-indigo-500/90 text-white px-4 py-1.5 rounded-full shadow-lg pointer-events-none z-50 text-sm font-bold tracking-wider animate-in fade-in slide-in-from-top-2 duration-200">
          SIDE VIEW MODE
        </div>
      )}
    </div>
  );
}
