class UrbanMapApp {
    constructor() {
        this.state = {
            lote: { exists: false, obj: null, area: 0, params: { zone: 'ZR-3', maxTO: 0.5, maxCA: 1.0 } },
            floors: [],
            currentFloorId: 0,
            buildings: [],
            tool: 'select',
            isShiftPressed: false,
            cutLine: null
        };

        this.snapDistance = 15;
        this.pxPerMeter = 10;
        this.isDrawing = false;
        this.isDragging = false;
        
        this.activeShape = null;
        this.activePoints = null;
        this.activeLines = null;
        this.activeLine = null;
        this.activeShapeStart = null;
        this.editingPolygon = null;
        this.selectedVertexIndex = -1;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        try {
            if (typeof fabric === 'undefined') {
                throw new Error("Biblioteca Fabric.js não encontrada.");
            }

            this.canvas = new fabric.Canvas('drawingCanvas', {
                backgroundColor: '#e2e8f0',
                selection: true,
                preserveObjectStacking: true,
                fireRightClick: true,
                stopContextMenu: true
            });

            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            
            document.addEventListener('keydown', (e) => this.handleKey(e, true));
            document.addEventListener('keyup', (e) => this.handleKey(e, false));

            this.setupCanvasEvents();
            this.setupUIEvents();

            this.addFloor(null, true);

            setTimeout(() => {
                const ls = document.getElementById('loadingScreen');
                if(ls) { 
                    ls.style.opacity = '0'; 
                    setTimeout(() => ls.style.display = 'none', 500); 
                }
            }, 800);

        } catch (error) {
            console.error("Erro ao iniciar UrbanMap:", error);
            const loadingText = document.getElementById('loadingText');
            if (loadingText) {
                loadingText.innerText = "Erro ao iniciar: " + error.message;
                loadingText.style.color = "#ef4444";
            }
        }
    }

