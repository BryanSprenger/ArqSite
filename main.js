const canvas = document.getElementById('cadCanvas');
const ctx = canvas.getContext('2d');

let drawing = false;
let points = [];
let polygons = [];
let history = [];
let redoStack = [];
const snapTolerance = 10;
const gridUnit = 1; // 1px = 1m

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenhar polígonos anteriores
  polygons.forEach(polygon => {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    polygon.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,150,150,0.3)';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    drawCotations(polygon);
  });

  // Desenhar linhas atuais
  if (points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Caixa de snap
    points.forEach(p => {
      ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
      ctx.fillRect(p.x - snapTolerance, p.y - snapTolerance, snapTolerance * 2, snapTolerance * 2);
    });
  }
}

// Snap visual
function snapToVertex(x, y) {
  for (let p of points) {
    if (Math.abs(p.x - x) < snapTolerance && Math.abs(p.y - y) < snapTolerance) {
      return p;
    }
  }
  return null;
}

// Cotas
function drawCotations(pts) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.fillText((length / gridUnit).toFixed(2) + 'm', mx + 5, my - 5);
  }
}

// Início e término do desenho
function startDrawing() {
  drawing = true;
  points = [];
  draw();
}

function finishDrawing() {
  if (points.length > 2) {
    polygons.push([...points]);
    saveState();
  }
  drawing = false;
  points = [];
  draw();
}

// Undo/Redo
function saveState() {
  history.push(polygons.map(p => [...p]));
  redoStack = [];
}

function undo() {
  if (history.length > 0) {
    redoStack.push(polygons);
    polygons = history.pop();
    draw();
  }
}

function redo() {
  if (redoStack.length > 0) {
    history.push(polygons);
    polygons = redoStack.pop();
    draw();
  }
}

// Mouse
canvas.addEventListener('mousedown', (e) => {
  if (!drawing) return;

  let x = e.offsetX;
  let y = e.offsetY;

  const snapEnabled = document.getElementById('snapToggle').checked;
  const orthoEnabled = document.getElementById('orthoToggle').checked;

  // Snap
  if (snapEnabled) {
    const snapped = snapToVertex(x, y);
    if (snapped) {
      x = snapped.x;
      y = snapped.y;

      // Fechamento do polígono
      if (snapped === points[0]) {
        finishDrawing();
        return;
      }
    }
  }

  // Ortogonalidade com ângulos múltiplos de 15°
  if (orthoEnabled && points.length > 0) {
    const last = points[points.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12); // 15°
    const r = Math.sqrt(dx * dx + dy * dy);
    x = last.x + r * Math.cos(snappedAngle);
    y = last.y + r * Math.sin(snappedAngle);
  }

  points.push({ x, y });
  draw();
});


