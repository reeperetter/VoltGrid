import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";
import {
  distanceMm,
  nearestTarget,
  roundPoint,
  snapOrthogonal,
  snapToGrid,
  type ElectricalPoint,
  type Opening,
  type Line as CableLine,
  type PointMm,
  type Project,
  type Wall,
  type WallMaterial,
} from "@voltgrid/core";
import type {
  CalibrationState,
  EditorOptions,
  LoadedUnderlay,
  PlacedPointKind,
  Tool,
} from "./types";
import { GROUP_COLORS } from "./types";

interface View {
  x: number;
  y: number;
  /** Пікселів на міліметр. */
  scale: number;
}

const MIN_SCALE = 0.004;
const MAX_SCALE = 2;
const ACCENT = "#2563eb";
const WALL_COLORS: Record<WallMaterial, string> = {
  concrete: "#6b7280",
  brick: "#a8704f",
  aerated: "#9ca3af",
  drywall: "#94a3b8",
};
const POINT_COLORS: Record<ElectricalPoint["kind"], string> = {
  board: "#111827",
  socket: "#d97706",
  switch: "#059669",
  light: "#ca8a04",
  appliance: "#7c3aed",
  data: "#0891b2",
};

export interface EditorCanvasProps {
  project: Project;
  levelId: string;
  underlay: LoadedUnderlay | undefined;
  underlayMmPerPx: number | undefined;
  tool: Tool;
  options: EditorOptions;
  selectedId: string | undefined;
  calibration: CalibrationState;
  /** Збільшується, коли треба «показати все». */
  fitSignal: number;
  onAddWall: (start: PointMm, end: PointMm) => void;
  onAddPoint: (kind: PlacedPointKind, at: PointMm) => void;
  onAddOpening: (kind: "door" | "window", at: PointMm, maxDistanceMm: number) => void;
  /** Ідентифікатор кола, лінії якого підсвічуються. */
  activeGroupId?: string | undefined;
  onSelect: (id: string | undefined) => void;
  onMovePoint: (id: string, to: PointMm) => void;
  onCalibrationPoint: (p: PointMm) => void;
  onCursor: (p: PointMm | undefined, scale: number) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
}

