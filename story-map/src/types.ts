export interface Vector {
    x: number;
    y: number;
}

export interface Passage {
    origin: string;
    filename: string;
    path: string;
    name: string;
    linksToNames: string[];
    tags: string[];
    position: Vector;
    size: Vector;
    originalPosition: Vector;
    originalSize: Vector;
    zIndex?: number;
}

export interface LinkedPassage extends Passage {
    linksTo: Passage[];
    linkedFrom: Passage[];
}

export interface PassageAndStyle {
    passage: Passage;
    style: { [key: string]: any; };
}

export interface RawPassage {
    origin: string;
    name: string;
    tags: string[];
    meta: string;
    linksToNames: string[];
}

export interface Line {
    fromPassage: Passage;
    toPassage: Passage;
    twoWay?: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    key: string;
}

export interface PassageLink {
    from: Passage;
    to: Passage;
    twoWay: boolean;
    key: string;
}
