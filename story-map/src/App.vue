<template>
  <div class="story-map">
    <div
      v-for="passage in passagesWithStyle"
      :key="passage.name"
      :style="passage.style"
      class="passage"
    >
      {{ passage.name }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import socketio from 'socket.io-client';

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
  style?: { [key: string]: any };
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
}

const parseRaw = (passageIn: RawPassage): Passage => {
  const lastIndex = passageIn.origin.lastIndexOf('/');
  const meta = JSON.parse(passageIn.meta || '{}');
  const positionArr = (meta.position || '0,0').split(',').map((str: string) => parseFloat(str));
  const sizeArr = (meta.size || '100,100').split(',').map((str: string) => parseFloat(str));
  return {
    origin: passageIn.origin,
    filename: passageIn.origin.substring(lastIndex + 1),
    path: passageIn.origin.substring(0, lastIndex),
    name: passageIn.name,
    tags: passageIn.tags,
    position: { x: Math.round(Math.max(0, positionArr[0])), y: Math.round(Math.max(0, positionArr[1])) },
    size: { x: sizeArr[0], y: sizeArr[1] },
  };
};

export default defineComponent({
  name: 'App',
  data: (): ComponentData => ({
    connected: false,
    passages: [],
  }),
  computed: {
    passagesWithStyle(): Passage[] {
      return this.passages.map((passage) => ({
        ...passage,
        style: {
          width: `${passage.size.x}px`,
          height: `${passage.size.y}px`,
          top: `${passage.position.x}px`,
          left: `${passage.position.y}px`,
        },
      }));
    },
  },
  created() {
    const socket = socketio.io('http://localhost:42069');
    socket.on('connect', () => {
      this.connected = true;
      console.log('connected');
    });
    socket.on('data', (data: unknown) => {
      console.log('Client received data', { data });
    });
    socket.on('passages', (passages: RawPassage[]) => {
      console.log('Client received passages', { passages });
      this.passages = passages.map((passageRaw) => parseRaw(passageRaw));
    });
    socket.on('disconnect', () => {
      console.log('socket disconnected');
    })
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
}
</style>

<style lang="scss" scoped>
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
