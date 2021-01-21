<template>
  <div
    class="layout"
    @mouseup="onMouseUp($event)"
    @mousemove="onMouseMove($event)"
    @mousedown="onMapMouseDown($event)"
    @wheel.prevent="onWheel($event)"
  >
    <ToolBar
      class="toolbar"
      :unsavedChanges="unsavedChanges"
      @saveChanges="saveChanges()"
      @toggle="toggleSetting($event)"
    />
    <div class="story-map" :style="{ transform: `${translateStr} scale(${zoom})` }">
      <svg :style="svgStyle">
        <template v-if="!draggedPassage">
          <!-- I would prefer if I could keep drawing lines while dragging -->
          <!-- But that just slows things down to a crawl, probably need canvas to fix -->
          <PassageLinkLine
            v-for="linkedPassage in linkedPassages"
            :key="`link-line${linkedPassage.key}`"
            :from="linkedPassage.from"
            :to="linkedPassage.to"
            :twoWay="linkedPassage.twoWay"
            :highlight="highlightElements.includes(linkedPassage)"
            @lineMouseenter="onHoverableMouseEnter(linkedPassage)"
            @lineMouseleave="onHoverableMouseLeave(linkedPassage)"
          />
        </template>
      </svg>
      <div
        v-for="item in items"
        :key="`passage-${item.passage.name}`"
        :style="item.style"
        :class="{ highlight: highlightElements.includes(item.passage) }"
        @mouseenter="onHoverableMouseEnter(item.passage)"
        @mouseleave="onHoverableMouseLeave(item.passage)"
        @mousedown.stop="onPassageMouseDown(item.passage, $event)"
        @dblclick="openPassage(item.passage)"
        class="passage"
      >
        {{ item.passage.name }}
        <div class="passage-tags">
          <template v-for="tag in item.passage.tags">
            <div
              v-if="tag in tagColors"
              :key="`tag-${item.passage.name}-${tag}`"
              class="passage-tag"
              :style="{ backgroundColor: tagColors[tag] }"></div>
          </template>
        </div>
      </div>
      <div v-if="shadowPassage" :style="shadowPassage.style" class="passage shadow-passage"></div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';

import { socket } from './socket';
import { PassageAndStyle, Vector, Passage, LinkedPassage, PassageLink, PassageStyle, PassageData } from './types';
import { linkPassage, parseRaw } from './util/passage-tools';

import ToolBar from './components/ToolBar.vue';
import PassageLinkLine from './components/PassageLinkLine.vue';

@Component({
  components: { ToolBar, PassageLinkLine },
})
export default class AppComponent extends Vue {
  connected = false;
  theme = 'cydark';
  passages = [];
  tagColors = {};
  draggedPassage = null;
  initialDragItemPosition = null;
  initialDragPosition = null;
  highestZIndex = 0;
  translate: Vector = { x: 0, y: 0 };
  zoom = 1;
  hoveredElement = null;
  linkedPassages = [];
  highlightElements = [];
  shadowPassage = null;
  settings = {
    showGrid: true,
    showDots: true,
    snapToGrid: false,
    gridSize: 25,
  };

  get items(): PassageAndStyle[] {
    return this.passages.map((passage) => ({
      passage,
      style: this.getPassageStyle(passage),
    }));
  }

  get changedPassages(): LinkedPassage[] {
    return this.passages.filter((passage) => {
      if (passage.position.x !== passage.originalPosition.x) return true;
      if (passage.position.y !== passage.originalPosition.y) return true;
      if (passage.size.x !== passage.originalSize.x) return true;
      if (passage.size.y !== passage.originalSize.y) return true;
      return false;
    });
  }
  get unsavedChanges(): boolean {
    return this.changedPassages.length > 0;
  }