    safeAddEvent(id, eventType, callback) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(eventType, callback);
    }

    setupUIEvents() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });

        this.safeAddEvent('btnDrawLote', 'click', () => this.setTool('draw-lote'));
        this.safeAddEvent('btnEditLote', 'click', () => this.setTool('edit-lote'));

        // --- CORREÇÃO: Zoneamento atualizando params e recalculando ---
        this.safeAddEvent('loteZoning', 'change', (e) => {
            const z = e.target.value;
            this.state.lote.params.zone = z;
            
            // Definição dos parâmetros por zona
            if (z === 'ZR-3') { 
                this.state.lote.params.maxTO = 0.5; // 50%
                this.state.lote.params.maxCA = 1.0; 
            } else if (z === 'ZR-4') { 
                this.state.lote.params.maxTO = 0.6; // 60%
                this.state.lote.params.maxCA = 2.0; 
            } else if (z === 'ECO-1') { 
                this.state.lote.params.maxTO = 0.8; // 80% (exemplo estrutural)
                this.state.lote.params.maxCA = 4.0; 
            }
            
            // Atualiza visualização dos limites na UI
            document.getElementById('limitTO').innerText = (this.state.lote.params.maxTO * 100);
            document.getElementById('limitCA').innerText = this.state.lote.params.maxCA.toFixed(1);

            this.updateUrbanIndices();
        });

        const zInput = document.getElementById('inputVertexZ');
        if (zInput) {
            zInput.addEventListener('change', (e) => {
                if (this.editingPolygon === this.state.lote.obj && this.selectedVertexIndex > -1) {
                    this.state.lote.obj.vertexZ[this.selectedVertexIndex] = parseFloat(e.target.value);
                }
            });
        }

        this.safeAddEvent('btnAddFloor', 'click', () => this.addFloor());
        this.safeAddEvent('btnRemoveFloor', 'click', () => this.removeCurrentFloor());
        this.safeAddEvent('btnExportJSON', 'click', () => this.exportJSON());

        const btnToggleNav = document.getElementById('btnToggleNav');
        if (btnToggleNav) btnToggleNav.addEventListener('click', () => {
            document.body.classList.toggle('mobile-panel-right');
        });

        this.safeAddEvent('btnCloseCut', 'click', () => {
            document.getElementById('cutModal').style.display = 'none';
        });
    }

    handleKey(e, isDown) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(tag)) return;

        if (isDown) {
            const key = e.key.toLowerCase();
            if (key === 'v') this.setTool('select');
            if (key === 'r') this.setTool('rectangle');
            if (key === 'p') this.setTool('polygon');
            if (key === 'enter' && this.isDrawing) this.finishPolygon(this.state.tool === 'draw-lote');
            if (key === 'delete') this.deleteSelected();
            if (key === 'escape') this.cancelDrawingAndEdit();
        }

        if (e.key === 'Shift') {
            this.state.isShiftPressed = isDown;
            const orthoEl = document.getElementById('orthoStatus');
            if(orthoEl) orthoEl.innerHTML = isDown ? '<i class="fas fa-ruler-combined"></i> Orto: ON' : '<i class="fas fa-ruler-combined"></i> Orto (Shift): OFF';
        }

        if (e.code === 'Space') {
            if (isDown && !this.panBySpace && !e.repeat) {
                e.preventDefault();
                this.panBySpace = true;
                this.lastToolBeforePan = this.state.tool;
                this.setTool('pan');
            }
            if (!isDown && this.panBySpace) {
                this.panBySpace = false;
                this.setTool(this.lastToolBeforePan || 'select');
            }
        }
    }

    resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        if (!container) return;
        this.canvas.setDimensions({ width: container.clientWidth, height: container.clientHeight });
        this.canvas.calcOffset();
        this.rescaleObjects();
    }

    rescaleObjects() {
        if (!this.canvas) return;
        const zoom = this.canvas.getZoom() || 1;
        
        this.canvas.getObjects().forEach(obj => {
            if (obj.strokeWidth !== undefined) {
                let baseWidth = 1.5;
                if (obj.isLote || obj.isCutLine) baseWidth = 2.5;
                if (obj.type === 'line' && !obj.isBuilding) baseWidth = 1.0;
                
                obj.set('strokeWidth', Math.max(baseWidth / zoom, 0.5 / zoom));
            }
            if (obj.cornerSize) {
                obj.set('cornerSize', 12 / zoom);
            }
            obj.setCoords();
        });
        this.canvas.requestRenderAll();
    }

    setTool(tool) {
        this.detachVertexEditor();
        this.state.tool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
        const hint = document.getElementById('toolHint');
        if(hint) hint.innerText = `Ferramenta: ${tool.toUpperCase()}`;

        this.canvas.selection = tool === 'select';
        this.canvas.defaultCursor = tool === 'pan' ? 'grab' : (tool.includes('edit') || tool === 'cut-line' ? 'crosshair' : 'default');

        this.canvas.forEachObject(o => {
            const isCurrentBuilding = !!o.isBuilding && o.floorId === this.state.currentFloorId;
            const canEditBuilding = tool === 'edit-building' && isCurrentBuilding;
            const canEditLote = tool === 'edit-lote' && !!o.isLote;
            
            o.selectable = (tool === 'select' && isCurrentBuilding) || canEditBuilding || canEditLote;
            o.evented = true;
        });

        this.canvas.off('selection:created');
        this.canvas.off('selection:updated');

        if (tool === 'edit-building') {
            const onSel = (ev) => {
                const s = ev.selected?.[0] || this.canvas.getActiveObject();
                if (s && s.isBuilding && s.floorId === this.state.currentFloorId) this.attachVertexEditor(s);
            };
            this.canvas.on('selection:created', onSel);
            this.canvas.on('selection:updated', onSel);
        }

        if (tool === 'edit-lote' && this.state.lote.obj) {
             this.canvas.setActiveObject(this.state.lote.obj);
             this.attachVertexEditor(this.state.lote.obj);
        }
        
        if (tool !== 'cut-line' && this.state.cutLine && !this.state.cutLine.finalized) {
            this.canvas.remove(this.state.cutLine);
            this.state.cutLine = null;
        }

        this.canvas.requestRenderAll();
    }

    setupCanvasEvents() {
        this.canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = this.canvas.getZoom();
            zoom *= 0.999 ** delta;
            zoom = Math.min(Math.max(zoom, 0.2), 20);
            this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            document.getElementById('headerZoom').innerText = Math.round(zoom * 100) + '%';
            opt.e.preventDefault(); opt.e.stopPropagation();
            clearTimeout(this._zoomTimeout);
            this._zoomTimeout = setTimeout(()=> this.rescaleObjects(), 80);
        });

        this.canvas.on('mouse:down', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            
            if (this.state.tool === 'pan' || o.e.altKey || o.e.button === 1) {
                this.isDragging = true;
                this.lastPosX = o.e.clientX;
                this.lastPosY = o.e.clientY;
                return;
            }

            if (this.state.tool === 'cut-line') {
                this.handleCutLineClick(pointer);
                return;
            }

            if (['rectangle', 'polygon', 'draw-lote'].includes(this.state.tool)) {
                let startPoint = this.getSnapPoint(pointer) || pointer;
                if (this.state.tool === 'rectangle') this.startRectangle(startPoint);
                else this.addPolygonPoint(startPoint, this.state.tool === 'draw-lote');
            }
        });

        this.canvas.on('mouse:move', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            document.getElementById('mouseCoords').innerText = `X: ${(pointer.x/10).toFixed(2)} m, Y: ${(pointer.y/10).toFixed(2)} m`;

            if (this.isDragging) {
                const vpt = this.canvas.viewportTransform;
                vpt[4] += o.e.clientX - this.lastPosX;
                vpt[5] += o.e.clientY - this.lastPosY;
                this.canvas.requestRenderAll();
                this.lastPosX = o.e.clientX; this.lastPosY = o.e.clientY;
                return;
            }

            if (this.isDrawing) {
                let target = this.getSnapPoint(pointer) || pointer;
                if (this.activeShapeStart) target = this.applyOrtho(this.activeShapeStart, target);

                if (this.state.tool === 'rectangle' && this.activeShape) {
                    this.updateRectanglePreview(target);
                } else if (this.activeLine) {
                    this.activeLine.set({ x2: target.x, y2: target.y });
                    this.canvas.requestRenderAll();
                }
            }

            if (this.state.tool === 'cut-line' && this.state.cutLine && !this.state.cutLine.finalized) {
                let target = this.getSnapPoint(pointer) || pointer;
                this.state.cutLine.set({ x2: target.x, y2: target.y });
                this.canvas.requestRenderAll();
            }
        });

        this.canvas.on('mouse:up', () => {
            this.isDragging = false;
            if (this.state.tool === 'rectangle' && this.isDrawing) this.finishRectangle();
        });

        this.canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (!obj) return;
            if (obj.isBuilding) {
                if (this.hasOverlap(obj)) {
                    this.revertObjectTransform(obj);
                    this.toast('Sobreposição não permitida!'); 
                } else {
                    this.updateBuildingData(obj);
                }
            }
            if (obj.isLote) this.updateLoteData();
            obj._beforeMoveState = null;
            this.rescaleObjects();
        });

        this.canvas.on('object:moving', (e) => {
            const obj = e.target;
            obj._beforeMoveState = { left: obj.left, top: obj.top, points: obj.points ? [...obj.points] : null };
            this.updateDimensions(obj);
        });
    }

    handleCutLineClick(pointer) {
        if (this.state.cutLine && this.state.cutLine.finalized) {
            this.canvas.remove(this.state.cutLine);
            this.state.cutLine = null;
        }

        if (!this.state.cutLine) {
            const points = [pointer.x, pointer.y, pointer.x, pointer.y];
            this.state.cutLine = new fabric.Line(points, {
                strokeWidth: 2 / this.canvas.getZoom(),
                stroke: '#ef4444',
                strokeDashArray: [10, 5, 2, 5], 
                selectable: false, evented: false, isCutLine: true
            });
            this.canvas.add(this.state.cutLine);
        } else {
            this.state.cutLine.set({ x2: pointer.x, y2: pointer.y });
            this.state.cutLine.finalized = true;
            this.state.cutLine.setCoords();
            this.canvas.requestRenderAll();
            setTimeout(() => this.generateSectionView(), 100);
            this.setTool('select');
        }
    }

    generateSectionView() {
        if (!this.state.cutLine || !this.state.lote.obj) {
            this.toast("Desenhe o terreno e a linha de corte primeiro.");
            return;
        }
        
        const p1 = { x: this.state.cutLine.x1, y: this.state.cutLine.y1 };
        const p2 = { x: this.state.cutLine.x2, y: this.state.cutLine.y2 };

        const lotePoints = this.getObjectVertices(this.state.lote.obj);
        const loteIntersections = this.getLinePolygonIntersections(p1, p2, lotePoints, this.state.lote.obj.vertexZ || []);
        
        const buildingsInCut = [];
        this.state.buildings.forEach(b => {
            if (b.obj.visible) {
                const bPoints = this.getObjectVertices(b.obj);
                const inters = this.getLinePolygonIntersections(p1, p2, bPoints);
                if (inters.length >= 2) {
                    inters.sort((a, b) => a.dist - b.dist);
                    buildingsInCut.push({
                        name: b.name || 'Edificação',
                        distStart: inters[0].dist,
                        distEnd: inters[inters.length - 1].dist,
                        height: b.height
                    });
                }
            }
        });

        if (loteIntersections.length < 2) return;
        loteIntersections.sort((a, b) => a.dist - b.dist);
        this.renderSectionModal(loteIntersections, buildingsInCut);
    }

    getLinePolygonIntersections(l1, l2, polyPoints, zValues = []) {
        const intersections = [];
        for (let i = 0; i < polyPoints.length; i++) {
            const a = polyPoints[i];
            const b = polyPoints[(i + 1) % polyPoints.length];
            const zA = zValues[i] !== undefined ? zValues[i] : 0;
            const zB = zValues[(i+1)%polyPoints.length] !== undefined ? zValues[(i+1)%polyPoints.length] : 0;

            const inter = fabric.Intersection.intersectLineLine(l1, l2, a, b);
            if (inter.status === 'Intersection') {
                const pt = inter.points[0];
                const distFromStart = Math.hypot(pt.x - l1.x, pt.y - l1.y);
                const lenEdge = Math.hypot(b.x - a.x, b.y - a.y);
                const distOnEdge = Math.hypot(pt.x - a.x, pt.y - a.y);
                const ratio = lenEdge > 0 ? distOnEdge / lenEdge : 0;
                const zInter = zA + (zB - zA) * ratio;
                intersections.push({ x: pt.x, y: pt.y, dist: distFromStart, z: zInter });
            }
        }
        return intersections;
    }

    renderSectionModal(terrainProfile, buildings) {
        const modal = document.getElementById('cutModal');
        const canvas = document.getElementById('cutCanvas');
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const marginX = 50;
        const groundBaseY = 300;
        const totalDist = terrainProfile[terrainProfile.length - 1].dist - terrainProfile[0].dist;
        const scaleX = (canvas.width - 2 * marginX) / (totalDist || 1); 
        const scaleY = 15; 

        ctx.beginPath();
        ctx.moveTo(marginX, groundBaseY - (terrainProfile[0].z * scaleY));
        terrainProfile.forEach(pt => {
            const x = marginX + (pt.dist - terrainProfile[0].dist) * scaleX;
            const y = groundBaseY - (pt.z * scaleY);
            ctx.lineTo(x, y);
        });
        ctx.lineTo(marginX + totalDist * scaleX, canvas.height);
        ctx.lineTo(marginX, canvas.height);
        ctx.fillStyle = '#e5e7eb';
        ctx.fill();
        
        ctx.beginPath();
        terrainProfile.forEach((pt, i) => {
            const x = marginX + (pt.dist - terrainProfile[0].dist) * scaleX;
            const y = groundBaseY - (pt.z * scaleY);
            if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        buildings.forEach(b => {
            const xStart = marginX + (b.distStart - terrainProfile[0].dist) * scaleX;
            const width = (b.distEnd - b.distStart) * scaleX;
            const height = b.height * scaleY;
            const yBase = groundBaseY; 
            const yTop = yBase - height;

            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(xStart, yTop, width, height);
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.strokeRect(xStart, yTop, width, height);
            
            this.drawLevelMarker(ctx, xStart + width/2, yTop, b.height.toFixed(2));
            
            ctx.fillStyle = '#000';
            ctx.font = '10px Arial';
            ctx.fillText(b.name, xStart + 2, yBase - 5);
        });

        this.drawLevelMarker(ctx, marginX - 20, groundBaseY, "0.00");
        modal.style.display = 'flex';
    }

    drawLevelMarker(ctx, x, y, text) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y - 8);
        ctx.lineTo(x + 5, y - 8);
        ctx.closePath();
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y - 12);
    }

    startRectangle(start) {
        this.isDrawing = true;
        this.activeShapeStart = start;
        this.activeShape = new fabric.Rect({
            left: start.x, top: start.y, width: 0, height: 0,
            fill: 'rgba(59, 130, 246, 0.3)', stroke: '#3b82f6', strokeWidth: 1,
            selectable: false
        });
        this.canvas.add(this.activeShape);
    }

    updateRectanglePreview(current) {
        if(!this.activeShape) return;
        const s = this.activeShapeStart;
        this.activeShape.set({
            left: Math.min(s.x, current.x),
            top: Math.min(s.y, current.y),
            width: Math.abs(s.x - current.x),
            height: Math.abs(s.y - current.y)
        });
        this.canvas.requestRenderAll();
    }

    finishRectangle() {
        this.isDrawing = false;
        if (!this.activeShape || this.activeShape.width < 1) {
            this.canvas.remove(this.activeShape);
            return;
        }

        const l = this.activeShape.left, t = this.activeShape.top, w = this.activeShape.width, h = this.activeShape.height;
        const points = [{x: l, y: t}, {x: l+w, y: t}, {x: l+w, y: t+h}, {x: l, y: t+h}];

        this.canvas.remove(this.activeShape);
        this.activeShape = null;

        const polygon = new fabric.Polygon(points, {
            fill: this.makeHatchPattern('Área Computável', 0.2),
            stroke: '#0f172a', strokeWidth: 1.5, objectCaching: false
        });

        this.canvas.add(polygon);
        this.registerBuilding(polygon, 'Retângulo');
        this.setTool('select');
        this.canvas.requestRenderAll();
    }

    addPolygonPoint(point, isLote) {
        if (!this.activePoints) {
            this.activePoints = [];
            this.activeLines = [];
            this.isDrawing = true;
        }
        if (this.activePoints.length > 2 && Math.hypot(point.x - this.activePoints[0].x, point.y - this.activePoints[0].y) < 10) {
            this.finishPolygon(isLote);
            return;
        }
        this.activeShapeStart = point;
        const zoom = this.canvas.getZoom();
        const circle = new fabric.Circle({ radius: 3/zoom, fill: isLote?'#f59e0b':'#3b82f6', left: point.x, top: point.y, originX:'center', originY:'center', selectable:false });
        this.canvas.add(circle);
        this.activePoints.push({ x: point.x, y: point.y, circle });
        
        if (this.activePoints.length > 1) {
             const prev = this.activePoints[this.activePoints.length-2];
             const line = new fabric.Line([prev.x, prev.y, point.x, point.y], { strokeWidth: 1.5/zoom, stroke: isLote?'#f59e0b':'#000', selectable:false });
             this.activeLines.push(line);
             this.canvas.add(line);
        }
        const tempLine = new fabric.Line([point.x, point.y, point.x, point.y], { strokeWidth: 1.5/zoom, stroke: '#999', strokeDashArray:[5,5], selectable:false });
        this.activeLine = tempLine;
        this.canvas.add(tempLine);
    }

    finishPolygon(isLote) {
        if (!this.activePoints || this.activePoints.length < 3) return;
        this.activePoints.forEach(p => this.canvas.remove(p.circle));
        this.activeLines.forEach(l => this.canvas.remove(l));
        this.canvas.remove(this.activeLine);

        const points = this.activePoints.map(p => ({ x: p.x, y: p.y }));
        const polygon = new fabric.Polygon(points, {
            fill: isLote ? 'transparent' : this.makeHatchPattern('Área Computável', 0.2), 
            stroke: isLote ? '#f59e0b' : '#0f172a',
            strokeWidth: isLote ? 2 : 1.5,
            objectCaching: false
        });

        this.canvas.add(polygon);
        
        if (isLote) {
            this.registerLote(polygon);
            this.setTool('edit-lote');
        } else {
            this.registerBuilding(polygon, 'Polígono');
        }

        this.activePoints = null; this.activeLines = null; this.activeLine = null; this.activeShapeStart = null; this.isDrawing = false;
        this.canvas.requestRenderAll();
    }

    attachVertexEditor(obj) {
        this.detachVertexEditor();
        if (!obj || obj.type !== 'polygon') return;

        obj.editablePolygon = true;
        if (!obj.vertexZ) obj.vertexZ = new Array(obj.points.length).fill(0);

        if (!obj._backupControls) obj._backupControls = obj.controls;
        
        obj.hasControls = true;
        obj.selectable = true;
        obj.evented = true;
        
        obj.controls = this.makePolygonControls(obj);
        obj.hasBorders = false;
        this.editingPolygon = obj;
        this.canvas.requestRenderAll();
        
        if (obj.isLote) {
             const zControl = document.getElementById('vertexZControl');
             if(zControl) zControl.style.display = 'flex';
        }
    }

    detachVertexEditor() {
        if (this.editingPolygon) {
            this.editingPolygon.controls = this.editingPolygon._backupControls;
            if(this.editingPolygon.isLote) {
                this.editingPolygon.hasControls = false;
            } else {
                this.editingPolygon.hasControls = true;
            }
            this.editingPolygon.hasBorders = true;
            this.editingPolygon.editablePolygon = false;
            this.editingPolygon = null;
            const zControl = document.getElementById('vertexZControl');
            if(zControl) zControl.style.display = 'none';
            this.canvas.requestRenderAll();
        }
    }

    makePolygonControls(polygon) {
        const controls = {};
        polygon.points.forEach((_, idx) => {
            controls[`p${idx}`] = new fabric.Control({
                positionHandler: (dim, finalMatrix, target) => {
                    const x = target.points[idx].x - target.pathOffset.x;
                    const y = target.points[idx].y - target.pathOffset.y;
                    return fabric.util.transformPoint({ x, y }, fabric.util.multiplyTransformMatrices(target.canvas.viewportTransform, target.calcTransformMatrix()));
                },
                actionHandler: (eventData, transform, x, y) => {
                    const changed = this.movePolygonPoint(eventData, transform, x, y, idx);
                    if (transform.target.isLote) {
                        this.selectedVertexIndex = idx;
                        const zInput = document.getElementById('inputVertexZ');
                        if (zInput && document.activeElement !== zInput) {
                            zInput.value = (transform.target.vertexZ[idx] || 0).toFixed(1);
                        }
                    }
                    return changed;
                },
                cursorStyle: 'move',
                render: (ctx, left, top) => {
                    ctx.save();
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(left, top, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });
        });
        return controls;
    }

    movePolygonPoint(eventData, transform, x, y, pointIndex) {
        const target = transform.target;
        const local = target.toLocalPoint(new fabric.Point(x, y), 'center', 'center');
        target.points[pointIndex] = { x: local.x + target.pathOffset.x, y: local.y + target.pathOffset.y };
        
        this.updateDimensions(target);
        if (target.isBuilding) this.updateBuildingData(target);
        if (target.isLote) this.updateLoteData();
        return true;
    }

    registerLote(obj) {
        if (this.state.lote.obj) this.canvas.remove(this.state.lote.obj);
        obj.set({ isLote: true, selectable: false, evented: true, lockRotation: true, hasControls: false });
        obj.set({ fill: 'transparent' }); 
        
        this.state.lote.exists = true;
        this.state.lote.obj = obj;
        document.getElementById('loteInfoBox').style.display = 'block';
        this.updateLoteData();
        this.updateDimensions(obj);
        
        const zInput = document.getElementById('inputVertexZ');
        if(zInput) {
            zInput.addEventListener('change', (e) => {
                if (this.editingPolygon === this.state.lote.obj && this.selectedVertexIndex > -1) {
                    this.state.lote.obj.vertexZ[this.selectedVertexIndex] = parseFloat(e.target.value);
                }
            });
        }
    }

    registerBuilding(obj, defaultName) {
        const id = Date.now();
        obj.set({ isBuilding: true, floorId: this.state.currentFloorId, cornerColor: 'white', borderColor: '#3b82f6', transparentCorners: false, lockRotation: true });
        obj.id = id;
        
        this.state.buildings.push({
            id,
            name: defaultName,
            type: obj.type,
            obj,
            floorId: this.state.currentFloorId,
            areaType: 'Área Computável',
            height: 3,
            area: this.calculateArea(obj)
        });
        
        this.updateBuildingData(obj);
        this.renderBuildingsList();
        this.updateUrbanIndices();
    }

    updateBuildingData(obj) {
        const b = this.state.buildings.find(i => i.id === obj.id);
        if (!b) return;
        b.area = this.calculateArea(obj);
        obj.set({ fill: this.makeHatchPattern(b.areaType, 0.2) });
        this.updateUrbanIndices();
    }

    updateLoteData() {
        if (!this.state.lote.obj) return;
        this.state.lote.area = this.calculateArea(this.state.lote.obj);
        document.getElementById('loteAreaDisplay').innerText = `${this.state.lote.area.toFixed(2)} m²`;
        this.updateUrbanIndices();
    }

    makeHatchPattern(type, alpha) {
        const c = document.createElement('canvas');
        c.width = 20; c.height = 20;
        const ctx = c.getContext('2d');
        ctx.strokeStyle = `rgba(0,0,0,0.6)`;
        ctx.lineWidth = 1.5;

        if (type === 'Área Permeável') {
            c.width = 16; c.height = 16;
            ctx.strokeStyle = '#059669'; 
            ctx.beginPath();
            ctx.moveTo(8, 4); ctx.lineTo(8, 12);
            ctx.moveTo(4, 8); ctx.lineTo(12, 8);
            ctx.stroke();
        } 
        else if (type === 'Área Computável') {
            ctx.beginPath();
            ctx.moveTo(0, 20); ctx.lineTo(20, 0);
            ctx.stroke();
        } 
        else if (type === 'Área não Computável') {
            ctx.beginPath();
            ctx.moveTo(0, 20); ctx.lineTo(20, 0); 
            ctx.moveTo(0, 0); ctx.lineTo(20, 20);
            ctx.stroke();
        } 
        else if (type === 'Pavimentação') {
             ctx.fillStyle = `rgba(160,174,192,${alpha})`;
             ctx.fillRect(0,0,20,20);
        }

        return new fabric.Pattern({ source: c, repeat: 'repeat' });
    }

    updateDimensions(obj) {
        this.removeDimensions(obj);
        obj.dimensions = [];
        const pts = this.getObjectVertices(obj);
        const zoom = this.canvas.getZoom();

        for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i+1)%pts.length];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (dist < 10) continue;

            const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
            
            const text = new fabric.Text((dist/this.pxPerMeter).toFixed(2), {
                left: mid.x, 
                top: mid.y,
                fontSize: 12/zoom, 
                fill: '#000', 
                backgroundColor:'rgba(255,255,255,0.7)',
                originX: 'center', 
                originY: 'center', 
                selectable: false,
                evented: false
            });

            // Linha invisível apenas para referência se precisar
            const dimLine = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
                 stroke: 'transparent', 
                 selectable: false,
                 evented: false
            });

            obj.dimensions.push(dimLine, text);
            this.canvas.add(dimLine, text);
            text.bringToFront();
        }
    }

    removeDimensions(obj) {
        if(obj.dimensions) obj.dimensions.forEach(d => this.canvas.remove(d));
        obj.dimensions = [];
    }

    calculateArea(obj) {
        const pts = this.getObjectVertices(obj);
        let area = 0;
        for (let i=0; i<pts.length; i++) {
            const j = (i+1)%pts.length;
            area += pts[i].x * pts[j].y;
            area -= pts[j].x * pts[i].y;
        }
        return Math.abs(area/2) / (this.pxPerMeter**2);
    }

    getObjectVertices(obj) {
        obj.setCoords();
        if (obj.points) {
            const m = obj.calcTransformMatrix();
            return obj.points.map(p => fabric.util.transformPoint(new fabric.Point(p.x, p.y), m));
        }
        return [obj.aCoords.tl, obj.aCoords.tr, obj.aCoords.br, obj.aCoords.bl];
    }

    addFloor(name, isGround = false) {
        const id = Date.now();
        const defaultName = name || `Pavimento ${this.state.floors.length + 1}`;
        if (isGround) this.state.floors.forEach(f => f.isGround = false);
        this.state.floors.push({ id, name: defaultName, isGround });
        this.selectFloor(id);
    }

    removeCurrentFloor() {
        if (this.state.floors.length <= 1) return; 
        const floorIndex = this.state.floors.findIndex(f => f.id === this.state.currentFloorId);
        if (floorIndex > -1) {
            const removedId = this.state.floors[floorIndex].id;
            this.state.buildings = this.state.buildings.filter(b => {
                 if(b.floorId === removedId) { this.canvas.remove(b.obj); return false; }
                 return true;
            });
            this.state.floors.splice(floorIndex, 1);
            this.selectFloor(this.state.floors[Math.max(0, floorIndex - 1)].id);
        }
    }

    exportJSON() {
        const data = {
            version: "UrbanMap 15",
            date: new Date().toISOString(),
            floors: this.state.floors,
            buildings: this.state.buildings.map(b => ({
                ...b,
                points: b.obj.points
            })),
            lote: this.state.lote.exists ? {
                points: this.state.lote.obj.points,
                vertexZ: this.state.lote.obj.vertexZ,
                params: this.state.lote.params
            } : null
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'projeto_urbanmap.json';
        a.click();
    }

    selectFloor(id) {
        this.state.currentFloorId = id;
        const f = this.state.floors.find(x => x.id === id);
        if(!f) return;
        
        document.getElementById('headerFloorName').innerText = f.name;
        
        this.state.buildings.forEach(b => {
            const isCurrent = b.floorId === id;
            b.obj.set({ opacity: isCurrent ? 1 : 0.1, selectable: isCurrent && this.state.tool === 'select', evented: isCurrent });
            if(isCurrent) this.canvas.bringToFront(b.obj); else this.canvas.sendToBack(b.obj);
        });
        if(this.state.lote.obj) this.canvas.sendToBack(this.state.lote.obj);
        
        this.renderFloorsList();
        this.renderBuildingsList();
        this.updateUrbanIndices();
        this.canvas.requestRenderAll();
    }

    renderFloorsList() {
        const el = document.getElementById('floorsList');
        el.innerHTML = '';
        [...this.state.floors].reverse().forEach(f => {
            const div = document.createElement('div');
            div.className = `floor-item ${f.id === this.state.currentFloorId ? 'active' : ''}`;
            
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = f.name;
            nameInput.className = 'inline-name-input';
            nameInput.onchange = (e) => { f.name = e.target.value; this.renderFloorsList(); };
            nameInput.onclick = (e) => e.stopPropagation();

            const small = document.createElement('small');
            small.innerText = f.isGround ? ' (Térreo)' : '';

            div.appendChild(nameInput);
            div.appendChild(small);
            div.onclick = () => this.selectFloor(f.id);
            el.appendChild(div);
        });
    }

    renderBuildingsList() {
        const el = document.getElementById('buildingsList');
        el.innerHTML = '';
        const visible = this.state.buildings.filter(b => b.floorId === this.state.currentFloorId);
        
        if (!visible.length) { el.innerHTML = '<div class="empty-state">Vazio</div>'; return; }

        visible.forEach(b => {
            const row = document.createElement('div');
            row.className = 'building-item';
            row.innerHTML = `
                <div class="building-main">
                    <input type="text" class="inline-name-input b-name" value="${b.name}">
                    <small>${b.area.toFixed(1)} m²</small>
                </div>
                <select class="mini-select b-type">
                    <option ${b.areaType === 'Área Computável' ? 'selected' : ''}>Área Computável</option>
                    <option ${b.areaType === 'Área não Computável' ? 'selected' : ''}>Área não Computável</option>
                    <option ${b.areaType === 'Área Permeável' ? 'selected' : ''}>Área Permeável</option>
                </select>
                <label>H <input class="mini-input b-height" type="number" value="${b.height}"></label>
            `;
            
            row.querySelector('.b-name').onchange = (e) => b.name = e.target.value;
            row.querySelector('.b-type').onchange = (e) => {
                b.areaType = e.target.value;
                this.updateBuildingData(b.obj);
            };
            row.querySelector('.b-height').onchange = (e) => {
                b.height = parseFloat(e.target.value) || 0;
            };
            row.onclick = (e) => {
                if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
                    this.canvas.setActiveObject(b.obj);
                    this.canvas.requestRenderAll();
                }
            }
            el.appendChild(row);
        });
    }

    // --- CORREÇÃO: Lógica de Índices Urbanísticos (Térreo vs Total) ---
    updateUrbanIndices() {
        // Validação inicial
        if (!this.state.lote.obj || this.state.lote.area <= 0) {
            this.updateIndicesUI(0, 0, 0, 0);
            return;
        }

        const loteArea = this.state.lote.area;
        let areaOcupada = 0;
        let areaComputavelTotal = 0;

        // 1. Identificar Pavimento Térreo
        const groundFloor = this.state.floors.find(f => f.isGround) || this.state.floors[0];

        // 2. Iterar sobre todos os edifícios
        this.state.buildings.forEach(b => {
            // Taxa de Ocupação (TO): Soma das projeções no térreo
            // (Consideramos Computável e Não Computável, exceto Permeável)
            if (b.floorId === groundFloor.id) {
                if (b.areaType === 'Área Computável' || b.areaType === 'Área não Computável') {
                    areaOcupada += b.area;
                }
            }

            // Coeficiente de Aproveitamento (CA): Soma de área computável em TODOS os andares
            if (b.areaType === 'Área Computável') {
                areaComputavelTotal += b.area;
            }
        });

        // 3. Cálculos Finais
        const currentTO = areaOcupada / loteArea;
        const currentCA = areaComputavelTotal / loteArea;
        const { maxTO, maxCA } = this.state.lote.params;

        // 4. Atualizar UI
        this.updateIndicesUI(currentTO, maxTO, currentCA, maxCA, areaOcupada, areaComputavelTotal);
    }

    updateIndicesUI(currentTO, maxTO, currentCA, maxCA, areaOcupada = 0, areaComp = 0) {
        // Atualiza Textos
        document.getElementById('valCurrentTO').innerText = (currentTO * 100).toFixed(1) + '%';
        document.getElementById('valCurrentCA').innerText = currentCA.toFixed(2);
        
        // Atualiza Limites (caso tenham mudado via dropdown)
        document.getElementById('limitTO').innerText = Math.round(maxTO * 100);
        document.getElementById('limitCA').innerText = maxCA.toFixed(1);

        // Atualiza Barras de Progresso
        const barTO = document.getElementById('barTO');
        const barCA = document.getElementById('barCA');
        const statusTO = document.getElementById('statusTO');
        const statusCA = document.getElementById('statusCA');

        // Cálculo da largura da barra (Porcentagem do LIMITE)
        // Se currentTO = 0.25 e maxTO = 0.50 -> width = 50%
        const widthTO = Math.min((currentTO / maxTO) * 100, 100);
        const widthCA = Math.min((currentCA / maxCA) * 100, 100);

        barTO.style.width = `${widthTO}%`;
        barCA.style.width = `${widthCA}%`;

        // Cores e Status (Vermelho se exceder)
        if (currentTO > maxTO) {
            barTO.style.backgroundColor = '#ef4444'; // Vermelho
            statusTO.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
            statusTO.style.color = '#ef4444';
        } else {
            barTO.style.backgroundColor = '#10b981'; // Verde
            statusTO.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
            statusTO.style.color = '#94a3b8';
        }

        if (currentCA > maxCA) {
            barCA.style.backgroundColor = '#ef4444';
            statusCA.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
            statusCA.style.color = '#ef4444';
        } else {
            barCA.style.backgroundColor = '#10b981';
            statusCA.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
            statusCA.style.color = '#94a3b8';
        }
    }

    deleteSelected() {
        const o = this.canvas.getActiveObject();
        if (o && o.isBuilding) {
            this.state.buildings = this.state.buildings.filter(b => b.id !== o.id);
            this.removeDimensions(o);
            this.canvas.remove(o);
            this.renderBuildingsList();
            this.updateUrbanIndices();
        }
    }
    
    getSnapPoint(pointer) {
        let closest = null, minDist = this.snapDistance;
        const targets = [this.state.lote.obj, ...this.state.buildings.filter(b=>b.obj.visible).map(b=>b.obj)];
        targets.forEach(t => {
            if(!t) return;
            this.getObjectVertices(t).forEach(p => {
                const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
                if(d < minDist) { minDist = d; closest = {x:p.x, y:p.y}; }
            });
        });
        return closest;
    }
    
    applyOrtho(start, curr) {
        if(!this.state.isShiftPressed) return curr;
        const dx = curr.x - start.x, dy = curr.y - start.y;
        if(Math.abs(dx) > Math.abs(dy)) return { x: curr.x, y: start.y };
        return { x: start.x, y: curr.y };
    }
    
    hasOverlap(obj) { return false; }
    revertObjectTransform(obj) { 
        if(obj._beforeMoveState) {
            obj.set(obj._beforeMoveState);
            obj.setCoords();
        }
    }
    cancelDrawingAndEdit() {
        this.isDrawing = false;
        if(this.activeShape) this.canvas.remove(this.activeShape);
        if(this.activePoints) this.activePoints.forEach(p=>this.canvas.remove(p.circle));
        if(this.activeLines) this.activeLines.forEach(l=>this.canvas.remove(l));
        this.activeShape=null; this.activePoints=null; this.activeLines=null;
        this.setTool('select');
    }

    toast(msg) {
        const th = document.getElementById('toolHint');
        if(th) {
            const original = th.innerText;
            th.innerText = msg;
            setTimeout(() => th.innerText = original, 3000);
        }
    }
}

window.urbanMap = new UrbanMapApp();
