<template>
  <div
    class="layout"
    :class="{ 'show-sidebar': selectedPassages.length }"
    @mouseup="onMouseUp($event)"
    @mousemove="onMouseMove($event)"
  >
    <ToolBar
      class="toolbar"
      :unsavedChanges="unsavedChanges"
      @saveChanges="saveChanges()"
      @toggle="toggleSetting($event)"
    />
    <div class="sidebar">
      <Sidebar
        :passages="selectedPassages"
        :allTags="allTags"
        :tagColors="tagColors"
        @setSize="setPassageSize(selectedPassages, $event)"
        @resetSize="resetPassageSize(selectedPassages)"
        @resetPosition="resetPassagePosition(selectedPassages)"
        @resetTags="resetPassageTags(selectedPassages)"
        @addTag="addPassageTag(selectedPassages, $event)"
        @removeTag="removePassageTag(selectedPassages, $event)"
        @selectPassage="selectPassage($event, null)"
        @openInVsCode="openPassage(selectedPassages)"
        @moveToFile="moveToFile(selectedPassages, $event)"
      />
    </div>
    <div class="story-area" @click="deselectPassage()" @mousedown="onMapMouseDown($event)">
      <div class="story-map" :style="{ transform: `${translateStr} scale(${zoom})` }" @wheel.prevent="onWheel($event)">
        <svg class="story-map-back" :style="svgStyle">
          <template v-if="!draggedPassage">
            <!-- I would prefer if I could keep drawing lines while dragging -->
            <!-- But that just slows things down to a crawl, probably need canvas to fix -->
            <PassageLinkLine
              v-for="linkedPassage in linkedPassages"
              :key="`link-line${linkedPassage.key}`"
              :from="linkedPassage.from"
              :to="linkedPassage.to"
              :twoWay="linkedPassage.twoWay"
              :highlight="highlightElements.includes(linkedPassage) || (!hoveredElement && selectedPassages.some((selPassage) => selPassage.key  === linkedPassage.key))"
              @lineMouseenter="onHoverableMouseEnter(linkedPassage)"
              @lineMouseleave="onHoverableMouseLeave(linkedPassage)"
            />
          </template>
        </svg>
        <div
          v-for="item in items"
          :key="`passage-${item.passage.name}`"
          :style="item.style"
          :class="{
            highlight: highlightElements.includes(item.passage) || passagesInDragArea.includes(item.passage),
            selected: selectedPassages.includes(item.passage),
          }"
          @mouseenter="onHoverableMouseEnter(item.passage)"
          @mouseleave="onHoverableMouseLeave(item.passage)"
          @mousedown.stop="onPassageMouseDown(item.passage, $event)"
          @click.stop="selectPassage(item.passage, $event)"
          @dblclick="openPassage(item.passage)"
          class="passage"
        >
          {{ item.passage.name }}
          <div
            v-if="item.passage.dropShadow"
            class="passage-shadow"
            :style="{ left: `${item.passage.dropShadow.x}px`, top: `${item.passage.dropShadow.y}px` }"
          ></div>

          <svg
            v-if="!storyData.start && item.passage.name === 'Start' || item.passage.name === storyData.start"
            :style="{
              width: Math.min(Math.max((36/zoom), 16), item.passage.size.x - 10) + 'px',
              height: Math.min(Math.max((36/zoom), 16), item.passage.size.y - 10) + 'px'  
            }"
            viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"
          >
            <path fill-rule="evenodd" clip-rule="evenodd" d="M14.491 1c-3.598.004-6.654 1.983-8.835 4H1.5l-.5.5v3l.147.354.991.991.001.009 4 4 .009.001.999.999L7.5 15h3l.5-.5v-4.154c2.019-2.178 3.996-5.233 3.992-8.846l-.501-.5zM2 6h2.643a23.828 23.828 0 0 0-2.225 2.71L2 8.294V6zm5.7 8l-.42-.423a23.59 23.59 0 0 0 2.715-2.216V14H7.7zm-1.143-1.144L3.136 9.437C4.128 8 8.379 2.355 13.978 2.016c-.326 5.612-5.987 9.853-7.421 10.84zM4 15v-1H2v-2H1v3h3zm6.748-7.667a1.5 1.5 0 1 0-2.496-1.666 1.5 1.5 0 0 0 2.495 1.666z" />
          </svg>

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
        <div class="drag-area" v-if="dragSelectPosition" :style="dragSelectStyle"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';

