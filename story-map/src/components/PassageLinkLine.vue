<template>
  <g @mouseenter="$emit('lineMouseenter')" @mouseleave="$emit('lineMouseleave')">
    <template v-if="highlight">
      <line
        v-for="line of lines"
        :key="`svg-line-${line.key}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        class="outline"
      />
    </template>
    <line
      v-for="line of lines"
      :key="`svg-highlight-line-${line.key}`"
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
      :class="{ highlight }"
    />
  </g>
</template>

<script lang="ts">
// import { defineComponent, PropType } from "vue";
import { Component, Vue, Prop, Watch } from "vue-property-decorator";
import { Line, Passage, Vector } from "../types";
import { cropLine } from "../util/line-tools";

@Component
export default class PassageLinkLine extends Vue {
  @Prop() from: Passage;
  @Prop() to: Passage;
  @Prop() twoWay: boolean;
  @Prop() highlight: boolean;

  lines: Line[] = [];
  lastUpdate: number = 0;
  timeout: number = 0;

  created() {
    this.updateLines();
  }

  @Watch("from.position.x")
  @Watch("from.position.y")
  @Watch("from.size.x")
  @Watch("from.size.y")
  @Watch("to.position.x")
  @Watch("to.position.y")
  @Watch("to.size.x")
  @Watch("to.size.y")
  @Watch("twoWay")
  updateLines() {
    const lines: Line[] = [];
    const line: Line = {
      x1: this.from.position.x + this.from.size.x / 2,
      y1: this.from.position.y + this.from.size.y / 2,
      x2: this.to.position.x + this.to.size.x / 2,
      y2: this.to.position.y + this.to.size.y / 2,
      key: `line-${this.from.name}-${this.to.name}`,
      fromPassage: this.from,
      toPassage: this.to,
    };
    // Okay so right now the line goes from center to center, lets move the endpoints of the arrows to the edges
    cropLine(line, this.from, this.to);
    lines.push(line);

    lines.push(...this.getArrow({ x: line.x2, y: line.y2 }, { x: line.x1, y: line.y1 }));
    if (this.twoWay) {
      lines.push(...this.getArrow({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }));
    }
    this.lines = lines;
    this.lastUpdate = Date.now();
  }

  getArrow(at: Vector, from: Vector): Line[] {
    const lines: Line[] = [];
    const deltaX = at.x - from.x;
    const deltaY = at.y - from.y;
    const deg = (Math.atan(deltaY / deltaX) * 180) / Math.PI - (deltaX < 0 ? 180 : 0);
    const ln1Deg = (deg + 330) % 360;
    const ln2Deg = (deg + 30) % 360;

    lines.push(this.getLineAtAngle(at, ln1Deg, 10));
    lines.push(this.getLineAtAngle(at, ln2Deg, 10));
    return lines;
  }

  getLineAtAngle(from: Vector, angle: number, length: number): Line {
    const radians = (angle * Math.PI) / 180;
    const deltaY = Math.sin(radians) * 10;
    const deltaX = Math.cos(radians) * 10;

    return {
      x1: from.x,
      y1: from.y,
      x2: from.x - deltaX,
      y2: from.y - deltaY,
      key: Math.random().toString(),
      fromPassage: null,
      toPassage: null,
    };
  }
}
</script>

<style scoped lang="scss">
line {
  stroke: var(--primary-700);
  stroke-width: 2;

  &.highlight {
    stroke: var(--primary-600);
    z-index: 1;
  }

  &.outline {
    stroke: var(--primary-800);
    stroke-width: 4px;
    stroke-linecap: round;
    opacity: 0.5;
  }
}
</style>