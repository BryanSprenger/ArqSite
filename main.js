/**
 * UrbanMap Pro v13 - CAD System (revisado)
 * Correções: estado de pavimentos, área de polígonos (shoelace),
 * rescale após zoom, progress bars, remoção sincronizada.
 */

class UrbanMapApp {
    constructor() {
        this.state = {
            lote: {
                exists: false,
                obj: null,
                area: 0,
                params: { 
                    zone: 'ZR-3', 
                    maxTO: 0.5,
                    maxCA: 1.0 
                }
            },
            floors: [],
            currentFloorId: 0,
            buildings: [],
            tool: 'select',
            isShiftPressed: false
        };

        this.snapDistance = 15; // pixels
        this.pxPerMeter = 10;   // Escala visual
        this.isDrawing = false;
        this.isDragging = false;
        this.panBySpace = false;
        this.lastToolBeforePan = 'select';

        this.init();
    }

    init() {
        this.canvas = new fabric.Canvas('drawingCanvas', {
            backgroundColor: '#e2e8f0',
            selection: true,
            preserveObjectStacking: true,
            fireRightClick: true,
            stopContextMenu: true
        });

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Keyboard
        document.addEventListener('keydown', (e) => this.handleKey(e, true));
        document.addEventListener('keyup', (e) => this.handleKey(e, false));

        this.setupCanvasEvents();
        this.setupUIEvents();

        // Inicializa Pavimento Térreo
        this.addFloor('Térreo');

        // Remove Loading com fade
        setTimeout(() => {
            const ls = document.getElementById('loadingScreen');
            if(ls) ls.style.display = 'none';
        }, 600);
    }

    handleKey(e, isDown) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const isInputContext = ['input', 'textarea', 'select'].includes(tag);

        if (!isInputContext && isDown) {
            const key = e.key.toLowerCase();
            if (key === 'v') this.setTool('select');
            if (key === 'r') this.setTool('rectangle');
            if (key === 'p') this.setTool('polygon');
        }

        if (e.key === 'Shift') {
            this.state.isShiftPressed = isDown;
            document.getElementById('orthoStatus').innerHTML = isDown ? 
                '<i class="fas fa-ruler-combined"></i> Orto: ON' : 
                '<i class="fas fa-ruler-combined"></i> Orto (Shift): OFF';
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
        if (isDown && e.key === 'Escape') this.setTool('select');
    }

    resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        if (!container) return;
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = container.clientHeight;

