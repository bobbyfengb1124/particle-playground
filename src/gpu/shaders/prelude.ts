import { Material, MATERIALS } from "../../grid/materials";

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

  lines.push(
    "",
    "// Packed cell: material bits 0-7, PROCESSED bit 8, timer bits 16-31.",
    `const MATERIAL_MASK: u32 = ${MATERIAL_MASK}u;`,
    `const PROCESSED: u32 = ${PROCESSED_BIT}u;`,
    `const TIMER_SHIFT: u32 = ${TIMER_SHIFT}u;`,
  );

  return lines.join("\n");
}
