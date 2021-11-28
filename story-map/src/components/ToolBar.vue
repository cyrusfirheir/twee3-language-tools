<template>
  <div class="toolbar">
    <template v-for="element in elements">
      <button
        v-if="element.tag === 'button' && element.type === 'toggle'"
        type="button"
        class="tb-button"
        :data-action="element.id"
        :key="`toolbar-id-${element.id}`"
        :class="{ active: element.active }"
        :title="`${element.text}: ${element.active ? 'On' : 'Off'}`"
        @click="onToggleClick(element)"
      >
        <span class="icon" :class="element.id"></span>
        <span class="text">{{ element.text }}</span>
      </button>
    </template>
    <div class="spacer"></div>
    <div class="save-changes" v-if="unsavedChanges">
      <button type="button" @click="$emit('saveChanges')">
        <span class="button-text">Save changes</span>
        <Save class="button-icon" />
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import Save from './svg/Save.vue';

import { Component, Vue, Prop } from "vue-property-decorator";

interface ToolbarItemToggle {
  id: string;
  tag: string;
  type: 'toggle';
  text: string;
  active: boolean;
}

type ToolbarItem = ToolbarItemToggle;

@Component({
  components: { Save },
})
export default class ToolBar extends Vue {
  @Prop() unsavedChanges: boolean;

  elements: ToolbarItem[] = [
    {
      id: 'snap-to-grid',
      tag: 'button',
      type: 'toggle',
      text: 'Snap to grid',
      active: true,
    },
  ];

  onToggleClick(element: ToolbarItemToggle) {
    element.active = !element.active;
    this.$emit("toggle", { id: element.id, value: element.active });
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">
.toolbar {
  display: flex;
  flex-direction: row;
  padding: 10px;
  background-color: var(--accent-400);

  .tb-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 0;
    overflow: hidden;
    background-color: var(--accent-800);
    cursor: pointer;
    outline: 0;
    padding: 0;

    &.active {
      outline: solid var(--gray-100) 1px;
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
          border-left: solid var(--text-color-light) 2px;
          border-right: solid var(--text-color-light) 2px;
        }

        &::after {
          top: 6px;
          bottom: 6px;
          left: 0;
          right: 0;
          border-top: solid var(--text-color-light) 2px;
          border-bottom: solid var(--text-color-light) 2px;
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

  .save-changes button {
    padding: 5px 8px 5px 8px;
    font-size: 24px;
    background-color: var(--accent-800);
    color: var(--text-color-light);
    cursor: pointer;
    border-radius: 4px;
    border: 0;
    display: flex;
    align-items: center;

    .button-icon {
      width: 24px;
      height: 24px;
      opacity: .85;
      transition: opacity .4s ease-in-out;
    }

    .button-text {
      width: 0px;
      overflow: hidden;
      white-space: nowrap;
      text-align: left;
      transition: width .4s ease-in-out, opacity .4s ease-in-out;
      opacity: 0;
      font-size: 16px;
    }

    &:hover {
      background-color: var(--accent-500);

      .button-text {
        width: 110px;
        opacity: .5;
      }

      .button-icon {
        opacity: 1;
      }
    }
  }
}

.spacer {
  flex: 1;
}
</style>
