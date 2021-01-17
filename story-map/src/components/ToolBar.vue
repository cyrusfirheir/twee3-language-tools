<template>
  <div class="toolbar">
    <template v-for="element in elements">
      <button
        v-if="element.tag === 'button' && element.type === 'toggle'"
        type="button"
        :data-action="element.id"
        :key="element.id"
        :class="{ active: element.active }"
        :title="`element.text (${element.active ? 'On' : 'Off'})`"
        @click="onToggleClick(element)"
      >
        <span class="icon" :class="element.id"></span>
        <span class="text">{{ element.text }}</span>
      </button>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "ToolBar",
  data: () => ({
    elements: [
      {
        id: "snap-to-grid",
        tag: "button",
        type: "toggle",
        text: "Snap to grid",
        active: false,
      },
    ],
  }),
  methods: {
    onToggleClick(element) {
      element.active = !element.active;
      this.$emit("toggle", { id: element.id, value: element.active });
    },
  },
});
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">
.toolbar {
  display: flex;
  flex-direction: row;
  padding: 4px;
  background-color: #222;

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 0;
    overflow: hidden;
    background-color: #444;
    cursor: pointer;
    outline: 0;
    padding: 0;

    &.active {
      outline: solid #FFF 1px;
    }

    .icon {
      position: relative;
      width: 24px;
      height: 24px;

      &::before,
      &::after {
        content: "";
        display: block;
        position: absolute;
      }

      &.snap-to-grid {
        opacity: .75;
        transition: opacity .2s ease-in-out;
        &::before {
          left: 6px;
          right: 6px;
          top: 0;
          bottom: 0;
          border-left: solid #FFF 2px;
          border-right: solid #FFF 2px;
        }

        &::after {
          top: 6px;
          bottom: 6px;
          left: 0;
          right: 0;
          border-top: solid #FFF 2px;
          border-bottom: solid #FFF 2px;
        }

        &:hover {
          opacity: 1;
        }
      }
    }

    .text {
      display: none;
    }
  }
}
</style>
