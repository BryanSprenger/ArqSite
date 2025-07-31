const canvas = new fabric.Canvas('drawingCanvas', {
  selection: false,
  backgroundColor: '#fdfdfd'
});

canvas.setHeight(window.innerHeight);
canvas.setWidth(window.innerWidth);

let points = [];
let lines = [];
let currentLine = null;
let snapEnabled = true;
let orthoEnabled = true;
let undoStack = [];
let redoStack = [];

function drawLine(start, end) {
  const line = new fabric.Line([start.x, start.y, end.x, end.y], {
    stroke: 'black',
    strokeWidth: 2,
    selectable: false,
    evented: false
  });
  canvas.add(line);
  lines.push(line);
}

function drawCota(start, end) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const label = new fabric.Text((distance / 100).toFixed(2) + ' m', {
    left: midX + 10,
    top: midY - 10,
    fontSize: 14,
    fill: '#333',
    selectable: false
  });
  canvas.add(label);
}

function createSnapBox(point) {
  const size = 10;
  const snapBox = new fabric.Rect({
    left: point.x - size / 2,
    top: point.y - size / 2,
    width: size,
    height: size,
    fill: 'rgba(0,0,255,0.2)',
    selectable: false,
    evented: false,
    visible: false
  });
  canvas.add(snapBox);
  return snapBox;
}

let snapBoxes = [];

function updateSnapBoxes() {
  snapBoxes.forEach(box => canvas.remove(box));
  snapBoxes = [];
  points.forEach(pt => {
    const box = createSnapBox(pt);
    snapBoxes.push(box);
  });
}

function findSnapPoint(pointer) {
  for (let pt of points) {
    const dx = pt.x - pointer.x;
    const dy = pt.y - pointer.y;
    if (Math.sqrt(dx * dx + dy * dy) < 10) {
      return pt;
    }
  }
  return null;
}

canvas.on('mouse:move', function (opt) {
  const pointer = canvas.getPointer(opt.e);
  if (currentLine) {
    let end = { x: pointer.x, y: pointer.y };

    if (snapEnabled) {
      const snap = findSnapPoint(pointer);
      if (snap) {
        end = snap;
      }
    }

    if (orthoEnabled && points.length > 0) {
      const start = points[points.length - 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const angle = Math.atan2(dy, dx);
      const degrees = (angle * 180) / Math.PI;
      const snappedAngle = Math.round(degrees / 15) * 15;
      const rad = (snappedAngle * Math.PI) / 180;
      const distance = Math.sqrt(dx * dx + dy * dy);
      end.x = start.x + Math.cos(rad) * distance;
      end.y = start.y + Math.sin(rad) * distance;
    }

    currentLine.set({ x2: end.x, y2: end.y });
    canvas.renderAll();
  }
});

canvas.on('mouse:down', function (opt) {
  const pointer = canvas.getPointer(opt.e);
  let snap = snapEnabled ? findSnapPoint(pointer) : null;
  let point = snap || { x: pointer.x, y: pointer.y };

  if (points.length > 0 && point === points[0]) {
    if (currentLine) {
      canvas.remove(currentLine);
      currentLine = null;
    }
    drawLine(points[points.length - 1], point);
    drawCota(points[points.length - 1], point);
    points.push(point);
    updateSnapBoxes();
    points = [];
    return;
  }

  if (points.length > 0) {
    drawLine(points[points.length - 1], point);
    drawCota(points[points.length - 1], point);
  }

  points.push(point);
  updateSnapBoxes();

  currentLine = new fabric.Line([point.x, point.y, point.x, point.y], {
    stroke: 'black',
    strokeWidth: 2,
    selectable: false,
    evented: false
  });
  canvas.add(currentLine);
});

// Botões
document.getElementById('undoBtn').onclick = () => {
  const last = lines.pop();
  if (last) {
    canvas.remove(last);
    undoStack.push(last);
  }
};

document.getElementById('redoBtn').onclick = () => {
  const last = undoStack.pop();
  if (last) {
    canvas.add(last);
    lines.push(last);
  }
};

document.getElementById('toggleSnapBtn').onclick = function () {
  snapEnabled = !snapEnabled;
  this.textContent = `Snap: ${snapEnabled ? 'Ativado' : 'Desativado'}`;
};

document.getElementById('toggleOrthoBtn').onclick = function () {
  orthoEnabled = !orthoEnabled;
  this.textContent = `Orto: ${orthoEnabled ? 'Ativado' : 'Desativado'}`;
};