  get svgStyle() {
    let maxX = 0;
    let maxY = 0;
    let theme = this.theme; // I need to read it so that this will be re-evaluated
    for (const passage of (this.passages as LinkedPassage[])) {
      const passageMaxX = passage.position.x + passage.size.x;
      const passageMaxY = passage.position.y + passage.size.y;
      maxX = Math.max(maxX, passageMaxX);
      maxY = Math.max(maxY, passageMaxY);
    }

    const style: { [key: string]: any } = {
      width: `${maxX * 1.1}px`,
      height: `${maxY * 1.1}px`,
    };
    const gridLine = getComputedStyle(document.body).getPropertyValue('--grid-lines').replace(/#/g, '%23').trim();
    const gridSize = this.settings.gridSize;
    const gridDotRadius = 1.5;

    const bgArr: string[] = [];

    if (this.settings.showGrid) {
      const svgLines = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${gridSize}" height="${gridSize}">
          <line x1="${gridSize/2}" y1="0" x2="${gridSize/2}" y2="${gridSize}" stroke-width="${gridDotRadius/3}" stroke="${gridLine}"></line>
          <line x1="0" y1="${gridSize/2}" x2="${gridSize}" y2="${gridSize/2}" stroke-width="${gridDotRadius/3}" stroke="${gridLine}"></line>
        </svg>
        `.replace(/\r?\n/g, " ");
      const svgLinesBig = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${gridSize*4}" height="${gridSize*4}">
          <line x1="${gridSize/2}" y1="0" x2="${gridSize/2}" y2="${gridSize*4}" stroke-width="${gridDotRadius/2}" stroke="${gridLine}"></line>
          <line x1="0" y1="${gridSize/2}" x2="${gridSize*4}" y2="${gridSize/2}" stroke-width="${gridDotRadius/2}" stroke="${gridLine}"></line>
        </svg>
        `.replace(/\r?\n/g, " ");
  
      bgArr.push(svgLines, svgLinesBig);
    }
  
    if (this.settings.showDots) {
      const svgDots = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${gridSize}" height="${gridSize}">
          <circle cx="${gridSize/2}" cy="${gridSize/2}" r="${gridDotRadius/1.5}" fill="${gridLine}" />
        </svg>`.replace(/\r?\n/g, " ");
    
      const svgDotsBig = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${gridSize*4}" height="${gridSize*4}">
          <circle cx="${gridSize/2}" cy="${gridSize/2}" r="${gridDotRadius*2}" fill="${gridLine}" />
        </svg>`.replace(/\r?\n/g, " ");
    
      bgArr.push(svgDots, svgDotsBig);
    }

    style.backgroundImage = bgArr.map(s => `url('data:image/svg+xml;utf8,${s}')`).join(",");
    style.backgroundPosition = `${-gridSize/2} ${-gridSize/2}`;

    return style;
  }

  translateStr() {
    return `translate(${Math.round(this.translate.x * 1000) / 1000}px, ${Math.round(this.translate.y * 1000) / 1000}px)`;
  }

  created() {
    // socket.disconnect();
    // socket.connect();
    socket.on('connect', () => {
      console.log('connected');
    });
    socket.on('passage-data', (passageData: PassageData) => {
      const passages = passageData.list;
      console.log('Client received passages', { passages, storyData: passageData.storyData });
      this.passages = passages
        // convert RawPassage to Passage
        .map((passageRaw) => parseRaw(passageRaw))
        .map((passage, index, allPassages) => linkPassage(passage, allPassages));
      
      this.tagColors = passageData?.storyData?.['tag-colors'] || {};
    });
    socket.on('disconnect', () => {
      console.log('socket disconnected');
    });
  }

  @Watch('hoveredElement', { deep: false })
  updateHighlights (hoveredElement: PassageLink | LinkedPassage | null) {
    const highlightElements: Array<Passage | PassageLink> = [];
    if (hoveredElement) {
      highlightElements.push(this.hoveredElement);
      if ('name' in hoveredElement) {
        // Its a passage
        // add passage links
        const linkedPassages: PassageLink[] = this.linkedPassages;
        const highlightLinks = linkedPassages.filter((linkedPassage) => linkedPassage.from === hoveredElement || linkedPassage.to === hoveredElement);
        highlightElements.push(...highlightLinks);
        // add linked passages
        highlightElements.push(...this.hoveredElement.linksTo);
        highlightElements.push(...this.hoveredElement.linkedFrom);
      } else if ('from' in hoveredElement) {
        // Its a passage link
        highlightElements.push(hoveredElement.from, hoveredElement.to);
      }
    }
    this.highlightElements = highlightElements;
  }

  @Watch('passages', { deep: false })
  updatePassageLinks(passages: LinkedPassage[]) {
    const linkedPassages: PassageLink[] = [];
    for (const passage of passages) {
      for (const linkedPassage of passage.linksTo) {
        // Check if this exact line already exists, it shouldn't but... Check anyway
        if (linkedPassages.some((line) => line.from === passage && line.to === linkedPassage)) continue;
        // Check if this line already exists in  the opposite direction
        let existingLink = linkedPassages.find((line) => line.from === linkedPassage && line.to === passage);
        if (existingLink) {
          // A line between these passages already exists in the opposite direction
          // make that line bi-directional
          existingLink.twoWay = true;
          continue;
        }
        // No link between these passages exists, create it
        linkedPassages.push({
          from: passage,
          to: linkedPassage,
          twoWay: false,
          key: `link-${passage.name}-${linkedPassage.name}`,
        });
      }
    }
    this.linkedPassages = linkedPassages;
  }

  @Watch('theme', { immediate: true })
  updateThemeAttribute(theme) {
    document.body.setAttribute('data-theme', theme);
  }

  getPassageStyle(passage: LinkedPassage): PassageStyle {
    return {
      width: `${passage.size.x}px`,
      height: `${passage.size.y}px`,
      left: `${passage.position.x}px`,
      top: `${passage.position.y}px`,
      ['z-index']: passage.zIndex || 0,
    };
  }

  toggleSetting({ id, value }: { id: string; value: any }) {
    if (id === 'snap-to-grid') {
      this.settings.snapToGrid = value;
    }
  }
  
  getSnappedPassagePosition(position: Vector): Vector {
    const gridSize: number = this.settings.gridSize;
    const halfGrid = gridSize / 2;
    const offset: Vector = { x: position.x % gridSize, y: position.y % gridSize };
    const target: Vector = {
      x: position.x - offset.x + (offset.x < halfGrid ? 0 : gridSize),
      y: position.y - offset.y + (offset.y < halfGrid ? 0 : gridSize),
    }
    return target;
  }

  onPassageMouseDown(passage: LinkedPassage, event: MouseEvent) {
    this.highestZIndex++;
    passage.zIndex = this.highestZIndex;
    this.draggedPassage = passage;

    this.initialDragItemPosition = { ... passage.position };
    this.initialDragPosition = { x: event.clientX, y: event.clientY };
  }

  onMapMouseDown(event: MouseEvent) {
    this.initialDragItemPosition = { ...this.translate };
    this.initialDragPosition = { x: event.clientX, y: event.clientY };
  }

  onMouseMove(event: MouseEvent) {
    if (!this.initialDragPosition || !this.initialDragItemPosition) return;

    if (this.draggedPassage) {
      const delta: Vector = { x: this.initialDragPosition.x - event.clientX, y: this.initialDragPosition.y - event.clientY };
      this.draggedPassage.position.x = Math.max(0, Math.round(this.initialDragItemPosition.x - (delta.x / this.zoom)));
      this.draggedPassage.position.y = Math.max(0, Math.round(this.initialDragItemPosition.y - (delta.y / this.zoom)));
      if (this.settings.snapToGrid) {
        const gridSnappedPassageClone = {
          ...this.draggedPassage,
          position: this.getSnappedPassagePosition(this.draggedPassage.position),
        };
        this.shadowPassage = {
          passage: gridSnappedPassageClone,
          style: this.getPassageStyle(gridSnappedPassageClone),
        };
      }
    } else {
      // Drag map
      const delta: Vector = { x: this.initialDragPosition.x - event.clientX, y: this.initialDragPosition.y - event.clientY };
      this.translate.x = Math.round(this.initialDragItemPosition.x - delta.x);
      this.translate.y = Math.round(this.initialDragItemPosition.y - delta.y);
    }
  }

  onMouseUp(event: MouseEvent) {
    if (this.draggedPassage) {
      this.draggedPassage.dropShadow = undefined;
      if (this.settings.snapToGrid) {
        this.draggedPassage.position = this.getSnappedPassagePosition(this.draggedPassage.position);
        this.shadowPassage = null;
      }
    }
    this.initialDragPosition = null;
    this.initialDragItemPosition = null;
    this.draggedPassage = null;
  }

  onWheel(event: WheelEvent) {
    const zoomAmount = (event.deltaY > 0)
      ? (event.deltaY / 1000)                   // deltaY 100  ->  .1
      : 1 - (1 / (1 + (event.deltaY / 1000)));  // deltaY -100 -> -.11111

    const zoomMod = 1 - zoomAmount;

    const leftOfClientX = event.clientX - this.translate.x;
    const leftOfClientXTarget = leftOfClientX * zoomMod;
    this.translate.x += (leftOfClientX - leftOfClientXTarget);
    const topOfClientY = event.clientY - this.translate.y;
    const topOfClientYTarget = topOfClientY * zoomMod;
    this.translate.y += (topOfClientY - topOfClientYTarget);
    this.zoom *= zoomMod;
  }

  onHoverableMouseEnter(element: PassageLink | LinkedPassage) {
    this.hoveredElement = element;
  }

  onHoverableMouseLeave(element: PassageLink | LinkedPassage) {
    if (this.hoveredElement === element || this.hoveredElement.key === element['key']) {
      this.hoveredElement = null;
    }
  }

  openPassage(passage: LinkedPassage) {
    socket.emit('open-passage', { name: passage.name, origin: passage.origin });
    console.log('passage was doubleclicked', passage);
  }

  saveChanges() {
    socket.emit('update-passages', this.changedPassages.map((passage) => ({
      name: passage.name,
      origin: passage.origin,
      position: passage.position,
      size: passage.size,
      tags: passage.tags,
    })));
    // This should probably be done differently
    this.changedPassages.forEach((passage) => {
      passage.originalPosition = { ...passage.position };
      passage.originalSize = { ...passage.size };
    });
  }
}
</script>

<style lang="scss">
html, body {
  font-family: Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

*, *::before, *::after {
  box-sizing: border-box;
  user-select: none;
}

:root {
  // Normal light theme
  --text-color-light: #FFF;
  --text-color-dark: #000;
  --primary-100: hsl(55deg 60% 100%); // passage hover
  --primary-200: hsl(55deg 15% 95%); // passage
  --primary-300: hsl(55deg 15% 90%); // passage highlight
  --primary-400: hsl(55deg 60% 96%); // map background
  --primary-500: hsl(53deg 20% 75%); // layout background (around map)
  --primary-600: hsl(55deg 50% 70%); // arrow-highlight inner
  --primary-700: hsl(55deg 30% 50%); // arrow inner
  --primary-800: hsl(55deg 50% 30%); // arrow-highlight outer

  --gray-100: #FFF; // outline for toolbar button when .active
  --gray-500: #CCC; // passage outline 
  --gray-600: #999; // passage-border (hover & highlight)

  --accent-800: #082030; // toolbar button background
  --accent-500: #245; // toolbar button hover
  --accent-400: #356; // toolbar background

  --highlight: #F00; // the drop location for a passage when dragging with snap to grid enabled

  --shadow-rgb: 0, 0, 0;
  --grid-lines: rgba(0, 0, 0, .25);
}

[data-theme="dark"] {
  --text-color-light: #FFF;
  --text-color-dark: #DDD;
  --primary-100: #000; /* passage hover */
  --primary-200: #151515; /* passage */
  --primary-300: #202029; /* passage highlight  */
  --primary-400: #070919; /* map background */
  --primary-500: #2b2b2b; /* layout background (around map) */
  --primary-600: #8C93D9; /* arrow-highlight inner */
  --primary-700: #5960A6; /* arrow inner */
  --primary-800: #262D73; /* arrow-highlight outer */

  --gray-100: #FFF; /* outline for toolbar button when .active */
  --gray-500: #444; /* passage outline  */
  --gray-600: #777; /* passage-border (hover & highlight) */

  --accent-800: #082030;  /* toolbar button background */
  --accent-500: #245; /* toolbar button hover */
  --accent-400: #356; /* toolbar background */

  --highlight: #F00; /* the drop location for a passage when dragging with snap to grid enabled */

  --shadow-rgb: 0, 0, 0;
  --grid-lines: #444466;
}

[data-theme="cydark"] {
  --text-color-light: #d9e5e9;
  --text-color-dark: #d9e5e9;
  --primary-100: #465c68; /* passage hover */
  --primary-200: #354852; /* passage */
  --primary-300: #7591a1; /* passage highlight  */
  --primary-400: #222d33; /* map background */
  --primary-500: #172024; /* layout background (around map) */
  --primary-600: #ffd5da; /* arrow-highlight inner */
  --primary-700: #ff0060; /* arrow inner */
  --primary-800: #33000a; /* arrow-highlight outer */

  --gray-100: #8ecafa; /* outline for toolbar button when .active */
  --gray-500: #647682; /* passage outline  */
  --gray-600: #8ea3b4; /* passage-border (hover & highlight) */

  --accent-800: #172024;  /* toolbar button background */
  --accent-500: #222d33; /* toolbar button hover */
  --accent-400: #4c606b; /* toolbar background */

  --highlight: #ffd5da; /* the drop location for a passage when dragging with snap to grid enabled */

  --shadow-rgb: 23, 32, 36;
  --grid-lines: #5c778a;
}
</style>

<style lang="scss" scoped>
.layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background-color: var(--primary-500);
}

.toolbar {
  z-index: 100;
}

.story-map {
  position: relative;
  flex: 1;
  transform-origin: top left;
}

svg {
  min-width: 100%;
  min-height: 100%;
  border-radius: 8px;
  background-color: var(--primary-400);
  box-shadow: 0 10px 20px rgba(var(--shadow-rgb),0.19), 0 6px 6px rgba(var(--shadow-rgb),0.23);
}

.passage {
  position: absolute;
  overflow: hidden;
  background-color: var(--primary-200);
  border: solid var(--gray-500) 1px;
  border-radius: 3px;
  color: var(--text-color-dark);
  padding: 5px;
  font-size: 12px;
  overflow-wrap: anywhere;
  cursor: grab;
  transition: background-color .15s ease-in-out, border-color .15s ease-in-out;
  box-shadow: 0 1px 3px rgba(var(--shadow-rgb),0.12), 0 1px 2px rgba(var(--shadow-rgb),0.24);

  &.highlight {
    background-color: var(--primary-300);
    border-color: var(--gray-600);
    border-width: 2px;
    padding: 4px;
  }

  &:hover {
    background-color: var(--primary-100);
    border-color: var(--gray-600);
    border-width: 2px;
    padding: 4px;
  }

  &.shadow-passage {
    background: 0;
    outline: solid var(--highlight) 1px;
    pointer-events: none;
  }
}

.passage-tags {
  display: flex;
  margin: 2px 0;
  gap: 3px;
}

.passage-tag {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: solid #000 1px;
}
</style>