export function EditorCanvas(props: EditorCanvasProps) {
  const {
    project, levelId, underlay, underlayMmPerPx, tool, options, selectedId, calibration, fitSignal,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 0.08 });
  const [cursor, setCursor] = useState<PointMm | undefined>();
  const [wallStart, setWallStart] = useState<PointMm | undefined>();
  const [spaceDown, setSpaceDown] = useState(false);
  const needsFit = useRef(true);

  const walls = useMemo(() => project.walls.filter((w) => w.levelId === levelId), [project.walls, levelId]);
  const wallsById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);
  const openings = useMemo(
    () => project.openings.filter((o) => wallsById.has(o.wallId)),
    [project.openings, wallsById],
  );
  const points = useMemo(() => project.points.filter((p) => p.levelId === levelId), [project.points, levelId]);
  const lines = useMemo(() => project.lines.filter((l) => l.levelId === levelId), [project.lines, levelId]);
  const groupIndex = useMemo(() => new Map(project.groups.map((g, i) => [g.id, i])), [project.groups]);
  const endpoints = useMemo(() => walls.flatMap((w) => [w.start, w.end]), [walls]);

  // Розмір контейнера.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // «Показати все»: при зміні поверху чи за сигналом.
  useEffect(() => {
    needsFit.current = true;
  }, [fitSignal, levelId]);

  useEffect(() => {
    if (!needsFit.current || size.width === 0 || size.height === 0) return;
    needsFit.current = false;

    const xs: number[] = [];
    const ys: number[] = [];
    for (const w of walls) xs.push(w.start.xMm, w.end.xMm), ys.push(w.start.yMm, w.end.yMm);
    for (const p of points) xs.push(p.xMm), ys.push(p.yMm);
    if (underlay && underlayMmPerPx) {
      xs.push(0, underlay.widthPx * underlayMmPerPx);
      ys.push(0, underlay.heightPx * underlayMmPerPx);
    }
    if (xs.length === 0) xs.push(0, 10_000), ys.push(0, 7_000);

    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const margin = 40;
    const w = Math.max(maxX - minX, 1000);
    const h = Math.max(maxY - minY, 1000);
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((size.width - 2 * margin) / w, (size.height - 2 * margin) / h)),
    );
    setView({
      scale,
      x: (size.width - w * scale) / 2 - minX * scale,
      y: (size.height - h * scale) / 2 - minY * scale,
    });
  }, [size, walls, points, underlay, underlayMmPerPx]);

  // Клавіші: Esc скасовує, Пробіл — тимчасова «рука».
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "Escape") setWallStart(undefined);
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Скидаємо незавершену стіну при зміні інструмента чи поверху.
  useEffect(() => {
    setWallStart(undefined);
  }, [tool, levelId]);

  const worldFromPointer = useCallback(
    (stage: Konva.Stage): PointMm | undefined => {
      const pos = stage.getPointerPosition();
      if (!pos) return undefined;
      return { xMm: (pos.x - view.x) / view.scale, yMm: (pos.y - view.y) / view.scale };
    },
    [view],
  );

  const snap = useCallback(
    (raw: PointMm, from?: PointMm): PointMm => {
      const end = nearestTarget(raw, endpoints, 14 / view.scale);
      if (end) return end;
      let p = options.grid ? snapToGrid(raw, options.gridMm) : roundPoint(raw);
      if (options.ortho && from) p = snapOrthogonal(from, p);
      return roundPoint(p);
    },
    [endpoints, options.grid, options.gridMm, options.ortho, view.scale],
  );

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const raw = worldFromPointer(stage);
    if (!raw) return;

    switch (tool) {
      case "select": {
        const id = e.target === stage ? undefined : e.target.id() || undefined;
        props.onSelect(id);
        break;
      }
      case "wall": {
        const at = snap(raw, wallStart);
        if (!wallStart) {
          setWallStart(at);
        } else if (at.xMm !== wallStart.xMm || at.yMm !== wallStart.yMm) {
          props.onAddWall(wallStart, at);
          setWallStart(at);
        }
        break;
      }
      case "door":
      case "window":
        props.onAddOpening(tool, raw, Math.max(250, 20 / view.scale));
        break;
      case "socket":
      case "switch":
      case "light":
      case "board":
        props.onAddPoint(tool, options.grid ? snapToGrid(raw, options.gridMm) : roundPoint(raw));
        break;
      case "calibrate":
        props.onCalibrationPoint(roundPoint(raw));
        break;
      case "pan":
        break;
    }
  };

  const handleMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const p = worldFromPointer(stage);
    setCursor(p);
    props.onCursor(p ? roundPoint(p) : undefined, view.scale);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale });
  };

  const panning = tool === "pan" || spaceDown;
  const cursorStyle = panning ? "grab" : tool === "select" ? "default" : "crosshair";
  const previewEnd = wallStart && cursor ? snap(cursor, wallStart) : undefined;
  const px = 1 / view.scale; // один екранний піксель у мм

  return (
    <div ref={containerRef} className="canvas-host" style={{ cursor: cursorStyle }}>
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={panning}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
            }
          }}
          onClick={handleClick}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            setWallStart(undefined);
          }}
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setCursor(undefined);
            props.onCursor(undefined, view.scale);
          }}
          onWheel={handleWheel}
        >
          <Layer listening={false}>
            {underlay && underlayMmPerPx && (
              <KImage
                image={underlay.source}
                x={0}
                y={0}
                width={underlay.widthPx * underlayMmPerPx}
                height={underlay.heightPx * underlayMmPerPx}
                opacity={options.underlayOpacity}
              />
            )}
            {options.grid && (
              <GridShape view={view} size={size} baseStepMm={options.gridMm} />
            )}
          </Layer>

          <Layer>
            {walls.map((w) => (
              <WallShape key={w.id} wall={w} selected={w.id === selectedId} minHitMm={12 * px} />
            ))}
            {openings.map((o) => {
              const wall = wallsById.get(o.wallId);
              return wall ? (
                <OpeningShape key={o.id} opening={o} wall={wall} selected={o.id === selectedId} />
              ) : null;
            })}
            {lines.map((l) => (
              <CableShape
                key={l.id}
                line={l}
                color={GROUP_COLORS[(groupIndex.get(l.groupId) ?? 0) % GROUP_COLORS.length] as string}
                active={props.activeGroupId === undefined || props.activeGroupId === l.groupId}
                px={px}
              />
            ))}
            {points.map((p) => (
              <PointShape
                key={p.id}
                point={p}
                selected={p.id === selectedId}
                draggable={tool === "select"}
                px={px}
                onDragEnd={(to) => props.onMovePoint(p.id, options.grid ? snapToGrid(to, options.gridMm) : to)}
              />
            ))}
          </Layer>

          <Layer listening={false}>
            {wallStart && previewEnd && (
              <>
                <Line
                  points={[wallStart.xMm, wallStart.yMm, previewEnd.xMm, previewEnd.yMm]}
                  stroke={ACCENT}
                  strokeWidth={2 * px}
                  dash={[8 * px, 6 * px]}
                />
                <Text
                  x={(wallStart.xMm + previewEnd.xMm) / 2 + 8 * px}
                  y={(wallStart.yMm + previewEnd.yMm) / 2 + 8 * px}
                  text={`${Math.round(distanceMm(wallStart, previewEnd))} мм`}
                  fontSize={13 * px}
                  fill={ACCENT}
                />
              </>
            )}
            {tool === "calibrate" && (
              <CalibrationShape calibration={calibration} cursor={cursor} px={px} />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function GridShape(props: { view: View; size: { width: number; height: number }; baseStepMm: number }) {
  const { view, size, baseStepMm } = props;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        // Крок збільшуємо вдвічі, доки лінії не розійдуться мінімум на 14 екранних пікселів.
        let step = baseStepMm;
        while (step * view.scale < 14) step *= 2;
        const left = -view.x / view.scale;
        const top = -view.y / view.scale;
        const right = (size.width - view.x) / view.scale;
        const bottom = (size.height - view.y) / view.scale;
        ctx.beginPath();
        for (let x = Math.floor(left / step) * step; x <= right; x += step) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        }
        for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        shape.stroke("#d1d5db");
        shape.strokeWidth(1 / view.scale);
        ctx.strokeShape(shape);
      }}
    />
  );
}

