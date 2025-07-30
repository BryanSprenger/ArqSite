const canvas = new fabric.Canvas('c', {
  selection: false,
  preserveObjectStacking: true
});

let drawingLine = null;
let isDrawing = false;
let points = [];
let snap = false;
let ortho = false;

// Mouse wheel zoom
canvas.on('mouse:wheel', function(opt) {
  let delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  zoom = Math.max(0.5, Math.min(5, zoom));
  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  opt.e.preventDefault();
  opt.e.stopPropagation();
});

// Pan com botão do meio
let isDragging = false;
let lastPosX, lastPosY;
canvas.on('mouse:down', function(opt) {
  if (opt.e.button === 1) { // botão do meio
    isDragging = true;
    lastPosX = opt.e.clientX;
    lastPosY = opt.e.clientY;
  }
});

canvas.on('mouse:move', function(opt) {
  if (isDragging) {
    const e = opt.e;
    const vpt = canvas.viewportTransform;
    vpt[4] += e.clientX - lastPosX;
    vpt[5] += e.clientY - lastPosY;
    canvas.requestRenderAll();
    lastPosX = e.clientX;
    lastPosY = e.clientY;
  }

  if (isDrawing && drawingLine) {
    const pointer = canvas.getPointer(opt.e);
    const last = drawingLine.points[0];
    const newPoints = [last.x, last.y, pointer.x, pointer.y];
    drawingLine.set({ x2: pointer.x, y2: pointer.y });
    canvas.requestRenderAll();
  }
});

canvas.on('mouse:up', function(opt) {
  if (opt.e.button === 1) {
    isDragging = false;
    return;
  }

  const pointer = canvas.getPointer(opt.e);

  if (!isDrawing) {
    isDrawing = true;
    const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: 'black',
      strokeWidth: 2,
      selectable: false,
    });
    drawingLine = line;
    canvas.add(line);
  } else {
    drawingLine.set({ x2: pointer.x, y2: pointer.y });
    drawingLine.set({ selectable: true });
    canvas.setActiveObject(drawingLine);

    drawingLine = null;
    isDrawing = false;
  }
});

// Snap e orto (botão)
document.getElementById("toggle-snap").onclick = () => {
  snap = !snap;
  document.getElementById("toggle-snap").innerText = `Snap: ${snap ? 'ON' : 'OFF'}`;
};

document.getElementById("toggle-ortho").onclick = () => {
  ortho = !ortho;
  document.getElementById("toggle-ortho").innerText = `Ortogonal: ${ortho ? 'ON' : 'OFF'}`;
};