        this.canvas.setDimensions({ width: w, height: h }, { backstoreOnly: false });
        // Ajuste para retina: fabric trata internamente em muitas versões, mas garantir ajuste de objetos
        this.rescaleObjects();
    }

    // --- SNAPPING ---
    getSnapPoint(pointer) {
        let closest = null;
        let minDist = this.snapDistance;

        let candidates = [];
        if (this.state.lote.obj) candidates.push(this.state.lote.obj);
        this.state.buildings.forEach(b => { if (b.obj && b.obj.visible) candidates.push(b.obj); });

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
        try {
            obj.setCoords();
        } catch (e) {}
        if (obj.type === 'polygon' && obj.points) {
            const matrix = obj.calcTransformMatrix();
            return obj.points.map(p => {
                const point = new fabric.Point(p.x, p.y);
                return fabric.util.transformPoint(point, matrix);
            });
        }
        if (obj.aCoords) {
            return [ obj.aCoords.tl, obj.aCoords.tr, obj.aCoords.br, obj.aCoords.bl ];
        }
        // fallback
        return [{x: obj.left, y: obj.top}];
    }

    // --- ORTHO (15deg) ---
    applyOrtho(start, current) {
        if (!this.state.isShiftPressed || !start) return current;
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return current;

        const angle = Math.atan2(dy, dx);
        const step = Math.PI / 12; 
        const snapped = Math.round(angle / step) * step;

        return {
            x: start.x + dist * Math.cos(snapped),
            y: start.y + dist * Math.sin(snapped)
        };
    }

    // --- CANVAS EVENTS ---
    setupCanvasEvents() {
        // ZOOM WHEEL
        this.canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = this.canvas.getZoom() || 1;
            zoom *= 0.999 ** delta;
            zoom = Math.min(Math.max(zoom, 0.2), 20);
            this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            document.getElementById('headerZoom').innerText = Math.round(zoom * 100) + '%';
            opt.e.preventDefault(); opt.e.stopPropagation();
            // Rescale after a small delay to avoid perf issues
            clearTimeout(this._zoomTimeout);
            this._zoomTimeout = setTimeout(()=> this.rescaleObjects(), 80);
        });

        // MOUSE DOWN
        this.canvas.on('mouse:down', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            const activeTool = this.state.tool;

            // Pan
            if (activeTool === 'pan' || o.e.altKey) {
                this.isDragging = true;
                this.lastPosX = o.e.clientX;
                this.lastPosY = o.e.clientY;
                return;
            }

            if (['rectangle', 'polygon', 'draw-lote'].includes(activeTool)) {
                let startPoint = this.getSnapPoint(pointer) || pointer;
                if (activeTool === 'rectangle') {
                    this.startRectangle(startPoint);
                } else if (activeTool === 'polygon' || activeTool === 'draw-lote') {
                    this.addPolygonPoint(startPoint, activeTool === 'draw-lote');
                }
            }
        });

        // MOUSE MOVE
        this.canvas.on('mouse:move', (o) => {
            const pointer = this.canvas.getPointer(o.e);
            const realX = (pointer.x / this.pxPerMeter).toFixed(2);
            const realY = (pointer.y / this.pxPerMeter).toFixed(2);
            const mc = document.getElementById('mouseCoords');
            if(mc) mc.innerText = `X: ${realX} m, Y: ${realY} m`;

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
                if (this.activeShapeStart) {
                    target = this.applyOrtho(this.activeShapeStart, target);
                }

                if (this.state.tool === 'rectangle' && this.activeShape) {
                    this.updateRectanglePreview(target);
                } else if ((this.state.tool === 'polygon' || this.state.tool === 'draw-lote') && this.activeLine) {
                    this.activeLine.set({ x2: target.x, y2: target.y });
                    this.canvas.requestRenderAll();
                }
            }
        });

        // MOUSE UP
        this.canvas.on('mouse:up', () => {
            this.isDragging = false;
            if (this.state.tool === 'rectangle' && this.isDrawing) {
                this.finishRectangle();
            }
        });

        // DOUBLE CLICK (finish polygon)
        this.canvas.on('mouse:dblclick', () => {
            if ((this.state.tool === 'polygon' || this.state.tool === 'draw-lote') && this.activePoints && this.activePoints.length >= 3) {
                this.finishPolygon(this.state.tool === 'draw-lote');
            }
        });

        // OBJECT MODIFIED
        this.canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (!obj) return;
            if (obj.isBuilding) this.updateBuildingData(obj);
            if (obj.isLote) this.updateLoteData();
            this.rescaleObjects();
        });

        this.canvas.on('object:moving', (e) => {
            const obj = e.target;
            if (!obj) return;
            if (obj.isBuilding || obj.isLote) this.updateDimensions(obj);
        });

        // OBJECT REMOVED -> sincroniza estado e cotas
        this.canvas.on('object:removed', (e) => {
            const obj = e.target;
            if(!obj) return;
            if (obj.isBuilding) {
                const idx = this.state.buildings.findIndex(b => b.id === obj.id);
                if (idx > -1) this.state.buildings.splice(idx, 1);
                if (obj.dimensions) obj.dimensions.forEach(d => this.canvas.remove(d));
                this.renderBuildingsList();
                this.updateUrbanIndices();
            }
            if (obj.isLote) {
                this.state.lote.obj = null;
                this.state.lote.exists = false;
                document.getElementById('loteInfoBox').style.display = 'none';
                document.getElementById('btnDrawLote').innerHTML = '<i class="fas fa-draw-polygon"></i> Desenhar Perímetro do Lote';
            }
        });
    }

    // --- SHAPES ---
    startRectangle(start) {
        this.isDrawing = true;
        this.activeShapeStart = start;
        const zoom = this.canvas.getZoom() || 1;
        this.activeShape = new fabric.Rect({
            left: start.x, top: start.y,
            width: 0, height: 0,
            fill: 'rgba(59, 130, 246, 0.45)',
            stroke: '#2563eb', strokeWidth: 2 / zoom,
            transparentCorners: false,
            selectable: false
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
        if (this.activeShape.width > 5 || this.activeShape.height > 5) {
            this.registerBuilding(this.activeShape, 'rect');
        } else {
            this.canvas.remove(this.activeShape);
        }
        this.activeShape = null; this.activeShapeStart = null;
    }

    addPolygonPoint(point, isLote) {
        if (!this.activePoints) {
            this.activePoints = [];
            this.activeLines = [];
            this.isDrawing = true;
        }
        this.activeShapeStart = point;

        const zoom = this.canvas.getZoom() || 1;
        const circle = new fabric.Circle({
            radius: 4 / zoom,
            fill: isLote ? '#f59e0b' : '#fff',
            stroke: '#333',
            left: point.x, top: point.y,
            originX: 'center', originY: 'center',
            selectable: false,
            evented: false
        });
        this.canvas.add(circle);
        this.activePoints.push({ x: point.x, y: point.y, circle: circle });

        // Linha elástica
        const line = new fabric.Line([point.x, point.y, point.x, point.y], {
            strokeWidth: 2 / zoom,
            stroke: isLote ? '#f59e0b' : '#999',
            selectable: false,
            evented: false
        });
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
            fill: isLote ? 'rgba(245, 158, 11, 0.17)' : 'rgba(59, 130, 246, 0.45)',
            stroke: isLote ? '#f59e0b' : '#2563eb',
            strokeWidth: 2 / (this.canvas.getZoom() || 1),
            objectCaching: false
        });

        this.canvas.add(polygon);

        if (isLote) this.registerLote(polygon);
        else this.registerBuilding(polygon, 'polygon');

        this.activePoints = null; this.activeLines = null; this.activeLine = null; this.isDrawing = false;

        if (isLote) this.setTool('select');
    }

    // --- DIMENSIONS / COTAS ---
    updateDimensions(obj) {
        if (!obj) return;
        if (obj.dimensions) {
            obj.dimensions.forEach(d => { try { this.canvas.remove(d); } catch(e){} });
        }
        obj.dimensions = [];

        const vertices = this.getObjectVertices(obj);
        if (!vertices || vertices.length < 2) return;
        const center = obj.getCenterPoint ? obj.getCenterPoint() : { x: obj.left, y: obj.top };

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];
            const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const distM = (distPx / this.pxPerMeter).toFixed(2);

            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let nx = -dy, ny = dx;
            const len = Math.hypot(nx, ny) || 1;
            nx /= len; ny /= len;

            const testPoint = { x: mid.x + nx * 10, y: mid.y + ny * 10 };
            const dCenter = Math.hypot(mid.x - center.x, mid.y - center.y);
            const dTest = Math.hypot(testPoint.x - center.x, testPoint.y - center.y);
            if (dTest < dCenter) { nx = -nx; ny = -ny; }

            const textPos = { x: mid.x + nx * 18, y: mid.y + ny * 18 };
            const txt = new fabric.Text(`${distM}m`, {
                left: textPos.x, top: textPos.y,
                fontSize: 12 / (this.canvas.getZoom() || 1),
                fontFamily: 'Arial', fill: '#fff',
                backgroundColor: 'rgba(0,0,0,0.6)',
                originX: 'center', originY: 'center',
                selectable: false, evented: false
            });

            this.canvas.add(txt);
            obj.dimensions.push(txt);
        }
    }

    // --- LOTE & ZONING ---
    registerLote(polygon) {
        if (this.state.lote.obj) {
            try {
                if (this.state.lote.obj.dimensions) this.state.lote.obj.dimensions.forEach(d => this.canvas.remove(d));
                this.canvas.remove(this.state.lote.obj);
            } catch(e){}
        }

        polygon.set({ isLote: true, selectable: false, evented: false, hoverCursor: 'default' });
        this.canvas.sendToBack(polygon);

        this.state.lote.exists = true;
        this.state.lote.obj = polygon;

        this.updateDimensions(polygon);
        this.updateLoteData();

        const box = document.getElementById('loteInfoBox');
        if (box) box.style.display = 'block';
        const hint = document.querySelector('.hint-text');
        if (hint) hint.style.display = 'none';
        const btn = document.getElementById('btnDrawLote');
        if (btn) btn.innerHTML = '<i class="fas fa-edit"></i> Redefinir Lote';
    }

    updateLoteData() {
        if (!this.state.lote.obj) return;
        const areaM2 = this.calculateArea(this.state.lote.obj, 'polygon'); // já em m²
        this.state.lote.area = areaM2 || 0;
        const areaEl = document.getElementById('loteAreaDisplay');
        if (areaEl) areaEl.innerText = this.state.lote.area.toFixed(2) + ' m²';
        this.updateUrbanIndices();
    }

    // --- BUILDINGS ---
    registerBuilding(obj, type) {
        obj.set({
            isBuilding: true,
            floorId: this.state.currentFloorId,
            cornerColor: 'white',
            borderColor: '#3b82f6',
            transparentCorners: false,
            selectable: true
        });

        const id = Date.now() + Math.floor(Math.random()*1000);
        obj.id = id;

        this.updateDimensions(obj);

        const building = {
            id, type, obj,
            floorId: this.state.currentFloorId,
            area: this.calculateArea(obj, type)
        };

        this.state.buildings.push(building);
        this.renderBuildingsList();
        this.updateUrbanIndices();
    }

    updateBuildingData(obj) {
        const b = this.state.buildings.find(item => item.id === obj.id);
        if (b) {
            b.area = this.calculateArea(obj, b.type);
            this.renderBuildingsList();
            this.updateUrbanIndices();
        }
    }

    // Área: rect usa w*h, polygon usa shoelace (transformado)
    calculateArea(obj, type) {
        if (!obj) return 0;
        if (type === 'rect') {
            const w = obj.width * obj.scaleX;
            const h = obj.height * obj.scaleY;
            const pixelArea = Math.abs(w * h);
            return pixelArea / (this.pxPerMeter * this.pxPerMeter);
        } else {
            // Se for polygon tente cálculo exato
            if (obj.type === 'polygon' && obj.points) {
                return this.calculatePolygonArea(obj);
            } else {
                // fallback bounding box
                const w = (obj.width || 0) * (obj.scaleX || 1);
                const h = (obj.height || 0) * (obj.scaleY || 1);
                return Math.abs((w * h * 0.75) / (this.pxPerMeter * this.pxPerMeter));
            }
        }
    }

    calculatePolygonArea(polygon) {
        // transforma pontos locais pela matrix e aplica shoelace
        const pts = polygon.points || [];
        const matrix = polygon.calcTransformMatrix();
        const world = pts.map(p => {
            const pt = new fabric.Point(p.x, p.y);
            return fabric.util.transformPoint(pt, matrix);
        });

        if (world.length < 3) return 0;
        let sum = 0;
        for (let i = 0; i < world.length; i++) {
            const x1 = world[i].x, y1 = world[i].y;
            const x2 = world[(i+1) % world.length].x, y2 = world[(i+1) % world.length].y;
            sum += (x1 * y2 - x2 * y1);
        }
        const pixelArea = Math.abs(sum / 2);
        return pixelArea / (this.pxPerMeter * this.pxPerMeter);
    }

    // --- INDICES URBANOS ---
    updateUrbanIndices() {
        const loteArea = this.state.lote.area || 1;

        let areaOcupada = 0;
        this.state.buildings.forEach(b => {
             if (b.floorId === 0) areaOcupada += b.area;
        });

        let areaTotalConstruida = 0;
        this.state.buildings.forEach(b => areaTotalConstruida += b.area);

        const TO = areaOcupada / loteArea;
        const CA = areaTotalConstruida / loteArea;
        const params = this.state.lote.params;

        const toPct = (TO * 100).toFixed(1);
        document.getElementById('valCurrentTO').innerText = toPct + '%';
        document.getElementById('areaOcupadaDisplay').innerText = areaOcupada.toFixed(1) + ' m² ocupados';
        document.getElementById('limitTO').innerText = Math.round(params.maxTO * 100);

        const barTO = document.getElementById('barTO');
        barTO.style.width = Math.min((TO / params.maxTO) * 100, 100) + '%';

        const statusTO = document.getElementById('statusTO');
        if (TO > params.maxTO) {
            barTO.style.background = 'linear-gradient(90deg, var(--error), #f87171)';
            statusTO.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
            statusTO.className = 'status-text status-warn';
        } else {
            barTO.style.background = 'linear-gradient(90deg, var(--success), #34d399)';
            statusTO.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
            statusTO.className = 'status-text status-ok';
        }

        document.getElementById('valCurrentCA').innerText = CA.toFixed(2);
        document.getElementById('areaTotalConstruidaDisplay').innerText = areaTotalConstruida.toFixed(1) + ' m² constr.';
        document.getElementById('limitCA').innerText = params.maxCA;

        const barCA = document.getElementById('barCA');
        barCA.style.width = Math.min((CA / params.maxCA) * 100, 100) + '%';

        const statusCA = document.getElementById('statusCA');
        if (CA > params.maxCA) {
            barCA.style.background = 'linear-gradient(90deg, var(--error), #f87171)';
            statusCA.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Excede o limite';
            statusCA.className = 'status-text status-warn';
        } else {
            barCA.style.background = 'linear-gradient(90deg, var(--success), #34d399)';
            statusCA.innerHTML = '<i class="fas fa-check"></i> Dentro do limite';
            statusCA.className = 'status-text status-ok';
        }
    }

    // --- UI HELPERS ---
    setTool(tool) {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`button[data-tool="${tool}"]`);
        if(btn) btn.classList.add('active');

        this.state.tool = tool;
        const kh = document.getElementById('toolHint');
        if(kh) kh.innerText = `Ferramenta: ${tool.toUpperCase()}`;

        if (tool === 'select') {
            this.canvas.selection = true;
            this.canvas.defaultCursor = 'default';
            this.canvas.forEachObject(o => {
                if (o.isBuilding && o.floorId === this.state.currentFloorId) o.selectable = true;
                else o.selectable = false;
            });
        } else {
            this.canvas.selection = false;
            this.canvas.defaultCursor = 'crosshair';
            this.canvas.discardActiveObject();
            this.canvas.forEachObject(o => o.selectable = false);
        }
        this.canvas.requestRenderAll();
    }

    setupUIEvents() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });

        document.getElementById('btnDrawLote').addEventListener('click', (e) => {
            const wasLote = !!this.state.lote.obj;
            this.setTool('draw-lote');
            if (wasLote && this.state.lote.obj) {
                try {
                    if (this.state.lote.obj.dimensions) this.state.lote.obj.dimensions.forEach(d => this.canvas.remove(d));
                    this.canvas.remove(this.state.lote.obj);
                } catch(err){}
                this.state.lote.obj = null;
                this.state.lote.exists = false;
                document.getElementById('loteInfoBox').style.display = 'none';
            }
        });

        document.getElementById('loteZoning').addEventListener('change', (e) => {
            this.state.lote.params.zone = e.target.value;
            if(e.target.value === 'ZR-3') { this.state.lote.params.maxTO = 0.5; this.state.lote.params.maxCA = 1.0; }
            if(e.target.value === 'ZR-4') { this.state.lote.params.maxTO = 0.6; this.state.lote.params.maxCA = 2.0; }
            if(e.target.value === 'ECO-1') { this.state.lote.params.maxTO = 0.8; this.state.lote.params.maxCA = 4.0; }
            this.updateUrbanIndices();
        });

        document.getElementById('btnAddFloor').addEventListener('click', () => {
            this.addFloor(`Pavimento ${this.state.floors.length}`);
        });

        const btnExport = document.getElementById('btnExportJSON');
        if (btnExport) btnExport.addEventListener('click', () => this.exportJSON());

        const btnToggleNav = document.getElementById('btnToggleNav');
        if (btnToggleNav) {
            btnToggleNav.addEventListener('click', () => {
                const rightActive = document.body.classList.contains('mobile-panel-right');
                this.setMobilePanel(rightActive ? 'left' : 'right');
            });
        }

        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMobilePanel(btn.dataset.panelTarget));
        });
    }

    setMobilePanel(target) {
        const showRight = target === 'right';
        document.body.classList.toggle('mobile-panel-right', showRight);
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panelTarget === (showRight ? 'right' : 'left'));
        });
    }

    addFloor(name) {
        const id = this.state.floors.length;
        this.state.floors.push({ id, name });
        if (id === 0) this.state.currentFloorId = 0;
        this.renderFloorsList();
    }

    renderFloorsList() {
        const list = document.getElementById('floorsList');
        if (!list) return;
        list.innerHTML = '';
        // ordem display: último em cima
        [...this.state.floors].slice().reverse().forEach(f => {
            const div = document.createElement('div');
            div.className = `floor-item ${f.id === this.state.currentFloorId ? 'active' : ''}`;
            div.innerText = f.name;
            div.addEventListener('click', () => this.selectFloor(f.id));
            list.appendChild(div);
        });
    }

    selectFloor(id) {
        if (!this.state.floors[id]) {
            // fallback: buscar por id
            const found = this.state.floors.find(f => f.id === id);
            if (found) this.state.currentFloorId = found.id;
        } else this.state.currentFloorId = id;

        const header = document.getElementById('headerFloorName');
        if (header && this.state.floors[this.state.currentFloorId]) header.innerText = this.state.floors[this.state.currentFloorId].name;
        this.renderFloorsList();

        // Visibilidade
        this.state.buildings.forEach(b => {
            if (b.floorId === this.state.currentFloorId) {
                b.obj.visible = true; b.obj.opacity = 1; b.obj.selectable = true;
            } else {
                b.obj.visible = true; b.obj.opacity = 0.22; b.obj.selectable = false;
            }
        });
        this.setTool(this.state.tool);
        this.renderBuildingsList();
        this.canvas.requestRenderAll();
    }

    renderBuildingsList() {
        const list = document.getElementById('buildingsList');
        if (!list) return;
        const visible = this.state.buildings.filter(b => b.floorId === this.state.currentFloorId);
        list.innerHTML = '';
        if (visible.length === 0) {
            list.innerHTML = '<div class="empty-state">Vazio</div>';
            return;
        }
        visible.forEach(b => {
            const item = document.createElement('div');
            item.className = 'floor-item';
            item.innerHTML = `<span>${b.type}</span> <small>${b.area.toFixed(1)} m²</small>`;
            list.appendChild(item);
        });
    }

    deleteSelected() {
        const active = this.canvas.getActiveObject();
        if (active && active.isBuilding) {
            try {
                if (active.dimensions) active.dimensions.forEach(d => this.canvas.remove(d));
                this.canvas.remove(active);
            } catch(e){}
            const idx = this.state.buildings.findIndex(b => b.id === active.id);
            if (idx > -1) this.state.buildings.splice(idx, 1);
            this.renderBuildingsList();
            this.updateUrbanIndices();
        }
    }

    // Ajusta strokeWidth e fontSize após zoom para manter legibilidade
    rescaleObjects() {
        const zoom = this.canvas.getZoom() || 1;
        this.canvas.forEachObject(o => {
            if (o.strokeWidth !== undefined) {
                // padrão visual: 2px em zoom 1
                o.set('strokeWidth', (o._baseStrokeWidth || (2 / (o.origZoomFactor || 1))) / zoom);
            }
            if (o.type === 'text' || o.type === 'i-text') {
                o.set('fontSize', (o._baseFontSize || (12 * (o.origFontFactor || 1))) / zoom);
            }
            // atualizar dimensões associadas
            if (o.isBuilding || o.isLote) {
                if (o.dimensions && o.dimensions.length) {
                    o.dimensions.forEach(t => {
                        if (t.type === 'text') t.set('fontSize', 12 / zoom);
                    });
                }
            }
            o.setCoords && o.setCoords();
        });
        this.canvas.requestRenderAll();
    }

    exportJSON() {
        const payload = {
            meta: { createdAt: new Date().toISOString(), pxPerMeter: this.pxPerMeter },
            lote: this.state.lote.exists ? { area: this.state.lote.area } : null,
            floors: this.state.floors,
            buildings: this.state.buildings.map(b => ({
                id: b.id, type: b.type, floorId: b.floorId, area: b.area
            }))
        };
        const data = JSON.stringify(payload, null, 2);
        const blob = new Blob([data], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'urbanmap_export.json'; document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
    }
}

// Init
window.onload = () => {
    window.urbanMap = new UrbanMapApp();
};
