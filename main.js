const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let currentLine = [];
const lines = [];

canvas.addEventListener("mousedown", (e) => {
  const mouse = getMousePos(e);
  
  // Se clicou perto do primeiro ponto, fecha o polígono
  if (currentLine.length > 2 && isNear(mouse, currentLine[0])) {
    lines.push([...currentLine, currentLine[0]]); // Fecha com o primeiro ponto
    currentLine = [];
    drawing = false;
  } else {
    currentLine.push(mouse);
    drawing = true;
  }

  redraw();
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  redraw();
  const mouse = getMousePos(e);
  const last = currentLine[currentLine.length - 1];
  drawLine(last, mouse, "#888");

  // Cotagem provisória
  const dist = distance(last, mouse).toFixed(2);
  ctx.fillStyle = "black";
  ctx.font = "12px Arial";
  ctx.fillText(`${dist} m`, (last.x + mouse.x) / 2 + 5, (last.y + mouse.y) / 2 - 5);
});

function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function drawLine(p1, p2, color = "black") {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCircle(p, r = 5, color = "red") {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function isNear(p1, p2, threshold = 10) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) < threshold;
}

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) / 10; // escala de 1:10 para simular metros
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Linhas desenhadas
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      drawLine(line[i], line[i + 1]);
    }
  }

  // Linha atual
  for (let i = 0; i < currentLine.length - 1; i++) {
    drawLine(currentLine[i], currentLine[i + 1]);
  }

  // Pontos
  for (const p of currentLine) drawCircle(p);
}
