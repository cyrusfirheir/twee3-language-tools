<template>
  <div
    class="layout"
    @mouseup="onMouseUp($event)"
    @mousemove="onMouseMove($event)"
    @mousedown="onMapMouseDown($event)"
    @wheel.prevent="onWheel($event)"
  >
    <ToolBar class="toolbar"></ToolBar>
    <div class="story-map" :style="{ transform: `${translateStr} scale(${zoom})` }">
      <svg :style="svgStyle">
        <line
          v-for="line of lines"
          :key="line.key"
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          @mouseenter="onHoverableMouseEnter(line)"
          @mouseleave="onHoverableMouseLeave(line)"
          :class="{ highlight: highlightElements.includes(line) }"
        />
      </svg>
      <div
        v-for="item in items"
        :key="item.passage.name"
        :style="item.style"
        :class="{ highlight: highlightElements.includes(item.passage) }"
        @mouseenter="onHoverableMouseEnter(item.passage)"
        @mouseleave="onHoverableMouseLeave(item.passage)"
        @mousedown.stop="onPassageMouseDown(item.passage, $event)"
        @dblclick="openPassage(item.passage)"
        class="passage"
      >
        {{ item.passage.name }}
      </div>
    </div>
    <!-- Move this to toolbar -->
    <div class="save-changes" v-if="unsavedChanges">
      <button type="button" @click="saveChanges()">Save changes</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { socket } from './socket';
import { PassageAndStyle, Vector, Passage, RawPassage, Line, LinkedPassage } from './types';
import { linkPassage, parseRaw } from './util/passage-tools';
import { cropLine } from './util/line-tools';

import ToolBar from './components/ToolBar.vue';

interface ComponentData {
    connected: boolean;
    passages: LinkedPassage[];
    draggedPassage: LinkedPassage | null;
    lastDragPosition: Vector | null;
    highestZIndex: number;
    translate: Vector;
    zoom: number;
    hoveredElement: Line | LinkedPassage | null;
}

