export interface Vector {
    x: number;
    y: number;
}

export interface PassageOrigin {
    root: string;
    path: string;
    full: string;
}

export interface PassageStringRange {
    start: number;
    endHeader: number;
    end: number;
}

export interface PassageRange {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
}

export interface Passage {
    origin: PassageOrigin;
    range: PassageRange;
    stringRange: PassageStringRange;
    filename: string;
    path: string;
    name: string;
    linksToNames: string[];
    tags: string[];
    position: Vector;
    size: Vector;
    drawPosition: Vector | null;
    originalPosition: Vector;
    originalSize: Vector;
    originalTags: string[];
    zIndex?: number;
    dropShadow?: Vector;
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
    origin: PassageOrigin;
    range: PassageRange;
    stringRange: PassageStringRange;
    name: string;
    tags: string[];
    meta: any;
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

export interface TweeWorkspaceFile {
    name: string;
    parent: TweeWorkspaceFolder;
}

export interface TweeWorkspaceFolderContent {
    folders: TweeWorkspaceFolder[];
    files: TweeWorkspaceFile[];
}

export interface TweeWorkspaceFolder {
    name: string;
    parent: TweeWorkspaceFolder | null;
    absolutePath: string;
    relativePath: string;
    content: TweeWorkspaceFolderContent;
}