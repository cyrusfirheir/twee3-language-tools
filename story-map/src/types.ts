export interface Vector {
    x: number;
    y: number;
}

export interface Passage {
    origin: {
        full: string;
        path: string;
        root: string;
    };
    range: {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
    };
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
    origin: {
        full: string;
        path: string;
        root: string;
    };
    range: {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
    };
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