import { EmberBehavior, FireworkPattern, ParticleKind } from "../../core/types";
import { Material, MATERIALS } from "../../grid/materials";
import { FIRE_LIFETIME_TICKS } from "../../grid/rules/fire";
import { MAX_STAGE, WATERED_TICKS_PER_STAGE } from "../../grid/rules/plant";
import { SMOKE_LIFETIME_TICKS } from "../../grid/rules/smoke";
import {
  CROSSETTE_SPLIT_FRACTION,
  CROSSETTE_SUB_EMBER_COUNT,
  EMBER_BASE_DRAG,
  EMBER_BASE_SPEED,
  EMBER_COUNT,
  EMBER_LIFESPAN,
  FIREWORK_COLOR_PRESETS,
  STROBE_FLICKER_PERIOD,
  WILLOW_DRAG_MULTIPLIER,
  WILLOW_GRAVITY_SCALE,
} from "../../particles/fireworks";
import { STEAM_REVERT_TICKS } from "../../grid/rules/steam";
import { REFERENCE_CELL_SIZE } from "../../grid/scene";
import { ZONE_WIND_MAX } from "../../wind/WindField";

/** Packed cell layout, shared by the WGSL (via buildPrelude) and GpuGrid's upload/readback: material bits 0-7, PROCESSED bit 8, timer bits 16-31. */
export const MATERIAL_MASK = 0xff;
export const PROCESSED_BIT = 1 << 8;
export const TIMER_SHIFT = 16;

/**
 * WGSL prepended to every shader module: material ids, liquid densities and
 * the packed cell layout, generated from the TS tables so the two can't drift.
 */
export function buildPrelude(): string {
  const lines: string[] = [];

  for (const [name, id] of Object.entries(Material)) {
    lines.push(`const MAT_${name}: u32 = ${id}u;`);
  }

  lines.push("", "// Particle kinds and ember behaviours, mirroring ParticleKind / EmberBehavior in core/types.");
  for (const [name, id] of Object.entries(ParticleKind)) {
    lines.push(`const KIND_${name}: u32 = ${id}u;`);
  }
  for (const [name, id] of Object.entries(EmberBehavior)) {
    lines.push(`const EMBER_${name}: u32 = ${id}u;`);
  }
  for (const [name, id] of Object.entries(FireworkPattern)) {
    lines.push(`const PATTERN_${name}: u32 = ${id}u;`);
  }

  lines.push(
    "",
    "// Firework tuning, mirroring the fireworks.ts constants.",
    `const EMBER_COUNT: u32 = ${EMBER_COUNT}u;`,
    `const CROSSETTE_SUB_EMBER_COUNT: u32 = ${CROSSETTE_SUB_EMBER_COUNT}u;`,
    `const EMBER_BASE_SPEED: f32 = ${EMBER_BASE_SPEED};`,
    `const EMBER_BASE_DRAG: f32 = ${EMBER_BASE_DRAG};`,
    `const EMBER_LIFESPAN: f32 = ${EMBER_LIFESPAN};`,
    `const WILLOW_DRAG_MULTIPLIER: f32 = ${WILLOW_DRAG_MULTIPLIER};`,
    `const WILLOW_GRAVITY_SCALE: f32 = ${WILLOW_GRAVITY_SCALE};`,
    `const CROSSETTE_SPLIT_FRACTION: f32 = ${CROSSETTE_SPLIT_FRACTION};`,
    `const STROBE_FLICKER_PERIOD: f32 = ${STROBE_FLICKER_PERIOD};`,
  );

  lines.push(
    "",
    "// FIREWORK_COLOR_PRESETS; an unknown colour falls back to GOLD, as presetFor does.",
    "struct ColorPreset { swatch: u32, rLo: f32, rHi: f32, gLo: f32, gHi: f32, bLo: f32, bHi: f32 }",
    "fn colorPreset(color: u32) -> ColorPreset {",
    "  switch color {",
  );
  FIREWORK_COLOR_PRESETS.forEach(({ swatch: [sr, sg, sb], r, g, b }, id) => {
    const label = id === 0 ? "0u, default" : `${id}u`;
    const swatch = sr | (sg << 8) | (sb << 16); // packed like Particle.color
    lines.push(`    case ${label}: { return ColorPreset(${swatch}u, ${r[0]}, ${r[1]}, ${g[0]}, ${g[1]}, ${b[0]}, ${b[1]}); }`);
  });
  lines.push("  }", "}");

  lines.push("", "// Liquid density, mirroring MATERIALS[].density; 0 = not a liquid.");
  lines.push("fn density(id: u32) -> u32 {", "  switch id {");
  MATERIALS.forEach((info, id) => {
    if (info.density === undefined) return;
    if (!Number.isInteger(info.density) || info.density < 1) {
      throw new Error(`${info.name}: GPU density must be a positive integer (0 means "not a liquid")`);
    }
    lines.push(`    case ${id}u: { return ${info.density}u; }`);
  });
  lines.push("    default: { return 0u; }", "  }", "}");

  const flammable = MATERIALS.flatMap((info, id) => (info.flammable ? [`${id}u`] : []));
  lines.push(
    "",
    "// Fire ignites these, mirroring MATERIALS[].flammable.",
    "fn isFlammable(id: u32) -> bool {",
    "  switch id {",
    `    case ${flammable.join(", ")}: { return true; }`,
    "    default: { return false; }",
    "  }",
    "}",
    "",
    "// Rule constants, mirroring the TS exports (lifetimes are × params.scale in the rules).",
    `const FIRE_LIFETIME_TICKS: u32 = ${FIRE_LIFETIME_TICKS}u;`,
    `const SMOKE_LIFETIME_TICKS: u32 = ${SMOKE_LIFETIME_TICKS}u;`,
    `const STEAM_REVERT_TICKS: u32 = ${STEAM_REVERT_TICKS}u;`,
    `const WATERED_TICKS_PER_STAGE: u32 = ${WATERED_TICKS_PER_STAGE}u;`,
    `const MAX_STAGE: u32 = ${MAX_STAGE}u;`,
    `const ZONE_WIND_MAX: i32 = ${ZONE_WIND_MAX};`,
    `const REFERENCE_CELL_SIZE: u32 = ${REFERENCE_CELL_SIZE}u;`,
  );

  lines.push(
    "",
    "// Packed cell: material bits 0-7, PROCESSED bit 8, timer bits 16-31.",
    `const MATERIAL_MASK: u32 = ${MATERIAL_MASK}u;`,
    `const PROCESSED: u32 = ${PROCESSED_BIT}u;`,
    `const TIMER_SHIFT: u32 = ${TIMER_SHIFT}u;`,
  );

  return lines.join("\n");
}
