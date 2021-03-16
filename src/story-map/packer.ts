import { Passage } from "../passage";

export function packer(passages: Passage[]) {
	interface origin {
		size: {
			w: number;
			h: number;
		};
		passages: Passage[];
	}
	const origins: Map<string, origin> = new Map();

	passages.forEach(passage => {
		passage.meta = passage.meta || {};
		passage.meta.position = {
			x: 0, y: 0
		};
		if (origins.has(passage.origin.full)) {
			const origin = origins.get(passage.origin.full) as origin;
			origin.passages.push(passage);
			const count = origin.passages.length;
			const size = Math.ceil(Math.sqrt(count));

			const rect = count <= size * (size - 1);

			passage.meta.position.x = rect ? size - 1 : (count + 1) % size;
			passage.meta.position.y = !rect ? size - 1 : count - (size - 1) ** 2 - 1;

			origin.size.w = size;
			origin.size.h = rect ? size - 1 : size;
		} else {
			origins.set(passage.origin.full, {
				size: {
					w: 1, h: 1
				},
				passages: [passage]
			});
		}
	});

	const oArr = [...origins.values()].sort((a, b) => b.passages.length - a.passages.length)

	const size = Math.ceil(Math.sqrt(oArr.length));

	const xStops = [0];
	const yStops = [0];

	const passageSize = 100;
	const gridSize = 25;
	const clusterGap = 75;
	const paddedSize = passageSize + gridSize;

	oArr.forEach((origin, i) => {
		const x = i % size;
		const y = (i - x) / size;

		origin.passages.forEach((passage: Passage) => {
			const _x = passage.meta.position.x * paddedSize + xStops[x] + gridSize;
			const _y = passage.meta.position.y * paddedSize + yStops[y] + gridSize;

			passage.meta.position = `${_x},${_y}`;
		});

		if (!xStops[x + 1]) xStops[x + 1] = xStops[x] + origin.size.w * paddedSize + clusterGap;
		if (!yStops[y + 1]) yStops[y + 1] = yStops[y] + origin.size.h * paddedSize + clusterGap;
	});

	return passages;
};