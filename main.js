// Configurações iniciais e variáveis globais
let canvas = document.getElementById("drawing-canvas");
let ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let drawing = false;
let currentLine = [];
let lines = [];
let undoneLines = [];
let snapEnabled = true;
let orthoEnabled = true;
let snapThreshold = 10; // em pixels
let scale = 1 / 50; // 1 metro = 50 pixels (exemplo)

// Eventos do mouse
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);

// Eventos para desfazer/refazer
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "z") undoLine();
  if (e.ctrlKey && e.key === "y") redoLine();
});

// Função para iniciar o desenho de uma linha
function startDrawing(e) {
  drawing = true;
  currentLine = [];
  addPoint(e);
}

// Função para desenhar conforme o mouse move
function draw(e) {
  if (!drawing) return;
  let point = getMousePos(e);

  if (orthoEnabled) {
    let last = currentLine[currentLine.length - 1];
    if (last) {
      let dx = point.x - last.x;
      let dy = point.y - last.y;
      let angle = Math.atan2(dy, dx);
      let snapAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180].map(a => a * Math.PI / 180);
      let closestAngle = snapAngles.reduce((a, b) => Math.abs(angle - a) < Math.abs(angle - b) ? a : b);
      let length = Math.sqrt(dx * dx + dy * dy);
      point.x = last.x + length * Math.cos(closestAngle);
      point.y = last.y + length * Math.sin(closestAngle);
    }
  }

  redraw();
  drawTempLine(point);
}

// Finaliza o traçado
function stopDrawing(e) {
  drawing = false;
  addPoint(e);
  if (currentLine.length > 1) {
    lines.push(currentLine);
    undoneLines = [];
  }
  currentLine = [];
  redraw();
}

// Adiciona ponto com snap
function addPoint(e) {
  let pos = getMousePos(e);
  if (snapEnabled) {
    for (let line of lines) {
      for (let pt of line) {
        if (distance(pt, pos) < snapThreshold) {
          pos = pt;
        }
      }
    }
  }
  currentLine.push(pos);
}

// Redesenha todas as linhas
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "rgba(0,0,0,0.1)";

  for (let line of lines) {
    drawLine(line);
  }

  drawSnapBoxes();
}

// Desenha uma linha
function drawLine(line) {
  ctx.beginPath();
  ctx.moveTo(line[0].x, line[0].y);
  for (let i = 1; i < line.length; i++) {
    ctx.lineTo(line[i].x, line[i].y);
    drawDimension(line[i - 1], line[i]);
  }
  ctx.stroke();
}

// Desenha linha temporária
function drawTempLine(point) {
  let last = currentLine[currentLine.length - 1];
  if (!last) return;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawDimension(last, point);
}

// Pega posição do mouse
function getMousePos(evt) {
  let rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

// Distância entre dois pontos
function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Desenha as caixas de snap
function drawSnapBoxes() {
  ctx.fillStyle = "rgba(0, 0, 255, 0.2)";
  for (let line of lines) {
    for (let pt of line) {
      ctx.fillRect(pt.x - snapThreshold / 2, pt.y - snapThreshold / 2, snapThreshold, snapThreshold);
    }
  }
}

// Desenha a cota (medida)
function drawDimension(p1, p2) {
  let midX = (p1.x + p2.x) / 2;
  let midY = (p1.y + p2.y) / 2;
  let dist = distance(p1, p2) * scale;
  ctx.font = "12px Arial";
  ctx.fillStyle = "black";
  ctx.fillText(dist.toFixed(2) + "m", midX + 5, midY - 5);
}

// Desfazer/Refazer
function undoLine() {
  if (lines.length > 0) {
    undoneLines.push(lines.pop());
    redraw();
  }
}

function redoLine() {
  if (undoneLines.length > 0) {
    lines.push(undoneLines.pop());
    redraw();
  }
}
