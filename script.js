const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let lines = [];
let undone = [];
let currentLine = [];
let snapping = true;
let ortho = true;
let gridSize = 10; // em pixels, mas vamos simular metros
let snapRadius = 10;

document.getElementById("snapToggle").addEventListener("change", e => snapping = e.target.checked);
document.getElementById("orthoToggle").addEventListener("change", e => ortho = e.target.checked);

canvas.addEventListener("mousedown", startLine);
canvas.addEventListener("contextmenu", e => e.preventDefault());

function startLine(e) {
  const pos = getMousePos(e);
  const snapped = snapping ? getSnappedPoint(pos) : pos;
  const point = applyOrtho(snapped);

  if (e.button === 2) return; // botão direito: não faz nada por enquanto

  currentLine.push(point);
  if (currentLine.length === 2) {
    lines.push([...currentLine]);
    currentLine = [currentLine[1]]; // recomeça da última
    undone = [];
  }
  draw();
}

function undo() {
  if (lines.length) undone.push(lines.pop());
  draw();
}

function redo() {
  if (undone.length) lines.push(undone.pop());
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  lines.forEach(line => drawLine(line[0], line[1]));
  if (currentLine.length === 1) drawPreviewLine(currentLine[0], getMousePos());
}

function drawLine(p1, p2) {
  ctx.beginPath();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  drawDimension(p1, p2);
  drawSnapBox(p1);
  drawSnapBox(p2);
}

function drawPreviewLine(p1, mouse) {
  const pos = getMousePos(mouse);
  const snap = snapping ? getSnappedPoint(pos) : pos;
  const p2 = applyOrtho(snap);

  ctx.beginPath();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "gray";
  ctx.lineWidth = 1;
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDimension(p1, p2) {
  const mid = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };

  const dx = (p2.x - p1.x);
  const dy = (p2.y - p1.y);
  const meters = Math.sqrt(dx * dx + dy * dy) / 100;

  ctx.fillStyle = "black";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${meters.toFixed(2)} m`, mid.x + 5, mid.y - 5);
}

function drawSnapBox(p) {
  ctx.beginPath();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 1;
  ctx.rect(p.x - snapRadius, p.y - snapRadius, snapRadius * 2, snapRadius * 2);
  ctx.stroke();
}

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function getSnappedPoint(p) {
  for (let line of lines) {
    for (let pt of line) {
      const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (dist < snapRadius) return pt;
    }
  }
  return p;
}

function applyOrtho(p) {
  if (currentLine.length === 0 || !ortho) return p;
  const origin = currentLine[0];
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const angle = Math.atan2(dy, dx);
  const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180].map(a => a * Math.PI / 180);
  const snappedAngle = angles.reduce((a, b) => Math.abs(b - angle) < Math.abs(a - angle) ? b : a);
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: origin.x + length * Math.cos(snappedAngle),
    y: origin.y + length * Math.sin(snappedAngle)
  };
}

function drawGrid() {
  const spacing = 100; // 100px = 1m
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

canvas.addEventListener("mousemove", e => draw());
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
});
