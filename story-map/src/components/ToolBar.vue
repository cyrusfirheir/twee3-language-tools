<template>
  <div class="toolbar">
    <template v-for="element in elements">
      <button
        v-if="element.tag === 'button' && element.type === 'toggle'"
        type="button"
        class="tb-button material-symbols-outlined"
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
  @Prop() settings: any;

  elements: ToolbarItem[] = [
    {
      id: 'snap-to-grid',
      tag: 'button',
      type: 'toggle',
      text: 'Snap to grid',
      active: true,
    },
    {
      id: 'dark-theme',
      tag: 'button',
      type: 'toggle',
      text: 'Dark theme',
      active: true
    }
  ];

  created() {
    this.elements.forEach((element) => {
      switch(element.id) {
        case 'snap-to-grid': {
          element.active = this.settings.snapToGrid;
          break;
        }
        case 'dark-theme': {
          element.active = this.settings.darkTheme;
          break;
        }
      }
    });
  }

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

    margin: 0 4px;

    .icon {
      position: relative;
      width: 24px;
      height: 24px;

      &::before,
      &::after {
        content: "";
        color: var(--color-light);
        display: block;
        position: absolute;
      }

      &.snap-to-grid {
        &::before {
          content: "grid_3x3"
        }
      }

      &.dark-theme {
        &::before {
          content: "light_mode";
        }
      }
    }

    &.active {
      outline: solid var(--gray-100) 2px;

      .icon {
        &.dark-theme {
          &::before {
            content: "dark_mode";
          }
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
    color: var(--color-light);
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
