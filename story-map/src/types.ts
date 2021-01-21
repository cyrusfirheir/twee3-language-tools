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
    dropShadow?: string;
    key: string;
}

export interface LinkedPassage extends Passage {
    linksTo: Passage[];
    linkedFrom: Passage[];
}

export interface PassageStyle {
    [key: string]: any;
}

export interface PassageAndStyle {
    passage: Passage;
    style: PassageStyle;
}

export interface PassageData {
    storyData: { [key: string]: any };
    list: RawPassage[];
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