export default defineComponent({
  name: 'App',
  components: { ToolBar },
  data: (): ComponentData => ({
    connected: false,
    passages: [],
    draggedPassage: null,
    lastDragPosition: null,
    highestZIndex: 0,
    translate: { x: 0, y: 0 },
    zoom: 1,
    hoveredElement: null,
  }),
  computed: {
    items(): PassageAndStyle[] {
      return this.passages.map((passage) => ({
        passage,
        style: {
          width: `${passage.size.x}px`,
          height: `${passage.size.y}px`,
          left: `${passage.position.x}px`,
          top: `${passage.position.y}px`,
          ['z-index']: passage.zIndex || 0,
        },
      }));
    },
    changedPassages(): LinkedPassage[] {
      return this.passages.filter((passage) => {
        if (passage.position.x !== passage.originalPosition.x) return true;
        if (passage.position.y !== passage.originalPosition.y) return true;
        if (passage.size.x !== passage.originalSize.x) return true;
        if (passage.size.y !== passage.originalSize.y) return true;
        return false;
      });
    },
    unsavedChanges(): boolean {
      return this.changedPassages.length > 0;
    },
    lines(): Line[] {
      const isDraggingPassage = this.draggedPassage !== null;
      const passages: LinkedPassage[] = this.passages;
      if (isDraggingPassage) return [];
      
      const lines: Line[] = [];
      for (const passage of passages) {
        for (const linkedPassage of passage.linksTo) {
          // Check if this exact line already exists, it shouldn't but... Check anyway
          if (lines.some((line) => line.fromPassage === passage && line.toPassage === linkedPassage)) continue;
          // Check if this line already exists in  the opposite direction
          let existingLine = lines.find((line) => line.fromPassage === linkedPassage && line.toPassage === passage);
          if (existingLine) {
            // A line between these passages already exists in the opposite direction
            // make that line bi-directional
            existingLine.twoWay = true;
            continue;
          }
          // No line between these passages exists, create it
          const line: Line = {
            x1: passage.position.x + (passage.size.x / 2),
            y1: passage.position.y + (passage.size.y / 2),
            x2: linkedPassage.position.x + (linkedPassage.size.x / 2),
            y2: linkedPassage.position.y + (linkedPassage.size.y / 2),
            key: `line-${passage.name}-${linkedPassage.name}`,
            fromPassage: passage,
            toPassage: linkedPassage,
          };
          // Okay so right now the line goes from center to center, lets move the endpoints of the arrows to the edges
          cropLine(line, passage, linkedPassage);
          lines.push(line);
        }
      }
      return lines;
    },
    highlightElements(): Array<Line | LinkedPassage> {
      const highlightElements: Array<Line | LinkedPassage> = [];
      if (this.hoveredElement) {
        highlightElements.push(this.hoveredElement);
        if ('name' in this.hoveredElement) {
          // Its a passage
          // add lines
          const highlightLines = this.lines.filter((line) => line.fromPassage === this.hoveredElement || line.toPassage === this.hoveredElement);
          highlightElements.push(...highlightLines);
          // add linked passages
          highlightElements.push(...this.hoveredElement.linksTo);
          highlightElements.push(...this.hoveredElement.linkedFrom);
        } else {
          // Its a line
          highlightElements.push(this.hoveredElement.fromPassage, this.hoveredElement.toPassage);
        }
      }
      return highlightElements;
    },
    svgStyle() {
      let maxX = 0;
      let maxY = 0;
      for (const passage of (this.passages as LinkedPassage[])) {
        const passageMaxX = passage.position.x + passage.size.x;
        const passageMaxY = passage.position.y + passage.size.y;
        maxX = Math.max(maxX, passageMaxX);
        maxY = Math.max(maxY, passageMaxY);
      }
      return `width: ${maxX * 1.1}px; height: ${maxY * 1.1}px;`;
    },
    translateStr() {
      return `translate(${Math.round(this.translate.x * 1000) / 1000}px, ${Math.round(this.translate.y * 1000) / 1000}px)`;
    },
  },
  methods: {
    onPassageMouseDown(passage: LinkedPassage, event: MouseEvent) {
      this.highestZIndex++;
      passage.zIndex = this.highestZIndex;
      this.draggedPassage = passage;
      this.lastDragPosition = { x: event.clientX, y: event.clientY };
      console.log(this.highestZIndex);
    },
    onMapMouseDown(event: MouseEvent) {
      this.lastDragPosition = { x: event.clientX, y: event.clientY };
    },
    onMouseMove(event: MouseEvent) {
      if (!this.lastDragPosition) return;

      if (this.draggedPassage) {
        const delta: Vector = { x: this.lastDragPosition.x - event.clientX, y: this.lastDragPosition.y - event.clientY };
        this.draggedPassage.position.x = Math.max(0, this.draggedPassage.position.x - (delta.x / this.zoom));
        this.draggedPassage.position.y = Math.max(0, this.draggedPassage.position.y - (delta.y / this.zoom));
      } else {
        // Drag map
        const delta: Vector = { x: this.lastDragPosition.x - event.clientX, y: this.lastDragPosition.y - event.clientY };
        this.translate.x -= delta.x;
        this.translate.y -= delta.y;
      }
      this.lastDragPosition = { x: event.clientX, y: event.clientY };
    },
    onMouseUp(event: MouseEvent) {
      this.lastDragPosition = null;
      this.draggedPassage = null;
    },
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
    },
    onHoverableMouseEnter(element: Line | LinkedPassage) {
      this.hoveredElement = element;
    },
    onHoverableMouseLeave(element: Line | LinkedPassage) {
      if (this.hoveredElement === element || this.hoveredElement.key === element['key']) {
        this.hoveredElement = null;
      }
    },
    openPassage(passage: LinkedPassage) {
      socket.emit('open-passage', { name: passage.name, origin: passage.origin });
      console.log('passage was doubleclicked', passage);
    },
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
    },
  },
  created() {
    socket.on('connect', () => {
      console.log('connected');
    });
    socket.on('passages', (passages: RawPassage[]) => {
      console.log('Client received passages', { passages });
      this.passages = passages
        // convert RawPassage to Passage
        .map((passageRaw) => parseRaw(passageRaw))
        .map((passage, index, allPassages) => linkPassage(passage, allPassages));
    });
    socket.on('disconnect', () => {
      console.log('socket disconnected');
    });
  },
});
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
  background-color: #111;
}

*, *::before, *::after {
  box-sizing: border-box;
  user-select: none;
}
</style>

<style lang="scss" scoped>
.layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
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
  background-color: rgba(255, 255, 255, .1);
}

line {
  stroke:rgb(200,200,200);
  stroke-width:2;

  &.highlight {
    stroke:rgb(100,255,100);
    z-index: 1;
  }
}

.save-changes {
  position: absolute;
  top: 10px;
  right: 10px;

  button {
    padding: 5px 10px;
    font-size: 24px;
    background-color: #234;
    color: #FFF;
    cursor: pointer;
    border-radius: 4px;
    border: 0;

    &:hover {
      background-color: #468;
    }
  }
}

.passage {
  position: absolute;
  overflow: hidden;
  border: solid #333 1px;
  background-color: #000;
  color: #FFF;
  padding: 5px;
  font-size: 12px;

  &.highlight {
    background-color: #5A5;
  }

  &:hover {
    background-color: #363;
  }
}
</style>