function WallShape(props: { wall: Wall; selected: boolean; minHitMm: number }) {
  const { wall, selected, minHitMm } = props;
  return (
    <Line
      id={wall.id}
      points={[wall.start.xMm, wall.start.yMm, wall.end.xMm, wall.end.yMm]}
      stroke={selected ? ACCENT : WALL_COLORS[wall.material]}
      strokeWidth={wall.thicknessMm}
      lineCap="square"
      hitStrokeWidth={Math.max(wall.thicknessMm, minHitMm)}
    />
  );
}

function OpeningShape(props: { opening: Opening; wall: Wall; selected: boolean }) {
  const { opening, wall, selected } = props;
  const angle = (Math.atan2(wall.end.yMm - wall.start.yMm, wall.end.xMm - wall.start.xMm) * 180) / Math.PI;
  const color = selected ? ACCENT : opening.kind === "door" ? "#92400e" : "#0369a1";
  const t = wall.thicknessMm;
  return (
    <Group x={wall.start.xMm} y={wall.start.yMm} rotation={angle}>
      <Rect
        id={opening.id}
        x={opening.offsetMm}
        y={-t / 2}
        width={opening.widthMm}
        height={t}
        fill="#ffffff"
        stroke={color}
        strokeWidth={Math.max(t / 10, 12)}
      />
      {opening.kind === "window" && (
        <Line
          id={opening.id}
          points={[opening.offsetMm, 0, opening.offsetMm + opening.widthMm, 0]}
          stroke={color}
          strokeWidth={Math.max(t / 14, 8)}
        />
      )}
    </Group>
  );
}

function PointShape(props: {
  point: ElectricalPoint;
  selected: boolean;
  draggable: boolean;
  px: number;
  onDragEnd: (to: PointMm) => void;
}) {
  const { point, selected, draggable, px } = props;
  const color = selected ? ACCENT : POINT_COLORS[point.kind];
  const r = Math.max(110, 6 * px);
  return (
    <Group
      id={point.id}
      x={point.xMm}
      y={point.yMm}
      draggable={draggable}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        props.onDragEnd({ xMm: e.target.x(), yMm: e.target.y() });
      }}
    >
      {selected && <Circle id={point.id} radius={r * 1.7} stroke={ACCENT} strokeWidth={2 * px} />}
      {point.kind === "board" ? (
        <Rect id={point.id} x={-r * 1.3} y={-r * 1.3} width={2.6 * r} height={2.6 * r} fill={color} stroke={color} strokeWidth={3 * px} />
      ) : point.kind === "switch" ? (
        <Rect id={point.id} x={-r} y={-r} width={2 * r} height={2 * r} fill="#ffffff" stroke={color} strokeWidth={3 * px} />
      ) : (
        <Circle id={point.id} radius={r} fill="#ffffff" stroke={color} strokeWidth={3 * px} />
      )}
      {point.kind === "socket" && (
        <Line id={point.id} points={[-r * 0.5, 0, r * 0.5, 0]} stroke={color} strokeWidth={3 * px} />
      )}
      {point.kind === "light" && (
        <>
          <Line id={point.id} points={[-r * 0.7, -r * 0.7, r * 0.7, r * 0.7]} stroke={color} strokeWidth={3 * px} />
          <Line id={point.id} points={[-r * 0.7, r * 0.7, r * 0.7, -r * 0.7]} stroke={color} strokeWidth={3 * px} />
        </>
      )}
      {point.kind === "switch" && (
        <Line id={point.id} points={[-r * 0.4, r * 0.4, r * 0.4, -r * 0.4]} stroke={color} strokeWidth={3 * px} />
      )}
    </Group>
  );
}

function CableShape(props: { line: CableLine; color: string; active: boolean; px: number }) {
  const { line, color, active, px } = props;
  if (!line.path || line.path.length < 2) return null;
  return (
    <Line
      listening={false}
      points={line.path.flatMap((p) => [p.xMm, p.yMm])}
      stroke={color}
      strokeWidth={(active ? 3 : 1.5) * px}
      opacity={active ? 0.95 : 0.35}
      lineJoin="round"
    />
  );
}

function CalibrationShape(props: { calibration: CalibrationState; cursor: PointMm | undefined; px: number }) {
  const { calibration, cursor, px } = props;
  const { a, b } = calibration;
  const end = b ?? (a ? cursor : undefined);
  return (
    <>
      {a && <Circle x={a.xMm} y={a.yMm} radius={6 * px} fill="#dc2626" />}
      {b && <Circle x={b.xMm} y={b.yMm} radius={6 * px} fill="#dc2626" />}
      {a && end && (
        <Line
          points={[a.xMm, a.yMm, end.xMm, end.yMm]}
          stroke="#dc2626"
          strokeWidth={2 * px}
          dash={[8 * px, 6 * px]}
        />
      )}
    </>
  );
}
