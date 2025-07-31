const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let drawing = false;
let currentPolygon = [];
let polygons = [];
let undoStack = [];
let redoStack = [];

const tooltip = document.getElementById("tooltip");
const snapThreshold = 10;
const orthoThreshold = 10;

function drawCircle(x, y, radius = 4, color = "#0077ff") {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLine(p1, p2, color = "#000") {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawText(text, x, y) {
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "black";
  ctx.fillText(text, x + 5, y - 5);
}

function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
}

function snapToVertex(point, vertices) {
  for (let vertex of vertices) {
    if (distance(point, vertex) < snapThreshold) {
      return vertex;
    }
  }
  return null;
}

function applyOrthoConstraint(point, lastPoint) {
  const dx = Math.abs(point.x - lastPoint.x);
  const dy = Math.abs(point.y - lastPoint.y);
  if (dx < orthoThreshold) return { x: lastPoint.x, y: point.y };
  if (dy < orthoThreshold) return { x: point.x, y: lastPoint.y };
  return point;
}

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      drawLine(p1, p2);
      drawCircle(p1.x, p1.y);
      drawDimension(p1, p2);
    }
  }
  for (let i = 0; i < currentPolygon.length - 1; i++) {
    drawLine(currentPolygon[i], currentPolygon[i + 1], "#0077ff");
    drawCircle(currentPolygon[i].x, currentPolygon[i].y);
    drawDimension(currentPolygon[i], currentPolygon[i + 1]);
  }
  if (currentPolygon.length > 0) {
    drawCircle(currentPolygon[currentPolygon.length - 1].x, currentPolygon[currentPolygon.length - 1].y);
  }
}

function drawDimension(p1, p2) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const meters = (distance(p1, p2) / 100).toFixed(2) + " m";
  drawText(meters, midX, midY);
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  let mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  if (currentPolygon.length > 0) {
    const lastPoint = currentPolygon[currentPolygon.length - 1];
    let adjusted = applyOrthoConstraint(mouse, lastPoint);
    let snapped = snapToVertex(adjusted, currentPolygon);
    if (snapped) adjusted = snapped;

    drawAll();
    drawLine(lastPoint, adjusted, "#aaa");
    drawDimension(lastPoint, adjusted);
    drawCircle(adjusted.x, adjusted.y, 5, "red");

    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = e.pageY + 10 + "px";
    tooltip.innerHTML = (distance(lastPoint, adjusted) / 100).toFixed(2) + " m";
    tooltip.style.visibility = "visible";
  } else {
    tooltip.style.visibility = "hidden";
  }
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  let clickPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  if (currentPolygon.length > 0) {
    const lastPoint = currentPolygon[currentPolygon.length - 1];
    let adjusted = applyOrthoConstraint(clickPoint, lastPoint);
    let snapped = snapToVertex(adjusted, currentPolygon);

    if (snapped && snapped === currentPolygon[0] && currentPolygon.length > 2) {
      currentPolygon.push(snapped);
      polygons.push([...currentPolygon]);
      undoStack.push({ type: "add", polygon: [...currentPolygon] });
      currentPolygon = [];
    } else {
      currentPolygon.push(adjusted);
    }
  } else {
    currentPolygon.push(clickPoint);
  }

  drawAll();
});

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "z") undo();
  if (e.ctrlKey && e.key === "y") redo();
});

function undo() {
  if (undoStack.length > 0) {
    const action = undoStack.pop();
    redoStack.push(action);
    if (action.type === "add") polygons.pop();
    drawAll();
  }
}

function redo() {
  if (redoStack.length > 0) {
    const action = redoStack.pop();
    if (action.type === "add") polygons.push(action.polygon);
    undoStack.push(action);
    drawAll();
  }
}

