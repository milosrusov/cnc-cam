import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, NgZone, inject, ChangeDetectionStrategy
} from '@angular/core';
import { Store } from '@ngrx/store';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import * as THREE from 'three';

import { selectEntityList, selectLayers } from '../../state/cad/cad.selectors';
import { selectToolpaths, selectOrderedOperations } from '../../state/cam/cam.selectors';
import { entityToPolyline } from '../../core/utils/geometry.utils';
import { Entity } from '../../core/models/geometry/entity.model';
import { Toolpath } from '../../core/models/cam/toolpath.model';

@Component({
  selector: 'app-viewport-3d',
  standalone: true,
  templateUrl: './viewport-3d.component.html',
  styleUrl: './viewport-3d.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Viewport3dComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas')   canvasRef!: ElementRef<HTMLCanvasElement>;

  private store = inject(Store);
  private zone   = inject(NgZone);
  private destroy$ = new Subject<void>();
  private resizeObserver!: ResizeObserver;

  // Three.js
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animId = 0;

  // Scene groups
  private stockGroup    = new THREE.Group();
  private entityGroup   = new THREE.Group();
  private toolpathGroup = new THREE.Group();
  private gridGroup     = new THREE.Group();

  // Toggle flags
  showStock     = true;
  showEntities  = true;
  showToolpath  = true;

  // Orbit state
  private orbitActive  = false;
  private orbitStart   = { x: 0, y: 0 };
  private spherical    = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 200 };
  private target       = new THREE.Vector3(0, 0, 0);

  // Pan state
  private panActive  = false;
  private panStart   = { x: 0, y: 0 };

  // Data
  private entities: Entity[] = [];
  private toolpaths: Record<string, Toolpath> = {};

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initThree());

    combineLatest([
      this.store.select(selectEntityList),
      this.store.select(selectToolpaths),
    ]).pipe(takeUntil(this.destroy$)).subscribe(([entities, toolpaths]) => {
      this.entities  = entities;
      this.toolpaths = toolpaths;
      this.zone.runOutsideAngular(() => {
        this.rebuildScene();
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private initThree(): void {
    const canvas  = this.canvasRef.nativeElement;
    const wrapper = this.viewportRef.nativeElement;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0a0f, 1);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(80, 120, 80);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.4);
    fill.position.set(-60, -40, -60);
    this.scene.add(ambient, dir, fill);

    // Groups
    this.scene.add(this.stockGroup, this.entityGroup, this.toolpathGroup, this.gridGroup);

    // Grid
    this.buildGrid();

    // Input
    this.bindInput(wrapper);

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(wrapper);
    this.onResize();

    this.resetCamera();
    this.animate();
  }

  private buildGrid(): void {
    this.gridGroup.clear();

    // XY plane grid
    const gridHelper = new THREE.GridHelper(200, 20, 0x2a2a3a, 0x1e1e28);
    gridHelper.rotation.x = Math.PI / 2; // flip to XY plane
    gridHelper.position.z = -0.5;
    this.gridGroup.add(gridHelper);

    // Axes
    const axes = new THREE.AxesHelper(30);
    this.gridGroup.add(axes);
  }

  // ── Scene build ───────────────────────────────────────────────────────────

  private rebuildScene(): void {
    this.entityGroup.clear();
    this.toolpathGroup.clear();
    this.stockGroup.clear();

    this.buildEntities();
    this.buildToolpaths();
    this.buildStock();
  }

  private buildEntities(): void {
    for (const entity of this.entities) {
      const pts = entityToPolyline(entity, 0.5);
      if (pts.length < 2) continue;

      const color = entity.color ? new THREE.Color(entity.color) : new THREE.Color(0x5b8dee);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });

      const geom = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (const p of pts) verts.push(p.x, p.y, 0.01);
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

      const line = entity.type === 'circle' || entity.type === 'arc' || entity.type === 'polygon'
        ? new THREE.LineLoop(geom, mat)
        : new THREE.Line(geom, mat);

      this.entityGroup.add(line);
    }
  }

  private buildToolpaths(): void {
    for (const tp of Object.values(this.toolpaths)) {
      if (tp.moves.length < 2) continue;

      // Separate rapids and feeds
      const rapidVerts: number[] = [];
      const feedVerts:  number[] = [];

      for (let i = 1; i < tp.moves.length; i++) {
        const a = tp.moves[i - 1], b = tp.moves[i];
        const arr = b.type === 'rapid' ? rapidVerts : feedVerts;
        arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }

      if (rapidVerts.length) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(rapidVerts, 3));
        this.toolpathGroup.add(new THREE.LineSegments(geom,
          new THREE.LineBasicMaterial({ color: 0xe05c5c, linewidth: 1 })));
      }
      if (feedVerts.length) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(feedVerts, 3));
        this.toolpathGroup.add(new THREE.LineSegments(geom,
          new THREE.LineBasicMaterial({ color: 0x5b8dee, linewidth: 1.5 })));
      }
    }
  }

  private buildStock(): void {
    // Compute bounding box of entities
    let minX = -55, minY = -45, maxX = 55, maxY = 45;
    for (const e of this.entities) {
      for (const p of entityToPolyline(e, 1)) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    const pad = 5;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const depth = 10;

    const geom = new THREE.BoxGeometry(w, h, depth);
    const mat  = new THREE.MeshPhongMaterial({
      color: 0x8899aa,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, -depth / 2);

    // Wireframe edges
    const edges = new THREE.EdgesGeometry(geom);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x445566, linewidth: 1 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    wireframe.position.copy(mesh.position);

    this.stockGroup.add(mesh, wireframe);
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  resetCamera(): void {
    this.spherical = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 200 };
    this.target.set(0, 0, -3);
    this.updateCamera();
  }

  setView(v: 'top' | 'front' | 'iso'): void {
    if (v === 'top')   { this.spherical.phi = 0.01;          this.spherical.theta = 0; }
    if (v === 'front') { this.spherical.phi = Math.PI / 2;   this.spherical.theta = 0; }
    if (v === 'iso')   { this.spherical.phi = Math.PI / 3.5; this.spherical.theta = Math.PI / 4; }
    this.updateCamera();
  }

  private updateCamera(): void {
    const { theta, phi, radius } = this.spherical;
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.sin(phi) * Math.cos(theta);
    const z = radius * Math.cos(phi);
    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z,
    );
    this.camera.lookAt(this.target);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private bindInput(el: HTMLElement): void {
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.orbitActive = true;
        this.orbitStart  = { x: e.clientX, y: e.clientY };
      } else if (e.button === 1 || e.button === 2) {
        this.panActive = true;
        this.panStart  = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    });

    el.addEventListener('mousemove', (e) => {
      if (this.orbitActive) {
        const dx = e.clientX - this.orbitStart.x;
        const dy = e.clientY - this.orbitStart.y;
        this.orbitStart = { x: e.clientX, y: e.clientY };
        this.spherical.theta -= dx * 0.008;
        this.spherical.phi    = Math.max(0.02, Math.min(Math.PI - 0.02, this.spherical.phi + dy * 0.008));
        this.updateCamera();
      }
      if (this.panActive) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this.panStart = { x: e.clientX, y: e.clientY };
        // Pan in camera-local XY plane
        const right = new THREE.Vector3();
        const up    = new THREE.Vector3();
        this.camera.getWorldDirection(up);
        right.crossVectors(up, this.camera.up).normalize();
        up.crossVectors(right, up.negate()).normalize();
        const speed = this.spherical.radius * 0.001;
        this.target.addScaledVector(right, -dx * speed);
        this.target.addScaledVector(new THREE.Vector3(0, 0, 1), dy * speed);
        this.updateCamera();
      }
    });

    el.addEventListener('mouseup', () => { this.orbitActive = false; this.panActive = false; });
    el.addEventListener('mouseleave', () => { this.orbitActive = false; this.panActive = false; });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      this.spherical.radius = Math.max(10, Math.min(2000, this.spherical.radius * factor));
      this.updateCamera();
    }, { passive: false });

    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Toggles ───────────────────────────────────────────────────────────────

  toggleStock():    void { this.showStock    = !this.showStock;    this.stockGroup.visible    = this.showStock; }
  toggleEntities(): void { this.showEntities = !this.showEntities; this.entityGroup.visible   = this.showEntities; }
  toggleToolpath(): void { this.showToolpath = !this.showToolpath; this.toolpathGroup.visible = this.showToolpath; }

  // ── Loop ──────────────────────────────────────────────────────────────────

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const w = this.viewportRef.nativeElement.clientWidth;
    const h = this.viewportRef.nativeElement.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    cancelAnimationFrame(this.animId);
    this.renderer?.dispose();
    this.resizeObserver?.disconnect();
  }
}
