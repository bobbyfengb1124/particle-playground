import type { ParticleSystem } from "./ParticleSystem";

/** Renders each active particle as a circle, fading out as it approaches the end of its lifespan. */
export function renderParticles(ctx: CanvasRenderingContext2D, particles: ParticleSystem): void {
  particles.forEachActive((p) => {
    const lifeRatio = p.lifespan > 0 ? p.age / p.lifespan : 1;
    const alpha = Math.max(0, 1 - lifeRatio);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.colorR}, ${p.colorG}, ${p.colorB}, ${alpha})`;
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}
