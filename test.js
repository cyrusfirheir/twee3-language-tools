const cropLine = (ln, p1, p2) => {
    // These should be the numbers I need
    const xDelta = ln.x2 - ln.x1;
    const yDelta = ln.y2 - ln.y1;
    const lnFactor = Math.abs(xDelta / (yDelta || 0.000001));
    const p1Factor = p1.size.x / p1.size.y;
    const p2Factor = p2.size.x / p2.size.y;

    let edgeP1 = 'unknown';
    // This means ln exits p1 out of top or bottom edge
    if (lnFactor < p1Factor) {
        if (yDelta > 0) {
            edgeP1 = 'bottom';
            const removeY = p1.size.y / 2;
            ln.y1 += removeY;
            ln.x1 += (removeY  / yDelta) * xDelta;
        } else {
            edgeP1 = 'top';
            const removeY = p1.size.y / 2;
            ln.y1 -= removeY;
            ln.x1 -= (removeY  / yDelta) * xDelta;
        }
    } else {
        // Else left of right edge
        if (xDelta > 0) {
            edgeP1 = 'right';
            const removeX = p1.size.x / 2;
            ln.x1 += removeX;
            ln.y1 += (removeX  / xDelta) * yDelta;
        } else {
            edgeP1 = 'left';
            const removeX = p1.size.x / 2;
            ln.x1 -= removeX;
            ln.y1 -= (removeX  / xDelta) * yDelta;
        }
    }

    let edgeP2 = 'unknown';
    // This means ln exits p1 out of top or bottom edge
    if (lnFactor < p2Factor) {
        if (yDelta < 0) {
            edgeP2 = 'bottom';
            const removeY = p2.size.y / 2;
            ln.y2 += removeY;
            ln.x2 += (removeY  / yDelta) * xDelta;
        } else {
            edgeP2 = 'top';
            const removeY = p2.size.y / 2;
            ln.y2 -= removeY;
            ln.x2 -= (removeY  / yDelta) * xDelta;
        }
    } else {
        // Else left of right edge
        if (xDelta < 0) {
            edgeP2 = 'right';
            const removeX = p2.size.x / 2;
            ln.x2 += removeX;
            ln.y2 += (removeX  / xDelta) * yDelta;
        } else {
            edgeP2 = 'left';
            const removeX = p2.size.x / 2;
            ln.x2 -= removeX;
            ln.y2 -= (removeX  / xDelta) * yDelta;
        }
    }

    console.log({ ln, edgeP1, edgeP2 });
};

cropLine(
    // Line
    { x1: 000, y1: 000, x2: 250, y2: 500 },
    // Passage 1
    { size: { x: 100, y: 100 } },
    // Passage 2
    { size: { x: 100, y: 100 } },
)
