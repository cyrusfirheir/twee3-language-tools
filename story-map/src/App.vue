<template>
  <div>Hi {{connected}}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import socketio from 'socket.io-client';

export default defineComponent({
  name: 'App',
  data: () => ({
    connected: false,
  }),
  components: {},
  created() {
    const socket = socketio.io('http://localhost:42069');
    socket.on('connect', () => {
      this.connected = true;
      console.log('connected');
    });
    socket.on('data', (data: unknown) => {
      console.log('Client received data', { data });
    });
    socket.on('disconnect', () => {
      console.log('socket disconnected');
    })
  },
});
</script>

<style lang="scss">
#app {
  font-family: Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
