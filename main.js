class UrbanMapApp {
    constructor() {
        this.state = {
            lote: { exists: false, obj: null, area: 0, params: { zone: 'ZR-3', maxTO: 0.5, maxCA: 1.0 } },
            floors: [],
            currentFloorId: 0,
            buildings: [],
            tool: 'select',
            isShiftPressed: false
        };

        this.snapDistance = 15;
        this.pxPerMeter = 10;
        this.isDrawing = false;
        this.isDragging = false;
        this.panBySpace = false;
        this.lastToolBeforePan = 'select';
        this.activeShape = null;
        this.activePoints = null;
        this.activeLines = null;
        this.activeLine = null;
        this.activeShapeStart = null;

        this.init();
    }

    init() {
        this.canvas = new fabric.Canvas('drawingCanvas', {
            backgroundColor: '#ffffff',
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

        this.addFloor('Térreo', true);
        this.updateUrbanIndices();

        setTimeout(() => {
            const ls = document.getElementById('loadingScreen');
            if (ls) ls.style.display = 'none';
        }, 450);
    }

    handleKey(e, isDown) {
        const tag = (e.target?.tagName || '').toLowerCase();
        const isInputContext = ['input', 'textarea', 'select'].includes(tag);

        if (!isInputContext && isDown) {
            const key = e.key.toLowerCase();
            if (key === 'v') this.setTool('select');
            if (key === 'r') this.setTool('rectangle');
            if (key === 'p') this.setTool('polygon');
            if (key === 'e') this.setTool('edit-building');
            if (key === 'c') this.setTool('cut');
        }

        if (e.key === 'Shift') {
            this.state.isShiftPressed = isDown;
            document.getElementById('orthoStatus').innerHTML = isDown
                ? '<i class="fas fa-ruler-combined"></i> Orto: ON'
                : '<i class="fas fa-ruler-combined"></i> Orto (Shift): OFF';
        }

        if (!isInputContext && e.code === 'Space') {
            e.preventDefault();
            if (isDown && !this.panBySpace) {
                this.panBySpace = true;
                this.lastToolBeforePan = this.state.tool;
                this.setTool('pan');
            }
            if (!isDown && this.panBySpace) {
                this.panBySpace = false;
                this.setTool(this.lastToolBeforePan || 'select');
            }
        }

        if (isDown && e.key === 'Delete') this.deleteSelected();
        if (isDown && e.key === 'Escape') this.cancelDrawingAndEdit();
    }

    cancelDrawingAndEdit() {
        if (this.activePoints) this.activePoints.forEach(p => this.canvas.remove(p.circle));
        if (this.activeLines) this.activeLines.forEach(l => this.canvas.remove(l));
        this.activePoints = null;
        this.activeLines = null;
        this.activeLine = null;
        this.activeShapeStart = null;
        this.isDrawing = false;
        this.detachVertexEditor();
        this.setTool('select');
    }

    resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        if (!container) return;
        this.canvas.setDimensions({ width: container.clientWidth, height: container.clientHeight }, { backstoreOnly: false });
        this.rescaleObjects();
    }

    setupCanvasEvents() {
        this.canvas.on('mouse:wheel', (opt) => {
            const e = opt.e;
            const isCtrlZoom = e.ctrlKey || e.metaKey;

            if (isCtrlZoom) {
                let zoom = this.canvas.getZoom() || 1;
                zoom *= 0.999 ** e.deltaY;
                zoom = Math.min(Math.max(zoom, 0.2), 18);
                this.canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, zoom);
                document.getElementById('headerZoom').innerText = `${Math.round(zoom * 100)}%`;
            } else {
                const vpt = this.canvas.viewportTransform;
                const panX = e.shiftKey ? -e.deltaY : -e.deltaX;
                const panY = e.shiftKey ? 0 : -e.deltaY;
                vpt[4] += panX;
                vpt[5] += panY;
                this.canvas.requestRenderAll();
            }

            e.preventDefault();
            e.stopPropagation();
            clearTimeout(this._zoomTimeout);
            this._zoomTimeout = setTimeout(() => this.rescaleObjects(), 60);
        });

        this.canvas.on('mouse:dblclick', (o) => {
            if ((this.state.tool === 'polygon' || this.state.tool === 'draw-lote') && this.activePoints?.length >= 3) {
                this.finishPolygon(this.state.tool === 'draw-lote');
                return;
            }

            if ((this.state.tool === 'edit-lote' || this.state.tool === 'edit-building') && o.target?.editablePolygon) {
                const ptr = this.canvas.getPointer(o.e);
                this.insertVertexOnNearestEdge(o.target, ptr);
            }
        });

        this.canvas.on('mouse:down', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            const activeTool = this.state.tool;

            if (activeTool === 'pan' || o.e.altKey) {
                this.isDragging = true;
                this.lastPosX = o.e.clientX;
                this.lastPosY = o.e.clientY;
                return;
            }

            if (activeTool === 'cut') {
                const target = o.target || this.canvas.getActiveObject();
                if (target?.isBuilding) this.renderSection(target);
                else this.toast('Selecione um bloco para gerar o corte.');
                return;
            }

            if (['rectangle', 'polygon', 'draw-lote'].includes(activeTool)) {
                const start = this.getSnapPoint(pointer) || pointer;
                if (activeTool === 'rectangle') this.startRectangle(start);
                else this.addPolygonPoint(start, activeTool === 'draw-lote');
            }
        });

        this.canvas.on('mouse:move', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            document.getElementById('mouseCoords').innerText = `X: ${(pointer.x / this.pxPerMeter).toFixed(2)} m, Y: ${(pointer.y / this.pxPerMeter).toFixed(2)} m`;

            if (this.isDragging) {
                const vpt = this.canvas.viewportTransform;
                vpt[4] += o.e.clientX - this.lastPosX;
                vpt[5] += o.e.clientY - this.lastPosY;
                this.lastPosX = o.e.clientX;
                this.lastPosY = o.e.clientY;
                this.canvas.requestRenderAll();
                return;
            }

            if (this.isDrawing) {
                let target = this.getSnapPoint(pointer) || pointer;
                if (this.activeShapeStart) target = this.applyOrtho(this.activeShapeStart, target);

                if (this.state.tool === 'rectangle' && this.activeShape) {
                    this.updateRectanglePreview(target);
                } else if ((this.state.tool === 'polygon' || this.state.tool === 'draw-lote') && this.activeLine) {
                    this.activeLine.set({ x2: target.x, y2: target.y });
                    this.canvas.requestRenderAll();
                }
            }
        });

        this.canvas.on('mouse:up', () => {
            this.isDragging = false;
            if (this.state.tool === 'rectangle' && this.isDrawing) this.finishRectangle();
        });

        this.canvas.on('object:moving', (e) => {
            const obj = e.target;
            if (!obj) return;
            obj._beforeMoveState ||= { left: obj.left, top: obj.top, points: obj.points ? obj.points.map(p => ({ ...p })) : null };
        });

        this.canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (!obj) return;
            if (obj.isBuilding) {
                if (this.hasOverlap(obj)) {
                    this.revertObjectTransform(obj);
                    this.toast('Sobreposição não permitida no mesmo pavimento.');
                } else {
                    this.updateBuildingData(obj);
                }
            }
            if (obj.isLote) this.updateLoteData();
            obj._beforeMoveState = null;
            this.rescaleObjects();
        });

        this.canvas.on('object:removed', (e) => {
            const obj = e.target;
            if (!obj) return;
            if (obj.isBuilding) {
                const idx = this.state.buildings.findIndex(b => b.id === obj.id);
                if (idx > -1) this.state.buildings.splice(idx, 1);
                this.removeDimensions(obj);
                this.renderBuildingsList();
                this.updateUrbanIndices();
            }
            if (obj.isLote) {
                this.state.lote.obj = null;
                this.state.lote.exists = false;
                this.state.lote.area = 0;
                document.getElementById('loteInfoBox').style.display = 'none';
                this.updateUrbanIndices();
            }
        });
    }

    setupUIEvents() {
        document.querySelectorAll('.tool-btn').forEach(btn => btn.addEventListener('click', () => this.setTool(btn.dataset.tool)));
        document.getElementById('btnDrawLote').addEventListener('click', () => this.setTool('draw-lote'));
        document.getElementById('btnEditLote').addEventListener('click', () => this.setTool('edit-lote'));

        document.getElementById('loteZoning').addEventListener('change', (e) => {
            this.state.lote.params.zone = e.target.value;
            if (e.target.value === 'ZR-3') { this.state.lote.params.maxTO = 0.5; this.state.lote.params.maxCA = 1; }
            if (e.target.value === 'ZR-4') { this.state.lote.params.maxTO = 0.6; this.state.lote.params.maxCA = 2; }
            if (e.target.value === 'ECO-1') { this.state.lote.params.maxTO = 0.8; this.state.lote.params.maxCA = 4; }
            this.updateUrbanIndices();
        });

        document.getElementById('btnAddFloor').addEventListener('click', () => {
            const name = prompt('Nome do pavimento:', `Pavimento ${this.state.floors.length}`);
            if (name) this.addFloor(name, false);
        });
        document.getElementById('btnRenameFloor').addEventListener('click', () => this.renameCurrentFloor());
        document.getElementById('btnRemoveFloor').addEventListener('click', () => this.removeCurrentFloor());

        document.getElementById('btnExportJSON').addEventListener('click', () => this.exportJSON());

        const btnToggleNav = document.getElementById('btnToggleNav');
        if (btnToggleNav) btnToggleNav.addEventListener('click', () => this.setMobilePanel(document.body.classList.contains('mobile-panel-right') ? 'left' : 'right'));
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.addEventListener('click', () => this.setMobilePanel(btn.dataset.panelTarget)));

        document.getElementById('btnCloseCut').addEventListener('click', () => {
            const m = document.getElementById('cutModal');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        });
    }

    setMobilePanel(target) {
        const showRight = target === 'right';
        document.body.classList.toggle('mobile-panel-right', showRight);
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.panelTarget === (showRight ? 'right' : 'left')));
    }

    setTool(tool) {
        this.detachVertexEditor();
        this.state.tool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
        document.getElementById('toolHint').innerText = `Ferramenta: ${tool.toUpperCase()}`;

        this.canvas.selection = tool === 'select';
        this.canvas.defaultCursor = tool === 'pan' ? 'grab' : (tool.includes('edit') ? 'crosshair' : 'default');

        this.canvas.forEachObject(o => {
            const isCurrentBuilding = !!o.isBuilding && o.floorId === this.state.currentFloorId;
            const canEditBuilding = tool === 'edit-building' && isCurrentBuilding && o.type === 'polygon';
            const canEditLote = tool === 'edit-lote' && !!o.isLote;
            const canCutPick = tool === 'cut' && isCurrentBuilding;
            o.selectable = (tool === 'select' && isCurrentBuilding) || canEditBuilding || canEditLote || canCutPick;
            o.evented = true;
        });


        this.canvas.off('selection:created');
        this.canvas.off('selection:updated');
        if (tool === 'edit-building') {
            const onSelection = (ev) => {
                const selected = ev.selected?.[0] || this.canvas.getActiveObject();
                if (selected?.isBuilding && selected.floorId === this.state.currentFloorId && selected.type === 'polygon') {
                    this.attachVertexEditor(selected);
                }
            };
            this.canvas.on('selection:created', onSelection);
            this.canvas.on('selection:updated', onSelection);
        }
        if (tool === 'edit-lote' && this.state.lote.obj) this.attachVertexEditor(this.state.lote.obj);
        if (tool === 'edit-building') {
            const active = this.canvas.getActiveObject();
            if (active?.isBuilding && active.floorId === this.state.currentFloorId && active.type === 'polygon') this.attachVertexEditor(active);
        }

        this.canvas.requestRenderAll();
    }

    // ----- Drawing
    startRectangle(start) {
        this.isDrawing = true;
        this.activeShapeStart = start;
        const zoom = this.canvas.getZoom() || 1;
        this.activeShape = new fabric.Rect({
            left: start.x,
            top: start.y,
            width: 0,
            height: 0,
            fill: this.makeHatchPattern('Área Computável', 0.2),
            stroke: '#0f172a',
            strokeWidth: 1.2 / zoom,
            selectable: false,
            objectCaching: false
        });
        this.canvas.add(this.activeShape);
    }

    updateRectanglePreview(current) {
        const start = this.activeShapeStart;
        if (start.x > current.x) this.activeShape.set({ left: current.x });
        if (start.y > current.y) this.activeShape.set({ top: current.y });
        this.activeShape.set({ width: Math.abs(start.x - current.x), height: Math.abs(start.y - current.y) });
        this.canvas.requestRenderAll();
    }

    finishRectangle() {
        this.isDrawing = false;
        if (this.activeShape.width > 5 || this.activeShape.height > 5) this.registerBuilding(this.activeShape, 'rect');
        else this.canvas.remove(this.activeShape);
        this.activeShape = null;
        this.activeShapeStart = null;
    }

    addPolygonPoint(point, isLote) {
        if (!this.activePoints) {
            this.activePoints = [];
            this.activeLines = [];
            this.isDrawing = true;
        }

        this.activeShapeStart = point;
        const zoom = this.canvas.getZoom() || 1;
        const circle = new fabric.Circle({ radius: 3.8 / zoom, fill: isLote ? '#f59e0b' : '#0f172a', stroke: '#fff', strokeWidth: 1 / zoom, left: point.x, top: point.y, originX: 'center', originY: 'center', selectable: false, evented: false });
        this.canvas.add(circle);
        this.activePoints.push({ x: point.x, y: point.y, circle });

        const line = new fabric.Line([point.x, point.y, point.x, point.y], { strokeWidth: 1.2 / zoom, stroke: isLote ? '#f59e0b' : '#1f2937', selectable: false, evented: false });
        this.activeLines.push(line);
        this.canvas.add(line);
        this.activeLine = line;
    }

    finishPolygon(isLote) {
        if (!this.activePoints || this.activePoints.length < 3) return;

        this.activePoints.forEach(p => this.canvas.remove(p.circle));
        this.activeLines.forEach(l => this.canvas.remove(l));
        const points = this.activePoints.map(p => ({ x: p.x, y: p.y }));

        const polygon = new fabric.Polygon(points, {
            fill: isLote ? this.makeHatchPattern('Área Permeável', 0.14) : this.makeHatchPattern('Área Computável', 0.18),
            stroke: '#0f172a',
            strokeWidth: 1.3 / (this.canvas.getZoom() || 1),
            objectCaching: false
        });

        this.canvas.add(polygon);
        if (isLote) this.registerLote(polygon);
        else this.registerBuilding(polygon, 'polygon');

        this.activePoints = null;
        this.activeLines = null;
        this.activeLine = null;
        this.activeShapeStart = null;
        this.isDrawing = false;
        if (isLote) this.setTool('edit-lote');
    }

    // ----- Polygon edit
    attachVertexEditor(obj) {
        if (!obj || obj.type !== 'polygon') return;
        this.detachVertexEditor();
        obj.editablePolygon = true;
        obj.cornerStyle = 'circle';
        obj.transparentCorners = false;

        const lastControl = obj.controls;
        obj._backupControls = lastControl;
        obj.controls = this.makePolygonControls(obj);
        obj.hasBorders = false;
        obj.selectable = true;
        obj.objectCaching = false;
        this.editingPolygon = obj;
        this.canvas.setActiveObject(obj);
        this.canvas.requestRenderAll();
    }

    detachVertexEditor() {
        const obj = this.editingPolygon;
        if (!obj) return;
        if (obj._backupControls) obj.controls = obj._backupControls;
        obj.editablePolygon = false;
        obj.hasBorders = true;
        this.editingPolygon = null;
        this.canvas.requestRenderAll();
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
                actionHandler: (eventData, transform, x, y) => this.movePolygonPoint(eventData, transform, x, y, idx),
                actionName: 'modifyPolygon',
                pointIndex: idx,
                render: this.renderVertexControl
            });
        });
        return controls;
    }

    renderVertexControl(ctx, left, top, styleOverride, fabricObject) {
        const size = (fabricObject.cornerSize || 8);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(left, top, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    movePolygonPoint(eventData, transform, x, y, pointIndex) {
        const target = transform.target;
        const prevPoint = { ...target.points[pointIndex] };
        const local = target.toLocalPoint(new fabric.Point(x, y), 'center', 'center');
        const finalPoint = {
            x: local.x + target.pathOffset.x,
            y: local.y + target.pathOffset.y
        };
        target.points[pointIndex] = finalPoint;
        target.setCoords();

        if (target.isBuilding && this.hasOverlap(target)) {
            target.points[pointIndex] = prevPoint;
            target.setCoords();
            return false;
        }

        if (target.isBuilding) this.updateBuildingData(target);
        if (target.isLote) this.updateLoteData();
        this.updateDimensions(target);
        return true;
    }

    insertVertexOnNearestEdge(polygon, pointer) {
        if (!polygon?.points || polygon.points.length < 3) return;
        const local = polygon.toLocalPoint(new fabric.Point(pointer.x, pointer.y), 'center', 'center');
        const p = { x: local.x + polygon.pathOffset.x, y: local.y + polygon.pathOffset.y };

        let nearestIndex = 0;
        let nearestDist = Number.MAX_VALUE;
        for (let i = 0; i < polygon.points.length; i++) {
            const a = polygon.points[i];
            const b = polygon.points[(i + 1) % polygon.points.length];
            const d = this.pointToSegmentDistance(p, a, b);
            if (d < nearestDist) {
                nearestDist = d;
                nearestIndex = i + 1;
            }
        }

        polygon.points.splice(nearestIndex, 0, p);
        polygon.controls = this.makePolygonControls(polygon);
        polygon.setCoords();

        if (polygon.isBuilding && this.hasOverlap(polygon)) {
            polygon.points.splice(nearestIndex, 1);
            polygon.controls = this.makePolygonControls(polygon);
            polygon.setCoords();
            this.toast('Novo vértice inválido: gerou sobreposição no pavimento.');
            return;
        }

        if (polygon.isBuilding) this.updateBuildingData(polygon);
        if (polygon.isLote) this.updateLoteData();
        this.updateDimensions(polygon);
        this.canvas.requestRenderAll();
    }

    pointToSegmentDistance(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        return Math.hypot(p.x - px, p.y - py);
    }

    // ----- Entities
    registerLote(obj) {
        if (this.state.lote.obj) {
            this.removeDimensions(this.state.lote.obj);
            this.canvas.remove(this.state.lote.obj);
        }
        obj.set({ isLote: true, selectable: false, evented: true, lockRotation: true });
        this.state.lote.exists = true;
        this.state.lote.obj = obj;
        document.getElementById('loteInfoBox').style.display = 'block';
        this.updateLoteData();
        this.updateDimensions(obj);
    }

    registerBuilding(obj, type) {
        obj.set({
            isBuilding: true,
            floorId: this.state.currentFloorId,
            cornerColor: 'white',
            borderColor: '#3b82f6',
            transparentCorners: false,
            selectable: true,
            lockRotation: true
        });

        const id = Date.now() + Math.floor(Math.random() * 1000);
        obj.id = id;

        const building = {
            id,
            type,
            obj,
            floorId: this.state.currentFloorId,
            areaType: 'Área Computável',
            height: 3,
            area: this.calculateArea(obj, type)
        };

        obj.areaType = building.areaType;
        obj.blockHeight = building.height;
        obj.fill = this.makeHatchPattern(building.areaType, 0.2);

        if (this.hasOverlap(obj)) {
            this.canvas.remove(obj);
            this.toast('Não é permitido sobrepor polígonos no mesmo pavimento.');
            return;
        }

        this.state.buildings.push(building);
        this.updateDimensions(obj);
        this.renderBuildingsList();
        this.updateUrbanIndices();
    }

    updateBuildingData(obj) {
        const b = this.state.buildings.find(item => item.id === obj.id);
        if (!b) return;
        b.area = this.calculateArea(obj, b.type);
        obj.fill = this.makeHatchPattern(b.areaType, 0.2);
        this.renderBuildingsList();
        this.updateUrbanIndices();
    }

    updateLoteData() {
        if (!this.state.lote.obj) return;
        this.state.lote.area = this.calculateArea(this.state.lote.obj, 'polygon') || 0;
        document.getElementById('loteAreaDisplay').innerText = `${this.state.lote.area.toFixed(2)} m²`;
        this.updateUrbanIndices();
    }

    // ----- Dimensions
    updateDimensions(obj) {
        this.removeDimensions(obj);
        obj.dimensions = [];

        const vertices = this.getObjectVertices(obj);
        if (!vertices || vertices.length < 2) return;
        const center = obj.getCenterPoint();
        const zoom = this.canvas.getZoom() || 1;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const distM = (distPx / this.pxPerMeter).toFixed(2);
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            let nx = -(p2.y - p1.y);
            let ny = (p2.x - p1.x);
            const nlen = Math.hypot(nx, ny) || 1;
            nx /= nlen;
            ny /= nlen;

            const towardCenter = Math.hypot(mid.x + nx * 12 - center.x, mid.y + ny * 12 - center.y) < Math.hypot(mid.x - center.x, mid.y - center.y);
            if (towardCenter) { nx *= -1; ny *= -1; }

            const offset = 14;
            const x1 = p1.x + nx * offset;
            const y1 = p1.y + ny * offset;
            const x2 = p2.x + nx * offset;
            const y2 = p2.y + ny * offset;

            const dimLine = new fabric.Line([x1, y1, x2, y2], { stroke: '#111827', strokeDashArray: [4 / zoom, 2 / zoom], strokeWidth: 1 / zoom, selectable: false, evented: false, excludeFromExport: true });
            const text = new fabric.Text(distM, { left: (x1 + x2) / 2, top: (y1 + y2) / 2, fontSize: 11 / zoom, fill: '#111827', originX: 'center', originY: 'center', backgroundColor: 'rgba(255,255,255,0.85)', selectable: false, evented: false, excludeFromExport: true });

            obj.dimensions.push(dimLine, text);
            this.canvas.add(dimLine, text);
            this.canvas.bringToFront(dimLine);
            this.canvas.bringToFront(text);
        }
    }

    removeDimensions(obj) {
        if (!obj?.dimensions) return;
        obj.dimensions.forEach(d => {
            try { this.canvas.remove(d); } catch (e) {}
        });
        obj.dimensions = [];
    }

    // ----- Math/geometry
    applyOrtho(start, current) {
        if (!this.state.isShiftPressed || !start) return current;
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return current;
        const angle = Math.atan2(dy, dx);
        const step = Math.PI / 12;
        const snapped = Math.round(angle / step) * step;
        return { x: start.x + dist * Math.cos(snapped), y: start.y + dist * Math.sin(snapped) };
    }

    getSnapPoint(pointer) {
        let closest = null;
        let minDist = this.snapDistance;
        const candidates = [];
        if (this.state.lote.obj) candidates.push(this.state.lote.obj);
        this.state.buildings.forEach(b => { if (b.obj?.visible) candidates.push(b.obj); });

        candidates.forEach(obj => {
            const points = this.getObjectVertices(obj);
            points.forEach(p => {
                const dist = Math.hypot(p.x - pointer.x, p.y - pointer.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { x: p.x, y: p.y };
                }
            });
        });
        return closest;
    }

    getObjectVertices(obj) {
        if (!obj) return [];
        obj.setCoords();
        if (obj.type === 'polygon' && obj.points) {
            const matrix = obj.calcTransformMatrix();
            return obj.points.map(p => fabric.util.transformPoint(new fabric.Point(p.x, p.y), matrix));
        }
        if (obj.aCoords) return [obj.aCoords.tl, obj.aCoords.tr, obj.aCoords.br, obj.aCoords.bl];
        return [{ x: obj.left, y: obj.top }];
    }

    calculateArea(obj, type) {
        if (!obj) return 0;
        if (type === 'rect') {
            const w = obj.width * obj.scaleX;
            const h = obj.height * obj.scaleY;
            return Math.abs(w * h) / (this.pxPerMeter ** 2);
        }
        return this.calculatePolygonArea(obj);
    }

    calculatePolygonArea(polygon) {
        const pts = this.getObjectVertices(polygon);
        if (!pts || pts.length < 3) return 0;
        let sum = 0;
        for (let i = 0; i < pts.length; i++) {
            const x1 = pts[i].x; const y1 = pts[i].y;
            const x2 = pts[(i + 1) % pts.length].x; const y2 = pts[(i + 1) % pts.length].y;
            sum += (x1 * y2 - x2 * y1);
        }
        return Math.abs(sum / 2) / (this.pxPerMeter ** 2);
    }

    hasOverlap(candidateObj) {
        const candidate = this.getObjectVertices(candidateObj);
        const floorId = candidateObj.floorId;
        const others = this.state.buildings.filter(b => b.floorId === floorId && b.id !== candidateObj.id).map(b => b.obj);

        for (const obj of others) {
            const poly = this.getObjectVertices(obj);
            const inter = fabric.Intersection.intersectPolygonPolygon(candidate.map(p => new fabric.Point(p.x, p.y)), poly.map(p => new fabric.Point(p.x, p.y)));
            if (inter.status === 'Intersection') return true;
            if (this.pointInPolygon(candidate[0], poly) || this.pointInPolygon(poly[0], candidate)) return true;
        }
        return false;
    }

    pointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    revertObjectTransform(obj) {
        const prev = obj._beforeMoveState;
        if (!prev) return;
        obj.set({ left: prev.left, top: prev.top });
        if (prev.points && obj.points) obj.points = prev.points.map(p => ({ ...p }));
        obj.setCoords();
        this.updateDimensions(obj);
        this.canvas.requestRenderAll();
    }

    // ----- Floor management
    addFloor(name, isGround = false) {
        const id = Date.now() + Math.floor(Math.random() * 999);
        if (isGround) this.state.floors.forEach(f => { f.isGround = false; });
        this.state.floors.push({ id, name, isGround });
        this.state.currentFloorId = id;
        this.renderFloorsList();
        this.selectFloor(id);
    }

    renameCurrentFloor() {
        const floor = this.state.floors.find(f => f.id === this.state.currentFloorId);
        if (!floor) return;
        const newName = prompt('Novo nome do pavimento:', floor.name);
        if (newName?.trim()) {
            floor.name = newName.trim();
            this.renderFloorsList();
            this.selectFloor(floor.id);
        }
    }

    removeCurrentFloor() {
        if (this.state.floors.length <= 1) return this.toast('É necessário manter ao menos 1 pavimento.');
        const current = this.state.floors.find(f => f.id === this.state.currentFloorId);
        if (!current) return;
        if (!confirm(`Remover ${current.name}?`)) return;

        const toRemove = this.state.buildings.filter(b => b.floorId === current.id);
        toRemove.forEach(b => {
            this.removeDimensions(b.obj);
            this.canvas.remove(b.obj);
        });
        this.state.buildings = this.state.buildings.filter(b => b.floorId !== current.id);
        this.state.floors = this.state.floors.filter(f => f.id !== current.id);

        if (!this.state.floors.some(f => f.isGround)) this.state.floors[0].isGround = true;
        this.selectFloor(this.state.floors[0].id);
        this.renderFloorsList();
    }

    selectFloor(id) {
        const found = this.state.floors.find(f => f.id === id);
        if (!found) return;
        this.state.currentFloorId = found.id;

        const header = document.getElementById('headerFloorName');
        if (header) header.innerText = found.name;

        this.state.buildings.forEach(b => {
            if (b.floorId === this.state.currentFloorId) {
                b.obj.visible = true;
                b.obj.opacity = 1;
                b.obj.selectable = this.state.tool === 'select';
            } else {
                b.obj.visible = true;
                b.obj.opacity = 0.18;
                b.obj.selectable = false;
            }
        });

        this.renderFloorsList();
        this.renderBuildingsList();
        this.updateUrbanIndices();
        this.canvas.requestRenderAll();
    }

    renderFloorsList() {
        const list = document.getElementById('floorsList');
        if (!list) return;
        list.innerHTML = '';
        [...this.state.floors].reverse().forEach(f => {
            const item = document.createElement('div');
            item.className = `floor-item ${f.id === this.state.currentFloorId ? 'active' : ''}`;
            item.innerHTML = `<span>${f.name}</span><small>${f.isGround ? 'Térreo TO' : 'Superior'}</small>`;
            item.addEventListener('click', () => this.selectFloor(f.id));
            item.addEventListener('dblclick', () => {
                this.state.floors.forEach(ff => { ff.isGround = false; });
                f.isGround = true;
                this.renderFloorsList();
                this.updateUrbanIndices();
            });
            list.appendChild(item);
        });
    }

    renderBuildingsList() {
        const list = document.getElementById('buildingsList');
        if (!list) return;
        const visible = this.state.buildings.filter(b => b.floorId === this.state.currentFloorId);
        list.innerHTML = '';

        if (!visible.length) {
            list.innerHTML = '<div class="empty-state">Vazio</div>';
            return;
        }

        visible.forEach(b => {
            const row = document.createElement('div');
            row.className = 'building-item';
            row.innerHTML = `
                <div class="building-main">
                    <strong>${b.type}</strong>
                    <small>${b.area.toFixed(1)} m²</small>
                </div>
                <select class="mini-select b-type">
                    <option ${b.areaType === 'Área Computável' ? 'selected' : ''}>Área Computável</option>
                    <option ${b.areaType === 'Área não Computável' ? 'selected' : ''}>Área não Computável</option>
                    <option ${b.areaType === 'Área Permeável' ? 'selected' : ''}>Área Permeável</option>
                    <option ${b.areaType === 'Pavimentação' ? 'selected' : ''}>Pavimentação</option>
                </select>
                <label>H <input class="mini-input b-height" type="number" min="0" step="0.1" value="${b.height.toFixed(1)}"></label>
            `;

            row.querySelector('.b-type').addEventListener('change', (e) => {
                b.areaType = e.target.value;
                b.obj.areaType = b.areaType;
                b.obj.set({ fill: this.makeHatchPattern(b.areaType, 0.2) });
                this.canvas.requestRenderAll();
                this.updateUrbanIndices();
            });
            row.querySelector('.b-height').addEventListener('change', (e) => {
                b.height = Math.max(0, Number(e.target.value) || 0);
                b.obj.blockHeight = b.height;
            });
            row.addEventListener('click', () => {
                this.canvas.setActiveObject(b.obj);
                if (this.state.tool === 'edit-building' && b.obj.type === 'polygon') this.attachVertexEditor(b.obj);
            });

            list.appendChild(row);
        });
    }

    // ----- Indices
    updateUrbanIndices() {
        const loteArea = this.state.lote.area || 1;
        const groundId = this.state.floors.find(f => f.isGround)?.id ?? this.state.currentFloorId;

        let areaOcupada = 0;
        let areaTotalConstruida = 0;
        this.state.buildings.forEach(b => {
            if (b.floorId === groundId) areaOcupada += b.area;
            if (b.areaType !== 'Área Permeável') areaTotalConstruida += b.area;
        });

        const TO = areaOcupada / loteArea;
        const CA = areaTotalConstruida / loteArea;
        const params = this.state.lote.params;

        document.getElementById('valCurrentTO').innerText = `${(TO * 100).toFixed(1)}%`;
        document.getElementById('areaOcupadaDisplay').innerText = `${areaOcupada.toFixed(1)} m² ocupados`;
        document.getElementById('limitTO').innerText = Math.round(params.maxTO * 100);

        const barTO = document.getElementById('barTO');
        const statusTO = document.getElementById('statusTO');
        barTO.style.width = `${Math.min((TO / params.maxTO) * 100, 100)}%`;
        if (TO > params.maxTO) {
            barTO.style.background = 'linear-gradient(90deg, var(--error), #fb7185)';
            statusTO.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
        } else {
            barTO.style.background = 'linear-gradient(90deg, var(--success), #34d399)';
            statusTO.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
        }

        document.getElementById('valCurrentCA').innerText = CA.toFixed(2);
        document.getElementById('areaTotalConstruidaDisplay').innerText = `${areaTotalConstruida.toFixed(1)} m² constr.`;
        document.getElementById('limitCA').innerText = params.maxCA;

        const barCA = document.getElementById('barCA');
        const statusCA = document.getElementById('statusCA');
        barCA.style.width = `${Math.min((CA / params.maxCA) * 100, 100)}%`;
        if (CA > params.maxCA) {
            barCA.style.background = 'linear-gradient(90deg, var(--error), #fb7185)';
            statusCA.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
        } else {
            barCA.style.background = 'linear-gradient(90deg, var(--success), #34d399)';
            statusCA.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
        }
    }

    // ----- Cut
    renderSection(buildingObj) {
        const building = this.state.buildings.find(b => b.id === buildingObj.id);
        if (!building) return;

        const modal = document.getElementById('cutModal');
        const c = document.getElementById('cutCanvas');
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);

        const groundY = c.height - 42;
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(26, groundY);
        ctx.lineTo(c.width - 26, groundY);
        ctx.stroke();

        const w = Math.min(560, Math.max(140, building.area * 3.2));
        const h = Math.min(180, Math.max(30, building.height * 26));
        const x = (c.width - w) / 2;
        const y = groundY - h;

        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 8;
        patternCanvas.height = 8;
        const pctx = patternCanvas.getContext('2d');
        pctx.fillStyle = '#f8fafc';
        pctx.fillRect(0, 0, 8, 8);
        pctx.strokeStyle = '#6b7280';
        pctx.lineWidth = 1;
        pctx.beginPath();
        pctx.moveTo(0, 8);
        pctx.lineTo(8, 0);
        pctx.stroke();

        ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#111827';
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#111827';
        ctx.font = '12px Arial';
        ctx.fillText(`Tipo: ${building.areaType}`, x + 10, y + 20);
        ctx.fillText(`Área: ${building.area.toFixed(1)} m²`, x + 10, y + 38);
        ctx.fillText(`Altura: ${building.height.toFixed(2)} m`, x + 10, y + 56);

        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    }

    // ----- Utils
    makeHatchPattern(areaType, alpha = 0.2) {
        const hatch = document.createElement('canvas');
        hatch.width = 12;
        hatch.height = 12;
        const hctx = hatch.getContext('2d');

        let bg = `rgba(255,255,255,${alpha})`;
        let stroke = '#0f172a';
        if (areaType === 'Área não Computável') bg = `rgba(254,226,226,${alpha})`;
        if (areaType === 'Área Permeável') bg = `rgba(220,252,231,${alpha})`;
        if (areaType === 'Pavimentação') bg = `rgba(226,232,240,${alpha})`;

        hctx.fillStyle = bg;
        hctx.fillRect(0, 0, hatch.width, hatch.height);
        hctx.strokeStyle = stroke;
        hctx.lineWidth = 1;

        if (areaType === 'Área Permeável') {
            hctx.beginPath();
            hctx.arc(6, 6, 2, 0, Math.PI * 2);
            hctx.stroke();
        } else if (areaType === 'Pavimentação') {
            hctx.strokeRect(1, 1, 10, 10);
            hctx.beginPath(); hctx.moveTo(1, 6); hctx.lineTo(11, 6); hctx.stroke();
        } else {
            hctx.beginPath();
            hctx.moveTo(0, 12);
            hctx.lineTo(12, 0);
            hctx.stroke();
        }

        return new fabric.Pattern({ source: hatch, repeat: 'repeat' });
    }

    deleteSelected() {
        const active = this.canvas.getActiveObject();
        if (!active?.isBuilding) return;
        this.removeDimensions(active);
        this.canvas.remove(active);
    }

    rescaleObjects() {
        const zoom = this.canvas.getZoom() || 1;
        this.canvas.forEachObject(o => {
            if (o.strokeWidth !== undefined && !o.excludeFromExport) o.set('strokeWidth', 1.2 / zoom);
            o.setCoords?.();
        });
        this.canvas.requestRenderAll();
    }

    toast(msg) {
        document.getElementById('toolHint').innerText = msg;
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            document.getElementById('toolHint').innerText = `Ferramenta: ${this.state.tool.toUpperCase()}`;
        }, 2600);
    }

    exportJSON() {
        const payload = {
            meta: { createdAt: new Date().toISOString(), pxPerMeter: this.pxPerMeter },
            lote: this.state.lote.exists ? { area: this.state.lote.area, zone: this.state.lote.params.zone } : null,
            floors: this.state.floors,
            buildings: this.state.buildings.map(b => ({ id: b.id, type: b.type, floorId: b.floorId, area: b.area, areaType: b.areaType, height: b.height }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'urbanmap_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
}

window.onload = () => {
    window.urbanMap = new UrbanMapApp();
};