import { socket } from './socket';
import { PassageAndStyle, Vector, Passage, LinkedPassage, PassageLink, PassageStyle, PassageData } from './types';
import { linkPassage, parseRaw } from './util/passage-tools';
import { getScrollDistance } from './util/scroll-distance-calc';

import ToolBar from './components/ToolBar.vue';
import PassageLinkLine from './components/PassageLinkLine.vue';
import Sidebar from './components/Sidebar.vue';

@Component({
  components: { ToolBar, PassageLinkLine, Sidebar },
})
export default class AppComponent extends Vue {
  connected = false;
  theme = 'cydark';
  passages: LinkedPassage[] = [];
  storyData: { [key: string]: any } = {};
  tagColors: { [tag: string]: string } = {};
  draggedPassage: Passage = null;
  initialDragMapPosition: null | Vector = null;
  initialDragPosition: null | Vector = null;
  dragSelectPosition: null | Vector = null;
  highestZIndex = 0;
  translate: Vector = { x: 0, y: 0 };
  mapSize: Vector = { x: 0, y: 0 };
  zoom = 1;
  mouseDownTimestamp: number;
  selectedPassages: Passage[] = [];
  hoveredElement: PassageLink | LinkedPassage = null;
  linkedPassages: PassageLink[] = [];
  highlightElements: Array<PassageLink | Passage> = [];
  settings = {
    showGrid: true,
    showDots: true,
    snapToGrid: true,
    gridSize: 25,
  };

