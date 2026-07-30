import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ApplicationTarget } from "./types";
import { formatMoney } from "./analytics";

export function OpportunityMap3D({ targets }: { targets: ApplicationTarget[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<ApplicationTarget | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0e1311");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    camera.position.set(8.5, 7.5, 11);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0x8fded5, 0.9));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(5, 8, 5);
    scene.add(keyLight);

    const sideLight = new THREE.DirectionalLight(0xf0aa55, 2.0);
    sideLight.position.set(-8, 4, -2);
    scene.add(sideLight);

    const grid = new THREE.GridHelper(12, 12, 0x2ed3c4, 0x293632);
    group.add(grid);

    const bars: THREE.Mesh[] = [];
    const maxP75 = Math.max(1, ...targets.map((target) => target.p75));
    const minP75 = Math.min(...targets.map((target) => target.p75), maxP75);
    const columns = 6;

    targets.forEach((target, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = (col - (columns - 1) / 2) * 1.25;
      const z = (row - 1) * 1.45;
      const normalized = (target.p75 - minP75) / Math.max(1, maxP75 - minP75);
      const barHeight = 0.55 + normalized * 3.7;
      const geometry = new THREE.BoxGeometry(0.62, barHeight, 0.62);
      const material = new THREE.MeshStandardMaterial({
        color: colorForScore(target.score),
        roughness: 0.55,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, barHeight / 2, z);
      mesh.userData = target;
      group.add(mesh);
      bars.push(mesh);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0xf7d27a, roughness: 0.32, metalness: 0.25 }),
      );
      cap.position.set(x, barHeight + 0.2, z);
      group.add(cap);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let width = 0;
    let height = 0;
    let dragging = false;
    let lastX = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(340, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
    };

    const onPointerUp = () => {
      dragging = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (dragging) {
        group.rotation.y += (event.clientX - lastX) * 0.01;
        lastX = event.clientX;
        return;
      }
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(bars)[0];
      setHovered(hit ? (hit.object.userData as ApplicationTarget) : null);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (!dragging) group.rotation.y += 0.0022;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      for (const mesh of bars) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material.dispose();
      }
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [targets]);

  if (!targets.length) {
    return <div className="empty-state tall">No opportunity targets match the filters.</div>;
  }

  return (
    <div className="map3d-shell">
      <div ref={containerRef} className="map3d-canvas" aria-label="3D opportunity bars" />
      <div className="map3d-legend">
        <span><i className="legend-low" /> Lower priority</span>
        <span><i className="legend-high" /> Higher priority</span>
      </div>
      {hovered && (
        <div className="map-tooltip">
          <strong>{hovered.role}</strong>
          <span>{hovered.industry} - {hovered.location} - {hovered.remote}</span>
          <span>{formatMoney(hovered.p75)} top quartile - score {hovered.score}</span>
        </div>
      )}
    </div>
  );
}

function colorForScore(score: number) {
  if (score >= 75) return new THREE.Color("#ff7a3d");
  if (score >= 62) return new THREE.Color("#f0c44c");
  if (score >= 50) return new THREE.Color("#2ed3c4");
  return new THREE.Color("#6f7dff");
}


