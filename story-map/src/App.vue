<template>
  <div class="story-map" @mousemove="onMousemove($event)" @mouseup="onMouseup($event)">
    <div
      v-for="item in items"
      :key="item.passage.name"
      :style="item.style"
      @mousedown.stop="onPassageMousedown(item.passage, $event)"
      @dblclick="openPassage(item.passage)"
      class="passage"
    >
      {{ item.passage.name }}
    </div>
    <div class="save-changes" v-if="unsavedChanges">
      <button type="button" @click="saveChanges()">Save changes</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { socket } from './socket';

interface Vector {
  x: number;
  y: number;
}

interface Passage {
  origin: string;
  filename: string;
  path: string;
  name: string;
  tags: string[];
  position: Vector;
  size: Vector;
  originalPosition: Vector;
  originalSize: Vector;
  zIndex?: number;
}

interface PassageAndStyle {
  passage: Passage;
  style: { [key: string]: any; };
}

interface RawPassage {
  origin: string;
  name: string;
  tags: string[];
  meta: string;
}

interface ComponentData {
  connected: boolean;
  passages: Passage[];
  draggedPassage: Passage | null;
  lastDragPosition: Vector | null;
  highestZIndex: number;
}

const parseRaw = (passageIn: RawPassage): Passage => {
  const lastIndex = passageIn.origin.lastIndexOf('/');
  const meta = JSON.parse(passageIn.meta || '{}');
  const positionArr = (meta.position || '0,0').split(',').map((str: string) => parseFloat(str));
  const sizeArr = (meta.size || '100,100').split(',').map((str: string) => parseFloat(str));
  const position: Vector = {
    x: Math.round(Math.max(0, positionArr[0])),
    y: Math.round(Math.max(0, positionArr[1])),
  };
  const size: Vector = { x: sizeArr[0], y: sizeArr[1] };
  return {
    origin: passageIn.origin,
    filename: passageIn.origin.substring(lastIndex + 1),
    path: passageIn.origin.substring(0, lastIndex),
    name: passageIn.name,
    tags: passageIn.tags,
    position: position,
    size: size,
    originalPosition: { ...position },
    originalSize: { ...size },
  };
};

export default defineComponent({
  name: 'App',
  data: (): ComponentData => ({
    connected: false,
    passages: [],
    draggedPassage: null,
    lastDragPosition: null,
    highestZIndex: 0,
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
    changedPassages(): Passage[] {
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
    }
  },
  methods: {
    openPassage(passage: Passage) {
      socket.emit('open-passage', { name: passage.name, origin: passage.origin });
      console.log('passage was doubleclicked', passage);
    },
    onPassageMousedown(passage: Passage, event: MouseEvent) {
      this.highestZIndex++;
      passage.zIndex = this.highestZIndex;
      this.draggedPassage = passage;
      this.lastDragPosition = { x: event.clientX, y: event.clientY };
      console.log(this.highestZIndex);
    },
    onMousemove(event: MouseEvent) {
      if (this.draggedPassage && this.lastDragPosition) {
        this.draggedPassage.position.x += event.clientX - this.lastDragPosition.x;
        this.draggedPassage.position.y += event.clientY - this.lastDragPosition.y;
        this.lastDragPosition = { x: event.clientX, y: event.clientY };
      }
    },
    onMouseup(event: MouseEvent) {
      if (this.draggedPassage) {
        this.draggedPassage = null;
        this.lastDragPosition = null;
      }
    },
    saveChanges() {
      socket.emit('update-passages', this.changedPassages.map((passage) => ({
        name: passage.name,
        origin: passage.origin,
        position: passage.position,
		size: passage.size,
		tags: passage.tags
      })));
      // This should probably be done differently
      this.changedPassages.forEach((passage) => {
        passage.originalPosition = { ...passage.position };
        passage.originalSize = { ...passage.size };
      });
    },
  },
  created() {
    // TODO: All this code needs to be wrapped and moved to some kind of util that is imported in this file
    socket.on('connect', () => {
      console.log('connected');
    });
    socket.on('passages', (passages: RawPassage[]) => {
      console.log('Client received passages', { passages });
      this.passages = passages.map((passageRaw) => parseRaw(passageRaw));
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
.story-map {
  position: relative;
  width: 100%;
  height: 100%;
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
  color: #666;
  padding: 5px;
  font-size: 12px;
}
</style>