  get allTags(): string[] {
    const { passages, storyData } = this;
    // twee 3 tags
    let allTags = ['script', 'stylesheet'];
    // sugarcube tags
    if (storyData?.format === 'SugarCube') {
      allTags.push('widget', 'nobr');
    }
    // if no passages are loaded yet, thats all
    if (!passages) return allTags;

    // else also add all tags from passages
    for (const passage of passages) {
      for (const tag of passage.tags) {
        if (!allTags.includes(tag)) {
          allTags.push(tag);
        }
      }
    };
    return allTags;
  }

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
      if (passage.tags.length !== passage.originalTags.length) return true;
      if (passage.tags.some((tag, index) => tag !==  passage.originalTags[index])) return true;
      return false;
    });
  }
  get unsavedChanges(): boolean {
    return this.changedPassages.length > 0;
  }

  get svgStyle() {
    let theme = this.theme; // I need to read it so that this will be re-evaluated
    const style: { [key: string]: any } = {
      width: `${this.mapSize.x}px`,
      height: `${this.mapSize.y}px`,
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
    style.backgroundPosition = `-${gridSize/2}px -${gridSize/2}px`;

    return style;
  }

  get translateStr() {
    return `translate(${Math.round(this.translate.x * 1000) / 1000}px, ${Math.round(this.translate.y * 1000) / 1000}px)`;
  }

  get dragArea(): null | [Vector, Vector] {
    const v1 = this.initialDragPosition;
    const v2 = this.dragSelectPosition;
    const scale = this.zoom;
    const translate = this.translate;
    if (!v2) return null;
    const x1 = (Math.min(v1.x, v2.x) - translate.x) / scale;
    const x2 = (Math.max(v1.x, v2.x) - translate.x) / scale;
    const y1 = (Math.min(v1.y, v2.y) - translate.y - 56) / scale;
    const y2 = (Math.max(v1.y, v2.y) - translate.y - 56) / scale;
    // now I need to do stuff with scale and translate
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }

  get dragSelectStyle() {
    const area = this.dragArea;
    if (!area) {
      return {};
    }
    return {
      left: `${area[0].x}px`,
      top: `${area[0].y}px`,
      width: `${area[1].x - area[0].x}px`,
      height: `${area[1].y - area[0].y}px`,
    }
  }

  get passagesInDragArea(): Passage[] {
    const area = this.dragArea;
    if (!area) {
      return [];
    }
    return this.passages.filter((passage) => {
      const pos = (passage.drawPosition || passage.position);
      const center: Vector = {
        x: pos.x + (passage.size.x / 2),
        y: pos.y + (passage.size.y / 2),
      };
      if (center.x < area[0].x) return false;
      if (center.x > area[1].x) return false;
      if (center.y < area[0].y) return false;
      if (center.y > area[1].y) return false;
      return true;
    });
  }

  created() {
    socket.disconnect();
    socket.connect();
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
      
      this.storyData = passageData.storyData;
      this.tagColors = passageData?.storyData?.['tag-colors'] || {};
      this.initMapSize();
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
        highlightElements.push(...hoveredElement.linksTo);
        highlightElements.push(...hoveredElement.linkedFrom);
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

  initMapSize() {
    let maxX = 0;
    let maxY = 0;
    for (const passage of (this.passages as LinkedPassage[])) {
      const passageMaxX = passage.position.x + passage.size.x;
      const passageMaxY = passage.position.y + passage.size.y;
      maxX = Math.max(maxX, passageMaxX);
      maxY = Math.max(maxY, passageMaxY);
    }
    this.mapSize = { x: Math.ceil(maxX * 1.1), y: Math.ceil(maxY * 1.1) };
  }

  getPassageStyle(passage: Passage): PassageStyle {
    const position = passage.drawPosition || passage.position;
    return {
      width: `${passage.size.x}px`,
      height: `${passage.size.y}px`,
      left: `${position.x}px`,
      top: `${position.y}px`,
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
    // Middle mouse is drag map
    if (event.button === 1) {
      return this.onMapMouseDown(event);
    } else if (event.shiftKey) {
      return this.onDragSelectStart(event);
    }
    this.highestZIndex++;
    passage.zIndex = this.highestZIndex;
    this.draggedPassage = passage;

    this.initialDragPosition = { x: event.clientX, y: event.clientY };
    this.mouseDownTimestamp = Date.now();
  }

  onMapMouseDown(event: MouseEvent) {
    if (event.shiftKey) {
      return this.onDragSelectStart(event);
    }
    this.initialDragMapPosition = { ...this.translate };
    this.initialDragPosition = { x: event.clientX, y: event.clientY };
    this.mouseDownTimestamp = Date.now();
  }

  onDragSelectStart(event: MouseEvent) {
    this.initialDragPosition = { x: event.clientX, y: event.clientY };
    this.dragSelectPosition = { x: event.clientX, y: event.clientY };
    this.mouseDownTimestamp = Date.now();
  }

  onMouseMove(event: MouseEvent) {
    if (!this.initialDragPosition || (!this.initialDragMapPosition && !this.draggedPassage && !this.dragSelectPosition)) return;

    if (this.dragSelectPosition) {
      this.dragSelectPosition = { x: event.clientX, y: event.clientY };
    } else if (this.draggedPassage) {
      const dragPassages = [this.draggedPassage, ...this.selectedPassages];
      for (const dragPassage of dragPassages) {
        const delta: Vector = { x: this.initialDragPosition.x - event.clientX, y: this.initialDragPosition.y - event.clientY };
        const x = Math.max(0, Math.round(dragPassage.position.x - (delta.x / this.zoom)));
        const y = Math.max(0, Math.round(dragPassage.position.y - (delta.y / this.zoom)));
        dragPassage.drawPosition = { x, y };

        // Snap to grid
        if (this.settings.snapToGrid) {
          const shadowPosition = this.getSnappedPassagePosition(dragPassage.drawPosition);
          dragPassage.dropShadow = {
            x: shadowPosition.x - dragPassage.drawPosition.x,
            y: shadowPosition.y - dragPassage.drawPosition.y,
          };
        }

        // resize map if needed
        if (dragPassage.drawPosition.x * 1.1 > this.mapSize.x) {
          this.mapSize.x = (dragPassage.drawPosition.x + dragPassage.size.x) * 1.1;
        }
        if (dragPassage.drawPosition.y * 1.1 > this.mapSize.y) {
          this.mapSize.y = dragPassage.drawPosition.y * 1.1;
        }
      }
    } else {
      // Drag map
      const delta: Vector = { x: this.initialDragPosition.x - event.clientX, y: this.initialDragPosition.y - event.clientY };
      this.translate.x = Math.round(this.initialDragMapPosition.x - delta.x);
      this.translate.y = Math.round(this.initialDragMapPosition.y - delta.y);
    }
  }

  onMouseUp(event: MouseEvent) {
    if (this.dragSelectPosition) {
      const selected = this.passagesInDragArea;
      if (event.ctrlKey) {
        // If the control key is pressed, add to selection
        for (const item of selected) {
          if (!this.selectedPassages.includes(item)) {
            this.selectedPassages.push(item);
          }
        }
      } else {
        // Else replace selection
        this.selectedPassages = selected;
      }
      this.dragSelectPosition = null;
    }
    else if (this.draggedPassage) {
      const dragPassages = [this.draggedPassage, ...this.selectedPassages];
      for (const dragPassage of dragPassages) {
        dragPassage.dropShadow = undefined;
        dragPassage.position = dragPassage.drawPosition || dragPassage.position;
        dragPassage.drawPosition = null;
        if (this.settings.snapToGrid) {
          dragPassage.position = this.getSnappedPassagePosition(dragPassage.position);
        }
      }
    }
    this.initialDragPosition = null;
    this.initialDragMapPosition = null;
    this.draggedPassage = null;
  }

  onWheel(event: WheelEvent) {
    const scrollAmount = getScrollDistance(event);
    const zoomAmount = (scrollAmount > 0)
      ? (scrollAmount / 1000)                   // deltaY 100  ->  .1
      : 1 - (1 / (1 + (scrollAmount / 1000)));  // deltaY -100 -> -.11111

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
    socket.emit('open-passage', { name: passage.name, origin: passage.origin, range: passage.range });
  }

  saveChanges() {
    socket.emit('update-passages', this.changedPassages.map((passage) => ({
      name: passage.name,
      origin: passage.origin,
      range: passage.range,
      position: passage.position,
      size: passage.size,
      tags: passage.tags,
    })));
    // This should probably be done differently
    this.changedPassages.forEach((passage) => {
      passage.originalPosition = { ...passage.position };
      passage.originalSize = { ...passage.size };
      passage.originalTags = [ ...passage.originalTags ];
    });
  }

  selectPassage(passage: Passage, event: MouseEvent) {
    // If there is an event, there is a click. If there's a click
    // The click should not be too long
    if (event && Date.now() - this.mouseDownTimestamp > 200) return;
    if (event?.ctrlKey) {
      if (!this.selectedPassages.includes(passage)) {
        this.selectedPassages.push(passage);
      }
    } else {
      this.selectedPassages = [passage];
    }
  }

  deselectPassage() {
    if (Date.now() - this.mouseDownTimestamp > 200) return;
    this.selectedPassages = [];
  }

  setPassageSize(passage: Passage, size: Vector) {
    passage.size = { ...size };
  }

  resetPassageSize(passage: Passage) {
    passage.size = { ... passage.originalSize };
  }

  resetPassagePosition(passage: Passage) {
    passage.position = { ...passage.originalPosition };
  }

  resetPassageTags(passage: Passage) {
    passage.tags = [ ...passage.originalTags ];
  }

  addPassageTag(passage: Passage, tag: string) {
    if (passage.tags.some((oldTag) => !oldTag.toLowerCase().localeCompare(tag.trim().toLowerCase()))){
      console.warn(`tried to add tag to passage already having that tag`, passage, tag.trim());
      return;
    }
    passage.tags.push(tag.trim());
  }

  removePassageTag(passage: Passage, tag: string) {
    passage.tags = passage.tags.filter((curTag) => curTag !== tag);
  }

  moveToFile(passages: Passage[], absolutePath: string) {
    this.selectedPassages = [];
    socket.emit('move-to-file', {
      toFile: absolutePath,
      passages: passages.map(p => {
        return {
          name: p.name,
          range: p.range,
          origin: p.origin
        }
      })
    })
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
  --primary-100: #7591a1; /* passage hover */
  --primary-200: #354852; /* passage */
  --primary-300: #465c68; /* passage highlight  */
  --primary-400: #222d33; /* map background */
  --primary-500: #172024; /* layout background (around map) */
  --primary-600: #ffd5da; /* arrow-highlight inner */
  --primary-700: #ff0060; /* arrow inner */
  --primary-800: #33000a; /* arrow-highlight outer */

  --start-passage-rocket-back: #ff0060; 
  --start-passage-rocket-color: #ffd5da;

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
  display: grid;
  grid-template-areas: 
    "titlebar titlebar"
    "map sidebar";
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr auto;
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  background-color: var(--primary-500);
}

.toolbar {
  grid-area: titlebar;
  z-index: 100;
}

.sidebar {
  grid-area: sidebar;
  background: rgba(0, 0, 0, .3);
  border-left: solid rgba(255, 255, 255, .2) 1px;
  box-shadow: 0 10px 20px rgba(var(--shadow-rgb),0.19), 0 6px 6px rgba(var(--shadow-rgb),0.23);
  width: 0;
  transition: width .3s ease-in-out;
  overflow: hidden;

  .show-sidebar & {
    width: 450px;
  }
}

.story-area {
  grid-area: map;
  overflow: hidden;
}

.story-map {
  position: relative;
  transform-origin: top left;
}

.story-map-back {
  min-width: 100%;
  min-height: 100%;
  border-radius: 8px;
  background-color: var(--primary-400);
  box-shadow: 0 10px 20px rgba(var(--shadow-rgb),0.19), 0 6px 6px rgba(var(--shadow-rgb),0.23);
}

.passage {
  position: absolute;
  overflow: visible;
  background-color: var(--primary-200);
  border: 1px solid var(--gray-500);
  border-radius: 3px;
  color: var(--text-color-dark);
  padding: 5px;
  font-size: 12px;
  overflow-wrap: anywhere;
  cursor: grab;
  transition: background-color .15s ease-in-out, border-color .15s ease-in-out;
  box-shadow: 0 1px 3px rgba(var(--shadow-rgb),0.12), 0 1px 2px rgba(var(--shadow-rgb),0.24);

  svg {
    position: absolute;
    right: 0; bottom: 0;
    margin: 5px;
    padding: 2px;
    
    fill: var(--start-passage-rocket-color);
    background-color: var(--start-passage-rocket-back);
    box-shadow: 0 1px 3px rgba(var(--shadow-rgb),.12),0 1px 2px rgba(var(--shadow-rgb),.23);
    border-radius: 3px;
  }

  &.highlight {
    background-color: var(--primary-300);
    border-color: var(--gray-600);
    border-width: 2px;
    padding: 4px;
  }

  &:hover,
  &.selected {
    background-color: var(--primary-100);
    border-color: var(--gray-600);
    border-width: 2px;
    padding: 4px;

    svg {
      margin: 4px;
    }
  }

  .passage-shadow {
    position: absolute;
    width: 100%;
    height: 100%;
    background: 0;
    border: 0;
    outline: solid var(--highlight) 1px;
    pointer-events: none;
    z-index: 1;
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

.drag-area {
  position: absolute;
  border: dashed #FFF 1px;
  background-color: rgba(255, 255, 255, .1);
}
</style>
