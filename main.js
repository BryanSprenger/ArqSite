const canvas = document.getElementById('cadCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let points = [];
let lines = [];
let redoStack = [];

let isDrawing = false;
let draggingPoint = null;
let camera = { x: 0, y: 0, zoom: 1 };

// Tamanho do snap em pixels
const SNAP_SIZE = 10;

// Converter coordenadas da tela para coordenadas do mundo (metros)
function screenToWorld(x, y) {
  return {
    x: (x - canvas.width / 2) / camera.zoom + camera.x,
    y: (y - canvas.height / 2) / camera.zoom + camera.y,
  };
}

// Converter coordenadas do mundo para a tela
function worldToScreen(x, y) {
  return {
    x: (x - camera.x) * camera.zoom + canvas.width / 2,
    y: (y - camera.y) * camera.zoom + canvas.height / 2,
  };
}

// Iniciar linha
function startDrawing() {
  isDrawing = true;
}

// Encerrar desenho atual
function finishDrawing() {
  isDrawing = false;
  points = [];
}

// Desfazer última ação
function undo() {
  if (lines.length > 0) {
    redoStack.push(lines.pop());
    draw();
  }
}

// Refazer última ação desfeita
function redo() {
  if (redoStack.length > 0) {
    lines.push(redoStack.pop());
    draw();
  }
}

// Obter ponto mais próximo para snap
function getSnapPoint(mx, my) {
  for (let line of lines) {
    for (let pt of [line[0], line[1]]) {
      const sp = worldToScreen(pt.x, pt.y);
      if (Math.abs(mx - sp.x) < SNAP_SIZE && Math.abs(my - sp.y) < SNAP_SIZE) {
        return pt;
      }
    }
  }
  return null;
}

// Aplicar ortogonalidade e ângulos intermediários
function applyOrtho(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx);
  const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180].map(a => a * Math.PI / 180);

  let closest = angles[0];
  let minDiff = Math.abs(angle - closest);
  for (let ang of angles) {
    const diff = Math.abs(angle - ang);
    if (diff < minDiff) {
      closest = ang;
      minDiff = diff;
    }
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    x: p1.x + len * Math.cos(closest),
    y: p1.y + len * Math.sin(closest),
  };
}

// Desenhar tudo
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenhar linhas
  for (let line of lines) {
    const p0 = worldToScreen(line[0].x, line[0].y);
    const p1 = worldToScreen(line[1].x, line[1].y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // Cotas
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    const distance = Math.hypot(line[0].x - line[1].x, line[0].y - line[1].y);
    ctx.fillStyle = "#000";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${distance.toFixed(2)} m`, midX + 5, midY - 5);
  }

  // Pontos de snap
  for (let line of lines) {
    for (let pt of [line[0], line[1]]) {
      const s = worldToScreen(pt.x, pt.y);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(s.x - SNAP_SIZE / 2, s.y - SNAP_SIZE / 2, SNAP_SIZE, SNAP_SIZE);
    }
  }
}

// Eventos
canvas.addEventListener("mousedown", (e) => {
  const world = screenToWorld(e.clientX, e.clientY);

  if (e.button === 1) {
    // Pan com botão do meio
    canvas.style.cursor = "grabbing";
    draggingPoint = { x: e.clientX, y: e.clientY };
    return;
  }

  const snapping = document.getElementById("snapToggle").checked;
  const ortho = document.getElementById("orthoToggle").checked;
  const snapPoint = snapping ? getSnapPoint(e.clientX, e.clientY) : null;
  const point = snapPoint ? snapPoint : world;

  if (isDrawing) {
    if (points.length > 0) {
      let p1 = points[points.length - 1];
      let p2 = point;
      if (ortho) {
        p2 = applyOrtho(p1, point);
      }
      lines.push([p1, p2]);
    }
    points.push(point);
  }

  draw();
});

canvas.addEventListener("mousemove", (e) => {
  if (draggingPoint) {
    const dx = (draggingPoint.x - e.clientX) / camera.zoom;
    const dy = (draggingPoint.y - e.clientY) / camera.zoom;
    camera.x += dx;
    camera.y += dy;
    draggingPoint = { x: e.clientX, y: e.clientY };
    draw();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 1) {
    canvas.style.cursor = "default";
    draggingPoint = null;
  }
});

canvas.addEventListener("wheel", (e) => {
  const zoomAmount = 1.05;
  if (e.deltaY < 0) {
    camera.zoom *= zoomAmount;
  } else {
    camera.zoom /= zoomAmount;
  }
  draw();
});

