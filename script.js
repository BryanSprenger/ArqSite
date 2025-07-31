// script.js
const canvas = document.getElementById('cadCanvas');
const ctx = canvas.getContext('2d');

let points = [];
let currentLine = [];
let snapEnabled = false;
let orthoEnabled = false;
let undoStack = [];
let redoStack = [];

let hoverPoint = null;
let isDragging = false;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenhar linhas existentes
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < points.length - 1; i++) {
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i + 1].x, points[i + 1].y);
    drawCotagem(points[i], points[i + 1]);
  }
  ctx.stroke();

  // Desenhar ponto de snap
  if (hoverPoint) {
    ctx.fillStyle = 'red';
    ctx.fillRect(hoverPoint.x - 5, hoverPoint.y - 5, 10, 10);
  }

  // Linha com mouse
  if (currentLine.length === 1 && !isDragging) {
    const { x, y } = currentLine[0];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.strokeStyle = '#999';
    ctx.stroke();
  }
}

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function snapToPoint(x, y) {
  return points.find(p => distance(p, { x, y }) < 10);
}

function drawCotagem(p1, p2) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dist = distance(p1, p2) / 10; // assume 10px = 1m

  ctx.fillStyle = 'black';
  ctx.font = '12px Arial';
  ctx.fillText(`${dist.toFixed(2)} m`, midX + 5, midY - 5);
}

let mouse = { x: 0, y: 0 };
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

  hoverPoint = snapToPoint(mouse.x, mouse.y);
  draw();
});

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const snapPoint = snapToPoint(x, y);
  const newPoint = snapPoint || { x, y };

  if (currentLine.length && snapPoint && distance(currentLine[0], snapPoint) < 10) {
    // Fechar polígono
    points.push(currentLine[0]);
    currentLine = [];
    saveState();
  } else {
    if (orthoEnabled && currentLine.length) {
      const last = currentLine[currentLine.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12); // 15°
      const length = Math.hypot(dx, dy);
      const nx = last.x + length * Math.cos(snappedAngle);
      const ny = last.y + length * Math.sin(snappedAngle);
      currentLine.push({ x: nx, y: ny });
      points.push({ x: nx, y: ny });
    } else {
      currentLine.push(newPoint);
      points.push(newPoint);
    }
    saveState();
  }
  draw();
});

function saveState() {
  undoStack.push([...points]);
  redoStack = [];
}

document.getElementById('undoBtn').onclick = () => {
  if (undoStack.length > 0) {
    redoStack.push(points);
    points = undoStack.pop();
    draw();
  }
};

document.getElementById('redoBtn').onclick = () => {
  if (redoStack.length > 0) {
    undoStack.push(points);
    points = redoStack.pop();
    draw();
  }
};

document.getElementById('toggleSnap').onclick = () => {
  snapEnabled = !snapEnabled;
};

document.getElementById('toggleOrtho').onclick = () => {
  orthoEnabled = !orthoEnabled;
};

draw();
