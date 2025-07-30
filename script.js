const svg = document.getElementById('svg');
const width = svg.clientWidth, height = svg.clientHeight;
const scale = 10; // pixels por metro (ajuste conforme necessidade)
let points = [];

function drawGrid() {
  const cols = Math.ceil(width / scale);
  const rows = Math.ceil(height / scale);
  const grid = document.createElementNS(svg.namespaceURI, 'g');
  grid.setAttribute('class', 'grid');
  for (let i=0; i<=cols; i++) {
    const x = i * scale;
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', height);
    grid.appendChild(line);
  }
  for (let j=0; j<=rows; j++) {
    const y = j * scale;
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width);
    line.setAttribute('y2', y);
    grid.appendChild(line);
  }
  svg.appendChild(grid);
}

function drawPolygon() {
  svg.querySelectorAll('.poly, .cota').forEach(el => el.remove());
  if (points.length < 2) return;
  const poly = document.createElementNS(svg.namespaceURI, 'polygon');
  poly.setAttribute('points', points.map(p => p.x + ',' + p.y).join(' '));
  poly.setAttribute('class', 'poly');
  svg.appendChild(poly);

  // desenha cotas
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i+1) % points.length];
    const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy) / scale;
    const cota = document.createElementNS(svg.namespaceURI, 'text');
    cota.setAttribute('x', mx);
    cota.setAttribute('y', my);
    cota.setAttribute('class', 'cota');
    cota.textContent = dist.toFixed(2) + ' m';
    svg.appendChild(cota);
  }
}

svg.addEventListener('click', e => {
  const pt = { x: e.offsetX, y: e.offsetY };
  points.push(pt);
  drawPolygon();
});

svg.addEventListener('dblclick', () => {
  if (points.length >= 3) {
    // fechar polígono
    drawPolygon();
    points = []; // reiniciar
  }
});

// inicializa
drawGrid();
