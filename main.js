const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let lines = [];
let currentLine = null;

canvas.addEventListener('mousedown', (e) => {
    const { x, y } = getMousePos(e);
    const snappedPoint = getSnappedPoint(x, y);

    if (!currentLine) {
        currentLine = {
            points: [snappedPoint],
            visible: true
        };
        lines.push(currentLine);
    } else {
        currentLine.points.push(snappedPoint);
    }

    draw();
});

canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getMousePos(e);
    const snapped = getSnappedPoint(x, y);

    canvas.style.cursor = snapped.snapped ? 'pointer' : 'crosshair';

    if (currentLine && currentLine.points.length > 0) {
        draw();
        const lastPoint = currentLine.points[currentLine.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(snapped.x, snapped.y);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'gray';
        ctx.stroke();
        ctx.setLineDash([]);
    }
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let line of lines) {
        if (line.points.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
            ctx.lineTo(line.points[i].x, line.points[i].y);
        }

        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();

        for (let point of line.points) {
            drawSnapBox(point.x, point.y);
        }

        drawDimensions(line.points);
    }
}

function drawDimensions(points) {
    ctx.font = '14px Arial';
    ctx.fillStyle = 'red';

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.fillText(`${distance.toFixed(2)}px`, midX + 5, midY - 5);
    }
}

function drawSnapBox(x, y) {
    const size = 8;
    ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function getSnappedPoint(x, y) {
    const snapDistance = 10;

    for (let line of lines) {
        for (let point of line.points) {
            const dx = x - point.x;
            const dy = y - point.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < snapDistance) {
                return { x: point.x, y: point.y, snapped: true };
            }
        }
    }

    return { x, y, snapped: false };
}
